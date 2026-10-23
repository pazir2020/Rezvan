"""Static specification of the system, derived from dashboard-41.html (ROLE_PERMS, FN_PERMS, record shapes) and the
owner-approved decisions (D-A..D-F, final build order). Extra allowed fields can be added WITHOUT code changes via the JSON
file named in HR_FIELD_OVERRIDES: {"collection": ["field", ...]} (use it for fields the migration reports as DATA_INSUFFICIENT)."""
import json
import os

ROLE_PERMS = {'admin': ['*'],
 'hr_manager': ['view_dashboard',
                'view_ceo',
                'view_alerts',
                'manage_alerts',
                'view_personnel',
                'write_personnel',
                'write_records',
                'delete_records',
                'delete_sensitive',
                'write_docs',
                'delete_files',
                'view_salary',
                'view_payroll_totals',
                'view_bank',
                'view_national_id',
                'view_discipline',
                'write_discipline',
                'view_confidential_docs',
                'view_recruitment',
                'write_recruitment',
                'view_reports',
                'view_training',
                'view_leave',
                'edit_settings',
                'backup',
                'view_audit',
                'approve_payroll',
                'view_economics',
                'edit_economic_assumptions',
                'manage_scenarios',
                'approve_records'],
 'hr_specialist': ['view_dashboard',
                   'view_alerts',
                   'manage_alerts',
                   'view_personnel',
                   'write_personnel',
                   'write_records',
                   'delete_records',
                   'write_docs',
                   'view_recruitment',
                   'write_recruitment',
                   'view_reports',
                   'view_training',
                   'view_leave'],
 'ceo': ['view_dashboard',
         'view_ceo',
         'view_alerts',
         'view_personnel',
         'view_payroll_totals',
         'view_recruitment',
         'view_reports',
         'view_training',
         'view_leave',
         'view_economics',
         'manage_scenarios'],
 'viewer': ['view_dashboard', 'view_personnel', 'view_training', 'view_leave', 'view_reports']}

ALL_PERMISSIONS = ('approve_payroll', 'approve_records', 'backup', 'delete_files', 'delete_records', 'delete_sensitive', 'edit_economic_assumptions', 'edit_settings', 'manage_alerts', 'manage_scenarios', 'manage_users', 'purge_data', 'reset_data', 'restore', 'view_alerts', 'view_audit', 'view_bank', 'view_ceo', 'view_confidential_docs', 'view_dashboard', 'view_discipline', 'view_economics', 'view_leave', 'view_national_id', 'view_payroll_totals', 'view_personnel', 'view_recruitment', 'view_reports', 'view_salary', 'view_training', 'write_discipline', 'write_docs', 'write_personnel', 'write_records', 'write_recruitment')
SENSITIVE_PERMISSIONS = ("view_salary", "view_bank", "view_national_id", "view_discipline", "view_confidential_docs")

ROLE_LABELS = {"admin": "مدیر سیستم", "hr_manager": "مدیر منابع انسانی", "hr_specialist": "کارشناس منابع انسانی", "ceo": "مدیرعامل", "viewer": "مشاهده‌گر"}

# keys any record may carry (client-side bookkeeping stamps); they never grant anything
CLIENT_META = ("created", "updated", "created_at", "updated_at", "deleted", "deleted_at", "decided_at", "status_at")
SERVER_OWNED = ("version", "legacy_id")        # `id` is handled separately; created_by/updated_by are plain data keys in some collections

EMPLOYEE_COLUMNS = ("id", "full_name", "department", "level", "manager_id", "hire_date", "exit_date", "phone", "code", "settlement_status")
TIER_A = {"salary": "view_salary", "settlement_amount": "view_salary", "national_id": "view_national_id",
          "bank": "view_bank", "account": "view_bank", "sheba": "view_bank", "ins_no": "view_national_id"}
TIER_B = ('married', 'children', 'probation_months', 'probation_start_date', 'probation_end_date', 'birth_date', 'real_start_date', 'education', 'field_of_study', 'skills', 'supplementary_insurance', 'gender', 'birthplace', 'military_status', 'emg_name', 'emg_phone', 'address', 'position', 'notes', 'resignation_date', 'exit_reason', 'exit_satisfaction', 'exit_interview_notes', 'exit_suggestions', 'equipment_checklist', 'documents_returned', 'exit_hr_note', 'photo_path', 'fte')
SENSITIVE_KEY_RE = r"(?<![a-z])(salary|wage|national|nid|sheba|iban|account|bank|pan|card[_-]?(no|num|number))(?![a-z])"

def _c(read, write=(), delete=None, approve=None, fields=(), sensitive=None, lock="NONE_OBSERVED", rules=(), scoped=True, unique_employee=False):
    return dict(read=read, write=list(write), delete=delete, approve=approve, fields=None if fields is None else list(fields),
                sensitive=sensitive or {}, lock=lock, rules=list(rules), employee_scoped=scoped, unique_employee=unique_employee)

_E = ("employee_id",)
COLLECTION_SPECS = {
 "contracts": _c("view_personnel", ["write_records"], "delete_sensitive", fields=_E + ("type","contract_no","start_date","end_date","position","salary_snapshot","technical_allowance_snapshot","notes","status","signed","signed_date","file_ref","workplace","working_hours","weekly_rest","shift"), sensitive={"salary_snapshot": "view_salary", "technical_allowance_snapshot": "view_salary"}),
 "payTerms": _c("view_salary", ["write_personnel", "view_salary"], None, fields=_E + ("from","basis","taxMode","insured","amount","note","prev_amount")),
 "attendance": _c("view_personnel", ["write_records"], "delete_records", "approve_records", fields=_E + ("type","date","minutes","note","justified","chain","hr_status","hr_at","deficit_excused"),
   rules=[{"field":"hr_status","when":"value_not_in","values":["pending","",None],"perm":"approve_records"},{"field":"deficit_excused","when":"change","perm":"approve_records"}]),
 "overtime": _c("view_personnel", ["write_records"], "delete_records", "approve_records", fields=_E + ("department","month","hours","approval","status_at","approver"), lock="HARD_BLOCK",
   rules=[{"field":"approval","when":"value_not_in","values":["pending","",None],"perm":"approve_records"}]),
 "disciplinary": _c("view_discipline", ["write_discipline"], "delete_sensitive", fields=_E + ("date","violation_type","description","action","chain","case_status")),
 "sickLeaves": _c("view_confidential_docs", ["write_records"], "delete_sensitive", fields=_E + ("start_date","end_date","reason","doc_status","cert_no","sso_status","internal_status","file_ref","hr_note")),
 "incidents": _c("view_personnel", ["write_records"], "delete_sensitive", fields=_E + ("date","time","place","desc","kind","severity","witnesses","cause","immediate","treatment","absent_days","owner","files","final_note","status","actions")),
 "laborActions": _c("view_personnel", ["write_records"], "delete_sensitive", "approve_records", fields=_E + ("kind","action","date","reason","doc_ref","review","approval","result","ref"),
   rules=[{"field":"approval","when":"value_not_in","values":["pending","",None],"perm":"approve_records"}]),
 "eidiRecords": _c("view_salary", ["write_records", "view_salary"], "delete_sensitive", fields=_E + ("year","calc","basis","days_worked","fraction","snapshot","paid","paid_date","status","note"), sensitive={"calc":"view_salary","paid":"view_salary","snapshot":"view_salary"}),
 "settlements": _c("view_salary", ["write_personnel", "view_salary"], None, "approve_payroll", fields=_E + ("items","history","status","pay_date","receipt","approved_by","note"),
   rules=[{"field":"status","when":"value_in","values":["paid"],"perm":"approve_payroll"}]),
 "probations": _c("view_personnel", ["write_records"], None, fields=_E + ("evaluation_status","result","decision_by","decision_date","note")),
 "insuranceMonths": _c("view_salary", ["write_records", "view_salary"], None, fields=("month","status","sent_date","paid_date","receipt","note"), scoped=False),
 "payrollPayments": _c("view_salary", ["write_records", "view_salary"], "delete_sensitive", fields=_E + ("month","amount","date","method","reference")),
 "loans": _c("view_salary", ["write_records", "view_salary"], "delete_sensitive", fields=_E + ("type","amount","installments","start_date","notes","overdue_count"), lock="AMEND_WITH_REASON"),
 "benefits": _c("view_salary", ["write_records", "view_salary"], "delete_sensitive", fields=_E + ("type","amount","date","notes")),
 "trainings": _c("view_training", ["write_records"], "delete_records", fields=_E + ("title","date","score","note")),
 "evaluations": _c("view_personnel", ["write_records"], "delete_sensitive", fields=_E + ("position_at_eval","period","date","scores","final_score","notes")),
 "candidates": _c("view_recruitment", ["write_recruitment"], "write_recruitment", fields=("name","phone","position","source","stage","applied_date","interviewer","interview1_date","interview1_department","interview1_interviewer","interview2_date","interview2_department","interview2_interviewer","proposed_salary","rejection_reason","notes"), sensitive={"proposed_salary":"view_salary"}, scoped=False),
 "jobHistory": _c("view_personnel", ["write_personnel"], None, fields=_E + ("date","field","old_value","new_value")),
 "empExtra": _c("view_personnel", ["write_personnel"], None, fields=_E + ("start","end","hours","rest","shift","shifttype","night","nighth","fri","hol","ins_no","ins_type","ins_status","ins_note","ins_start"), sensitive={"ins_no":"view_national_id"}, unique_employee=True),
 "monthlyFinancials": _c("view_economics", ["edit_economic_assumptions"], "edit_economic_assumptions", fields=("month","revenue","netProfit","operatingProfit","fixedCosts","variableCosts","headcount","production","laborHours","notes","createdAt","updatedAt"), scoped=False),
 "hiringScenarios": _c("view_economics", ["manage_scenarios"], "manage_scenarios", scoped=False,
  fields=("type", "title", "createdAt", "position", "headcount", "salary", "employerInsurance",
          "benefits", "overtime", "recruitmentCost", "trainingCost", "onboardingCost",
          "rampUpCost", "rampUpMonths", "additionalRevenue", "contributionMarginRatio",
          "hiringAdvertisingCost", "averageInterviewCost", "recruitmentCostIncludesAdsInterview", "calculationVersion",
          "requiredHours", "scope", "dept", "selectedIds", "increasePct", "increaseAmount", "results"),
  sensitive={"salary":"view_salary", "selectedIds":"view_salary", "increaseAmount":"view_salary", "results":"view_salary"}),
 "turnoverCosts": _c("view_economics", ["edit_economic_assumptions"], "edit_economic_assumptions", fields=_E + ("recruitmentCost","interviewCost","onboardingCost","trainingCost","overtimeReplacementCost","adminExitCost","lostProductivityManual","rampUpDays","dailyProductivityGap","costPerProductivityUnit","notes","createdAt","updatedAt")),
 "leaves": _c("view_leave", ["write_records"], "delete_records", fields=_E + ("type","start_date","end_date","advance","note")),
 "payrollAdjustments": _c("view_salary", ["write_records", "view_salary"], "delete_sensitive", fields=_E + ("kind","type","type_label","calc","hours","days","amount","date","payroll_month","apply_to_payroll","notes","created_by","created_by_name","updated_by","updated_by_name"), lock="AMEND_WITH_REASON"),
 "documents": _c("view_personnel", ["write_docs"], "write_docs", fields=_E + ("title","category","fileName","relativePath","expiry_date","confidential","size","source","storage_key","sha256","mime")),
}
# writes disabled until the allowlist is verified (owner decision): unknown fields -> DATA_INSUFFICIENT
WRITE_DISABLED = ()
# payrollLocks / deletedRecords / settings / alertStates / users / auditLog are handled by dedicated rules (services/sync.py)
LOCK_FIELDS = ("month","status","history","amendments","reviewed_by","reviewed_by_name","reviewed_at","approved_by","approved_by_name","approved_at",
               "unlocked_by","unlocked_by_name","unlocked_at","unlock_reason","snapshotVersion","snapshot","workingDays","dailyHours","rulesYear",
               "rulesSnapshot","leavePolicySnapshot","eidiSnapshot","holidaysCountSnapshot","laborCostComponentsSnapshot","source","excelReport")
TRASH_COLLECTIONS = ("attendance","disciplinary","payrollAdjustments","leaves","contracts","loans","benefits","trainings","payrollPayments","overtime","evaluations")
SETTINGS_PERM_DEFAULT = "edit_settings"
SETTINGS_PERMS = {"economicAssumptions": "edit_economic_assumptions", "lockDisabled": "manage_users", "legacyLockMigrated": "manage_users"}
SETTINGS_KEYS_DOC = ("alertConfig","economicAssumptions","eidi","holidays","laborRules","laborRulesLog","leavePolicy","minWage","payslipOrg","unitSchedules","accountMap","lockDisabled","legacyLockMigrated")

def _apply_overrides():
    p = os.environ.get("HR_FIELD_OVERRIDES")
    if p and os.path.exists(p):
        for coll, extra in json.load(open(p, encoding="utf-8")).items():
            spec = COLLECTION_SPECS.get(coll)
            if spec and spec["fields"] is not None:
                spec["fields"] = sorted(set(spec["fields"]) | set(extra))
_apply_overrides()
