"""Storage interface used by the sync service + an in-memory implementation (used by the unit tests).
PgStore (services/pgstore.py) implements the same methods on PostgreSQL."""
import copy
import datetime
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


@dataclass
class Rec:
    collection: str
    id: str
    data: dict
    version: int = 1
    employee_id: Optional[str] = None
    unit_id: Optional[int] = None          # employees only
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None
    delete_reason: Optional[str] = None
    deleted_via: Optional[str] = None      # 'flag' | 'trash'
    delete_label: Optional[str] = None
    created_at: str = field(default_factory=now_iso)
    updated_at: Optional[str] = None

    @property
    def deleted(self) -> bool:
        return self.deleted_at is not None


class MemoryStore:
    def __init__(self):
        self.recs: Dict[tuple, Rec] = {}
        self._users: Dict[str, dict] = {}
        self._units: Dict[int, str] = {}
        self._kv: Dict[tuple, tuple] = {}
        self.audit_rows: List[dict] = []
        self.files: Dict[str, bytes] = {}
        self.migrations: Dict[str, dict] = {}

    # ---- transactions
    @contextmanager
    def atomic(self):
        snap = (copy.deepcopy(self.recs), copy.deepcopy(self._users),
                copy.deepcopy(self._units), copy.deepcopy(self._kv), len(self.audit_rows))
        try:
            yield
        except BaseException:
            self.recs, self._users, self._units, self._kv = snap[:4]
            del self.audit_rows[snap[4]:]
            raise

    # ---- records (employees included; Tier A merged in `data`)
    def get(self, collection: str, rid: str, lock: bool = False) -> Optional[Rec]:
        return self.recs.get((collection, rid))

    def list(self, collection: str, include_deleted: bool = False) -> List[Rec]:
        return [r for (c, _), r in self.recs.items() if c == collection and (include_deleted or not r.deleted)]

    def insert(self, rec: Rec) -> Rec:
        self.recs[(rec.collection, rec.id)] = rec
        return rec

    def save(self, rec: Rec) -> Rec:
        rec.version += 1
        rec.updated_at = now_iso()
        self.recs[(rec.collection, rec.id)] = rec
        return rec

    def purge(self, collection: str, rid: str):
        self.recs.pop((collection, rid), None)

    def live_exists(self, collection: str, employee_id: str) -> bool:
        return any(r.employee_id == employee_id for r in self.list(collection))

    # ---- units
    def units_all(self) -> List[dict]:
        return [{"id": i, "name": n} for i, n in sorted(self._units.items())]

    def unit_by_name(self, name: str) -> Optional[int]:
        for i, n in self._units.items():
            if n == name:
                return i
        return None

    def unit_create(self, name: str) -> int:
        i = max(self._units, default=0) + 1
        self._units[i] = name
        return i

    def unit_of_employee(self, eid: str) -> Optional[int]:
        r = self.get("employees", eid)
        return r.unit_id if r else None

    # ---- users
    def users_all(self) -> List[dict]:
        return list(self._users.values())

    def user_by_id(self, uid: str) -> Optional[dict]:
        return self._users.get(uid)

    def user_by_username(self, username: str) -> Optional[dict]:
        for u in self._users.values():
            if u["username"].lower() == username.lower():
                return u
        return None

    def user_save(self, u: dict) -> dict:
        self._users[u["id"]] = u
        return u

    def user_set_password(self, uid: str, pw: dict):
        self._users[uid]['pw'] = pw

    def user_delete(self, uid: str):
        self._users.pop(uid, None)

    # ---- settings / alertStates (key/value with version)
    def kv_all(self, ns: str) -> Dict[str, tuple]:
        return {k: v for (n, k), v in self._kv.items() if n == ns}

    def kv_get(self, ns: str, key: str) -> Optional[tuple]:
        return self._kv.get((ns, key))

    def kv_put(self, ns: str, key: str, value: Any) -> int:
        cur = self._kv.get((ns, key))
        ver = (cur[1] + 1) if cur else 1
        self._kv[(ns, key)] = (copy.deepcopy(value), ver)
        return ver

    def kv_delete(self, ns: str, key: str):
        self._kv.pop((ns, key), None)

    # ---- migration bookkeeping
    def migration_applied(self, sha: str) -> bool:
        return sha in self.migrations

    def migration_record(self, sha: str, mode: str, summary: dict, report: dict):
        if mode == 'apply':
            self.migrations[sha] = summary

    # ---- audit (append-only: no update/delete methods exist)
    def audit_add(self, row: dict):
        row = dict(row)
        row.setdefault("at", now_iso())
        row["id"] = len(self.audit_rows) + 1
        self.audit_rows.append(row)

    def audit_list(self, limit: int = 500) -> List[dict]:
        return list(reversed(self.audit_rows[-limit:]))
