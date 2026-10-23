"""Single mapping from KPI Jalali period to the legacy HRMS payroll month.

Legacy payroll and Excel imports use Gregorian YYYY-MM buckets. Imported Jalali
months are mapped by the 15th day of the Jalali month (see dashboard-41.html
Excel import: jalaliToISO(year, month, 15).slice(0, 7)).

Uses the same Jalali year calculation as the bundled frontend, with no extra
runtime dependency. Never treat the Jalali string as a Gregorian month.
"""
from datetime import date, timedelta
import re

_JALALI_MONTH = re.compile(r'^14\d{2}-(0[1-9]|1[0-2])$')
_BREAKS = (-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
           1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178)


def _trunc(a: int, b: int) -> int:
    """JS truncating division (not floor for negative numbers)."""
    return a // b if a >= 0 else -((-a) // b)


def _mod(a: int, b: int) -> int:
    return a - _trunc(a, b) * b


def _farvardin_start(jy: int) -> date:
    if not 1400 <= jy <= 1499:
        raise ValueError('سال شمسی خارج از محدوده سامانه است')
    gy = jy + 621
    leap_j, jp, jump = -14, _BREAKS[0], 0
    for jm in _BREAKS[1:]:
        jump = jm - jp
        if jy < jm:
            break
        leap_j += _trunc(jump, 33) * 8 + _trunc(_mod(jump, 33), 4)
        jp = jm
    n = jy - jp
    leap_j += _trunc(n, 33) * 8 + _trunc(_mod(n, 33) + 3, 4)
    if _mod(jump, 33) == 4 and jump - n == 4:
        leap_j += 1
    leap_g = _trunc(gy, 4) - _trunc((_trunc(gy, 100) + 1) * 3, 4) - 150
    march = 20 + leap_j - leap_g
    return date(gy, 3, march)


def jalali_payroll_bucket(period_key: str) -> tuple[str, str]:
    """Return (Gregorian YYYY-MM payroll key, valid Gregorian ISO anchor date).

    The anchor is 15th of the Jalali month, matching the established importer.
    """
    if not isinstance(period_key, str) or not _JALALI_MONTH.fullmatch(period_key):
        raise ValueError('ماه ارزیابی باید با قالب شمسی ۱۴۰۵-۰۸ ثبت شود')
    jy, jm = map(int, period_key.split('-'))
    days = ((jm - 1) * 31 if jm <= 7 else 186 + (jm - 7) * 30) + 14
    anchor = _farvardin_start(jy) + timedelta(days=days)
    return anchor.strftime('%Y-%m'), anchor.isoformat()
