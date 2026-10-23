"""Sync-service tests on the in-memory store (real logic, no database). Run: python -m unittest discover -s tests -v"""
import unittest

from app.core.policy import Principal
from app.errors import ApiError
from app.services.store import MemoryStore, Rec
from app.services.sync import Actor, SyncService

MONTH = "2026-09"


def actor(role="hr_manager", all_units=True, units=(), uid="u1", **kw):
    p = Principal(user_id=uid, role_id=role, all_units=all_units, unit_ids=frozenset(units), **kw)
    return Actor(p, uid, uid, uid)


def svc(store, role="hr_manager", **kw):
    return SyncService(store, actor(role, **kw), month_now=lambda: MONTH)


def seed():
    s = MemoryStore()
    u1, u2 = s.unit_create("منابع انسانی"), s.unit_create("مالی")
    s.insert(Rec("employees", "emp1", {"id": "emp1", "full_name": "الف", "department": "منابع انسانی", "salary": 100, "code": "100"}, unit_id=u1))
    s.insert(Rec("employees", "emp2", {"id": "emp2", "full_name": "ب", "department": "مالی", "salary": 200, "national_id": "123", "code": "200"}, unit_id=u2))
    return s, u1, u2


def push(service, *ops):
    return service.push(list(ops))


def err(testcase, fn):
    with testcase.assertRaises(ApiError) as cm:
        fn()
    return cm.exception


class Bootstrap(unittest.TestCase):
    def test_sensitive_fields_and_collections_filtered(self):
        s, u1, u2 = seed()
        s.insert(Rec("loans", "l1", {"employee_id": "emp1", "amount": 5}, employee_id="emp1"))
        s.insert(Rec("leaves", "v1", {"employee_id": "emp1", "type": "leave"}, employee_id="emp1"))
        full = svc(s, "hr_manager").bootstrap()["data"]
        self.assertEqual({e["id"] for e in full["employees"]}, {"emp1", "emp2"})
        self.assertIn("salary", full["employees"][0])
        self.assertEqual(len(full["loans"]), 1)
        spec = svc(s, "hr_specialist").bootstrap()["data"]       # no view_salary / view_national_id
        for e in spec["employees"]:
            self.assertNotIn("salary", e)
            self.assertNotIn("national_id", e)
        self.assertEqual(spec["loans"], [])                      # collection hidden without view_salary
        self.assertEqual(len(spec["leaves"]), 1)

    def test_unit_scope_filters_records(self):
        s, u1, u2 = seed()
        b = svc(s, "hr_manager", all_units=False, units={u1}).bootstrap()["data"]
        self.assertEqual([e["id"] for e in b["employees"]], ["emp1"])

    def test_all_units_without_permission_sees_nothing(self):
        s, u1, u2 = seed()
        d = svc(s, "viewer", all_units=True).bootstrap()["data"]
        self.assertEqual(d["loans"], [])
        self.assertEqual(d["payrollLocks"], [])

    def test_me_permissions(self):
        s, *_ = seed()
        self.assertEqual(svc(s, "admin").bootstrap()["me"]["permissions"], ["*"])
        self.assertIn("approve_records", svc(s, "hr_manager").bootstrap()["me"]["permissions"])
        self.assertNotIn("approve_records", svc(s, "hr_specialist").bootstrap()["me"]["permissions"])


class Records(unittest.TestCase):
    def test_create_update_conflict_and_audit(self):
        s, *_ = seed()
        sv = svc(s)
        r = push(sv, {"c": "leaves", "op": "create", "id": "lv1", "data": {"employee_id": "emp1", "type": "leave", "start_date": "2026-09-01", "end_date": "2026-09-02"}})
        self.assertEqual(r["results"][0]["version"], 1)
        r = push(sv, {"c": "leaves", "op": "update", "id": "lv1", "v": 1, "set": {"note": "x"}})
        self.assertEqual(r["results"][0]["version"], 2)
        e = err(self, lambda: push(sv, {"c": "leaves", "op": "update", "id": "lv1", "v": 1, "set": {"note": "y"}}))
        self.assertEqual((e.status, e.sub), (409, "VERSION_CONFLICT"))
        self.assertGreaterEqual(len(s.audit_rows), 2)

    def test_mass_assignment_and_unknown_collection(self):
        s, *_ = seed()
        sv = svc(s)
        for data in ({"employee_id": "emp1", "type": "leave", "is_admin": True}, {"employee_id": "emp1", "version": 9}):
            e = err(self, lambda d=data: push(sv, {"c": "leaves", "op": "create", "id": "lvx", "data": d}))
            self.assertEqual(e.status, 422)
        e = err(self, lambda: push(sv, {"c": "users", "op": "create", "id": "x", "data": {}}))
        self.assertEqual(e.status, 422)
        e = err(self, lambda: push(sv, {"c": "nope", "op": "create", "id": "xyz", "data": {}}))
        self.assertEqual(e.status, 422)

    def test_scenario_save_roundtrip_and_read_salary_permission(self):
        s, *_ = seed()
        scenario = {'type':'hiring','title':'طرح جذب فرضی', 'position':'نیروی فنی',
                    'headcount':2,'salary':20000000,'results':{'monthlyLaborCost':44000000}}
        push(svc(s, 'hr_manager'), {'c':'hiringScenarios','op':'create','id':'hs1','data':scenario})
        # Views with only economic/aggregate permission never see the exact input salary or results.
        from app.core.validation import filter_read
        self.assertNotIn('salary', filter_read('hiringScenarios', scenario, lambda p: p!='view_salary'))
        self.assertNotIn('results', filter_read('hiringScenarios', scenario, lambda p: p!='view_salary'))
        record = s.get('hiringScenarios','hs1')
        self.assertEqual(record.data['type'],'hiring')
        ceo_rows=svc(s,'ceo').bootstrap()['data']['hiringScenarios']
        self.assertEqual(len(ceo_rows),1)
        self.assertNotIn('salary',ceo_rows[0])
        self.assertNotIn('results',ceo_rows[0])
        # This model never mutates an actual employee salary.
        self.assertEqual(s.get('employees', 'emp1').data['salary'],100)

    def test_scenario_rejects_undeclared_fields_and_salary_write_without_permission(self):
        s,*_ = seed()
        basic={'type':'hiring','title':'آزمایش','position':'آهنگری','headcount':1,'salary':15000000,'results':{'monthlyLaborCost':15000000}}
        e=err(self,lambda:push(svc(s,'admin'), {'c':'hiringScenarios','op':'create','id':'hs2','data':{**basic,'is_admin':True}}))
        self.assertEqual(e.status,422)
        e=err(self,lambda:push(svc(s,'ceo'), {'c':'hiringScenarios','op':'create','id':'hs3','data':basic}))
        self.assertEqual(e.status,403)
        e=err(self,lambda:push(svc(s,'admin'), {'c':'hiringScenarios','op':'create','id':'hs4','data':{**basic,'results':{'malicious':1}}}))
        self.assertEqual(e.status,422)

    def test_permission_and_unit_scope_on_write(self):
        s, u1, u2 = seed()
        e = err(self, lambda: push(svc(s, "viewer"), {"c": "leaves", "op": "create", "id": "lv2", "data": {"employee_id": "emp1", "type": "leave"}}))
        self.assertEqual((e.status, e.sub), (403, "PERMISSION_DENIED"))
        scoped = svc(s, "hr_manager", all_units=False, units={u1})
        e = err(self, lambda: push(scoped, {"c": "leaves", "op": "create", "id": "lv3", "data": {"employee_id": "emp2", "type": "leave"}}))
        self.assertEqual(e.sub, "UNIT_ACCESS_DENIED")
        push(scoped, {"c": "leaves", "op": "create", "id": "lv4", "data": {"employee_id": "emp1", "type": "leave"}})

    def test_money_write_needs_view_salary_too(self):
        s, *_ = seed()
        op = {"c": "payrollPayments", "op": "create", "id": "pp1", "data": {"employee_id": "emp1", "month": MONTH, "amount": 5}}
        e = err(self, lambda: push(svc(s, "hr_specialist"), op))
        self.assertEqual(e.status, 403)
        push(svc(s, "hr_manager"), op)

    def test_broken_reference_and_duplicate_id(self):
        s, *_ = seed()
        sv = svc(s)
        e = err(self, lambda: push(sv, {"c": "leaves", "op": "create", "id": "lv5", "data": {"employee_id": "ghost", "type": "leave"}}))
        self.assertEqual(e.sub, "BROKEN_REFERENCE")
        push(sv, {"c": "leaves", "op": "create", "id": "lv6", "data": {"employee_id": "emp1", "type": "leave"}})
        e = err(self, lambda: push(sv, {"c": "leaves", "op": "create", "id": "lv6", "data": {"employee_id": "emp1", "type": "leave"}}))
        self.assertEqual(e.sub, "DUPLICATE_ID")

    def test_approval_fields_need_approve_records(self):
        s, *_ = seed()
        mgr = svc(s, "hr_manager")
        push(mgr, {"c": "overtime", "op": "create", "id": "ot1", "data": {"employee_id": "emp1", "month": MONTH, "hours": 2}})
        spec = svc(s, "hr_specialist")
        e = err(self, lambda: push(spec, {"c": "overtime", "op": "update", "id": "ot1", "v": 1, "set": {"approval": "approved"}}))
        self.assertEqual(e.sub, "APPROVAL_PERMISSION")
        push(spec, {"c": "overtime", "op": "update", "id": "ot1", "v": 1, "set": {"approval": "pending"}})      # allowed value
        push(mgr, {"c": "overtime", "op": "update", "id": "ot1", "v": 2, "set": {"approval": "approved"}})
        # attendance: only 'pending' without approve_records, deficit_excused always needs it
        push(mgr, {"c": "attendance", "op": "create", "id": "at1", "data": {"employee_id": "emp1", "type": "absence", "date": "2026-09-01"}})
        e = err(self, lambda: push(spec, {"c": "attendance", "op": "update", "id": "at1", "v": 1, "set": {"deficit_excused": True}}))
        self.assertEqual(e.sub, "APPROVAL_PERMISSION")
        # settlements: paid needs approve_payroll
        e = err(self, lambda: push(svc(s, "hr_specialist"), {"c": "settlements", "op": "create", "id": "st1", "data": {"employee_id": "emp1", "status": "paid"}}))
        self.assertEqual(e.status, 403)

    def test_sensitive_field_in_collection(self):
        s, *_ = seed()
        e = err(self, lambda: push(svc(s, "hr_specialist"), {"c": "candidates", "op": "create", "id": "cd1", "data": {"name": "n", "proposed_salary": 10}}))
        self.assertEqual(e.status, 403)
        e = err(self, lambda: push(svc(s, "hr_specialist"), {"c": "empExtra", "op": "create", "id": "ex1", "data": {"employee_id": "emp1", "ins_no": "7"}}))
        self.assertEqual(e.sub, "SENSITIVE_FIELD")

    def test_empextra_unique_per_employee(self):
        s, *_ = seed()
        sv = svc(s, "hr_manager")
        push(sv, {"c": "empExtra", "op": "create", "id": "ex1", "data": {"employee_id": "emp1", "shift": "a"}})
        e = err(self, lambda: push(sv, {"c": "empExtra", "op": "create", "id": "ex2", "data": {"employee_id": "emp1"}}))
        self.assertEqual(e.sub, "DUPLICATE_EMPLOYEE_RECORD")

    def test_atomic_batch_rolls_back(self):
        s, *_ = seed()
        sv = svc(s)
        ops = [{"c": "leaves", "op": "create", "id": "lvA", "data": {"employee_id": "emp1", "type": "leave"}},
               {"c": "leaves", "op": "create", "id": "lvB", "data": {"employee_id": "ghost", "type": "leave"}}]
        e = err(self, lambda: sv.push(ops))
        self.assertEqual(e.details["op_index"], 1)
        self.assertIsNone(s.get("leaves", "lvA"))
        self.assertEqual(len(s.audit_rows), 0)


class PerUnitAccess(unittest.TestCase):
    def test_edit_in_one_unit_view_only_in_another(self):
        s, u1, u2 = seed()
        a = Actor(Principal(user_id="m", role_id="viewer", all_units=False, unit_ids=frozenset({u1, u2}), unit_roles={u1: "hr_specialist"}), "m", "m", "m")
        sv = SyncService(s, a, month_now=lambda: MONTH)
        sv.push([{"c": "leaves", "op": "create", "id": "lvU1", "data": {"employee_id": "emp1", "type": "leave"}}])      # unit 1: specialist rights
        e = err(self, lambda: sv.push([{"c": "leaves", "op": "create", "id": "lvU2", "data": {"employee_id": "emp2", "type": "leave"}}]))
        self.assertEqual((e.status, e.sub), (403, "PERMISSION_DENIED"))                                                # unit 2: viewer only
        boot = sv.bootstrap()["data"]
        self.assertEqual({x["id"] for x in boot["employees"]}, {"emp1", "emp2"})                                       # sees both units
        self.assertNotIn("salary", boot["employees"][0])

    def test_unit_role_never_widens_unit_scope(self):
        s, u1, u2 = seed()
        a = Actor(Principal(user_id="m", role_id="viewer", unit_ids=frozenset({u1}), unit_roles={u2: "hr_manager"}), "m", "m", "m")
        self.assertEqual([x["id"] for x in SyncService(s, a).bootstrap()["data"]["employees"]], ["emp1"])


class SoftDelete(unittest.TestCase):
    def test_trash_delete_restore_and_purge(self):
        s, *_ = seed()
        mgr = svc(s, "hr_manager")
        push(mgr, {"c": "leaves", "op": "create", "id": "lv1", "data": {"employee_id": "emp1", "type": "leave"}})
        push(mgr, {"c": "leaves", "op": "delete", "id": "lv1", "v": 1},
             {"c": "deletedRecords", "op": "create", "id": "del1", "data": {"coll": "leaves", "label": "مرخصی", "rec": {"id": "lv1"}, "at": "x"}})
        b = mgr.bootstrap()["data"]
        self.assertEqual(b["leaves"], [])
        self.assertEqual((b["deletedRecords"][0]["coll"], b["deletedRecords"][0]["label"]), ("leaves", "مرخصی"))
        # restore = client re-creates the record with the same id (needs delete_sensitive)
        e = err(self, lambda: push(svc(s, "hr_specialist"), {"c": "leaves", "op": "create", "id": "lv1", "data": {"employee_id": "emp1", "type": "leave"}}))
        self.assertEqual(e.status, 403)
        push(mgr, {"c": "leaves", "op": "create", "id": "lv1", "data": {"employee_id": "emp1", "type": "leave"}},
             {"c": "deletedRecords", "op": "delete", "id": "del_leaves_lv1"})
        self.assertEqual(len(mgr.bootstrap()["data"]["leaves"]), 1)
        # permanent purge needs purge_data
        push(mgr, {"c": "leaves", "op": "delete", "id": "lv1", "v": s.get("leaves", "lv1").version})
        e = err(self, lambda: push(mgr, {"c": "deletedRecords", "op": "delete", "id": "del_leaves_lv1"}))
        self.assertEqual(e.status, 403)
        push(svc(s, "admin"), {"c": "deletedRecords", "op": "delete", "id": "del_leaves_lv1"})
        self.assertIsNone(s.get("leaves", "lv1"))

    def test_flag_delete_keeps_record_in_list(self):
        s, *_ = seed()
        mgr = svc(s)
        push(mgr, {"c": "laborActions", "op": "create", "id": "la1", "data": {"employee_id": "emp1", "kind": "k"}})
        push(mgr, {"c": "laborActions", "op": "update", "id": "la1", "v": 1, "set": {"deleted": True, "deleted_at": "t"}})
        rows = mgr.bootstrap()["data"]["laborActions"]
        self.assertTrue(rows[0]["deleted"])
        push(mgr, {"c": "laborActions", "op": "create", "id": "la2", "data": {"employee_id": "emp1", "kind": "k"}})
        e = err(self, lambda: push(svc(s, "hr_specialist"), {"c": "laborActions", "op": "update", "id": "la2", "v": 1, "set": {"reason": "x", "deleted": True}}))
        self.assertEqual(e.status, 403)


class Employees(unittest.TestCase):
    def test_create_split_and_tier_rules(self):
        s, *_ = seed()
        mgr = svc(s, "hr_manager")
        push(mgr, {"c": "employees", "op": "create", "id": "emp3", "data": {"full_name": "ج", "department": "فنی", "salary": 9, "national_id": "1", "photo_path": "p/x.jpg", "code": "300"}})
        self.assertIsNotNone(s.unit_by_name("فنی"))
        e = err(self, lambda: push(mgr, {"c": "employees", "op": "create", "id": "emp4", "data": {"full_name": "د", "status": "active"}}))
        self.assertEqual(e.details["info"][0]["problem"], "unknown_field")
        spec = svc(s, "hr_specialist")
        e = err(self, lambda: push(spec, {"c": "employees", "op": "create", "id": "emp5", "data": {"full_name": "ه", "salary": 5}}))
        self.assertEqual(e.sub, "SENSITIVE_FIELD")
        push(spec, {"c": "employees", "op": "create", "id": "emp5", "data": {"full_name": "ه", "department": "مالی"}})

    def test_scoped_user_cannot_create_in_other_unit(self):
        s, u1, u2 = seed()
        sv = svc(s, "hr_manager", all_units=False, units={u1})
        e = err(self, lambda: push(sv, {"c": "employees", "op": "create", "id": "empX", "data": {"full_name": "x", "department": "مالی"}}))
        self.assertEqual(e.sub, "UNIT_ACCESS_DENIED")

    def test_code_change_blocked_when_files_exist_and_duplicates(self):
        s, *_ = seed()
        mgr = svc(s)
        e = err(self, lambda: push(mgr, {"c": "employees", "op": "update", "id": "emp1", "v": 1, "set": {"code": "200"}}))
        self.assertEqual(e.sub, "DUPLICATE_CODE")
        s.insert(Rec("documents", "d1", {"employee_id": "emp1", "title": "t"}, employee_id="emp1"))
        e = err(self, lambda: push(mgr, {"c": "employees", "op": "update", "id": "emp1", "v": 1, "set": {"code": "101"}}))
        self.assertEqual(e.sub, "CODE_LOCKED")

    def test_delete_blockers(self):
        s, *_ = seed()
        adm = svc(s, "admin")
        s.insert(Rec("payrollPayments", "p1", {"employee_id": "emp1", "month": MONTH, "amount": 1}, employee_id="emp1"))
        e = err(self, lambda: push(adm, {"c": "employees", "op": "delete", "id": "emp1", "v": 1}))
        self.assertEqual(e.code, "PAYROLL_LOCKED")
        e = err(self, lambda: push(svc(s, "hr_manager"), {"c": "employees", "op": "delete", "id": "emp2", "v": 1}))
        self.assertEqual(e.status, 403)                       # purge_data is admin-only
        push(adm, {"c": "employees", "op": "delete", "id": "emp2", "v": 1})
        self.assertEqual([x["id"] for x in adm.bootstrap()["data"]["employees"]], ["emp1"])

    def test_audit_never_contains_sensitive_values(self):
        s, *_ = seed()
        push(svc(s), {"c": "employees", "op": "update", "id": "emp1", "v": 1, "set": {"salary": 12345}})
        row = s.audit_rows[-1]
        self.assertNotIn("12345", str(row["after"]) + str(row["before"]))


class PayrollLock(unittest.TestCase):
    def _locked(self, s):
        adm = svc(s, "admin")
        push(adm, {"c": "payrollLocks", "op": "create", "id": "pl1", "data": {"month": MONTH, "status": "open", "history": [], "amendments": []}})
        push(adm, {"c": "payrollLocks", "op": "update", "id": "pl1", "v": 1, "set": {"status": "hr_reviewed", "history": [{"status": "hr_reviewed"}]}})
        push(adm, {"c": "payrollLocks", "op": "update", "id": "pl1", "v": 2, "set": {"status": "locked", "snapshotVersion": 2, "snapshot": [{"employee_id": "emp1", "net": 1}], "rulesSnapshot": {}}})
        return adm

    def test_transitions_permissions_and_actor_ids(self):
        s, *_ = seed()
        self._locked(s)
        lock = s.get("payrollLocks", "pl1").data
        self.assertEqual((lock["status"], lock["approved_by"], lock["reviewed_by"]), ("locked", "u1", "u1"))   # server-owned actors
        e = err(self, lambda: push(svc(s, "hr_specialist"), {"c": "payrollLocks", "op": "update", "id": "pl1", "v": 3, "set": {"status": "hr_reviewed", "unlock_reason": "x"}}))
        self.assertEqual(e.status, 403)
        e = err(self, lambda: push(svc(s, "admin"), {"c": "payrollLocks", "op": "update", "id": "pl1", "v": 3, "set": {"status": "hr_reviewed"}}))
        self.assertEqual(e.sub, "REASON_REQUIRED")
        push(svc(s, "admin"), {"c": "payrollLocks", "op": "update", "id": "pl1", "v": 3, "set": {"status": "hr_reviewed", "unlock_reason": "اصلاح"}})
        self.assertIn("snapshot", s.get("payrollLocks", "pl1").data)          # snapshot kept on unlock (as in the current code)

    def test_locked_lock_is_frozen_and_history_append_only(self):
        s, *_ = seed()
        adm = self._locked(s)
        e = err(self, lambda: push(adm, {"c": "payrollLocks", "op": "update", "id": "pl1", "v": 3, "set": {"snapshot": []}}))
        self.assertEqual(e.sub, "LOCK_IS_FROZEN")
        e = err(self, lambda: push(adm, {"c": "payrollLocks", "op": "update", "id": "pl1", "v": 3, "set": {"history": []}}))
        self.assertEqual(e.sub, "APPEND_ONLY")

    def test_hard_block_overtime_and_amend_rules(self):
        s, *_ = seed()
        self._locked(s)
        mgr = svc(s, "hr_manager")
        s.insert(Rec("overtime", "ot9", {"employee_id": "emp1", "month": MONTH, "hours": 1}, employee_id="emp1"))
        e = err(self, lambda: push(mgr, {"c": "overtime", "op": "delete", "id": "ot9", "v": 1}))
        self.assertEqual(e.code, "PAYROLL_LOCKED")
        e = err(self, lambda: push(mgr, {"c": "overtime", "op": "update", "id": "ot9", "v": 1, "set": {"approval": "approved"}}))
        self.assertEqual(e.code, "PAYROLL_LOCKED")
        # salary and loans: amendment required (record in the same batch)
        e = err(self, lambda: push(mgr, {"c": "employees", "op": "update", "id": "emp1", "v": 1, "set": {"salary": 150}}))
        self.assertEqual(e.code, "LOCK_AMENDMENT_REQUIRED")
        amend = {"c": "payrollLocks", "op": "update", "id": "pl1", "v": 3, "set": {"amendments": [{"at": "t", "text": "salary", "month": MONTH, "reason": "r"}]}}
        adm = svc(s, "admin")
        push(adm, amend, {"c": "employees", "op": "update", "id": "emp1", "v": 1, "set": {"salary": 150}})
        e = err(self, lambda: push(mgr, {"c": "loans", "op": "create", "id": "ln1", "data": {"employee_id": "emp1", "amount": 5}}))
        self.assertEqual(e.code, "LOCK_AMENDMENT_REQUIRED")
        # NO new strictness: other collections are untouched by the lock
        push(mgr, {"c": "leaves", "op": "create", "id": "lvq", "data": {"employee_id": "emp1", "type": "leave"}})
        push(mgr, {"c": "attendance", "op": "create", "id": "atq", "data": {"employee_id": "emp1", "type": "absence", "date": "2026-09-02"}})

    def test_lock_needs_all_units_and_snapshot(self):
        s, u1, _ = seed()
        e = err(self, lambda: push(svc(s, "admin", all_units=False, units={u1}), {"c": "payrollLocks", "op": "create", "id": "plx", "data": {"month": MONTH}}))
        self.assertEqual(e.sub, "UNIT_ACCESS_DENIED")
        adm = svc(s, "admin")
        push(adm, {"c": "payrollLocks", "op": "create", "id": "pl2", "data": {"month": "2026-08"}})
        e = err(self, lambda: push(adm, {"c": "payrollLocks", "op": "update", "id": "pl2", "v": 1, "set": {"status": "locked"}}))
        self.assertEqual(e.status, 422)

    def test_lock_records_hidden_without_view_salary(self):
        s, *_ = seed()
        self._locked(s)
        self.assertEqual(svc(s, "hr_specialist").bootstrap()["data"]["payrollLocks"], [])
        self.assertEqual(len(svc(s, "hr_manager").bootstrap()["data"]["payrollLocks"]), 1)


class SettingsAlerts(unittest.TestCase):
    def test_settings_permissions_and_versions(self):
        s, *_ = seed()
        put = lambda sv, key, val, v=None: push(sv, {"c": "settings", "op": "put", "id": key, "value": val, "v": v})
        e = err(self, lambda: put(svc(s, "hr_specialist"), "minWage", 5))
        self.assertEqual(e.status, 403)
        put(svc(s, "hr_manager"), "minWage", 5)
        e = err(self, lambda: put(svc(s, "hr_manager"), "minWage", 6, 7))
        self.assertEqual(e.sub, "VERSION_CONFLICT")
        e = err(self, lambda: put(svc(s, "hr_manager"), "lockDisabled", True))           # manage_users only
        self.assertEqual(e.status, 403)
        put(svc(s, "admin"), "lockDisabled", False)
        self.assertEqual(svc(s, "hr_manager").bootstrap()["data"]["settings"]["minWage"], 5)

    def test_alert_states(self):
        s, *_ = seed()
        push(svc(s, "hr_manager"), {"c": "alertStates", "op": "put", "id": "contract|emp1|", "value": {"status": "done"}})
        e = err(self, lambda: push(svc(s, "viewer"), {"c": "alertStates", "op": "put", "id": "k|e|", "value": {}}))
        self.assertEqual(e.status, 403)


if __name__ == "__main__":
    unittest.main()
