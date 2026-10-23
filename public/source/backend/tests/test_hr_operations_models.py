"""Dependency-free validation tests for HR operations until LAN PostgreSQL integration."""
import ast
from datetime import date
from pathlib import Path
import pytest
from pydantic import BaseModel, Field, ValidationError, model_validator
from typing import Literal

SOURCE=Path(__file__).resolve().parents[1]/'app'/'routers'/'hr_operations_api.py'
node=ast.parse(SOURCE.read_text(encoding='utf-8'))
KEEP={'FinancialScenario','ScenarioDecision','ScenarioRevert','LinkCandidate','AdvanceCase',
      'AlertAction','MonthKey','simulation','signed_contract'}
body=[n for n in node.body if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name in KEEP]
ns={'BaseModel':BaseModel,'Field':Field,'Literal':Literal,'date':date,'model_validator':model_validator}
exec(compile(ast.Module(body=body,type_ignores=[]),'<hr operations business rules>','exec'),ns)
Scenario=ns['FinancialScenario'];simulation=ns['simulation']
BASE=dict(employee_id='e1',component='base_salary',current_toman=15000000,
          proposed_toman=17000000,effective_date='2026-11-01',months=3,
          baseline_reference='قرارداد و فیش ماه جاری',justification='موافقت مدیر با تغییر حقوق پیشنهادی')

def test_financial_preview_positive_and_without_payroll_write():
    s=Scenario(**BASE)
    r=simulation(s.current_toman,s.proposed_toman,s.months)
    assert r['monthly_delta_toman']==2_000_000
    assert r['period_delta_toman']==6_000_000
    assert r['not_applied_to_payroll']

def test_financial_preview_negative():
    assert simulation(200,100,12)['period_delta_toman']==-1200

def test_equal_amount_not_accepted():
    with pytest.raises(ValidationError): Scenario(**{**BASE,'proposed_toman':BASE['current_toman']})

def test_bad_month_count_and_amount_rejected():
    with pytest.raises(ValidationError):Scenario(**{**BASE,'months':13})
    with pytest.raises(ValidationError):Scenario(**{**BASE,'current_toman':-1})

def test_decision_expected_version_and_long_note():
    valid=ns['ScenarioDecision'](decision='approved',expected_version=2,note='تأیید برای بررسی نه تغییر فیش')
    assert valid.expected_version==2
    with pytest.raises(ValidationError):ns['ScenarioDecision'](decision='approved',expected_version=0,note='تأیید برای بررسی نه تغییر فیش')

def test_no_unsupported_financial_component():
    with pytest.raises(ValidationError): Scenario(**{**BASE,'component':'bank_account'})

def test_link_requires_actual_references():
    m=ns['LinkCandidate'](candidate_id='cand-12',employee_id='emp-10',note='انجام بررسی اولیه')
    assert m.employee_id=='emp-10'
    with pytest.raises(ValidationError):ns['LinkCandidate'](candidate_id='',employee_id='e',note='...')

def test_advance_rejects_arbitrary_stage():
    with pytest.raises(ValidationError):ns['AdvanceCase'](stage='permanent_labor_contract',expected_version=1,note='پیشنهاد بدون مرحله رسمی')

def test_alert_action_restricted_source():
    with pytest.raises(ValidationError):ns['AlertAction'](source_type='employee_salary',source_id='1',owner='HR',due_date=date.today())

def test_month_key_validated():
    ns['MonthKey'](month='1405-07')
    with pytest.raises(ValidationError):ns['MonthKey'](month='1405-13')

def test_contract_gate_requires_valid_dates_and_signed():
    class Conn:
        def execute(self,query,params):
            return self
        def fetchall(self):
            return [{'data':{'start_date':'2026-08-01','end_date':'2026-08-31','signed':True}},
                    {'data':{'start_date':'2026-09-01','end_date':'2026-09-30','signed':False}}]
    assert ns['signed_contract'](Conn(),'e1')
    assert not ns['signed_contract'](Conn(),'e1',after='2026-09-01')
