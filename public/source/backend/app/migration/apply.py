"""Migration APPLY. Idempotent (a source file hash is applied once), transactional (caller wraps it in one DB transaction /
store.atomic()), never modifies the source JSON, preserves Employee ids, maps username -> users.id, '' -> NULL, and never guesses:
unknown fields/collections are reported (DATA_INSUFFICIENT) and skipped — apply refuses to run while `blocking` items exist
unless accept_blocking=True (then exactly those fields/records are skipped).
Status: logic tested on MemoryStore with the sample file; the PostgreSQL path (PgStore + files) is UNTESTED."""
import hashlib
import json
import os
import shutil
from typing import Dict, List, Optional

from ..core.validation import allowed_fields, split_employee
from ..services.store import Rec, now_iso
from ..specs import CLIENT_META, COLLECTION_SPECS, ROLE_PERMS, TIER_A, TRASH_COLLECTIONS
from .preview import build_preview

SYSTEM_USER_ID = "usr_system"


class MigrationBlocked(Exception):
    def __init__(self, report):
        super().__init__("migration has %d blocking item(s); review the report or pass accept_blocking" % report["blocking"])
        self.report = report


def apply_migration(store, data: dict, source_sha256: str, *, all_units_roles=tuple(ROLE_PERMS), accept_blocking=False,
                    files_root: Optional[str] = None, doc_root: Optional[str] = None, dry_run=False) -> dict:
    report = build_preview(data, source_sha256)
    if store.migration_applied(source_sha256):
        report["notes"].append("ALREADY APPLIED: this exact source file was migrated before; nothing was done (idempotent).")
        report["already_applied"] = True
        return report
    if report["blocking"] and not accept_blocking:
        raise MigrationBlocked(report)
    stats: Dict[str, int] = {}
    skipped: List[dict] = []

    def count(k, n=1):
        stats[k] = stats.get(k, 0) + n

    def skip(coll, rid, why):
        skipped.append({"collection": coll, "record_id": rid, "reason": why})
        count("skipped")

    with store.atomic():
        # ---- users (ids and password hashes preserved; legacy usernames kept for actor mapping)
        by_username: Dict[str, str] = {}
        if store.user_by_id(SYSTEM_USER_ID) is None:
            store.user_save({"id": SYSTEM_USER_ID, "username": "system", "name": "سیستم", "role": "viewer", "active": False, "is_system": True,
                             "all_units": False, "unit_ids": [], "perms_add": [], "perms_remove": [], "pw": {}, "created_at": now_iso()})
        by_username["system"] = SYSTEM_USER_ID
        for u in data.get("users", []):
            pw = u.get("pw") or {}
            if u.get("role") not in ROLE_PERMS or pw.get("algo") not in ("pbkdf2", "sha256"):
                skip("users", u.get("id"), "unknown role or password format")
                continue
            if store.user_by_id(u["id"]) or store.user_by_username(u["username"]):
                skip("users", u["id"], "already exists")
                continue
            store.user_save({"id": u["id"], "username": u["username"], "legacy_username": u["username"], "name": u.get("name") or u["username"],
                             "role": u["role"], "active": bool(u.get("active", True)), "is_system": False,
                             "all_units": u["role"] in all_units_roles, "unit_ids": [], "perms_add": list(u.get("perms_add") or []),
                             "perms_remove": list(u.get("perms_remove") or []), "pw": {k: pw[k] for k in ("algo", "iter", "salt", "hash") if k in pw},
                             "created_at": u.get("created_at") or now_iso()})
            by_username[u["username"]] = u["id"]
            count("users")

        # ---- units + employees
        for dept in dict.fromkeys(e.get("department") for e in data.get("employees", []) if e.get("department")):
            if store.unit_by_name(dept) is None:
                store.unit_create(dept)
                count("units")
        valid_emp = set()
        for e in data.get("employees", []):
            cols, sens, extra, issues = split_employee(e)
            bad = [i for i in issues if i["severity"] == "failed" or i["problem"] == "unknown_field"]
            for i in issues:
                if i["problem"] == "unknown_field":
                    cols.pop(i["field"], None)
            if any(i["severity"] == "failed" for i in issues) or store.get("employees", e["id"]):
                skip("employees", e.get("id"), "failed validation or already exists")
                continue
            unit = store.unit_by_name(cols.get("department")) if cols.get("department") else None
            clean = {k: v for k, v in {**cols, **sens, **extra}.items() if v is not None}
            store.insert(Rec("employees", e["id"], clean, unit_id=unit))
            valid_emp.add(e["id"])
            count("employees")

        # ---- all other record collections (ids preserved; flag-deleted rows become soft-deleted)
        for coll, spec in COLLECTION_SPECS.items():
            allowed = allowed_fields(coll)
            for r in data.get(coll, []):
                rid = r.get("id")
                if spec["employee_scoped"] and r.get("employee_id") not in valid_emp:
                    skip(coll, rid, "employee reference is broken or its employee was skipped")
                    continue
                if allowed is None:
                    body = {k: v for k, v in r.items() if k != "id"}      # hiringScenarios: kept as stored (read-only in the API)
                else:
                    unknown = [k for k in r if k != "id" and k not in allowed]
                    body = {k: v for k, v in r.items() if k != "id" and k in allowed}
                    if unknown:
                        count("fields_skipped", len(unknown))
                if store.get(coll, rid):
                    skip(coll, rid, "duplicate id")
                    continue
                rec = Rec(coll, rid, {k: (None if v == "" else v) for k, v in body.items()} if False else body, employee_id=r.get("employee_id"))
                if body.get("deleted") is True:
                    rec.deleted_at, rec.deleted_via = body.get("deleted_at") or now_iso(), "flag"
                store.insert(rec)
                count(coll)

        # ---- payroll locks (actors mapped username -> users.id; side snapshots kept exactly)
        for l in data.get("payrollLocks", []):
            body = {k: v for k, v in l.items() if k != "id"}
            for k in ("reviewed_by", "approved_by", "unlocked_by"):
                if body.get(k) in by_username:
                    body[k] = by_username[body[k]]
            if store.get("payrollLocks", l["id"]):
                skip("payrollLocks", l["id"], "duplicate id")
                continue
            store.insert(Rec("payrollLocks", l["id"], body))
            count("payrollLocks")

        # ---- deletedRecords (trash) -> soft-deleted rows that can be restored
        for it in data.get("deletedRecords", []):
            coll, rec = it.get("coll"), it.get("rec") or {}
            if coll not in TRASH_COLLECTIONS or not rec.get("id"):
                skip("deletedRecords", it.get("id"), "unknown collection or record without id")
                continue
            if store.get(coll, rec["id"]):
                skip("deletedRecords", it.get("id"), "a record with this id already exists")
                continue
            allowed = allowed_fields(coll)
            body = {k: v for k, v in rec.items() if k != "id" and (allowed is None or k in allowed)}
            r = Rec(coll, rec["id"], body, employee_id=rec.get("employee_id"))
            r.deleted_at, r.deleted_via, r.delete_label = it.get("at") or now_iso(), "trash", it.get("label")
            store.insert(r)
            count("deletedRecords")

        # ---- settings / alertStates (values kept as stored; '' is NOT converted here)
        for k, v in (data.get("settings") or {}).items():
            store.kv_put("settings", k, v)
            count("settings")
        for k, v in (data.get("alertStates") or {}).items():
            store.kv_put("alertStates", k, v)
            count("alertStates")

        # ---- legacy audit rows: text only, nothing invented
        for a in data.get("auditLog", []):
            store.audit_add({"at": a.get("at"), "user_id": by_username.get(a.get("user")), "username": a.get("user"), "user_name": a.get("user_name"),
                             "role": a.get("role"), "action": a.get("action") or "legacy", "module": a.get("section"), "section": a.get("section"),
                             "text": a.get("text"), "legacy": True, "legacy_text": a.get("text")})
            count("auditLog")

        # ---- files (documents + photos) copied from the old folder, only when asked for
        if files_root and doc_root:
            report["files"] = _copy_files(data, files_root, doc_root, dry_run)

        summary = {"applied": stats, "skipped": len(skipped)}
        report["applied"], report["skipped_records"] = stats, skipped
        report["skipped"] = len(skipped)
        store.migration_record(source_sha256, "apply", summary, report)
        store.audit_add({"action": "migration", "module": "migration", "section": "migration", "username": "system",
                         "text": "اجرای مهاجرت از فایل داده (SHA-256 %s…)" % source_sha256[:12], "after": summary})
    return report


def _safe_rel(rel: str) -> Optional[str]:
    parts = [p for p in str(rel).replace("\\", "/").split("/") if p not in ("", ".")]
    if not parts or any(p == ".." for p in parts):
        return None
    return "/".join(parts)


def _copy_files(data: dict, files_root: str, doc_root: str, dry_run: bool) -> dict:
    out = {"copied": 0, "missing": [], "unsafe": [], "code_mismatch": []}
    code_of = {e["id"]: e.get("code") for e in data.get("employees", [])}
    items = [(d.get("employee_id"), d.get("relativePath"), "documents:%s" % d.get("id")) for d in data.get("documents", [])]
    items += [(e["id"], e.get("photo_path"), "photo:%s" % e["id"]) for e in data.get("employees", []) if e.get("photo_path")]
    for eid, rel, label in items:
        safe = _safe_rel(rel or "")
        if not safe:
            out["unsafe"].append(label)
            continue
        if code_of.get(eid) and not safe.startswith("پرسنل/%s/" % code_of[eid]):
            out["code_mismatch"].append(label)
        src = os.path.join(files_root, *safe.split("/"))
        if not os.path.isfile(src):
            out["missing"].append(label)
            continue
        if not dry_run:
            dst = os.path.join(doc_root, *safe.split("/"))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
        out["copied"] += 1
    return out


def apply_file(store, path: str, **kw) -> dict:
    raw = open(path, "rb").read()
    return apply_migration(store, json.loads(raw.decode("utf-8")), hashlib.sha256(raw).hexdigest(), **kw)
