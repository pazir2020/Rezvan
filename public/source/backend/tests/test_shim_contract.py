"""End-to-end contract: the REAL frontend adapter (frontend/hr-api-shim.js, run in Node with a fake fetch) generates change batches
from realistic edits of a server-built bootstrap; the REAL SyncService applies them on the MemoryStore.
Skipped when `node` is missing. Not a browser test and not a database test."""
import hashlib
import json
import os
import shutil
import subprocess
import unittest

from app.core.policy import Principal
from app.migration.apply import apply_migration
from app.services.store import MemoryStore
from app.services.sync import Actor, SyncService

SAMPLE = os.environ.get("HR_SAMPLE_JSON", "/mnt/user-data/uploads/hr-dashboard-data.json")
HARNESS = os.path.join(os.path.dirname(__file__), "shim_harness.js")


def actor(role):
    return Actor(Principal(user_id="u_" + role, role_id=role, all_units=True), "u_" + role, role, role)


def run_node(boot, me, steps, fail=None):
    p = subprocess.run(["node", HARNESS], input=json.dumps({"bootstrap": boot, "me": me, "steps": steps, "failPush": fail}), capture_output=True, text=True, timeout=60)
    assert p.returncode == 0, p.stderr
    return json.loads(p.stdout)


@unittest.skipUnless(shutil.which("node") and os.path.exists(SAMPLE), "node or sample file missing")
class ShimContract(unittest.TestCase):
    def setUp(self):
        with open(SAMPLE, "rb") as f:
            raw = f.read()
        self.store = MemoryStore()
        apply_migration(self.store, json.loads(raw), hashlib.sha256(raw).hexdigest())
        self.svc = SyncService(self.store, actor("hr_manager"))
        self.boot = self.svc.bootstrap()
        self.me = self.boot["me"]
        self.eid = self.boot["data"]["employees"][0]["id"]

    def pushes(self, steps, **kw):
        return [[c["push"]["ops"] for c in step if "push" in c] for step in run_node(self.boot, self.me, steps, **kw)]

    def test_no_changes_means_no_push(self):
        self.assertEqual(self.pushes(["await window.saveToStorage();"]), [[]])

    def test_create_update_delete_flow_is_accepted_by_server(self):
        eid = self.eid
        steps = [
            f"DATA.leaves.push({{id:'lvNew1', employee_id:'{eid}', type:'leave', start_date:'2026-10-01', end_date:'2026-10-02'}}); await window.saveToStorage();",
            f"DATA.leaves.find(x=>x.id==='lvNew1').note='edited'; await window.saveToStorage();",
            f"DATA.leaves = DATA.leaves.filter(x=>x.id!=='lvNew1'); DATA.deletedRecords.unshift({{id:'delX', coll:'leaves', label:'مرخصی', rec:{{id:'lvNew1'}}, at:'t'}}); await window.saveToStorage();",
        ]
        batches = self.pushes(steps)
        self.assertEqual([b[0][0]["op"] for b in batches], ["create", "update", "delete"])
        self.assertEqual(batches[1][0][0]["set"], {"note": "edited"})          # only the changed field is sent
        self.assertEqual(batches[1][0][0]["v"], 1)                              # base version from the server
        for step in batches:
            for ops in step:
                self.svc.push(ops)                                              # REAL server logic accepts what the adapter produced
        data = self.svc.bootstrap()["data"]
        self.assertEqual([r["coll"] for r in data["deletedRecords"]], ["leaves"])
        self.assertEqual(data["deletedRecords"][0]["label"], "مرخصی")

    def test_render_time_empty_settings_defaults_are_not_pushed(self):
        steps = ["DATA.settings.laborRules = {}; DATA.settings.holidays = []; await window.saveToStorage();"]
        self.assertEqual(self.pushes(steps), [[]])

    def test_real_setting_change_by_permitted_user(self):
        steps = ["DATA.settings.minWage = 123; await window.saveToStorage();"]
        ops = self.pushes(steps)[0][0]
        self.assertEqual([(o["c"], o["op"], o["id"]) for o in ops], [("settings", "put", "minWage")])
        self.svc.push(ops)
        self.assertEqual(self.svc.bootstrap()["data"]["settings"]["minWage"], 123)

    def test_unpermitted_setting_change_is_not_pushed(self):
        svc = SyncService(self.store, actor("hr_specialist"))
        boot = svc.bootstrap()
        out = run_node(boot, boot["me"], ["DATA.settings.minWage = 5; await window.saveToStorage();"])
        self.assertEqual([c for c in out[0] if "push" in c], [])

    def test_employee_edit_sends_only_changed_field_and_server_applies(self):
        steps = [f"DATA.employees.find(e=>e.id==='{self.eid}').phone='09120000000'; await window.saveToStorage();"]
        ops = self.pushes(steps)[0][0]
        self.assertEqual(ops[0]["set"], {"phone": "09120000000"})
        self.svc.push(ops)

    def test_server_rejection_shows_message_and_reloads(self):
        out = run_node(self.boot, self.me, [f"DATA.leaves.push({{id:'lvBad', employee_id:'{self.eid}', type:'leave', hack:1}}); await window.saveToStorage();"],
                       fail={"status": 422, "error": {"code": "VALIDATION_ERROR", "message": "داده‌ی ارسالی معتبر نیست."}})
        self.assertTrue(any("alert" in c for c in out[0]))

    def test_user_without_permission_data_is_never_in_bootstrap_so_never_pushed(self):
        svc = SyncService(self.store, actor("hr_specialist"))
        boot = svc.bootstrap()
        self.assertEqual(boot["data"]["payrollAdjustments"], [])
        out = run_node(boot, boot["me"], ["await window.saveToStorage();"])
        self.assertEqual([c for c in out[0] if "push" in c], [])


if __name__ == "__main__":
    unittest.main()
