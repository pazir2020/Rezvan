"""Migration endpoints (admin). UNTESTED (HTTP + PostgreSQL). The same logic is used by the CLI."""
import hashlib
import json
from typing import Optional

from fastapi import APIRouter, Depends, File, UploadFile

from .. import config
from ..core.policy import has_permission
from ..db import tx
from ..deps import authenticate
from ..errors import ApiError, forbidden, invalid
from ..migration.apply import MigrationBlocked, apply_migration
from ..migration.preview import build_preview
from ..services.pgstore import PgStore
from ..services.sync import Actor
from .common import log_event

router = APIRouter(prefix="/api/migration", tags=["migration"])


def _need(actor: Actor):
    for perm in ("manage_users", "purge_data"):
        if not has_permission(actor.principal, perm):
            raise forbidden("PERMISSION_DENIED", {"permission": perm})


def _load(file: UploadFile):
    raw = file.file.read()
    try:
        return json.loads(raw.decode("utf-8")), hashlib.sha256(raw).hexdigest()
    except Exception:
        raise invalid("INVALID_JSON", message="فایل داده معتبر نیست.")


@router.post("/preview")
def preview(file: UploadFile = File(...), actor: Actor = Depends(authenticate)):
    _need(actor)
    data, sha = _load(file)
    rep = build_preview(data, sha)
    with tx() as conn:
        PgStore(conn).migration_record(sha, "preview", {k: rep[k] for k in ("total", "migrated", "failed", "data_insufficient", "duplicates", "warnings", "blocking")}, rep)
        log_event(conn, "migration_preview", "migration", "پیش‌نمایش مهاجرت", actor=actor)
    return rep


@router.post("/apply")
def apply(confirm: bool = False, accept_blocking: bool = False, file: UploadFile = File(...), actor: Actor = Depends(authenticate)):
    _need(actor)
    if not confirm:
        raise invalid("CONFIRMATION_REQUIRED", message="برای اجرای واقعی مهاجرت confirm=true بفرستید (پیش‌نمایش را قبلاً ببینید).")
    data, sha = _load(file)
    try:
        with tx() as conn:
            rep = apply_migration(PgStore(conn), data, sha, accept_blocking=accept_blocking, doc_root=config.DOC_ROOT)
            log_event(conn, "migration", "migration", "اجرای مهاجرت", actor=actor)
            return rep
    except MigrationBlocked as e:
        raise ApiError("VALIDATION_ERROR", str(e), sub="MIGRATION_BLOCKED", details={"blocking": e.report["blocking"], "issues": [i for i in e.report["issues"] if i["severity"] in ("failed", "data_insufficient", "duplicate")][:200]})
