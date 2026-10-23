"""Personnel documents and photos: files on the server disk under پرسنل/<employee code>/..., metadata in PostgreSQL.
No public URLs: every download checks Permission AND Unit Scope AND confidentiality. UNTESTED (HTTP layer + disk)."""
import hashlib
import mimetypes
import os
import re
import secrets
import shutil
import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse

from .. import config
from ..core.policy import has_permission, in_unit_scope
from ..db import tx
from ..deps import authenticate
from ..errors import ApiError, forbidden, invalid
from ..services.pgstore import PgStore
from ..services.store import Rec
from ..services.sync import Actor, SyncService
from .common import log_event

router = APIRouter(prefix="/api", tags=["documents"])
_BAD = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


def safe_name(name: str, default="file") -> str:
    n = _BAD.sub("_", str(name or "")).strip(" .")
    n = n.replace("..", "_")
    return (n[:120] or default)


def _root() -> str:
    return os.path.abspath(config.DOC_ROOT)


def full_path(rel: str) -> str:
    """Resolve a stored relative path inside DOC_ROOT; refuses anything that escapes it."""
    path = os.path.abspath(os.path.join(_root(), *[p for p in rel.replace("\\", "/").split("/") if p not in ("", ".")]))
    if os.path.commonpath([_root(), path]) != _root():
        raise ApiError("FORBIDDEN", sub="PATH_ESCAPE")
    return path


def _ext_ok(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lstrip(".").lower()
    if ext not in config.ALLOWED_UPLOAD_EXT:
        raise invalid("FILE_TYPE_NOT_ALLOWED", [{"extension": ext}], "نوع فایل مجاز نیست.")
    return ext


def _save_upload(up: UploadFile, dest: str):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    h, size, limit = hashlib.sha256(), 0, config.MAX_UPLOAD_MB * 1024 * 1024
    tmp = dest + ".part"
    try:
        with open(tmp, "wb") as f:
            while True:
                chunk = up.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > limit:
                    raise invalid("FILE_TOO_LARGE", [{"max_mb": config.MAX_UPLOAD_MB}], "حجم فایل بیش از حد مجاز است.")
                h.update(chunk)
                f.write(chunk)
        os.replace(tmp, dest)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return size, h.hexdigest()


def _unique(path: str) -> str:
    base, ext = os.path.splitext(path)
    n, cand = 1, path
    while os.path.exists(cand):
        n += 1
        cand = "%s (%d)%s" % (base, n, ext)
    return cand


def _employee_or_404(store, svc: SyncService, eid: str) -> Rec:
    emp = store.get("employees", eid)
    if not emp or emp.deleted:
        raise ApiError("NOT_FOUND")
    if not has_permission(svc.p, "view_personnel", emp.unit_id) or not in_unit_scope(svc.p, emp.unit_id):
        raise ApiError("NOT_FOUND")
    if not emp.data.get("code"):
        raise invalid("EMPLOYEE_CODE_REQUIRED", message="برای نگهداری فایل، کد پرسنلی کارمند الزامی است.")
    return emp


@router.post("/documents/upload", status_code=201)
def upload(employee_id: str = Form(...), category: str = Form("سایر"), title: str = Form(""), expiry_date: str = Form(""),
           confidential: bool = Form(False), source: str = Form("upload"), file: UploadFile = File(...), actor: Actor = Depends(authenticate)):
    ext = _ext_ok(file.filename or "")
    with tx() as conn:
        store = PgStore(conn)
        svc = SyncService(store, actor)
        emp = _employee_or_404(store, svc, employee_id)
        if not has_permission(actor.principal, "write_docs", emp.unit_id):
            raise forbidden("PERMISSION_DENIED", {"permission": "write_docs"})
        if confidential and not has_permission(actor.principal, "view_confidential_docs", emp.unit_id):
            raise forbidden("PERMISSION_DENIED", {"permission": "view_confidential_docs"})
        rel_dir = "پرسنل/%s/%s" % (safe_name(emp.data["code"]), safe_name(category, "سایر"))
        fname = safe_name(os.path.splitext(file.filename or "file")[0] or "file") + "." + ext
        dest = _unique(full_path(rel_dir + "/" + fname))
        size, digest = _save_upload(file, dest)
        rel = rel_dir + "/" + os.path.basename(dest)
        did = "doc" + secrets.token_hex(7)
        data = {"employee_id": employee_id, "title": title or fname, "category": category, "fileName": os.path.basename(dest), "relativePath": rel,
                "created_at": datetime.date.today().isoformat(), "expiry_date": expiry_date or None, "confidential": bool(confidential),
                "size": size, "source": source, "storage_key": rel, "sha256": digest, "mime": mimetypes.guess_type(dest)[0] or "application/octet-stream"}
        data = {k: v for k, v in data.items() if v is not None}
        rec = store.insert(Rec("documents", did, data, employee_id=employee_id))
        log_event(conn, "upload", "documents", "بارگذاری سند «%s» برای کارمند %s" % (fname, emp.data.get("full_name", "")), actor=actor,
                  after={"id": did, "category": category, "size": size})
    return {"id": did, "version": rec.version, "record": dict(data, id=did)}


def _visible_doc(actor: Actor, store, did: str):
    svc = SyncService(store, actor)
    items = svc.bootstrap()["data"]["documents"]
    for it in items:
        if it["id"] == did:
            return it
    raise ApiError("NOT_FOUND")


@router.get("/documents/scan")
def scan(actor: Actor = Depends(authenticate)):
    """Which visible documents/photos have no file on disk (replaces the browser-side folder scan)."""
    with tx() as conn:
        store = PgStore(conn)
        data = SyncService(store, actor).bootstrap()["data"]
    missing = []
    for d in data["documents"]:
        rel = d.get("relativePath")
        if rel and not os.path.isfile(full_path(rel)):
            missing.append({"id": d["id"], "employee_id": d.get("employee_id"), "relativePath": rel, "kind": "document"})
    for e in data["employees"]:
        rel = e.get("photo_path")
        if rel and not os.path.isfile(full_path(rel)):
            missing.append({"id": e["id"], "employee_id": e["id"], "relativePath": rel, "kind": "photo"})
    return {"total_documents": len(data["documents"]), "missing": missing}


@router.get("/documents/{did}/download")
def download(did: str, actor: Actor = Depends(authenticate)):
    with tx() as conn:
        store = PgStore(conn)
        doc = _visible_doc(actor, store, did)                  # visibility = permission + unit scope + confidentiality
        path = full_path(doc["relativePath"])
        log_event(conn, "download", "documents", "دانلود سند «%s»" % doc.get("fileName", did), actor=actor, after={"id": did})
    if not os.path.isfile(path):
        raise ApiError("NOT_FOUND", "فایل روی سرور پیدا نشد.")
    return FileResponse(path, filename=doc.get("fileName"), media_type=doc.get("mime") or mimetypes.guess_type(path)[0] or "application/octet-stream")


@router.delete("/documents/{did}/file")
def delete_file(did: str, actor: Actor = Depends(authenticate)):
    """Physical file removal (permission delete_files). The metadata row is removed through the normal sync delete."""
    with tx() as conn:
        store = PgStore(conn)
        doc = _visible_doc(actor, store, did)
        emp = store.get("employees", doc.get("employee_id") or "")
        if not has_permission(actor.principal, "delete_files", emp.unit_id if emp else None):
            raise forbidden("PERMISSION_DENIED", {"permission": "delete_files"})
        path = full_path(doc["relativePath"])
        existed = os.path.isfile(path)
        if existed:
            os.remove(path)
        log_event(conn, "file_delete", "documents", "حذف فایل سند «%s»" % doc.get("fileName", did), actor=actor, after={"id": did, "existed": existed})
    return {"ok": True, "existed": existed}


@router.post("/employees/{eid}/photo")
def upload_photo(eid: str, file: UploadFile = File(...), actor: Actor = Depends(authenticate)):
    ext = _ext_ok(file.filename or "")
    if ext not in ("jpg", "jpeg", "png", "gif", "webp"):
        raise invalid("FILE_TYPE_NOT_ALLOWED", message="فقط تصویر مجاز است.")
    with tx() as conn:
        store = PgStore(conn)
        svc = SyncService(store, actor)
        emp = _employee_or_404(store, svc, eid)
        rel = "پرسنل/%s/عکس-پرسنلی/profile.%s" % (safe_name(emp.data["code"]), ext)
        _save_upload(file, full_path(rel))
        svc.push([{"c": "employees", "op": "update", "id": eid, "v": emp.version, "set": {"photo_path": rel}}])
        log_event(conn, "upload", "documents", "بارگذاری عکس پرسنلی", actor=actor, after={"employee_id": eid})
    return {"photo_path": rel}


@router.get("/employees/{eid}/photo")
def get_photo(eid: str, actor: Actor = Depends(authenticate)):
    with tx() as conn:
        store = PgStore(conn)
        data = SyncService(store, actor).bootstrap()["data"]
    emp = next((e for e in data["employees"] if e["id"] == eid), None)
    if not emp or not emp.get("photo_path"):
        raise ApiError("NOT_FOUND")
    path = full_path(emp["photo_path"])
    if not os.path.isfile(path):
        raise ApiError("NOT_FOUND")
    return FileResponse(path, media_type=mimetypes.guess_type(path)[0] or "image/jpeg")
