"""Migration PREVIEW (read-only): classifies what `apply` would do. Never writes to the source or to a database.
Usage: python -m app.cli migrate-preview FILE.json"""
import datetime
import hashlib
import json
from collections import Counter, OrderedDict

from ..core.validation import allowed_fields, split_employee
from ..specs import CLIENT_META, COLLECTION_SPECS, ROLE_PERMS, TRASH_COLLECTIONS

KNOWN_TOP = set(COLLECTION_SPECS) | {"employees", "payrollLocks", "documents", "auditLog", "users", "settings", "alertStates", "deletedRecords", "schemaVersion"}
RECORD_LISTS = [k for k in KNOWN_TOP if k not in ("settings", "alertStates", "schemaVersion")]


def _iso_ok(s):
    try:
        datetime.date.fromisoformat(str(s)[:10])
        return True
    except Exception:
        return False


def build_preview(data: dict, source_sha256: str = "") -> dict:
    rep = OrderedDict(source_sha256=source_sha256, counts={}, migrated=0, skipped=0, failed=0, data_insufficient=0, duplicates=0,
                      warnings=0, blocking=0, issues=[], absent_collections=[], unknown_top_level=[], units=[], notes=[])
    issues = rep["issues"]
    failed, di, warn, dup, block = set(), set(), set(), set(), set()

    def add(kind, coll, rid, problem, reason, action, blocking=False):
        issues.append({"collection": coll, "record_id": rid, "severity": kind, "problem": problem, "reason": reason, "suggested_action": action})
        {"failed": failed, "data_insufficient": di, "warning": warn, "duplicate": dup}[kind].add((coll, rid))
        if blocking:
            block.add((coll, rid, problem))

    rep["unknown_top_level"] = [k for k in data if k not in KNOWN_TOP]
    for k in rep["unknown_top_level"]:
        add("data_insufficient", k, "*", "unknown_collection", "collection is not known to the system; not migrated", "review", True)
    rep["absent_collections"] = sorted(c for c in KNOWN_TOP if c not in data and c not in ("schemaVersion",))
    users = data.get("users", [])
    usernames = {u.get("username") for u in users}
    user_ids = {u.get("id") for u in users}
    employees = data.get("employees", [])
    emp_ids = {e.get("id") for e in employees}
    total = 0
    for coll in RECORD_LISTS:
        recs = data.get(coll, [])
        rep["counts"][coll] = len(recs)
        total += len(recs)
        seen = Counter(r.get("id") for r in recs if isinstance(r, dict))
        for rid, n in seen.items():
            if n > 1:
                add("duplicate", coll, rid, "duplicate_id", "same id appears %d times" % n, "decide which record wins", True)
    codes = Counter(e.get("code") for e in employees if e.get("code"))
    depts = OrderedDict()
    for e in employees:
        rid = e.get("id")
        cols, sens, extra, iss = split_employee(e)
        if cols.get("department"):
            depts[cols["department"]] = 1
        for it in iss:
            add("failed" if it["severity"] == "failed" else "data_insufficient", "employees", rid, "%s:%s" % (it["problem"], it["field"]), it["reason"], "add the field to HR_FIELD_OVERRIDES / TIER lists if legitimate", True)
        empties = [k for k, v in e.items() if v == ""]
        if empties:
            add("warning", "employees", rid, "empty_strings_to_null", "%d empty-string fields become NULL: %s" % (len(empties), ", ".join(empties)), "none (documented rule)")
        if e.get("manager_id") and e["manager_id"] not in emp_ids:
            add("failed", "employees", rid, "broken_reference", "manager_id %s not found" % e["manager_id"], "fix reference", True)
        for dcol in ("hire_date", "exit_date"):
            if e.get(dcol) and not _iso_ok(e[dcol]):
                add("failed", "employees", rid, "invalid_date", dcol, "fix date", True)
        if e.get("code") and codes[e["code"]] > 1:
            add("duplicate", "employees", rid, "duplicate_code", "employee code %s repeated" % e["code"], "codes name the document folders; make them unique", True)
        if e.get("exit_date") and e.get("settlement_status") not in (None, "", "تکمیل‌شده"):
            add("warning", "employees", rid, "exit_without_completed_settlement", "exit_date set; settlement_status=%r" % e.get("settlement_status"), "review settlement")
        ph = e.get("phone")
        if ph not in (None, "") and (not str(ph).isdigit() or len(str(ph)) != 11):
            add("warning", "employees", rid, "phone_format", "phone length %d (kept as is)" % len(str(ph)), "confirm number")
    rep["units"] = list(depts)

    for coll, spec in COLLECTION_SPECS.items():
        if coll == "employees":
            continue
        allowed = allowed_fields(coll)
        for r in data.get(coll, []):
            if not isinstance(r, dict):
                continue
            rid = r.get("id")
            if allowed is not None:
                unknown = [k for k in r if k != "id" and k not in allowed]
                for k in unknown:
                    add("data_insufficient", coll, rid, "unknown_field:%s" % k, "field not in the allowlist for %s; not migrated" % coll, "add via HR_FIELD_OVERRIDES after review", True)
            if spec["employee_scoped"] and r.get("employee_id") not in emp_ids:
                add("failed", coll, rid, "broken_reference", "employee_id %r not found" % r.get("employee_id"), "fix reference", True)
            if coll == "leaves" and r.get("start_date") and r.get("end_date") and r["end_date"] < r["start_date"]:
                add("failed", coll, rid, "invalid_range", "end_date before start_date", "fix dates", True)

    for u in users:
        rid = u.get("id")
        pw = u.get("pw") or {}
        if pw.get("algo") == "sha256":
            add("warning", "users", rid, "legacy_sha256", "unsalted legacy hash; upgraded to Argon2id on first login", "none")
        elif pw.get("algo") != "pbkdf2":
            add("failed", "users", rid, "unknown_password_algo", "algo=%r" % pw.get("algo"), "set the password with the CLI", True)
        if u.get("role") not in ROLE_PERMS:
            add("failed", "users", rid, "unknown_role", "role=%r" % u.get("role"), "fix role", True)
        add("data_insufficient", "users", rid, "unit_scope", "no unit data on users; unit access is set by --all-units-roles", "assign units per user in the admin UI")

    refs = Counter()
    for coll, f in (("auditLog", "user"), ("payrollAdjustments", "created_by")):
        for r in data.get(coll, []):
            if r.get(f) is not None:
                refs[r[f]] += 1
    for a, n in refs.items():
        if a == "system":
            add("warning", "auditLog", "system", "system_actor", "%d references to 'system' -> non-login system user" % n, "automatic")
        elif a not in usernames and a not in user_ids:
            add("data_insufficient", "auditLog", str(a), "unknown_actor", "actor %r not in users (%d refs); kept as legacy text" % (a, n), "none")
    legacy = data.get("auditLog", [])
    if legacy:
        add("warning", "auditLog", "*", "legacy_text_only", "%d rows kept as legacy_text; no before/after/IP/UA invented" % len(legacy), "none (documented rule)")
    for l in data.get("payrollLocks", []):
        rid = l.get("id")
        if "snapshotVersion" not in l and l.get("snapshot"):
            add("warning", "payrollLocks", rid, "legacy_snapshot", "older snapshot format (no snapshotVersion/side snapshots)", "kept as is; nothing fabricated")
        for k in ("reviewed_by", "approved_by", "unlocked_by"):
            if l.get(k) and l[k] in usernames and l[k] not in user_ids:
                add("warning", "payrollLocks", rid, "actor_by_username", "%s holds a username; mapped to users.id" % k, "automatic")
    for it in data.get("deletedRecords", []):
        if it.get("coll") not in TRASH_COLLECTIONS:
            add("data_insufficient", "deletedRecords", it.get("id"), "unknown_collection:%s" % it.get("coll"), "trash item for a collection that is not allowed; not migrated", "review", True)
    for c in rep["absent_collections"]:
        add("warning", c, "*", "collection_absent_in_file", "known to the system, absent in the file", "confirm with the full export")

    rep["total"] = total
    rep["failed"], rep["data_insufficient"], rep["duplicates"], rep["warnings"] = len(failed), len(di), len(dup), len(warn)
    rep["blocking"] = len(block)
    rep["migrated"] = total - len({k for k in failed})
    rep["notes"] = ["PREVIEW ONLY: nothing was written.",
                    "Counts are distinct (collection, record) pairs; alertStates/settings are key-value maps and are not counted in `total`.",
                    "`blocking` items stop `migrate-apply` unless --accept-blocking is given (those fields/records are then skipped, never guessed)."]
    return rep


def preview_file(path: str) -> dict:
    raw = open(path, "rb").read()
    return build_preview(json.loads(raw.decode("utf-8")), hashlib.sha256(raw).hexdigest())
