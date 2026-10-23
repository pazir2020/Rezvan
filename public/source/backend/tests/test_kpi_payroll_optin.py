"""Regression tests for optional KPI-to-payslip transfer and correct month buckets.

The production router needs psycopg/PostgreSQL; validate the pure policy here
without connecting to the customer database.
"""
import ast
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pytest
from fastapi import HTTPException
from app.core.payroll_period import jalali_payroll_bucket

ROOT=Path(__file__).resolve().parents[2]
API=(ROOT/'backend/app/routers/kpi_payroll_api.py').read_text(encoding='utf-8')
JS=(ROOT/'frontend/kpi-team.js').read_text(encoding='utf-8')


def test_jalali_to_legacy_payroll_month_matches_excel_anchor():
    assert jalali_payroll_bucket('1405-07')==('2026-10','2026-10-07')
    assert jalali_payroll_bucket('1405-08')==('2026-11','2026-11-06')
    assert jalali_payroll_bucket('1405-12')==('2027-03','2027-03-06')
    for bad in ('2026-11','1405-13','1405-00','1405-7',''):
        with pytest.raises(ValueError):jalali_payroll_bucket(bad)


def test_backend_uses_gregorian_key_for_payslip_records_and_guard():
    assert "'payroll_month':payroll_month" in API
    assert "'date':anchor_date" in API
    assert 'assure_unlocked(conn,payroll_month)' in API
    assert "body.payroll_month != payroll_month" in API
    assert "'default_applies_to_payslip':False" in API
    assert "'requires_manual_approval':True" in API


def test_frontend_optin_is_unchecked_by_default_and_action_guarded():
    assert 'id="rk-pay-optin"' in JS
    assert 'approve.disabled=!optin.checked' in JS
    assert "operation==='approve'&&!document.getElementById('rk-pay-optin')?.checked" in JS
    assert "?{kpi_version:d.kpi_version,payroll_month:d.payroll_month,note:note.trim()}" in JS
    assert 'بازگشت و حذف اثر همین کارانه از فیش' in JS


class FakeConn:
    def __init__(self,locks=(),payments=()):
        self.locks=list(locks)
        self.payments=list(payments)
    def execute(self,q,params):
        return FakeRows(self.locks if 'payrollLocks' in q else self.payments)


class FakeRows:
    def __init__(self,data):self.data=data
    def fetchall(self):return self.data
    def fetchone(self):return self.data[0] if self.data else None


def _guard():
    node=ast.parse(API)
    fun=next(n for n in node.body if isinstance(n,ast.FunctionDef) and n.name=='assure_unlocked')
    namespace={'HTTPException':HTTPException,'datetime':datetime,'timezone':timezone,'timedelta':timedelta}
    exec(compile(ast.Module(body=[fun],type_ignores=[]),'<guard>','exec'),namespace)
    return namespace['assure_unlocked']


def current_iranian_month():
    return datetime.now(timezone(timedelta(hours=3,minutes=30))).strftime('%Y-%m')


def test_guard_blocks_locked_or_imported_and_payments():
    check=_guard();m=current_iranian_month()
    check(FakeConn(),m)
    check(FakeConn(locks=[{'data':{'status':'open'}}]),m)
    for state in ('locked','imported','finalized','unknown'):
        with pytest.raises(HTTPException) as exc:
            check(FakeConn(locks=[{'data':{'status':state}}]),m)
        assert exc.value.status_code==409
    with pytest.raises(HTTPException) as exc:
        check(FakeConn(payments=[{'id':'paid'}]),m)
    assert exc.value.status_code==409
    with pytest.raises(HTTPException):check(FakeConn(),'1999-01')


def test_generated_entries_are_exclusive_to_payroll_api():
    sync=(ROOT/'backend/app/services/sync.py').read_text(encoding='utf-8')
    assert 'rid.startswith("kpi-pay-")' in sync
    assert 'KPI_PAYROLL_MANAGED_ONLY' in sync
    assert "data['apply_to_payroll']=False" in API
    assert "data['status']='cancelled'" in API
