"""Regression checks for real-payroll lock guard and payslip-PDF archive.

Runs without PostgreSQL: SQL statements are exercised against a purpose-built
read-only fake. PostgreSQL transaction integration remains a LAN acceptance test.
"""
from io import BytesIO
from pathlib import Path
import pytest
from app.core.payroll_review_gate import payroll_source_fingerprint,valid_approved_packet_for_lock
from app.core.payslip_archive import store_payslip_pdf
from app.core.hr_completion_rules import PAYROLL_CHECKS


class Conn:
    def __init__(self,rows,packets=None):
        self.rows=rows
        self.packets=packets or []
        self.sql=[]
    def execute(self,sql,params=()):
        self.sql.append((sql,params))
        self._data=self.packets if 'FROM hr_payroll_review_packets' in sql else self.rows
        return self
    def fetchall(self):
        return self._data


def _r(lock_version=1,pay_version=1):
    return [dict(collection='payrollLocks',id='lock-oct',version=lock_version),
            dict(collection='payrollAdjustments',id='adj',version=pay_version)]


def test_lock_status_change_does_not_cancel_independent_review():
    old_digest,count=payroll_source_fingerprint(Conn(_r(1,1)),'1405-08')
    new_digest,_=payroll_source_fingerprint(Conn(_r(99,1)),'1405-08')
    assert count==2
    assert new_digest==old_digest


def test_wage_adjustment_change_invalidates_review():
    old_digest,_=payroll_source_fingerprint(Conn(_r(1,1)),'1405-08')
    new_digest,_=payroll_source_fingerprint(Conn(_r(1,2)),'1405-08')
    assert new_digest!=old_digest


def test_approved_packet_required_to_lock_and_must_be_independent():
    digest,_=payroll_source_fingerprint(Conn(_r()),'1405-08')
    packet={'month':'1405-08','status':'approved','source_fingerprint':digest,
            'prepared_by':'hr','reviewed_by':'finance',
            'checklist':{k:True for k in PAYROLL_CHECKS},
            'evidence_refs':{k:'Document 123' for k in PAYROLL_CHECKS}}
    assert valid_approved_packet_for_lock(Conn(_r(),[packet]),'2026-11')['month']=='1405-08'
    assert valid_approved_packet_for_lock(Conn(_r(),[packet]),'1405-08')['month']=='1405-08'
    with pytest.raises(ValueError,match='قبل از قفل'):
        valid_approved_packet_for_lock(Conn(_r(),[]),'2026-11')
    with pytest.raises(ValueError,match='کنترل مجدد'):
        valid_approved_packet_for_lock(Conn(_r(pay_version=2),[packet]),'2026-11')
    with pytest.raises(ValueError,match='بدون تأیید'):
        valid_approved_packet_for_lock(Conn(_r(),[{**packet,'reviewed_by':'hr'}]),'2026-11')


def test_pdf_archive_accepts_valid_pdf_bytes_and_returns_digest(tmp_path):
    src=b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'
    dest=tmp_path/'payslip.pdf'
    size,digest=store_payslip_pdf(BytesIO(src),dest,1024)
    import hashlib
    assert size==len(src) and digest==hashlib.sha256(src).hexdigest()
    assert dest.read_bytes()==src


@pytest.mark.parametrize('bad', [b'not a pdf at all',b'%PDF-1.4\nmissing trailer',b'%PDF-1.4\n'])
def test_pdf_archive_rejects_invalid_streams(tmp_path,bad):
    with pytest.raises(ValueError):
        store_payslip_pdf(BytesIO(bad),tmp_path/'bad.pdf',1024)


def test_pdf_archive_rejects_oversize(tmp_path):
    with pytest.raises(ValueError,match='حجم'):
        store_payslip_pdf(BytesIO(b'%PDF-1.4\n'+b'a'*300+b'%%EOF'),tmp_path/'big.pdf',100)


def test_guard_uses_central_sync_lock_path():
    root=Path(__file__).resolve().parents[1]
    pg=(root/'app/services/pgstore.py').read_text()
    sync=(root/'app/services/sync.py').read_text()
    api=(root/'app/routers/hr_completion_api.py').read_text()
    sql=(root.parent/'db/upgrade-hr-completion.sql').read_text()
    assert 'require_approved_payroll_review' in pg
    assert "gate(old.get('month'))" in sync
    assert "@router.post('/payslips/archive'" in api
    assert "@router.get('/payslips/archive/{archive_id}/download'" in api
    assert 'hr_payslip_pdf_archive' in sql
