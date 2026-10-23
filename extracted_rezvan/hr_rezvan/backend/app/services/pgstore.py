"""PostgreSQL implementation of the store interface (psycopg 3).
Status: UNTESTED — no PostgreSQL / psycopg in the authoring environment. The same interface is covered by tests via MemoryStore."""
import decimal
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

from psycopg.types.json import Jsonb

from ..specs import EMPLOYEE_COLUMNS, TIER_A, TIER_B
from .store import Rec

_EMP_COLS = ("code", "full_name", "level", "manager_id", "phone", "settlement_status")
_NUM = ("salary", "settlement_amount")


def _plain(v):
    if isinstance(v, decimal.Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    return v


def _iso(d):
    return d.isoformat() if d is not None and hasattr(d, "isoformat") else d


class PgStore:
    def __init__(self, conn):
        self.conn = conn

    @contextmanager
    def atomic(self):
        with self.conn.transaction():
            yield

    def _q(self, sql, params=()):
        return self.conn.execute(sql, params)

    def require_approved_payroll_review(self, month):
        """The real PostgreSQL store must refuse unreviewed lock transitions.

        All client paths (REST and /api/sync/push) use SyncService._lock.
        """
        from ..core.payroll_review_gate import valid_approved_packet_for_lock
        from ..errors import ApiError
        try:
            return valid_approved_packet_for_lock(self.conn, month)
        except ValueError as exc:
            raise ApiError('PAYROLL_LOCKED', message=str(exc), sub='PAYROLL_REVIEW_REQUIRED') from exc

    # ------------------------------------------------------------------ employees <-> Rec
    _EMP_SQL = ("SELECT e.*, s.salary, s.settlement_amount, s.national_id, s.ins_no, s.bank, s.account, s.sheba "
                "FROM employees e LEFT JOIN employee_sensitive s ON s.employee_id = e.id")

    @staticmethod
    def _emp_rec(r) -> Rec:
        d: Dict[str, Any] = {"id": r["id"]}
        for c in _EMP_COLS:
            if r[c] is not None:
                d[c] = r[c]
        if r["department_legacy"] is not None:
            d["department"] = r["department_legacy"]
        for c in ("hire_date", "exit_date"):
            if r[c] is not None:
                d[c] = _iso(r[c])
        d.update(r["extra"] or {})
        for c in list(TIER_A):
            if r.get(c) is not None:
                d[c] = _plain(r[c])
        return Rec("employees", r["id"], d, version=r["version"], unit_id=r["unit_id"],
                   deleted_at=_iso(r["deleted_at"]), deleted_by=r["deleted_by"], delete_reason=r["delete_reason"],
                   deleted_via=r["deleted_via"], created_at=_iso(r["created_at"]), updated_at=_iso(r["updated_at"]))

    @staticmethod
    def _rec(r) -> Rec:
        return Rec(r["collection"], r["id"], r["data"], version=r["version"], employee_id=r["employee_id"],
                   deleted_at=_iso(r["deleted_at"]), deleted_by=r["deleted_by"], delete_reason=r["delete_reason"],
                   deleted_via=r["deleted_via"], delete_label=r["delete_label"], created_at=_iso(r["created_at"]),
                   updated_at=_iso(r["updated_at"]))

    def get(self, collection: str, rid: str, lock: bool = False) -> Optional[Rec]:
        if collection == "employees":
            if lock:
                self._q("SELECT id FROM employees WHERE id = %s FOR UPDATE", (rid,))
            r = self._q(self._EMP_SQL + " WHERE e.id = %s", (rid,)).fetchone()
            return self._emp_rec(r) if r else None
        r = self._q("SELECT * FROM records WHERE collection = %s AND id = %s" + (" FOR UPDATE" if lock else ""), (collection, rid)).fetchone()
        return self._rec(r) if r else None

    def list(self, collection: str, include_deleted: bool = False) -> List[Rec]:
        if collection == "employees":
            rows = self._q(self._EMP_SQL + ("" if include_deleted else " WHERE e.deleted_at IS NULL") + " ORDER BY e.created_at, e.id").fetchall()
            return [self._emp_rec(r) for r in rows]
        rows = self._q("SELECT * FROM records WHERE collection = %s" + ("" if include_deleted else " AND deleted_at IS NULL") +
                       " ORDER BY created_at, id", (collection,)).fetchall()
        return [self._rec(r) for r in rows]

    def live_exists(self, collection: str, employee_id: str) -> bool:
        return self._q("SELECT 1 FROM records WHERE collection = %s AND employee_id = %s AND deleted_at IS NULL LIMIT 1",
                       (collection, employee_id)).fetchone() is not None

    def _emp_write(self, rec: Rec, insert: bool):
        d = dict(rec.data)
        cols = {c: d.get(c) for c in _EMP_COLS}
        extra = {k: d[k] for k in TIER_B if k in d}
        hire, exit_ = (d.get("hire_date") or None), (d.get("exit_date") or None)
        hire = hire[:10] if hire else None
        exit_ = exit_[:10] if exit_ else None
        if insert:
            self._q("INSERT INTO employees (id, code, full_name, unit_id, department_legacy, level, manager_id, hire_date, exit_date, phone, "
                    "settlement_status, extra) VALUES (%s,%s,%s,%s,%s,%s,%s,%s::date,%s::date,%s,%s,%s)",
                    (rec.id, cols["code"], cols["full_name"], rec.unit_id, d.get("department"), cols["level"], cols["manager_id"],
                     hire, exit_, cols["phone"], cols["settlement_status"], Jsonb(extra)))
        else:
            self._q("UPDATE employees SET code=%s, full_name=%s, unit_id=%s, department_legacy=%s, level=%s, manager_id=%s, hire_date=%s::date, "
                    "exit_date=%s::date, phone=%s, settlement_status=%s, extra=%s, version=version+1, updated_at=now(), "
                    "deleted_at=%s, deleted_by=%s, delete_reason=%s, deleted_via=%s WHERE id=%s",
                    (cols["code"], cols["full_name"], rec.unit_id, d.get("department"), cols["level"], cols["manager_id"], hire, exit_,
                     cols["phone"], cols["settlement_status"], Jsonb(extra), rec.deleted_at, rec.deleted_by, rec.delete_reason, rec.deleted_via, rec.id))
        sens = {k: d.get(k) for k in TIER_A}
        if any(v is not None for v in sens.values()):
            names = list(sens)
            self._q("INSERT INTO employee_sensitive (employee_id, %s) VALUES (%%s, %s) ON CONFLICT (employee_id) DO UPDATE SET %s, version = employee_sensitive.version + 1"
                    % (", ".join(names), ", ".join(["%s"] * len(names)), ", ".join("%s = EXCLUDED.%s" % (n, n) for n in names)),
                    (rec.id, *[sens[n] for n in names]))

    def insert(self, rec: Rec) -> Rec:
        if rec.collection == "employees":
            self._emp_write(rec, True)
            return rec
        self._q("INSERT INTO records (collection, id, employee_id, data) VALUES (%s,%s,%s,%s)",
                (rec.collection, rec.id, rec.employee_id, Jsonb(rec.data)))
        return rec

    def save(self, rec: Rec) -> Rec:
        if rec.collection == "employees":
            self._emp_write(rec, False)
            rec.version += 1
            return rec
        self._q("UPDATE records SET data=%s, employee_id=%s, version=version+1, updated_at=now(), deleted_at=%s, deleted_by=%s, "
                "delete_reason=%s, deleted_via=%s, delete_label=%s WHERE collection=%s AND id=%s",
                (Jsonb(rec.data), rec.employee_id, rec.deleted_at, rec.deleted_by, rec.delete_reason, rec.deleted_via,
                 rec.delete_label, rec.collection, rec.id))
        rec.version += 1
        return rec

    def purge(self, collection: str, rid: str):
        if collection == "employees":
            self._q("DELETE FROM employee_sensitive WHERE employee_id = %s", (rid,))
            self._q("DELETE FROM employees WHERE id = %s", (rid,))
        else:
            self._q("DELETE FROM records WHERE collection = %s AND id = %s", (collection, rid))

    # ------------------------------------------------------------------ units
    def units_all(self) -> List[dict]:
        return [dict(r) for r in self._q("SELECT id, name FROM units ORDER BY id")]

    def unit_by_name(self, name: str) -> Optional[int]:
        r = self._q("SELECT id FROM units WHERE name = %s", (name,)).fetchone()
        return r["id"] if r else None

    def unit_create(self, name: str) -> int:
        return self._q("INSERT INTO units (name, legacy_value) VALUES (%s,%s) RETURNING id", (name, name)).fetchone()["id"]

    def unit_of_employee(self, eid: str) -> Optional[int]:
        r = self._q("SELECT unit_id FROM employees WHERE id = %s", (eid,)).fetchone()
        return r["unit_id"] if r else None

    # ------------------------------------------------------------------ users
    def _user(self, r) -> dict:
        units = [x["unit_id"] for x in self._q("SELECT unit_id FROM user_units WHERE user_id = %s", (r["id"],))]
        pw = {"algo": r["pw_algo"], "iter": r["pw_iter"], "salt": r["pw_salt"], "hash": r["pw_hash"]}
        return {"id": r["id"], "username": r["username"], "legacy_username": r["legacy_username"], "name": r["name"], "role": r["role_id"],
                "active": r["active"], "is_system": r["is_system"], "all_units": r["all_units"], "perms_add": r["perms_add"],
                "perms_remove": r["perms_remove"], "pw": pw, "unit_ids": units, "created_at": _iso(r["created_at"]),
                "last_login": _iso(r["last_login"]), "version": r["version"]}

    def users_all(self) -> List[dict]:
        return [self._user(r) for r in self._q("SELECT * FROM users ORDER BY created_at, id").fetchall()]

    def user_by_id(self, uid: str) -> Optional[dict]:
        r = self._q("SELECT * FROM users WHERE id = %s", (uid,)).fetchone()
        return self._user(r) if r else None

    def user_by_username(self, username: str) -> Optional[dict]:
        r = self._q("SELECT * FROM users WHERE lower(username) = lower(%s)", (username,)).fetchone()
        return self._user(r) if r else None

    def user_save(self, u: dict) -> dict:
        pw = u.get("pw") or {}
        self._q("INSERT INTO users (id, username, legacy_username, name, role_id, active, is_system, all_units, perms_add, perms_remove, "
                "pw_algo, pw_iter, pw_salt, pw_hash, last_login, created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,COALESCE(%s::timestamptz, now())) "
                "ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username, name=EXCLUDED.name, role_id=EXCLUDED.role_id, active=EXCLUDED.active, "
                "all_units=EXCLUDED.all_units, perms_add=EXCLUDED.perms_add, perms_remove=EXCLUDED.perms_remove, pw_algo=EXCLUDED.pw_algo, "
                "pw_iter=EXCLUDED.pw_iter, pw_salt=EXCLUDED.pw_salt, pw_hash=EXCLUDED.pw_hash, last_login=EXCLUDED.last_login, version=users.version+1",
                (u["id"], u["username"], u.get("legacy_username"), u["name"], u["role"], u.get("active", True), u.get("is_system", False),
                 u.get("all_units", False), list(u.get("perms_add") or []), list(u.get("perms_remove") or []), pw.get("algo"), pw.get("iter"),
                 pw.get("salt"), pw.get("hash"), u.get("last_login"), u.get("created_at")))
        keep = list(u.get("unit_ids") or [])
        self._q("DELETE FROM user_units WHERE user_id = %s AND NOT (unit_id = ANY(%s))", (u["id"], keep))     # keeps per-unit roles of units that stay
        for uid_ in keep:
            self._q("INSERT INTO user_units (user_id, unit_id) VALUES (%s,%s) ON CONFLICT DO NOTHING", (u["id"], uid_))
        return u

    def user_unit_role_set(self, uid: str, unit_id: int, role: Optional[str]):
        self._q("UPDATE user_units SET role_id = %s WHERE user_id = %s AND unit_id = %s", (role, uid, unit_id))

    def user_set_password(self, uid: str, pw: dict):
        self._q("UPDATE users SET pw_algo=%s, pw_iter=%s, pw_salt=%s, pw_hash=%s, version=version+1 WHERE id=%s",
                (pw.get('algo'), pw.get('iter'), pw.get('salt'), pw.get('hash'), uid))

    def user_delete(self, uid: str):
        self._q("DELETE FROM users WHERE id = %s", (uid,))

    # ------------------------------------------------------------------ kv
    def kv_all(self, ns: str) -> Dict[str, tuple]:
        return {r["key"]: (r["value"], r["version"]) for r in self._q("SELECT key, value, version FROM kv WHERE ns = %s", (ns,))}

    def kv_get(self, ns: str, key: str) -> Optional[tuple]:
        r = self._q("SELECT value, version FROM kv WHERE ns = %s AND key = %s", (ns, key)).fetchone()
        return (r["value"], r["version"]) if r else None

    def kv_put(self, ns: str, key: str, value: Any) -> int:
        return self._q("INSERT INTO kv (ns, key, value) VALUES (%s,%s,%s) ON CONFLICT (ns, key) DO UPDATE SET value = EXCLUDED.value, "
                       "version = kv.version + 1, updated_at = now() RETURNING version", (ns, key, Jsonb(value))).fetchone()["version"]

    def kv_delete(self, ns: str, key: str):
        self._q("DELETE FROM kv WHERE ns = %s AND key = %s", (ns, key))

    # ------------------------------------------------------------------ migration bookkeeping
    def migration_applied(self, sha: str) -> bool:
        return self._q("SELECT 1 FROM migration_runs WHERE source_sha256 = %s AND mode = 'apply' AND finished_at IS NOT NULL", (sha,)).fetchone() is not None

    def migration_record(self, sha: str, mode: str, summary: dict, report: dict):
        self._q("INSERT INTO migration_runs (mode, source_sha256, finished_at, summary, report) VALUES (%s,%s,now(),%s,%s)", (mode, sha, Jsonb(summary), Jsonb(report)))

    # ------------------------------------------------------------------ audit
    def audit_add(self, row: dict):
        self._q("INSERT INTO audit_log (user_id, username, user_name, role, action, module, section, text, record_id, employee_id, "
                "before, after, ip, ua, result, reason, legacy, legacy_text, at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,COALESCE(%s::timestamptz, now()))",
                (row.get("user_id"), row.get("username"), row.get("user_name"), row.get("role"), row["action"], row.get("module"),
                 row.get("section"), row.get("text"), row.get("record_id"), row.get("employee_id"),
                 Jsonb(row["before"]) if row.get("before") is not None else None, Jsonb(row["after"]) if row.get("after") is not None else None,
                 row.get("ip"), row.get("ua"), row.get("result"), row.get("reason"), bool(row.get("legacy")), row.get("legacy_text"), row.get("at")))

    def audit_list(self, limit: int = 500) -> List[dict]:
        rows = self._q("SELECT * FROM audit_log ORDER BY id DESC LIMIT %s", (limit,)).fetchall()
        out = []
        for r in rows:
            r = dict(r)
            r["at"] = _iso(r["at"])
            out.append(r)
        return out
