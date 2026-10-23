"""Pure-logic tests (policy, validation, passwords, throttle, locks, migration). stdlib unittest, no database.
Run: python -m unittest discover -s tests -v   (from the backend folder)"""
import hashlib
import json
import os
import unittest

from app.core import locks, policy, throttle, validation
from app.core.passwords import _pbkdf2_hex, verify_password
from app.migration.apply import MigrationBlocked, apply_migration
from app.migration.preview import build_preview
from app.services.store import MemoryStore
from app.services.sync import Actor, SyncService
from app.specs import COLLECTION_SPECS, ROLE_PERMS, TIER_A, TIER_B

SAMPLE = os.environ.get("HR_SAMPLE_JSON", "/mnt/user-data/uploads/hr-dashboard-data.json")


def P(role="hr_manager", **kw):
    return policy.Principal(user_id="u1", role_id=role, **kw)


class Decisions(unittest.TestCase):
    def test_approve_records_and_roles(self):
        self.assertIn("approve_records", ROLE_PERMS["hr_manager"])
        self.assertNotIn("approve_records", ROLE_PERMS["hr_specialist"])
        self.assertNotIn("export_data", {p for v in ROLE_PERMS.values() for p in v})

    def test_read_permissions_D_D(self):
        self.assertEqual(COLLECTION_SPECS["sickLeaves"]["read"], "view_confidential_docs")
        self.assertEqual(COLLECTION_SPECS["laborActions"]["read"], "view_personnel")
        self.assertEqual(COLLECTION_SPECS["incidents"]["read"], "view_personnel")

    def test_write_never_authorized_by_view_alone(self):
        for c, s in COLLECTION_SPECS.items():
            if s["write"]:
                self.assertFalse(s["write"][0].startswith("view_"), c)

    def test_ins_no_is_tier_a_and_status_is_not_stored(self):
        self.assertEqual(TIER_A["ins_no"], "view_national_id")
        self.assertEqual(COLLECTION_SPECS["empExtra"]["sensitive"]["ins_no"], "view_national_id")
        self.assertNotIn("status", TIER_B)
        self.assertIn("photo_path", TIER_B)


class PolicyTests(unittest.TestCase):
    def test_all_units_does_not_grant_permission(self):
        d = policy.check_access(P("viewer", all_units=True), ["write_records"], unit_id=1)
        self.assertEqual(d.code, "PERMISSION_DENIED")

    def test_unit_scope_and_record_scope(self):
        p = P("hr_manager", unit_ids=frozenset({2}))
        self.assertEqual(policy.check_access(p, ["write_records"], unit_id=1).code, "UNIT_ACCESS_DENIED")
        self.assertTrue(policy.check_access(P("hr_manager", all_units=True), ["write_records"], unit_id=9).allowed)
        self.assertEqual(policy.check_access(P("admin", all_units=True), ["write_records"], unit_id=1, record_in_scope=False).code, "RECORD_SCOPE_DENIED")

    def test_view_cannot_authorize_mutation(self):
        d = policy.check_operation(P("admin", all_units=True), operation="edit", operation_permission="view_salary")
        self.assertFalse(d.allowed)

    def test_overrides_and_per_unit_role(self):
        self.assertTrue(policy.has_permission(P("viewer", add=frozenset({"write_records"})), "write_records"))
        self.assertFalse(policy.has_permission(P("hr_manager", remove=frozenset({"write_records"})), "write_records"))
        p3 = P("viewer", unit_ids=frozenset({1}), unit_roles={1: "hr_manager"})
        self.assertTrue(policy.has_permission(p3, "write_records", unit_id=1))
        self.assertFalse(policy.has_permission(p3, "write_records", unit_id=2))


class ValidationTests(unittest.TestCase):
    def test_keys_unknown_server_owned_and_disabled(self):
        codes = {(e["code"], e["field"]) for e in validation.validate_keys("loans", ["employee_id", "amount", "is_admin", "version"], creating=True)}
        self.assertIn(("UNKNOWN_FIELD", "is_admin"), codes)
        self.assertIn(("SERVER_OWNED_FIELD", "version"), codes)
        self.assertEqual(validation.validate_keys("hiringScenarios", ["x"], creating=True)[0]["code"], "UNKNOWN_FIELD")
        self.assertEqual(validation.validate_keys("users", ["x"], creating=True)[0]["code"], "UNKNOWN_COLLECTION")

    def test_values(self):
        self.assertTrue(validation.validate_values({"amount": -1}))
        self.assertTrue(validation.validate_values({"start_date": "2026/01/01"}))
        self.assertFalse(validation.validate_values({"start_date": "2026-01-01", "amount": 5}))

    def test_split_employee(self):
        rec = {"id": "e1", "full_name": "x", "department": "d", "salary": 5, "national_id": "", "address": "a", "mystery": 1, "photo_path": "p", "notes": {"bank_account": "1"}}
        cols, sens, extra, issues = validation.split_employee(rec)
        self.assertEqual(set(sens), {"salary", "national_id"})
        self.assertIsNone(sens["national_id"])
        self.assertNotIn("salary", extra)
        self.assertNotIn("mystery", extra)
        self.assertIn("photo_path", extra)
        self.assertEqual({i["problem"] for i in issues}, {"unknown_field", "sensitive_key_in_extra"})

    def test_sensitive_key_regex_has_no_substring_false_positives(self):
        _, _, _, issues = validation.split_employee({"id": "e", "notes": {"average": 1, "company": 2, "card": True, "span": 1}})
        self.assertEqual([i for i in issues if i["problem"] == "sensitive_key_in_extra"], [])

    def test_filter_read_drops_sensitive(self):
        out = validation.filter_read("candidates", {"name": "n", "proposed_salary": 10}, lambda p: False)
        self.assertEqual(out, {"name": "n"})

    def test_rules(self):
        self.assertEqual(validation.rule_permissions("overtime", {}, {"approval": "approved"}), [("approval", "approve_records")])
        self.assertEqual(validation.rule_permissions("overtime", {}, {"approval": "pending"}), [])
        self.assertEqual(validation.rule_permissions("settlements", {"status": "ready"}, {"status": "paid"}), [("status", "approve_payroll")])


class PasswordTests(unittest.TestCase):
    def test_pbkdf2_matches_webcrypto_vector(self):
        salt = "00112233445566778899aabbccddeeff"
        self.assertEqual(_pbkdf2_hex("abc123", salt, 120000), "11b4c0c9cfeb74a9448cf7e6d8c4995eb4ff0ff686b7f82d540bb7fd8b6dec00")
        stored = {"algo": "pbkdf2", "iter": 120000, "salt": salt, "hash": _pbkdf2_hex("abc123", salt, 120000)}
        self.assertEqual(verify_password(stored, "abc123"), (True, True))
        self.assertEqual(verify_password(stored, "wrong"), (False, True))

    def test_legacy_sha256_persian_and_malformed(self):
        stored = {"algo": "sha256", "hash": hashlib.sha256("old".encode()).hexdigest()}
        self.assertEqual(verify_password(stored, "old"), (True, True))
        salt = "ff" * 16
        fa = {"algo": "pbkdf2", "iter": 1000, "salt": salt, "hash": _pbkdf2_hex("رمز‌فارسی۱۲۳", salt, 1000)}
        self.assertTrue(verify_password(fa, "رمز‌فارسی۱۲۳")[0])
        for bad in (None, {}, {"algo": "pbkdf2"}, {"algo": "x"}, {"algo": "pbkdf2", "salt": "zz", "hash": "a"}):
            self.assertEqual(verify_password(bad, "p"), (False, False))


class ThrottleAndLockTests(unittest.TestCase):
    def test_throttle(self):
        now = 10_000
        self.assertEqual(throttle.retry_after([now - 1] * 4, now), 0)
        self.assertGreater(throttle.retry_after([now - 1] * 5, now), 0)
        self.assertGreater(throttle.retry_after([now - 1] * 7, now), throttle.retry_after([now - 1] * 5, now))
        self.assertEqual(throttle.retry_after([now - 3600] * 9, now), 0)

    def test_lock_policy_reproduces_current_behaviour_only(self):
        L = {"2026-09"}
        self.assertEqual(locks.decide("overtime", "delete", "2026-09", L).code, "PAYROLL_LOCKED")
        self.assertEqual(locks.decide("employees.salary", "edit", "2026-09", L).code, "LOCK_AMENDMENT_REQUIRED")
        self.assertTrue(locks.decide("employees.salary", "edit", "2026-09", L, has_amendment_reason=True).allowed)
        for coll, op in (("attendance", "edit"), ("leaves", "create"), ("eidiRecords", "create"), ("overtime", "create")):
            self.assertTrue(locks.decide(coll, op, "2026-09", L).allowed)
        self.assertTrue(locks.employee_delete_blocked(False, True, False))


@unittest.skipUnless(os.path.exists(SAMPLE), "sample file not present")
class Migration(unittest.TestCase):
    def setUp(self):
        with open(SAMPLE, "rb") as f:
            self.raw = f.read()
        self.sha = hashlib.sha256(self.raw).hexdigest()
        self.data = json.loads(self.raw)

    def test_preview_reads_only_and_counts(self):
        rep = build_preview(self.data, self.sha)
        with open(SAMPLE, "rb") as f:
            self.assertEqual(hashlib.sha256(f.read()).hexdigest(), self.sha)
        self.assertEqual((rep["total"], rep["failed"], rep["duplicates"], rep["blocking"]), (35, 0, 0, 0))
        self.assertEqual(len(rep["absent_collections"]), 6)

    def test_apply_idempotent_preserves_ids_and_maps_actors(self):
        s = MemoryStore()
        rep = apply_migration(s, self.data, self.sha)
        self.assertEqual(rep["applied"]["employees"], 2)
        self.assertEqual(rep["applied"]["settings"], 13)
        uid = self.data["users"][0]["id"]
        self.assertEqual(s.get("payrollLocks", self.data["payrollLocks"][0]["id"]).data["approved_by"], uid)   # username -> users.id
        self.assertEqual(s.user_by_id(uid)["pw"]["algo"], "pbkdf2")                                              # hash kept: no reset
        self.assertTrue(s.user_by_id("usr_system")["is_system"])
        before = (len(s.recs), len(s.audit_rows))
        again = apply_migration(s, self.data, self.sha)
        self.assertTrue(again["already_applied"])
        self.assertEqual((len(s.recs), len(s.audit_rows)), before)
        e = next(r for r in s.list("employees") if r.id == "empmu5dxucflwhrx")
        self.assertFalse({"national_id", "sheba", "bank", "account"} & set(e.data))                              # '' became NULL -> not stored
        legacy = [r for r in s.audit_rows if r.get("legacy")]
        self.assertEqual(len(legacy), 26)
        self.assertTrue(all(r.get("before") is None for r in legacy))                                           # nothing invented

    def test_apply_blocks_unknown_fields_and_collections(self):
        d = json.loads(self.raw)
        d["leaves"][0]["mystery"] = 1
        d["weird"] = [{"id": "x"}]
        with self.assertRaises(MigrationBlocked) as cm:
            apply_migration(MemoryStore(), d, "sha-x")
        self.assertGreaterEqual(cm.exception.report["blocking"], 2)
        s = MemoryStore()
        rep = apply_migration(s, d, "sha-x", accept_blocking=True)                      # explicit decision: skip, never guess
        self.assertIsNone(s.get("leaves", d["leaves"][0]["id"]).data.get("mystery"))
        self.assertEqual(rep["applied"]["leaves"], 2)

    def test_apply_skips_broken_references_and_duplicate_codes(self):
        d = json.loads(self.raw)
        d["leaves"][0]["employee_id"] = "ghost"
        rep = apply_migration(MemoryStore(), d, "sha-y", accept_blocking=True)
        self.assertEqual(rep["applied"].get("leaves", 0), 1)
        self.assertEqual(rep["skipped"], 1)

    def test_trash_and_flag_delete_migration(self):
        d = json.loads(self.raw)
        eid = d["employees"][0]["id"]
        d["deletedRecords"] = [{"id": "del1", "coll": "leaves", "label": "L", "at": "2026-01-01T00:00:00Z", "rec": {"id": "lvOld", "employee_id": eid, "type": "leave"}},
                               {"id": "del2", "coll": "payrollPayments_x", "rec": {"id": "z"}}]
        d["laborActions"] = [{"id": "la1", "employee_id": eid, "kind": "k", "deleted": True, "deleted_at": "2026-02-02T00:00:00Z"}]
        s = MemoryStore()
        with self.assertRaises(MigrationBlocked):                                        # the unknown trash collection blocks
            apply_migration(s, d, "sha-z")
        rep = apply_migration(s, d, "sha-z", accept_blocking=True)
        r = s.get("leaves", "lvOld")
        self.assertEqual((r.deleted_via, r.delete_label), ("trash", "L"))
        self.assertEqual(s.get("laborActions", "la1").deleted_via, "flag")
        boot = SyncService(s, Actor(policy.Principal(user_id="a", role_id="admin", all_units=True), "a", "a", "a")).bootstrap()["data"]
        self.assertEqual(boot["deletedRecords"][0]["coll"], "leaves")
        self.assertTrue(boot["laborActions"][0]["deleted"])

    def test_bootstrap_of_migrated_data_matches_roles(self):
        s = MemoryStore()
        apply_migration(s, self.data, self.sha)
        mgr = SyncService(s, Actor(policy.Principal(user_id="m", role_id="hr_manager", all_units=True), "m", "m", "m")).bootstrap()
        self.assertEqual(len(mgr["data"]["employees"]), 2)
        self.assertEqual(mgr["data"]["settings"]["taxBrackets"], self.data["settings"]["taxBrackets"])
        spec = SyncService(s, Actor(policy.Principal(user_id="s", role_id="hr_specialist", all_units=True), "s", "s", "s")).bootstrap()["data"]
        self.assertTrue(all("salary" not in e and "national_id" not in e for e in spec["employees"]))
        self.assertEqual(spec["payrollAdjustments"], [])


if __name__ == "__main__":
    unittest.main()
