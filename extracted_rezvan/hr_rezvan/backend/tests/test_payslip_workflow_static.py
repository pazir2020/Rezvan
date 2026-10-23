"""Static regression checks for the legacy Rezvan payslip UI kept in the LAN build."""
from pathlib import Path

HTML = (Path(__file__).resolve().parents[2] / 'frontend' / 'dashboard-41.html').read_text(encoding='utf-8')


def test_original_payslip_engine_and_reports_preserved():
    assert 'window.slipOpen=function' in HTML
    assert 'window.slipOpenAll=function' in HTML
    assert 'window.slipListHTML=function' in HTML
    assert "TAB==='slip'?slipListHTML" in HTML
    assert "'emp'" in HTML and "'org'" in HTML
    assert 'فیش حقوقی' in HTML


def test_direct_payslip_shortcut_uses_existing_engine():
    assert 'id="rz-payslip-shortcut"' in HTML
    assert 'onclick="rzOpenPayslipCenter()"' in HTML
    assert "goPage('acct-ins'); aiSet('slip');" in HTML


def test_salary_permission_and_historical_snapshot_guard():
    assert "if(!can('view_salary')){ deny('view_salary'); return; }" in HTML
    assert "if(mk!==monthKey(0)) return {na:" in HTML
    assert "lock.snapshot.find(x=>x.employee_id===id)" in HTML
    assert "پیش‌نویس (حقوق این ماه قفل نشده است)" in HTML
