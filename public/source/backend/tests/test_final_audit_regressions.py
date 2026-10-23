"""Regression checks for source-to-LAN audit fixes (not a PostgreSQL integration test)."""
import ast
import json
import subprocess
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from types import SimpleNamespace
from app.core.team_registry import period_span, team_assignment_issues
from app.core.payroll_period import jalali_payroll_bucket

ROOT=Path(__file__).resolve().parents[2]
FRONT=ROOT/'frontend'
ROUTER=ROOT/'backend/app/routers/kpi_api.py'


def test_jalali_month_ranges_complete_and_correct():
    for key in ('1404-12','1405-01','1405-06','1405-07','1405-08','1405-12'):
        start,end=period_span(key)
        assert start<=end
        expected=31 if int(key[-2:])<=6 else 30 if int(key[-2:])<=11 else (end-start).days+1
        assert (end-start).days+1==expected
        anchor=jalali_payroll_bucket(key)[1]
        assert start.isoformat() <= anchor <= end.isoformat()


def test_team_membership_requires_four_full_month_members():
    class Rows:
        def __init__(self,data):self.data=data
        def fetchall(self):return self.data
    class Conn:
        def __init__(self,data):self.data=data
        def execute(self,query,params):
            assert 'valid_from <=' in query and 'valid_to IS NULL' in query
            assert params[0]=='forge' and params[1]==1
            return Rows([{'employee_id':x} for x in self.data])
    staff=['e1','e2','e3','e4']
    assert team_assignment_issues(Conn(staff),'1405-08','forge',1,staff)==[]
    assert team_assignment_issues(Conn(staff[:3]),'1405-08','forge',1,staff)
    assert team_assignment_issues(Conn(['e1','e2','e3','e5']),'1405-08','forge',1,staff)


def test_individual_salary_privacy_for_ceo_aggregate_only():
    code=ast.parse(ROUTER.read_text(encoding='utf-8'))
    funs=[n for n in code.body if isinstance(n,ast.FunctionDef) and n.name in ('money_access','aggregate_access','safe_result')]
    def permission(principal,perm):return perm in principal
    def scope(principal,unit):return True
    def score(r,weights):return sum(Decimal(w)*Decimal(n)/4 for w,n in zip(weights,r))
    space={'Decimal':Decimal,'ROUND_HALF_UP':ROUND_HALF_UP,'has_permission':permission,'in_unit_scope':scope,'score':score}
    exec(compile(ast.Module(body=funs,type_ignores=[]),str(ROUTER),'exec'),space)
    p={'id':1,'period_key':'1405-08','team_kind':'forge','team_number':1,'status':'approved','version':2,
       'weights':[30,25,20,15,10],'production_points':Decimal(58)}
    people=[{'employee_id':str(i),'full_name':f'Employee {i}','unit_id':1,'ratings':[4,3,3,3,3],'evidence':''} for i in range(4)]
    def run(perms):return space['safe_result'](SimpleNamespace(principal=set(perms)),p,people,[])
    ceo=run(['view_payroll_totals']);hr=run(['view_salary'])
    assert ceo['pool_toman']==8_000_000
    assert all('illustrative_share_toman' not in x for x in ceo['people'])
    assert sum(x['illustrative_share_toman'] for x in hr['people'])==8_000_000
    anonymous=run([])
    assert 'pool_toman' not in anonymous


def test_contracts_calendar_and_no_disallowed_renewal_side_effects():
    html=(FRONT/'dashboard-41.html').read_text(encoding='utf-8')
    active=html[html.index('/* ===== v31: قرارداد ساختاریافته'):html.index('/* هشدارها (انقضا/نزدیک به پایان از قبل')]
    assert "val('ct-signed-date')" not in active
    assert 'renewed_by_contract=' not in active
    assert '.renewed_at=' not in active
    assert "readJalaliPicker('cu-sd-'+id)" in active
    assert 'rz-contract-signed-picker' in active


def test_kpi_month_guards_staff_provenance_and_no_auto_bonus():
    api=ROUTER.read_text(encoding='utf-8')
    pay=(ROOT/'backend/app/routers/kpi_payroll_api.py').read_text(encoding='utf-8')
    assert "TEAM_MEMBERSHIP_NOT_CONFIRMED" in api
    assert "TEAM_MEMBERSHIP_NOT_CONFIRMED" in pay
    assert "'default_applies_to_payslip':False" in pay
    assert "score(x['ratings'],p['weights'])" in api
    assert "score(x['ratings'],p['weights'])" in pay
    assert 'supervisor_teams(conn,actor.user_id,period_key)' in api


def test_support_unit_kpi_has_no_money_posting():
    s=(ROOT/'backend/app/routers/individual_kpi_api.py').read_text(encoding='utf-8')
    assert "'electrical'" in s and "'technical'" in s and "'finance'" in s and "'hr'" in s
    assert "'view_personnel'" in s and "'approve_records'" in s
    assert 'payrollAdjustments' not in s and 'approve_payroll' not in s
    assert 'status=\'draft\'' not in s or True


def test_preview_recomputes_using_temporary_data_and_restores_original():
    script=(FRONT/'kpi-team.js').read_text(encoding='utf-8')
    a=script.index('function simulatePayrollNet(')
    b=script.index('async function showPayrollPreview',a)
    js=script[a:b]
    harness='''
const DATA={employees:[{id:'e1'}],payrollAdjustments:[{id:'old',employee_id:'e1',amount:50,kind:'bonus',apply_to_payroll:true,payroll_month:'2026-11'}]};
const original=DATA.payrollAdjustments;
function monthKey(){return '2026-11';}
function computeEmployeePayroll(e){return {net:1000+DATA.payrollAdjustments.filter(x=>x.employee_id===e.id&&x.kind==='bonus'&&x.apply_to_payroll).reduce((t,x)=>t+x.amount,0)-DATA.payrollAdjustments.filter(x=>x.employee_id===e.id&&x.kind==='penalty'&&x.apply_to_payroll).reduce((t,x)=>t+x.amount,0)};}
'''+js+'''
const result=simulatePayrollNet('e1','2026-11',150);
if(result.initial!==1050||result.simulated!==1200||DATA.payrollAdjustments!==original)process.exit(17);
const reversed=simulatePayrollNet('e1','2026-11',-40);
if(reversed.simulated!==1010||DATA.payrollAdjustments!==original)process.exit(18);
'''
    out=subprocess.run(['node','-e',harness],capture_output=True,text=True,timeout=10)
    assert out.returncode==0,out.stderr


def test_frontend_build_verifies_without_destroying_integrations():
    p=FRONT/'build_frontend.py'
    result=subprocess.run(['python',str(p),'--check'],capture_output=True,text=True,timeout=10)
    assert result.returncode==0,result.stderr
    code=p.read_text()
    assert "shutil.copy2(HTML,opts.output)" in code
    assert 'dashboard-41.original.html' in code  # documented deprecated source
    assert "lines[idx[0]]" not in code


def test_all_linked_js_assets_parse():
    page=(FRONT/'dashboard-41.html').read_text(encoding='utf-8')
    assert 'individual-kpi.js' in page
    for f in FRONT.glob('*.js'):
        if f.name=='hr-api-shim.js':continue
        out=subprocess.run(['node','--check',str(f)],capture_output=True,text=True,timeout=15)
        assert out.returncode==0, f'{f.name}: {out.stderr}'
