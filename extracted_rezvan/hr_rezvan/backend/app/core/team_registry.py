"""Rules for historical four-person Rezvan production teams.

No payroll allocation may be certified by a mere shared department label.
Every team member must have an explicit assignment spanning the WHOLE Jalali
month. In-month transfers/partial participation are flagged for HR review;
no pro-rata formula is invented before management approves a policy.
"""
from datetime import date, timedelta
from .payroll_period import _farvardin_start

DEFAULT_WEIGHTS = (30, 25, 20, 15, 10)


def period_span(month_key: str) -> tuple[date, date]:
    if not isinstance(month_key, str) or len(month_key) != 7 or month_key[4] != '-':
        raise ValueError('Invalid Jalali month')
    try:
        jy, jm = (int(v) for v in month_key.split('-'))
        if not 1 <= jm <= 12 or not 1400 <= jy <= 1498:
            raise ValueError()
        start = _farvardin_start(jy) + timedelta(days=(jm-1)*31 if jm <= 7 else 186 + (jm-7)*30)
        next_start = (_farvardin_start(jy + 1) if jm == 12 else
                      _farvardin_start(jy) + timedelta(days=jm*31 if jm < 7 else 186 + (jm-6)*30))
        end = next_start - timedelta(days=1)
        return start, end
    except Exception as exc:
        raise ValueError('Invalid Jalali month') from exc


def team_assignment_issues(conn, key: str, kind: str, number: int, employee_ids) -> list[str]:
    start, end = period_span(key)
    valid = conn.execute('''SELECT employee_id FROM hr_team_memberships WHERE team_kind=%s AND team_number=%s
        AND valid_from <= %s AND (valid_to IS NULL OR valid_to >= %s)''', (kind, number, start, end)).fetchall()
    assigned = [x['employee_id'] for x in valid]
    issues=[]
    if len(assigned) != 4 or len(set(assigned)) != 4:
        issues.append('برای این ماه چهار عضویت کامل و تأییدشده برای تیم ثبت نشده است')
    if set(assigned) != set(employee_ids):
        issues.append('اعضای انتخاب‌شده با ترکیب تاریخی ثبت‌شده تیم مطابقت ندارند؛ جابه‌جایی یا حضور بخشی از ماه نیازمند تصمیم جداگانه است')
    return issues


def supervisor_teams(conn, actor_id: str, key: str | None = None) -> set[tuple[str,int]]:
    if key:
        start, end = period_span(key)
        rows = conn.execute('''SELECT team_kind,team_number FROM hr_team_supervisors WHERE user_id=%s
          AND valid_from <= %s AND (valid_to IS NULL OR valid_to >= %s)''', (actor_id,start,end)).fetchall()
    else:
        rows = conn.execute('''SELECT team_kind,team_number FROM hr_team_supervisors WHERE user_id=%s
          AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)''', (actor_id,)).fetchall()
    return {(r['team_kind'],r['team_number']) for r in rows}
