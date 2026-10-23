"""Pure behavior and integration-contract regressions for optional HR controls."""
from datetime import date
from pathlib import Path
import subprocess
from app.core.hr_completion_rules import (
    PAYROLL_CHECKS,valid_jalali_month,evidence_quality,contract_month_status,repeated_membership,
)
from app.core.team_registry import period_span

ROOT=Path(__file__).resolve().parents[2]


def test_complete_evidence_requires_all_checks_and_source_references():
    yes={k:True for k in PAYROLL_CHECKS}
    refs={k:'signed ref 45' for k in PAYROLL_CHECKS}
    assert evidence_quality(yes,refs)==(True,[])
    for key in PAYROLL_CHECKS:
        partial={**yes,key:False}
        assert key in evidence_quality(partial,refs)[1]
        badref={**refs,key:' '}
        assert key in evidence_quality(yes,badref)[1]
    assert evidence_quality({},refs)[0] is False


def test_month_validation_rejects_wrong_year_and_format():
    assert valid_jalali_month('1405-08')=='1405-08'
    for x in ['2026-11','1405-13','1405-00','1399-09','bad',None]:
        try:valid_jalali_month(x)
        except ValueError:pass
        else:assert False,repr(x)


def test_independent_monthly_contract_does_not_count_span_or_unsigned():
    start,end=period_span('1405-08')
    before=start.replace(day=max(1,start.day-1))
    after=end.replace(day=min(28,end.day))
    full={'start_date':str(start),'end_date':str(end),'signed':True}
    assert contract_month_status([full],start,end)=='signed'
    assert contract_month_status([{**full,'signed':False}],start,end)=='draft'
    assert contract_month_status([],start,end)=='missing'
    # A yearly contract should not be misread as the separately signed Aban document.
    assert contract_month_status([{'start_date':'2026-03-21','end_date':'2027-03-20','signed':True}],start,end)=='cross_month_review'
    assert contract_month_status([{'start_date':'not-a-date','end_date':'2026-11-22','signed':True}],start,end)=='missing'


def test_partial_month_roster_needs_independent_review():
    a,b=period_span('1405-08')
    initial={'team_kind':'forge','team_number':1,'valid_from':a,'valid_to':b}
    assert repeated_membership([initial],a,b) is False
    shifted={**initial,'team_number':2,'valid_from':a.replace(day=min(a.day+1,28))}
    assert repeated_membership([initial,shifted],a,b) is True
    assert repeated_membership([shifted],a,b) is True
    assert repeated_membership([],a,b) is False


def test_new_frontend_is_bundled_and_server_routes_precede_generic_sync():
    html=(ROOT/'frontend/dashboard-41.html').read_text(encoding='utf-8')
    main=(ROOT/'backend/app/main.py').read_text(encoding='utf-8')
    cli=(ROOT/'backend/app/cli.py').read_text(encoding='utf-8')
    assert 'hr-completion.js' in html and 'hr-completion.css' in html
    assert main.index('hr_completion_api.router') < main.index('sync_api.router')
    assert "'upgrade-hr-completion.sql'" in cli
    assert 'hr_payroll_review_packets' in (ROOT/'db/upgrade-hr-completion.sql').read_text()


def test_completion_has_no_direct_payroll_base_mutations_and_explicit_guards():
    code=(ROOT/'backend/app/routers/hr_completion_api.py').read_text(encoding='utf-8')
    assert 'SELF_APPROVAL_NOT_ALLOWED' in code
    assert 'fingerprint(conn,body.month)' in code
    assert 'payroll_month' not in code or 'payroll_month' in code
    assert 'UPDATE employee_sensitive' not in code
    assert "UPDATE records SET" not in code
    assert "INSERT INTO hr_payslip_issue_register" in code
    assert 'no fake' not in code  # no placeholder messaging required


def test_build_frontend_and_javascript_syntax():
    front=ROOT/'frontend'
    for f in ['hr-completion.js','hr-operations.js','kpi-team.js']:
        r=subprocess.run(['node','--check',str(front/f)],capture_output=True,text=True,timeout=10)
        assert r.returncode==0,r.stderr
    r=subprocess.run(['python',str(front/'build_frontend.py'),'--check'],capture_output=True,text=True,timeout=10)
    assert r.returncode==0,r.stderr
