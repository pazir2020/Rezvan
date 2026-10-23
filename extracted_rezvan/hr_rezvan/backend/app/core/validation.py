"""Field-level validation (anti mass-assignment), sensitive-field rules and employee splitting. Pure logic."""
import json
import math
import re
from typing import Callable, Dict, Iterable, List, Optional, Tuple

from ..specs import (CLIENT_META, COLLECTION_SPECS, EMPLOYEE_COLUMNS, SENSITIVE_KEY_RE, SERVER_OWNED, TIER_A, TIER_B, WRITE_DISABLED)

HasPerm = Callable[[str], bool]
MAX_PAYLOAD_BYTES = 256 * 1024          # payroll snapshots can be large; per-record cap
MAX_STRING = 8000
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")
_MONTH = re.compile(r"^\d{4}-\d{2}$")
_NUMERIC_HINT = re.compile(r"(amount|hours|minutes|days|installments|score|count|cost|revenue|profit|headcount|production)", re.I)
_sens = re.compile(SENSITIVE_KEY_RE, re.I)
ID_RE = re.compile(r"^[A-Za-z0-9_-]{3,64}$")


def allowed_fields(collection: str) -> Optional[set]:
    spec = COLLECTION_SPECS[collection]
    if spec["fields"] is None:
        return None
    return set(spec["fields"]) | set(CLIENT_META)


def _walk_keys(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield path + "/" + str(k), str(k)
            yield from _walk_keys(v, path + "/" + str(k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _walk_keys(v, path + "[%d]" % i)


def check_value(key: str, v) -> Optional[str]:
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        if not math.isfinite(v):
            return "non-finite number"
        if key == "fte" and not (0 < v <= 1):
            return "FTE must be greater than zero and at most one"
        # A real month can show a loss: only profit fields may be negative.
        if key in ("netProfit", "operatingProfit"):
            return None
        return "negative number" if (_NUMERIC_HINT.search(key) and v < 0) else None
    if isinstance(v, str):
        if key == "fte":
            return "FTE must be numeric"
        if len(v) > MAX_STRING:
            return "string too long"
        if v and (key.endswith("_date") or key in ("date", "from")) and not _DATE.match(v):
            return "expected YYYY-MM-DD"
        if v and key in ("month", "payroll_month") and not _MONTH.match(v):
            return "expected YYYY-MM"
        return None
    if isinstance(v, (dict, list)):
        return None
    return "unsupported type"


def validate_keys(collection: str, keys: Iterable[str], *, creating: bool) -> List[dict]:
    """Unknown / server-owned / write-disabled keys. `id` is accepted on create only."""
    errs = []
    if collection not in COLLECTION_SPECS:
        return [{"code": "UNKNOWN_COLLECTION", "field": None}]
    if collection in WRITE_DISABLED or COLLECTION_SPECS[collection]["fields"] is None:
        return [{"code": "DATA_INSUFFICIENT", "field": None, "message": "allowlist unresolved; writes disabled"}]
    allowed = allowed_fields(collection)
    for k in keys:
        if k == "id":
            if not creating:
                errs.append({"code": "IMMUTABLE_FIELD", "field": k})
        elif k in SERVER_OWNED:
            errs.append({"code": "SERVER_OWNED_FIELD", "field": k})
        elif k not in allowed:
            errs.append({"code": "UNKNOWN_FIELD", "field": k})
        elif k == "employee_id" and not creating:
            errs.append({"code": "IMMUTABLE_FIELD", "field": k})
    return errs


def validate_values(data: dict) -> List[dict]:
    errs = []
    try:
        if len(json.dumps(data, ensure_ascii=False).encode("utf-8")) > MAX_PAYLOAD_BYTES:
            return [{"code": "PAYLOAD_TOO_LARGE", "field": None}]
    except (TypeError, ValueError):
        return [{"code": "INVALID_BODY", "field": None}]
    for k, v in data.items():
        e = check_value(k, v)
        if e:
            errs.append({"code": "INVALID_VALUE", "field": k, "message": e})
    return errs


def validate_economic_scenario(data: dict, *, creating: bool = True) -> List[dict]:
    """Validate the two legacy *preview-only* economic scenarios before LAN persistence.

    Results are stored as audit snapshots, never applied to actual salary/contract records.
    Money fields require view_salary, enforced by sensitive-field permissions.
    """
    issues = []
    kind = data.get('type')
    if (creating or 'type' in data) and kind not in ('hiring', 'salary_increase'):
        issues.append({'code':'INVALID_VALUE','field':'type','message':'unknown scenario type'})
    if (creating or 'title' in data) and (not isinstance(data.get('title'), str) or not data['title'].strip() or len(data['title']) > 300):
        issues.append({'code':'INVALID_VALUE','field':'title'})
    if (creating or 'results' in data) and not isinstance(data.get('results'), dict):
        issues.append({'code':'INVALID_VALUE','field':'results'})
    elif 'results' in data:
        # Calculated results must be scalar snapshots, not arbitrarily nested payloads.
        keys = {'ok','affectedCount','currentSalarySum','additionalSalary','additionalEmployerCost',
                'totalAdditionalLaborCost','annualAdditional','currentProfit','scenarioProfit',
                'currentLaborCostRatio','scenarioLaborCostRatio','monthlyLaborCost',
                'initialInvestment','breakEvenRevenue','additionalContribution',
                'netEconomicEffect','roi','annualRoi','annualNetEffect',
                'annualContribution','rampUpMonthsApplied','payback','steadyStateProfit','month1Profit'}
        for k,v in data['results'].items():
            if k not in keys or isinstance(v,(dict,list)) or (v is not None and not isinstance(v,(int,float,bool))):
                issues.append({'code':'INVALID_VALUE','field':'results.'+str(k)})
            elif isinstance(v,(int,float)) and not isinstance(v,bool) and not math.isfinite(v):
                issues.append({'code':'INVALID_VALUE','field':'results.'+k})
    for k in ('salary','headcount','employerInsurance','benefits','overtime','recruitmentCost',
              'trainingCost','onboardingCost','rampUpCost','rampUpMonths','hiringAdvertisingCost',
              'averageInterviewCost','additionalRevenue',
              'contributionMarginRatio','requiredHours','increasePct','increaseAmount'):
        if k not in data or data[k] is None: continue
        v=data[k]
        if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or v < 0:
            issues.append({'code':'INVALID_VALUE','field':k})
    ids=data.get('selectedIds',[])
    if not isinstance(ids,list) or len(ids)>300 or any(not isinstance(x,str) or len(x)>64 for x in ids):
        issues.append({'code':'INVALID_VALUE','field':'selectedIds'})
    if 'calculationVersion' in data and data['calculationVersion'] not in ('econ-linear-ramp-v2', None):
        issues.append({'code':'INVALID_VALUE','field':'calculationVersion'})
    if 'recruitmentCostIncludesAdsInterview' in data and not isinstance(data['recruitmentCostIncludesAdsInterview'], (bool,type(None))):
        issues.append({'code':'INVALID_VALUE','field':'recruitmentCostIncludesAdsInterview'})
    if 'headcount' in data and data['headcount'] is not None:
        count=data['headcount']
        if isinstance(count,bool) or not isinstance(count,int) or count<1 or count>300:
            issues.append({'code':'INVALID_VALUE','field':'headcount','message':'integer 1..300 required'})
    if isinstance(data.get('employerInsurance'), (int, float)) and not isinstance(data.get('employerInsurance'), bool) and data['employerInsurance'] > 100:
        issues.append({'code':'INVALID_VALUE','field':'employerInsurance','message':'rate may not exceed 100 percent'})
    if isinstance(data.get('contributionMarginRatio'), (int, float)) and not isinstance(data.get('contributionMarginRatio'), bool) and data['contributionMarginRatio'] > 100:
        issues.append({'code':'INVALID_VALUE','field':'contributionMarginRatio','message':'rate may not exceed 100 percent'})
    if 'rampUpMonths' in data and data['rampUpMonths'] is not None:
        months = data['rampUpMonths']
        if isinstance(months, bool) or not isinstance(months, int) or months > 36:
            issues.append({'code':'INVALID_VALUE','field':'rampUpMonths','message':'integer 0..36 months required'})
    if kind=='salary_increase' and (creating or 'scope' in data) and data.get('scope') not in ('all','department','position','selected'):
        issues.append({'code':'INVALID_VALUE','field':'scope'})
    return issues


def sensitive_field_perms(collection: str, keys: Iterable[str]) -> Dict[str, str]:
    spec = COLLECTION_SPECS[collection]
    return {k: spec["sensitive"][k] for k in keys if k in spec["sensitive"]}


def rule_permissions(collection: str, old: dict, changes: dict) -> List[Tuple[str, str]]:
    """Extra permissions required by approval/restricted-value rules for the changed fields -> [(field, perm)]."""
    out = []
    for r in COLLECTION_SPECS[collection]["rules"]:
        f = r["field"]
        if f not in changes:
            continue
        new, was = changes[f], old.get(f)
        if r["when"] == "change":
            if new != was:
                out.append((f, r["perm"]))
        elif r["when"] == "value_in":
            if new in r["values"] and new != was:
                out.append((f, r["perm"]))
        elif r["when"] == "value_not_in":
            if new not in r["values"] and new != was:
                out.append((f, r["perm"]))
    return out


def filter_read(collection: str, record: dict, has_perm: HasPerm) -> dict:
    """Drop (not null) sensitive fields the caller may not read."""
    spec = COLLECTION_SPECS.get(collection)
    if not spec:
        return dict(record)
    out = dict(record)
    for field, perm in spec["sensitive"].items():
        if field in out and not has_perm(perm):
            del out[field]
    return out


def split_employee(rec: dict) -> Tuple[dict, dict, dict, List[dict]]:
    """-> (columns, tierA, tierB, issues). Unknown keys are NEVER placed in extra (DATA_INSUFFICIENT). '' -> NULL here only."""
    cols, sens, extra, issues = {}, {}, {}, []
    for k, v in rec.items():
        if v == "":
            v = None
        if k in EMPLOYEE_COLUMNS:
            cols[k] = v
        elif k in TIER_A:
            sens[k] = v
        elif k in TIER_B:
            extra[k] = v
        else:
            issues.append({"severity": "data_insufficient", "problem": "unknown_field", "field": k,
                           "reason": "field is not in the approved employee field lists; not guessed"})
    for path, key in _walk_keys(extra):
        if _sens.search(key):
            issues.append({"severity": "failed", "problem": "sensitive_key_in_extra", "field": path,
                           "reason": "key matches the sensitive-key pattern"})
    return cols, sens, extra, issues
