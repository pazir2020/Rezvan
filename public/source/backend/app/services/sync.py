"""Sync service: builds the DATA-shaped bootstrap for the legacy client and applies its change batches.

Every operation is checked on the server: Permission AND Unit Scope AND Record Scope, field-level sensitive rules,
approval rules, payroll-lock rules (observed behaviour only), optimistic versions (409), allowlists (no mass assignment),
and is audited. A batch is all-or-nothing (store.atomic()).
Status: logic covered by tests/ (MemoryStore). The PostgreSQL store is UNTESTED."""
import copy
import datetime
from dataclasses import dataclass
import json
from typing import Any, Dict, List, Optional

from ..core import locks, validation
from ..core.policy import Principal, check_access, check_operation, has_permission, in_unit_scope
from ..errors import ApiError, conflict, forbidden, invalid, not_found
from ..specs import (COLLECTION_SPECS, LOCK_FIELDS, ROLE_PERMS, SETTINGS_PERM_DEFAULT, SETTINGS_PERMS, TIER_A, TIER_B,
                     TRASH_COLLECTIONS, CLIENT_META)
from .store import MemoryStore, Rec, now_iso

SCHEMA_VERSION = 3
RECORD_COLLECTIONS = [c for c in COLLECTION_SPECS if c != "documents"]
ALL_COLLECTIONS = list(COLLECTION_SPECS)
_PHASE = {"employees": 0, "units": 1, "settings": 1, "alertStates": 1, "payrollLocks": 3, "deletedRecords": 4}
MONTH_OK = lambda m: isinstance(m, str) and len(m) == 7 and m[4] == "-" and m[:4].isdigit() and m[5:].isdigit()


@dataclass
class Actor:
    principal: Principal
    user_id: str
    username: str
    name: str
    ip: Optional[str] = None
    ua: Optional[str] = None


def current_month_key() -> str:
    d = datetime.date.today()
    return "%04d-%02d" % (d.year, d.month)


class SyncService:
    def __init__(self, store, actor: Actor, month_now=current_month_key):
        self.s, self.a, self.p = store, actor, actor.principal
        self.month_now = month_now

    # ------------------------------------------------------------------ helpers
    def _has(self, perm: str, unit: Optional[int] = None) -> bool:
        return has_permission(self.p, perm, unit)

    def _need(self, perms: List[str], unit: Optional[int], scoped: bool, operation: str):
        d = check_operation(self.p, operation=operation, operation_permission=perms[0], also_requires=perms[1:],
                            unit_id=unit, employee_scoped=scoped)
        if not d.allowed:
            raise forbidden(d.code, {"permission": d.detail})

    def _audit(self, action, module, text, *, rid=None, eid=None, before=None, after=None, reason=None, section=None, result="ok"):
        self.s.audit_add({"user_id": self.a.user_id, "username": self.a.username, "user_name": self.a.name,
                          "role": self.p.role_id, "action": action, "module": module, "section": section or module,
                          "text": text, "record_id": rid, "employee_id": eid, "before": before, "after": after,
                          "ip": self.a.ip, "ua": self.a.ua, "result": result, "reason": reason})

    def _safe(self, collection: str, data: Optional[dict]) -> Optional[dict]:
        """Audit payloads never contain sensitive values (only their names)."""
        if data is None:
            return None
        hide = set(TIER_A) | set(COLLECTION_SPECS.get(collection, {}).get("sensitive", {}))
        return {k: ("«حساس»" if k in hide else v) for k, v in data.items()}

    def _emp_unit_map(self) -> Dict[str, Optional[int]]:
        return {r.id: r.unit_id for r in self.s.list("employees", include_deleted=True)}

    def _locks(self) -> List[Rec]:
        return self.s.list("payrollLocks")

    def _locked_months(self) -> set:
        return {l.data.get("month") for l in self._locks() if l.data.get("status") == "locked"}

    def _unit_for(self, spec: dict, employee_id: Optional[str]) -> Optional[int]:
        if not spec["employee_scoped"]:
            return None
        if not employee_id:
            raise invalid("MISSING_FIELD", [{"field": "employee_id"}])
        emp = self.s.get("employees", employee_id)
        if not emp or emp.deleted:
            raise invalid("BROKEN_REFERENCE", [{"field": "employee_id", "value": employee_id}])
        return emp.unit_id

    # ------------------------------------------------------------------ bootstrap
    def bootstrap(self) -> dict:
        p, s = self.p, self.s
        data: Dict[str, Any] = {"schemaVersion": SCHEMA_VERSION}
        versions: Dict[str, Dict[str, int]] = {}
        emp_units = self._emp_unit_map()

        emps, ver = [], {}
        for r in s.list("employees"):
            if not check_access(p, ["view_personnel"], unit_id=r.unit_id).allowed:
                continue
            d = {k: v for k, v in r.data.items() if k not in TIER_A or self._has(TIER_A[k], r.unit_id)}
            d["id"] = r.id
            emps.append(d); ver[r.id] = r.version
        data["employees"], versions["employees"] = emps, ver

        trash = []
        for c, spec in COLLECTION_SPECS.items():
            out, ver = [], {}
            for r in s.list(c, include_deleted=True):
                unit = emp_units.get(r.employee_id) if spec["employee_scoped"] else None
                if not check_access(p, [spec["read"]], unit_id=unit, employee_scoped=spec["employee_scoped"]).allowed:
                    continue
                if c == "documents" and r.data.get("confidential") and not self._has("view_confidential_docs", unit):
                    continue
                body = validation.filter_read(c, r.data, lambda perm, u=unit: self._has(perm, u))
                body["id"] = r.id
                if r.deleted and r.deleted_via == "trash":
                    if self._has("delete_sensitive"):
                        trash.append({"id": "del_%s_%s" % (c, r.id), "coll": c, "label": r.delete_label or "", "rec": body, "at": r.deleted_at})
                    continue
                out.append(body); ver[r.id] = r.version
            data[c], versions[c] = out, ver
        data["deletedRecords"] = trash

        locks_out, ver = [], {}
        if self._has("view_salary"):
            for r in self._locks():
                locks_out.append(dict(r.data, id=r.id)); ver[r.id] = r.version
        data["payrollLocks"], versions["payrollLocks"] = locks_out, ver

        st, ver = {}, {}
        for k, (v, n) in s.kv_all("settings").items():
            st[k], ver[k] = v, n
        data["settings"], versions["settings"] = st, ver
        al, ver = {}, {}
        if self._has("view_alerts") or self._has("manage_alerts"):
            for k, (v, n) in s.kv_all("alertStates").items():
                al[k], ver[k] = v, n
        data["alertStates"], versions["alertStates"] = al, ver

        users = s.users_all() if self._has("manage_users") else [u for u in s.users_all() if u["id"] == self.a.user_id]
        data["users"] = [{k: u.get(k) for k in ("id", "username", "name", "role", "active", "created_at", "last_login", "perms_add", "perms_remove")} for u in users]
        data["auditLog"] = []
        if self._has("view_audit"):
            data["auditLog"] = [{"id": "log%s" % r["id"], "at": r["at"], "text": r.get("text") or r["action"], "action": r["action"],
                                 "section": r.get("section") or r.get("module"), "user": r.get("username"),
                                 "user_name": r.get("user_name"), "role": r.get("role")} for r in reversed(s.audit_list(500))]
        return {"data": data, "versions": versions, "me": self.me()}

    def list_collection(self, c: str) -> dict:
        """REST view of one collection (same visibility/filtering as bootstrap)."""
        if c not in COLLECTION_SPECS and c not in ("employees", "payrollLocks"):
            raise not_found()
        b = self.bootstrap()
        return {"items": b["data"][c], "versions": b["versions"][c]}

    def me(self) -> dict:
        p = self.p
        base = set(p._perms_of(p.role_id))
        perms = ["*"] if "*" in base else sorted((base | set(p.add)) - set(p.remove))
        return {"id": self.a.user_id, "username": self.a.username, "name": self.a.name, "role": p.role_id,
                "permissions": perms, "all_units": p.all_units, "unit_ids": sorted(p.unit_ids)}

    # ------------------------------------------------------------------ push
    def push(self, ops: List[dict]) -> dict:
        if not isinstance(ops, list) or len(ops) > 5000:
            raise invalid("INVALID_BODY", message="ops must be a list (max 5000)")
        order = sorted(range(len(ops)), key=lambda i: _PHASE.get(ops[i].get("c") if isinstance(ops[i], dict) else None, 2))
        results: List[Optional[dict]] = [None] * len(ops)
        with self.s.atomic():
            amend = self._prescan_amendments(ops)
            for i in order:
                op = ops[i]
                try:
                    results[i] = self._apply(op, amend)
                except ApiError as e:
                    e.details = {"op_index": i, "collection": op.get("c") if isinstance(op, dict) else None,
                                 "id": op.get("id") if isinstance(op, dict) else None, "info": e.details}
                    raise
        return {"results": results}

    def _prescan_amendments(self, ops) -> set:
        months = set()
        for op in ops:
            if not isinstance(op, dict) or op.get("c") != "payrollLocks":
                continue
            lock = self.s.get("payrollLocks", op.get("id") or "")
            if op.get("op") == "create":
                new = (op.get("data") or {}).get("amendments") or []
                if new:
                    months.add((op.get("data") or {}).get("month"))
            elif op.get("op") == "update" and lock and "amendments" in (op.get("set") or {}):
                if len(op["set"]["amendments"] or []) > len(lock.data.get("amendments") or []):
                    months.add(lock.data.get("month"))
        return months

    def _apply(self, op: dict, amend: set) -> dict:
        if not isinstance(op, dict) or op.get("op") not in ("create", "update", "delete", "put") or not isinstance(op.get("c"), str):
            raise invalid("INVALID_BODY", message="malformed operation")
        c = op["c"]
        if c in ("users", "auditLog"):
            raise invalid("NOT_SYNCABLE", message="%s is managed by the server only" % c)
        if c == "employees":
            return self._employee(op, amend)
        if c == "payrollLocks":
            return self._lock(op)
        if c == "settings":
            return self._setting(op)
        if c == "alertStates":
            return self._alert(op)
        if c == "deletedRecords":
            return self._trash(op)
        if c in COLLECTION_SPECS:
            return self._record(op, amend)
        raise invalid("UNKNOWN_COLLECTION", details=[{"collection": c}])

    # ------------------------------------------------------------------ generic records
    def _lock_month(self, c: str, data: dict) -> Optional[str]:
        if c == "overtime":
            return data.get("month")
        if c == "loans":
            return self.month_now()           # code checks the current month for loans
        if c == "payrollAdjustments":
            return data.get("payroll_month")
        return None

    def _check_lock(self, c, operation, data, amend):
        month = self._lock_month(c, data)
        d = locks.decide(c, operation, month, self._locked_months(), has_amendment_reason=month in amend,
                         applies_to_payroll=data.get("apply_to_payroll", True) is not False)
        if not d.allowed:
            raise ApiError("PAYROLL_LOCKED" if d.code == "PAYROLL_LOCKED" else "LOCK_AMENDMENT_REQUIRED", sub=d.mode, details={"month": month})

    def _validate_data(self, c, data, *, creating):
        errs = validation.validate_keys(c, data.keys(), creating=creating) + validation.validate_values(data)
        if c == "hiringScenarios":
            errs += validation.validate_economic_scenario(data, creating=creating)
        if errs:
            code = errs[0]["code"]
            raise invalid("DATA_INSUFFICIENT" if code == "DATA_INSUFFICIENT" else "VALIDATION_ERROR", errs,
                          "ذخیره‌ی این بخش هنوز فعال نیست (ساختار آن هنوز تأیید نشده است)." if code == "DATA_INSUFFICIENT" else "")

    def _field_perms(self, c, keys, unit):
        for field, perm in validation.sensitive_field_perms(c, keys).items():
            if not self._has(perm, unit):
                raise forbidden("SENSITIVE_FIELD", {"field": field, "permission": perm})

    def _rule_perms(self, c, old, changes, unit):
        for field, perm in validation.rule_permissions(c, old, changes):
            if not self._has(perm, unit):
                raise forbidden("APPROVAL_PERMISSION", {"field": field, "permission": perm})

    def _record(self, op, amend):
        c, kind, rid = op["c"], op["op"], op.get("id")
        spec = COLLECTION_SPECS[c]
        if not isinstance(rid, str) or not validation.ID_RE.match(rid):
            raise invalid("INVALID_ID", [{"id": rid}])
        # Generated KPI payroll adjustments are exclusively managed by the dedicated
        # approval/reversal endpoints. Do not allow generic sync (or record trash)
        # to tamper with the authoritative reversible bonus entries.
        if c == "payrollAdjustments" and isinstance(rid, str) and rid.startswith("kpi-pay-"):
            raise forbidden("KPI_PAYROLL_MANAGED_ONLY", {"id": rid})
        cur = self.s.get(c, rid, lock=True)
        scoped = spec["employee_scoped"]

        if kind == "create":
            data = dict(op.get("data") or {})
            if not isinstance(op.get("data"), dict):
                raise invalid("INVALID_BODY")
            data.pop("id", None)
            if c == "documents":
                raise invalid("USE_UPLOAD_API", message="documents are created through /api/documents/upload")
            self._validate_data(c, data, creating=True)
            unit = self._unit_for(spec, data.get("employee_id"))
            if cur is not None:
                if cur.deleted and cur.deleted_via == "trash":
                    return self._restore(cur, spec, data, unit, amend)
                raise conflict("DUPLICATE_ID", [{"id": rid}])
            self._need(spec["write"], unit, scoped, "create")
            self._field_perms(c, data.keys(), unit)
            self._rule_perms(c, {}, data, unit)
            if spec["unique_employee"] and any(r.employee_id == data.get("employee_id") for r in self.s.list(c)):
                raise conflict("DUPLICATE_EMPLOYEE_RECORD")
            self._check_lock(c, "create", data, amend)
            rec = self.s.insert(Rec(c, rid, data, employee_id=data.get("employee_id")))
            self._audit("create", c, "ایجاد رکورد در %s" % c, rid=rid, eid=rec.employee_id, after=self._safe(c, data))
            return {"c": c, "id": rid, "version": rec.version}

        if cur is None or (cur.deleted and cur.deleted_via == "trash"):
            raise not_found()
        unit = self._unit_for(spec, cur.employee_id) if scoped else None
        if op.get("v") is not None and cur.version != op["v"]:
            raise conflict("VERSION_CONFLICT", {"current_version": cur.version})

        if kind == "update":
            sets = op.get("set") or {}
            unset = op.get("unset") or []
            if not isinstance(sets, dict) or not isinstance(unset, list):
                raise invalid("INVALID_BODY")
            keys = list(sets) + list(unset)
            self._validate_data(c, sets, creating=False)
            errs = validation.validate_keys(c, unset, creating=False)
            if errs:
                raise invalid("VALIDATION_ERROR", errs)
            flag_delete = sets.get("deleted") is True and not cur.data.get("deleted")
            others = [k for k in keys if k not in CLIENT_META]
            if others:
                self._need(spec["write"], unit, scoped, "edit")
            if flag_delete:
                if not spec["delete"]:
                    raise forbidden("DELETE_NOT_ALLOWED")
                self._need([spec["delete"]], unit, scoped, "delete")
            self._field_perms(c, keys, unit)
            self._rule_perms(c, cur.data, sets, unit)
            new = {k: v for k, v in cur.data.items() if k not in unset}
            new.update(sets)
            self._check_lock(c, "delete" if flag_delete else ("decision" if any(r["field"] in sets for r in spec["rules"]) else "edit"), new, amend)
            before = dict(cur.data)
            cur.data = new
            if flag_delete:
                cur.deleted_at, cur.deleted_by, cur.deleted_via = now_iso(), self.a.user_id, "flag"
            self.s.save(cur)
            self._audit("delete" if flag_delete else "update", c, "%s رکورد در %s" % ("حذف نرم" if flag_delete else "ویرایش", c),
                        rid=rid, eid=cur.employee_id, before=self._safe(c, {k: before.get(k) for k in keys}), after=self._safe(c, {k: new.get(k) for k in keys}))
            return {"c": c, "id": rid, "version": cur.version}

        if kind == "delete":
            if not spec["delete"]:
                raise forbidden("DELETE_NOT_ALLOWED")
            self._need([spec["delete"]], unit, scoped, "delete")
            self._check_lock(c, "delete", cur.data, amend)
            cur.deleted_at, cur.deleted_by, cur.deleted_via = now_iso(), self.a.user_id, "trash"
            self.s.save(cur)
            self._audit("delete", c, "حذف رکورد از %s (قابل بازیابی)" % c, rid=rid, eid=cur.employee_id, before=self._safe(c, cur.data))
            return {"c": c, "id": rid, "version": cur.version}
        raise invalid("INVALID_BODY")

    def _restore(self, cur: Rec, spec, data, unit, amend):
        c = cur.collection
        self._need(["delete_sensitive"], unit, spec["employee_scoped"], "restore")
        self._need(spec["write"], unit, spec["employee_scoped"], "create")
        self._field_perms(c, data.keys(), unit)
        cur.data = data
        cur.deleted_at = cur.deleted_by = cur.deleted_via = cur.delete_label = cur.delete_reason = None
        self.s.save(cur)
        self._audit("restore", c, "بازیابی رکورد از سطل حذف‌شده‌ها در %s" % c, rid=cur.id, eid=cur.employee_id)
        return {"c": c, "id": cur.id, "version": cur.version}

    # ------------------------------------------------------------------ deletedRecords (trash view)
    def _trash(self, op):
        kind = op["op"]
        if kind == "create":
            item = op.get("data") or {}
            coll, rec = item.get("coll"), item.get("rec") or {}
            if coll not in TRASH_COLLECTIONS or not isinstance(rec, dict):
                raise invalid("UNKNOWN_COLLECTION", [{"collection": coll}], message="trash item for an unknown collection")
            target = self.s.get(coll, rec.get("id") or "")
            if target and target.deleted and target.deleted_via == "trash":
                target.delete_label = str(item.get("label") or "")[:300]
                self.s.save(target)
            return {"c": "deletedRecords", "id": op.get("id")}
        if kind == "delete":
            tid = str(op.get("id") or "")
            parts = tid.split("_", 2)
            if len(parts) == 3 and parts[0] == "del":
                target = self.s.get(parts[1], parts[2])
                if target and target.deleted and target.deleted_via == "trash":    # permanent removal, not a restore
                    if not self._has("purge_data"):
                        raise forbidden("PERMISSION_DENIED", {"permission": "purge_data"})
                    self.s.purge(parts[1], parts[2])
                    self._audit("delete", parts[1], "حذف دائمی رکورد از سطل", rid=parts[2])
            return {"c": "deletedRecords", "id": tid}
        raise invalid("INVALID_BODY")

    # ------------------------------------------------------------------ settings / alerts
    def _setting(self, op):
        key = op.get("id") or op.get("key")
        if not isinstance(key, str) or not (1 <= len(key) <= 64) or not key.replace("_", "").isalnum():
            raise invalid("INVALID_KEY")
        perm = SETTINGS_PERMS.get(key, SETTINGS_PERM_DEFAULT)
        if not self._has(perm):
            raise forbidden("PERMISSION_DENIED", {"permission": perm})
        cur = self.s.kv_get("settings", key)
        if op["op"] == "delete":
            if cur:
                self.s.kv_delete("settings", key)
                self._audit("settings", "settings", "حذف تنظیم %s" % key, rid=key)
            return {"c": "settings", "id": key}
        if "value" not in op and "data" not in op:
            raise invalid("INVALID_BODY")
        value = op["value"] if "value" in op else op["data"]
        errs = validation.validate_values({"v": value})
        if errs:
            raise invalid("VALIDATION_ERROR", errs)
        if cur and op.get("v") is not None and cur[1] != op["v"]:
            raise conflict("VERSION_CONFLICT", {"current_version": cur[1]})
        ver = self.s.kv_put("settings", key, value)
        self._audit("settings", "settings", "تغییر تنظیم %s" % key, rid=key, section="تنظیمات")
        return {"c": "settings", "id": key, "version": ver}

    def _alert(self, op):
        key = op.get("id")
        if not isinstance(key, str) or not (1 <= len(key) <= 200) or any(ch.isspace() for ch in key):
            raise invalid("INVALID_KEY")
        if not self._has("manage_alerts"):
            raise forbidden("PERMISSION_DENIED", {"permission": "manage_alerts"})
        if op["op"] == "delete":
            self.s.kv_delete("alertStates", key)
            return {"c": "alertStates", "id": key}
        value = op["value"] if "value" in op else op.get("data")
        if not isinstance(value, dict):
            raise invalid("INVALID_BODY")
        ver = self.s.kv_put("alertStates", key, value)
        self._audit("update", "alertStates", "تغییر وضعیت هشدار", rid=key, section="هشدارها")
        return {"c": "alertStates", "id": key, "version": ver}

    # ------------------------------------------------------------------ employees
    def _unit_id_for_department(self, dept: Optional[str]) -> Optional[int]:
        if not dept:
            return None
        uid = self.s.unit_by_name(dept)
        if uid is None:
            uid = self.s.unit_create(dept)
            self._audit("create", "units", "ایجاد واحد سازمانی «%s»" % dept, rid=str(uid))
        return uid

    def _employee_blockers(self, eid: str):
        in_lock = any(l.data.get("status") == "locked" and any(r.get("employee_id") == eid for r in (l.data.get("snapshot") or [])) for l in self._locks())
        pays = self.s.live_exists("payrollPayments", eid)
        stl = self.s.live_exists("settlements", eid)
        return in_lock, pays, stl

    def _employee(self, op, amend):
        kind, eid = op["op"], op.get("id")
        if not isinstance(eid, str) or not validation.ID_RE.match(eid):
            raise invalid("INVALID_ID", [{"id": eid}])
        cur = self.s.get("employees", eid, lock=True)

        if kind == "create":
            if cur is not None:
                raise conflict("DUPLICATE_ID", [{"id": eid}])
            rec = dict(op.get("data") or {})
            rec["id"] = eid
            cols, sens, extra, issues = validation.split_employee(rec)
            if issues:
                raise invalid("DATA_INSUFFICIENT", issues)
            unit = self._unit_id_for_department(cols.get("department"))
            self._need(["write_personnel"], unit, True, "create")
            for f in sens:
                if sens[f] is not None and not self._has(TIER_A[f], unit):
                    raise forbidden("SENSITIVE_FIELD", {"field": f})
            errs = validation.validate_values({**cols, **extra})
            if errs:
                raise invalid("VALIDATION_ERROR", errs)
            code = cols.get("code")
            if code and any(r.data.get("code") == code for r in self.s.list("employees")):
                raise conflict("DUPLICATE_CODE", [{"code": code}])
            data = {**cols, **sens, **extra}
            r = self.s.insert(Rec("employees", eid, data, unit_id=unit))
            self._audit("create", "employees", "ایجاد کارمند", rid=eid, eid=eid, after=self._safe("employees", data), section="پرسنل")
            return {"c": "employees", "id": eid, "version": r.version}

        if cur is None or cur.deleted:
            raise not_found()
        if op.get("v") is not None and cur.version != op["v"]:
            raise conflict("VERSION_CONFLICT", {"current_version": cur.version})

        if kind == "update":
            sets, unset = op.get("set") or {}, op.get("unset") or []
            if not isinstance(sets, dict) or not isinstance(unset, list) or "id" in sets:
                raise invalid("INVALID_BODY")
            probe = {**{k: None for k in unset}, **sets}
            cols, sens, extra, issues = validation.split_employee(probe)
            if issues:
                raise invalid("DATA_INSUFFICIENT", issues)
            unit = cur.unit_id
            self._need(["write_personnel"], unit, True, "edit")
            if "department" in cols:
                unit = self._unit_id_for_department(cols["department"])
                if not in_unit_scope(self.p, unit):
                    raise forbidden("UNIT_ACCESS_DENIED")
            for f in sens:
                if not self._has(TIER_A[f], cur.unit_id):
                    raise forbidden("SENSITIVE_FIELD", {"field": f})
            errs = validation.validate_values({**cols, **extra})
            if errs:
                raise invalid("VALIDATION_ERROR", errs)
            if "code" in cols and cols["code"] != cur.data.get("code"):
                has_files = bool(cur.data.get("photo_path")) or self.s.live_exists("documents", eid)
                if has_files:
                    raise conflict("CODE_LOCKED", message="تغییر کد پرسنلی تا انتقال فایل‌های پرونده ممنوع است")
                if cols["code"] and any(r.id != eid and r.data.get("code") == cols["code"] for r in self.s.list("employees")):
                    raise conflict("DUPLICATE_CODE")
            if "salary" in sens and sens["salary"] != cur.data.get("salary"):
                m = self.month_now()
                d = locks.decide("employees.salary", "edit", m, self._locked_months(), has_amendment_reason=m in amend)
                if not d.allowed:
                    raise ApiError("LOCK_AMENDMENT_REQUIRED", sub=d.mode, details={"month": m})
            before = dict(cur.data)
            new = {k: v for k, v in cur.data.items() if k not in unset}
            new.update({**cols, **sens, **extra})
            cur.data, cur.unit_id = new, unit
            self.s.save(cur)
            keys = sorted(probe)
            self._audit("update", "employees", "ویرایش کارمند", rid=eid, eid=eid, before=self._safe("employees", {k: before.get(k) for k in keys}),
                        after=self._safe("employees", {k: new.get(k) for k in keys}), section="پرسنل")
            return {"c": "employees", "id": eid, "version": cur.version}

        if kind == "delete":
            if not self._has("purge_data"):
                raise forbidden("PERMISSION_DENIED", {"permission": "purge_data"})
            in_lock, pays, stl = self._employee_blockers(eid)
            if locks.employee_delete_blocked(in_lock, pays, stl):
                raise ApiError("PAYROLL_LOCKED", sub="EMPLOYEE_HAS_FINANCIAL_HISTORY",
                               details={"in_locked_snapshot": in_lock, "has_payments": pays, "has_settlement": stl})
            cur.deleted_at, cur.deleted_by, cur.deleted_via = now_iso(), self.a.user_id, "trash"
            self.s.save(cur)
            self._audit("delete", "employees", "حذف دائمی کارمند (نگهداری در بایگانی)", rid=eid, eid=eid, section="پرسنل")
            return {"c": "employees", "id": eid, "version": cur.version}
        raise invalid("INVALID_BODY")

    # ------------------------------------------------------------------ payroll locks (observed behaviour only)
    def _lock(self, op):
        kind, lid = op["op"], op.get("id")
        if not isinstance(lid, str) or not validation.ID_RE.match(lid):
            raise invalid("INVALID_ID")
        if not self.p.all_units:
            raise forbidden("UNIT_ACCESS_DENIED", message="عملیات قفل حقوق به دسترسی همه‌ی واحدها نیاز دارد")
        if kind == "delete":
            raise forbidden("DELETE_NOT_ALLOWED")
        cur = self.s.get("payrollLocks", lid, lock=True)
        if kind == "create":
            if cur is not None:
                raise conflict("DUPLICATE_ID")
            data = dict(op.get("data") or {})
            data.pop("id", None)
            bad = [k for k in data if k not in LOCK_FIELDS and k not in CLIENT_META]
            if bad or not MONTH_OK(data.get("month")):
                raise invalid("VALIDATION_ERROR", [{"unknown_or_missing": bad or ["month"]}])
            if any(l.data.get("month") == data["month"] for l in self._locks()):
                raise conflict("DUPLICATE_MONTH")
            # Imported XLSX periods are historical read-only snapshots, not approved payroll locks.
            # They are visible ONLY to view_salary holders (bootstrap) and may only be created
            # by an all-units payroll approver, so a normal viewer cannot write/payroll-leak data.
            if data.get("status") == "imported":
                self._need(["approve_payroll", "view_salary"], None, False, "approve")
                report = data.get("excelReport")
                snap = data.get("snapshot")
                if not isinstance(report, dict) or not isinstance(report.get("staff"), list) or not report["staff"]:
                    raise invalid("VALIDATION_ERROR", [{"field":"excelReport","message":"staff records required"}])
                if not isinstance(snap, list) or len(snap) != len(report["staff"]):
                    raise invalid("VALIDATION_ERROR", [{"field":"snapshot","message":"snapshot must match report staff"}])
                if len(snap) > 2000:
                    raise invalid("VALIDATION_ERROR", [{"field":"snapshot","message":"too many employees"}])
                try:
                    payload_size = len(json.dumps(data, ensure_ascii=False).encode("utf-8"))
                except (TypeError, ValueError):
                    raise invalid("VALIDATION_ERROR", [{"field":"excelReport","message":"invalid JSON"}])
                if payload_size > 4 * 1024 * 1024:
                    raise invalid("VALIDATION_ERROR", [{"field":"excelReport","message":"monthly report too large"}])
                if not (isinstance(report.get("year"), int) and 1300 <= report["year"] <= 1600
                        and isinstance(report.get("month"), int) and 1 <= report["month"] <= 12):
                    raise invalid("VALIDATION_ERROR", [{"field":"excelReport","message":"invalid Jalali month"}])
                ids = {r.id for r in self.s.list("employees")}
                if any(not isinstance(r,dict) or r.get("employee_id") not in ids for r in snap):
                    raise invalid("BROKEN_REFERENCE", [{"field":"snapshot"}])
            elif data.get("status") not in (None, "open"):
                raise invalid("VALIDATION_ERROR", [{"field": "status", "message": "a lock record starts as open"}])
            data.setdefault("status", "open")
            data.setdefault("history", []); data.setdefault("amendments", [])
            r = self.s.insert(Rec("payrollLocks", lid, data))
            return {"c": "payrollLocks", "id": lid, "version": r.version}
        if cur is None:
            raise not_found()
        if op.get("v") is not None and cur.version != op["v"]:
            raise conflict("VERSION_CONFLICT", {"current_version": cur.version})
        # Historical source files must never be silently replaced or approved as calculated payroll.
        if cur.data.get("status") == "imported":
            raise forbidden("PAYROLL_LOCKED", message="Imported monthly reports are immutable; contact an administrator to resolve an import error")
        sets, unset = op.get("set") or {}, op.get("unset") or []
        bad = [k for k in list(sets) + list(unset) if k not in LOCK_FIELDS and k not in CLIENT_META]
        if bad or "month" in sets and sets["month"] != cur.data.get("month"):
            raise invalid("VALIDATION_ERROR", [{"unknown_or_immutable": bad or ["month"]}])
        old, new = cur.data, {k: v for k, v in cur.data.items() if k not in unset}
        new.update(sets)
        # history and amendments are append-only
        for k in ("history", "amendments"):
            a, b = old.get(k) or [], new.get(k) or []
            if len(b) < len(a) or b[:len(a)] != a:
                raise forbidden("APPEND_ONLY", {"field": k})
        was, now = old.get("status", "open"), new.get("status", "open")
        if was == "locked" and now == "locked":
            frozen = [k for k in sets if k not in ("history", "amendments") and k not in CLIENT_META and new.get(k) != old.get(k)]
            if frozen:
                raise ApiError("PAYROLL_LOCKED", sub="LOCK_IS_FROZEN", details={"fields": frozen})
        if was != now:
            if now == "hr_reviewed" and was == "open":
                self._need(["approve_payroll", "view_salary"], None, False, "approve")
                new.update(reviewed_by=self.a.user_id, reviewed_by_name=self.a.name)
                action, text = "approve", "علامت‌گذاری بررسی‌شده‌ی حقوق"
            elif now == "locked" and was in ("open", "hr_reviewed"):
                self._need(["approve_payroll", "view_salary"], None, False, "approve")
                gate = getattr(self.s, 'require_approved_payroll_review', None)
                if gate is not None:
                    gate(old.get('month'))  # Enforced on PostgreSQL for ALL lock API paths.
                snap = new.get("snapshot")
                if not isinstance(snap, list) or not snap:
                    raise invalid("VALIDATION_ERROR", [{"field": "snapshot", "message": "snapshot rows required to lock"}])
                ids = {r.id for r in self.s.list("employees")}
                if any(r.get("employee_id") not in ids for r in snap):
                    raise invalid("BROKEN_REFERENCE", [{"field": "snapshot"}])
                new.update(approved_by=self.a.user_id, approved_by_name=self.a.name)
                action, text = "lock", "قفل حقوق ماه %s" % old.get("month")
            elif now == "hr_reviewed" and was == "locked":
                if not self._has("purge_data"):
                    raise forbidden("PERMISSION_DENIED", {"permission": "purge_data"})
                if not str(new.get("unlock_reason") or "").strip():
                    raise invalid("REASON_REQUIRED", message="علت باز کردن قفل الزامی است")
                new.update(unlocked_by=self.a.user_id, unlocked_by_name=self.a.name)
                action, text = "unlock", "باز کردن قفل حقوق ماه %s" % old.get("month")
            else:
                raise invalid("INVALID_TRANSITION", [{"from": was, "to": now}])
            self._audit(action, "payrollLocks", text, rid=lid, reason=new.get("unlock_reason") if action == "unlock" else None, section="حقوق")
        cur.data = new
        self.s.save(cur)
        return {"c": "payrollLocks", "id": lid, "version": cur.version}
