"""Server-enforced, fail-closed readiness check for locking payroll.

The review is a human sign-off, NOT mathematical verification of payslip tax,
insurance or bank settlement. The digest tracks version changes of employees,
sensitive employee data, settings, payroll and other operational records.
Changes to unrelated periods may therefore also demand a fresh review.
It also tracks the identity of payroll-lock records. Lock status/version is excluded
because the final lock transition itself must not invalidate the review.
"""
import hashlib
import json
from .payroll_period import jalali_payroll_bucket
from .hr_completion_rules import evidence_quality


def payroll_source_fingerprint(conn, jalali_month):
    gregorian, _ = jalali_payroll_bucket(jalali_month)
    rows = conn.execute('''''SELECT collection,id,version FROM records
        WHERE deleted_at IS NULL AND
         ((collection='payrollLocks' AND data->>'month' IN (%s,%s)) OR
          (collection='payrollPayments' AND data->>'month' IN (%s,%s)) OR
          (collection='payrollAdjustments' AND data->>'payroll_month' IN (%s,%s)) OR
          collection IN ('attendance','leaves','overtime','loans','benefits',
                         'contracts','settlements','empExtra','disciplinary'))
        UNION ALL SELECT 'employees',id,version FROM employees WHERE deleted_at IS NULL
        UNION ALL SELECT 'employee_sensitive',employee_id,version FROM employee_sensitive
        UNION ALL SELECT 'settings',key,version FROM kv WHERE ns='settings'
        ORDER BY collection,id''''',
        (jalali_month,gregorian,jalali_month,gregorian,jalali_month,gregorian)).fetchall()

    digest_rows = [(r['collection'],r['id'],0 if r['collection']=='payrollLocks' else r['version']) for r in rows]
    month_docs = sum(1 for r in rows if r['collection'] in ('payrollLocks','payrollPayments','payrollAdjustments'))
    return hashlib.sha256(json.dumps(digest_rows,ensure_ascii=True).encode()).hexdigest(),month_docs


def valid_approved_packet_for_lock(conn, payroll_month):
    """Return the matching approved packet, or raise a clear ValueError.

    Supports the legacy Gregorian month key and a correctly formatted Jalali
    key. Searches approved packets (typically 12/year), compares derived month
    and ensures no watched data changed after independent sign-off.
    """
    packets = conn.execute('''SELECT * FROM hr_payroll_review_packets
                              WHERE status='approved' ORDER BY reviewed_at DESC FOR SHARE''').fetchall()
    for row in packets:
        try:
            gregorian,_ = jalali_payroll_bucket(row['month'])
        except ValueError:
            continue
        if payroll_month not in (row['month'],gregorian):
            continue
        valid,_ = evidence_quality(row['checklist'],row['evidence_refs'])
        if not valid or row['prepared_by']==row['reviewed_by'] or not row['reviewed_by']:
            raise ValueError('کنترل ماه حقوق ناقص یا بدون تأیید مستقل است')
        digest,count=payroll_source_fingerprint(conn,row['month'])
        if digest != row['source_fingerprint'] or count == 0:
            raise ValueError('اطلاعات ماه حقوق بعد از کنترل تغییر کرده یا مدارک منبع ناقص است؛ کنترل مجدد لازم است')
        return row
    raise ValueError('قبل از قفل حقوق باید کنترل مستند همان ماه توسط مسئول مستقل تأیید شود')
