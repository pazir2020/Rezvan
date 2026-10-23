"""Pure rules for Rezvan HR completion: no payroll mutation.

Production-hours standard remains pending supervisor data. These functions
must not manufacture paid amounts, insurance/tax correctness or team shares.
"""
import re
from datetime import date
from .team_registry import period_span

JALALI_MONTH_RE = re.compile(r'^14\d{2}-(0[1-9]|1[0-2])$')
PAYROLL_CHECKS = (
    'payroll_source', 'employee_roster', 'attendance_leave', 'overtime',
    'kpi_and_adjustments', 'insurance', 'tax', 'payslip_vs_excel',
)


def valid_jalali_month(value):
    if not isinstance(value, str) or not JALALI_MONTH_RE.fullmatch(value):
        raise ValueError('ماه شمسی باید به صورت ۱۴۰۵-۰۸ باشد')
    period_span(value)
    return value


def evidence_quality(checks, refs):
    """Require all independent reviews AND cited human-check source references."""
    if not isinstance(checks, dict) or not isinstance(refs, dict):
        return False, list(PAYROLL_CHECKS)
    bad = [k for k in PAYROLL_CHECKS if checks.get(k) is not True or
           not isinstance(refs.get(k), str) or len(refs[k].strip()) < 4]
    return not bad, bad


def contract_month_status(contracts, start, end):
    """Do not treat one multi-month contract as the independent monthly document.

    All calendar dates are Gregorian DATE from backend. The term may be shorter
    than the month; it must start/end inside the same Jalali month to qualify.
    """
    found_draft = False
    found_spanning = False
    for raw in contracts:
        d = raw.get('data', raw)
        try:
            a = date.fromisoformat(str(d.get('start_date') or ''))
            b = date.fromisoformat(str(d.get('end_date') or ''))
        except ValueError:
            continue
        if a > b or a > end or b < start:
            continue
        if a < start or b > end:
            found_spanning = True
            continue
        if d.get('signed') in (True, 'true', 'yes', 1):
            return 'signed'
        found_draft = True
    return 'draft' if found_draft else ('cross_month_review' if found_spanning else 'missing')


def repeated_membership(segments, start, end):
    """Find mid-period transfers or gaps; no automatic money allocation."""
    relevant = [r for r in segments if r['valid_from'] <= end and
                (r['valid_to'] is None or r['valid_to'] >= start)]
    teams = {(r['team_kind'], r['team_number']) for r in relevant}
    full = [r for r in relevant if r['valid_from'] <= start and
            (r['valid_to'] is None or r['valid_to'] >= end)]
    if len(teams) > 1 or len(relevant) > 1 or (relevant and len(full) != 1):
        return True
    return False
