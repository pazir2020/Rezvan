"""Rezvan HR operations center: verified recruitment links, financial scenarios,
read-only payroll quality checks, actionable contract alerts and safe audit summaries.

Design constraints: no scenario changes salaries, no alert writes payroll, no new
candidate link creates an employee; existing HR flows remain authoritative.
"""
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from ..db import tx
from ..deps import authenticate
from ..services.sync import Actor
from ..core.policy import has_permission, in_unit_scope
from ..errors import forbidden, not_found, conflict
from .common import log_event

router = APIRouter(prefix='/api/hr-operations', tags=['HR operations'])


def requires(actor, *perms):
    for p in perms:
        if not has_permission(actor.principal, p):
            raise forbidden(details={'permission': p})


def scoped_employee(conn, emp_id, actor):
    row = conn.execute('SELECT id,full_name,unit_id FROM employees WHERE id=%s AND deleted_at IS NULL', (emp_id,)).fetchone()
    if not row:
        raise not_found()
    if not in_unit_scope(actor.principal, row['unit_id']):
        raise forbidden(details={'reason':'OUT_OF_UNIT_SCOPE'})
    return row


def row_dict(row):
    d = dict(row)
    # Don't send internal DB actor IDs as proof of real-world signatures.
    return d


# ---------------- financial decision support: strictly no payroll writes -------------
class FinancialScenario(BaseModel):
    employee_id: str = Field(min_length=1, max_length=120)
    component: Literal['base_salary', 'technical_allowance']
    current_toman: int = Field(ge=0, le=10**12)
    proposed_toman: int = Field(ge=0, le=10**12)
    effective_date: date
    months: int = Field(default=1, ge=1, le=12)
    baseline_reference: str = Field(min_length=5, max_length=500)
    justification: str = Field(min_length=10, max_length=1500)
    @model_validator(mode='after')
    def changed(self):
        if self.proposed_toman == self.current_toman:
            raise ValueError('مبلغ پیشنهادی باید با مبلغ فعلی متفاوت باشد')
        return self

class ScenarioDecision(BaseModel):
    decision: Literal['approved', 'rejected']
    expected_version: int = Field(ge=1)
    note: str = Field(min_length=8, max_length=1000)

class ScenarioRevert(BaseModel):
    expected_version: int = Field(ge=1)
    note: str = Field(min_length=8, max_length=1000)


def simulation(current, proposed, months):
    delta = proposed - current
    return {'current_toman': current, 'proposed_toman': proposed,
            'monthly_delta_toman': delta, 'period_delta_toman': delta * months,
            'months': months, 'not_a_net_payslip': True,
            'not_applied_to_payroll': True}

@router.post('/finance/preview')
def finance_preview(body: FinancialScenario, actor: Actor = Depends(authenticate)):
    requires(actor, 'view_salary')
    with tx() as conn:
        scoped_employee(conn, body.employee_id, actor)
    return simulation(body.current_toman, body.proposed_toman, body.months)

@router.get('/finance/scenarios')
def finance_list(actor: Actor = Depends(authenticate)):
    requires(actor, 'view_salary')
    with tx() as conn:
        rows = conn.execute('''SELECT s.*,e.full_name,e.unit_id FROM hr_financial_scenarios s
                JOIN employees e ON e.id=s.employee_id WHERE e.deleted_at IS NULL
                ORDER BY s.id DESC LIMIT 500''').fetchall()
    return {'items':[row_dict(r) for r in rows if in_unit_scope(actor.principal, r['unit_id'])]}

@router.post('/finance/scenarios', status_code=201)
def finance_create(body: FinancialScenario, actor: Actor = Depends(authenticate)):
    requires(actor, 'view_salary', 'write_records')
    with tx() as conn:
        scoped_employee(conn, body.employee_id, actor)
        row=conn.execute('''INSERT INTO hr_financial_scenarios
            (employee_id,component,current_toman,proposed_toman,effective_date,months,baseline_reference,justification,created_by)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *''',
            (body.employee_id,body.component,body.current_toman,body.proposed_toman,body.effective_date,
             body.months,body.baseline_reference,body.justification,actor.user_id)).fetchone()
        log_event(conn,'create','hr_financial_scenario','ثبت شبیه‌سازی تغییر هزینه حقوق (بدون اعمال)',actor=actor)
    return {'item':row_dict(row), 'simulation':simulation(body.current_toman,body.proposed_toman,body.months)}

@router.post('/finance/scenarios/{sid}/decision')
def finance_decide(sid:int, body:ScenarioDecision,actor:Actor=Depends(authenticate)):
    requires(actor,'view_salary','approve_payroll')
    with tx() as conn:
        s=conn.execute('SELECT * FROM hr_financial_scenarios WHERE id=%s FOR UPDATE',(sid,)).fetchone()
        if not s:raise not_found()
        scoped_employee(conn,s['employee_id'],actor)
        if s['created_by']==actor.user_id:raise forbidden(details={'reason':'SELF_APPROVAL_NOT_ALLOWED'})
        if s['status']!='pending' or s['version']!=body.expected_version:raise conflict()
        row=conn.execute('''UPDATE hr_financial_scenarios SET status=%s,decided_by=%s,decided_at=NOW(),
          decision_note=%s,version=version+1 WHERE id=%s RETURNING *''',
          (body.decision,actor.user_id,body.note,sid)).fetchone()
        log_event(conn,body.decision,'hr_financial_scenario',f'تصمیم درباره سناریوی هزینه #{sid} (بدون اعمال در فیش)',actor=actor)
    return {'item':row_dict(row),'notice':'این تأیید صرفاً تصویب سناریوی پیشنهادی است؛ هیچ مبلغی در فیش یا قرارداد تغییر نکرد.'}

@router.post('/finance/scenarios/{sid}/revert')
def finance_revert(sid:int,body:ScenarioRevert,actor:Actor=Depends(authenticate)):
    requires(actor,'view_salary','approve_payroll')
    with tx() as conn:
        s=conn.execute('SELECT * FROM hr_financial_scenarios WHERE id=%s FOR UPDATE',(sid,)).fetchone()
        if not s:raise not_found()
        scoped_employee(conn,s['employee_id'],actor)
        if s['status']!='approved' or s['version']!=body.expected_version:raise conflict()
        row=conn.execute('''UPDATE hr_financial_scenarios SET status='reverted',reverted_by=%s,
            reverted_at=NOW(),revert_note=%s,version=version+1 WHERE id=%s RETURNING *''',
            (actor.user_id,body.note,sid)).fetchone()
        log_event(conn,'revert','hr_financial_scenario',f'بازگشت تصویب سناریوی هزینه #{sid}',actor=actor)
    return {'item':row_dict(row),'notice':'تصویب سناریو بازگردانده شد. این سناریو هیچ مبلغی در حقوق را تغییر نداده بود.'}


# ---------------- applicant-to-employee controlled lineage ------------------------
class LinkCandidate(BaseModel):
    candidate_id: str = Field(min_length=1,max_length=120)
    employee_id: str = Field(min_length=1,max_length=120)
    note: str = Field(min_length=5,max_length=1000)

class AdvanceCase(BaseModel):
    stage: Literal['initial_contract','probation','confirmed','monthly_contracts','closed']
    expected_version: int = Field(ge=1)
    note: str = Field(min_length=8,max_length=1000)

STAGE_NEXT={'linked':'initial_contract','initial_contract':'probation','probation':'confirmed',
            'confirmed':'monthly_contracts','monthly_contracts':'closed'}

def candidate(conn,cid):
    row=conn.execute("SELECT id,data FROM records WHERE collection='candidates' AND id=%s AND deleted_at IS NULL",(cid,)).fetchone()
    if not row:raise not_found()
    return row

@router.get('/hiring/candidates')
def hiring_candidates(actor:Actor=Depends(authenticate)):
    requires(actor,'view_recruitment')
    with tx() as conn:
        rows=conn.execute("SELECT id,data FROM records WHERE collection='candidates' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 600").fetchall()
    return {'items':[{'id':r['id'],'name':r['data'].get('name'),'position':r['data'].get('position'),'stage':r['data'].get('stage')} for r in rows]}

@router.get('/hiring/cases')
def hiring_cases(actor:Actor=Depends(authenticate)):
    requires(actor,'view_recruitment','view_personnel')
    with tx() as conn:
        rows=conn.execute('''SELECT h.*,e.full_name,e.unit_id FROM hr_hiring_cases h
           JOIN employees e ON e.id=h.employee_id WHERE e.deleted_at IS NULL
           ORDER BY h.id DESC LIMIT 500''').fetchall()
    return {'items':[row_dict(r) for r in rows if in_unit_scope(actor.principal,r['unit_id'])]}

@router.post('/hiring/cases',status_code=201)
def hiring_link(body:LinkCandidate,actor:Actor=Depends(authenticate)):
    requires(actor,'view_recruitment','write_recruitment','write_personnel')
    with tx() as conn:
        candidate(conn,body.candidate_id)
        emp=scoped_employee(conn,body.employee_id,actor)
        if conn.execute('SELECT id FROM hr_hiring_cases WHERE candidate_id=%s OR employee_id=%s',
                        (body.candidate_id,body.employee_id)).fetchone():raise conflict(details={'reason':'ALREADY_LINKED'})
        row=conn.execute('''INSERT INTO hr_hiring_cases(candidate_id,employee_id,stage,note,created_by)
          VALUES(%s,%s,'linked',%s,%s) RETURNING *''',
          (body.candidate_id,body.employee_id,body.note,actor.user_id)).fetchone()
        log_event(conn,'link','hr_hiring_case',f'اتصال داوطلب به پرونده استخدامی #{row["id"]}',actor=actor)
    return {'item':row_dict(row),'notice':'هیچ پرونده کارمند یا قرارداد جدیدی به‌صورت خودکار ایجاد نشده است.'}


def signed_contract(conn,employee_id,after=None):
    rows=conn.execute('''SELECT id,data FROM records WHERE collection='contracts'
       AND employee_id=%s AND deleted_at IS NULL''',(employee_id,)).fetchall()
    for r in rows:
        d=r['data'];start=str(d.get('start_date') or '');end=str(d.get('end_date') or '')
        if start and end and start<=end and d.get('signed') in (True,'true','yes',1):
            if after is None or start>=str(after):return True
    return False

@router.post('/hiring/cases/{cid}/advance')
def hiring_advance(cid:int,body:AdvanceCase,actor:Actor=Depends(authenticate)):
    requires(actor,'view_recruitment','write_recruitment','approve_records')
    with tx() as conn:
        case=conn.execute('SELECT * FROM hr_hiring_cases WHERE id=%s FOR UPDATE',(cid,)).fetchone()
        if not case:raise not_found()
        scoped_employee(conn,case['employee_id'],actor)
        if case['version']!=body.expected_version:raise conflict()
        if body.stage!=STAGE_NEXT.get(case['stage']):raise HTTPException(409,'تغییر مرحله باید به ترتیب گردش استخدام انجام شود')
        if body.stage in ('initial_contract','monthly_contracts') and not signed_contract(conn,case['employee_id']):
            raise HTTPException(409,'برای عبور از این مرحله قرارداد مدت‌دار دارای تاریخ معتبر و امضا باید در پرونده ثبت شده باشد')
        if body.stage=='monthly_contracts':
            rows=conn.execute("SELECT data FROM records WHERE collection='contracts' AND employee_id=%s AND deleted_at IS NULL",(case['employee_id'],)).fetchall()
            signed_starts={str(r['data'].get('start_date')) for r in rows if r['data'].get('signed') in (True,'true','yes',1) and r['data'].get('start_date') and r['data'].get('end_date')}
            if len(signed_starts)<2:
                raise HTTPException(409,'برای ورود به مرحله قراردادهای ماهانه، علاوه بر قرارداد اولیه حداقل یک قرارداد مستقل با تاریخ شروع متفاوت ثبت و امضا شود')
        if body.stage=='confirmed':
            p=conn.execute('''SELECT outcome,status FROM hr_probation_reviews WHERE employee_id=%s
                         ORDER BY id DESC LIMIT 1''',(case['employee_id'],)).fetchone()
            if not p or p['status']!='approved' or p['outcome']!='continue':
                raise HTTPException(409,'تأیید ارزیابی پایان دوره آزمایشی برای تثبیت وضعیت داخلی لازم است')
        row=conn.execute('''UPDATE hr_hiring_cases SET stage=%s,note=%s,updated_by=%s,
          updated_at=NOW(),version=version+1 WHERE id=%s RETURNING *''',
          (body.stage,body.note,actor.user_id,cid)).fetchone()
        log_event(conn,'advance','hr_hiring_case',f'تغییر مرحله پرونده جذب #{cid}: {body.stage}',actor=actor)
    return {'item':row_dict(row),'notice':'فقط مرحله پیگیری به‌روزرسانی شد؛ قرارداد، وضعیت قانونی و حقوق خودکار تغییر نکرد.'}


# ---------------- read-only payroll preclose checks ------------------------------
class MonthKey(BaseModel):
    month: str = Field(pattern=r'^14[0-9]{2}-(0[1-9]|1[0-2])$')

@router.get('/payroll/checks')
def payroll_checks(month:str,actor:Actor=Depends(authenticate)):
    requires(actor,'view_salary')
    if not re.fullmatch(r'14[0-9]{2}-(0[1-9]|1[0-2])', month):
        raise HTTPException(422,'ماه شمسی نامعتبر است؛ قالب درست: ۱۴۰۵-۰۷')
    issues=[]
    with tx() as conn:
        employees=conn.execute('''SELECT e.id,e.full_name,e.unit_id,e.exit_date,s.salary
            FROM employees e LEFT JOIN employee_sensitive s ON s.employee_id=e.id
            WHERE e.deleted_at IS NULL ORDER BY e.full_name''').fetchall()
        eligible={r['id']:r for r in employees if in_unit_scope(actor.principal,r['unit_id'])}
        for r in eligible.values():
            if r['exit_date'] is None and (r['salary'] is None or r['salary']<=0):
                issues.append({'level':'warning','code':'MISSING_BASE_AMOUNT','employee_id':r['id'],
                   'employee':r['full_name'],'message':'حقوق پایه در پرونده مالی ثبت یا تأیید نشده است؛ ممکن است از سابقه شرایط حقوقی جداگانه استفاده شود.'})
        payments=conn.execute("SELECT id,employee_id,data FROM records WHERE collection='payrollPayments' AND deleted_at IS NULL AND data->>'month'=%s",(month,)).fetchall()
        per_emp={}
        for p in payments:
            if p['employee_id'] not in eligible:continue
            per_emp.setdefault(p['employee_id'],[]).append(p)
        for eid,rows in per_emp.items():
            if len(rows)>1:
                issues.append({'level':'review','code':'MULTIPLE_PAYMENTS','employee_id':eid,'employee':eligible[eid]['full_name'],
                    'message':f'{len(rows)} پرداخت برای این ماه ثبت شده است؛ ممکن است اقساط پرداخت باشند و نیازمند تطبیق هستند.'})
        adjustments=conn.execute('''SELECT id,employee_id,data FROM records WHERE collection='payrollAdjustments'
              AND deleted_at IS NULL AND data->>'payroll_month'=%s''',(month,)).fetchall()
        active=[]
        for r in adjustments:
            if r['employee_id'] not in eligible:continue
            d=r['data']
            if d.get('apply_to_payroll') in (True,'true','True') and d.get('status')!='cancelled':
                active.append(r)
                try:
                    if Decimal(str(d.get('amount'))) < 0:
                        raise ValueError()
                except Exception:
                    issues.append({'level':'critical','code':'INVALID_ADJUSTMENT','employee_id':r['employee_id'],
                        'employee':eligible[r['employee_id']]['full_name'],'message':'مبلغ یک قلم مؤثر بر فیش معتبر نیست.'})
        per_kpi={}
        for r in active:
            if r['data'].get('type')=='kpi_team':per_kpi.setdefault(r['employee_id'],[]).append(r)
        for eid,rows in per_kpi.items():
            if len(rows)>1:
                issues.append({'level':'critical','code':'KPI_MULTIPLE_ITEMS','employee_id':eid,'employee':eligible[eid]['full_name'],
                               'message':'بیش از یک قلم کارانه تیمی فعال در همین ماه وجود دارد؛ قبل از پرداخت بررسی شود.'})
        transfers=conn.execute("SELECT * FROM hr_kpi_payroll_transfers WHERE month=%s AND status='applied'",(month,)).fetchall()
        adj_by_id={r['id']:r for r in active}
        for t in transfers:
            for entry in t['snapshot']:
                emp=entry['employee_id']
                if emp not in eligible:continue
                item=adj_by_id.get(entry['record_id'])
                if not item or str(item['data'].get('amount'))!=str(entry['amount_toman']):
                    issues.append({'level':'critical','code':'KPI_TRANSFER_MISMATCH','employee_id':emp,'employee':eligible[emp]['full_name'],
                        'message':'مبلغ کارانه فیش با رکورد تأییدشده انتقال KPI مطابقت ندارد.'})
        locks=conn.execute("SELECT data FROM records WHERE collection='payrollLocks' AND deleted_at IS NULL AND data->>'month'=%s",(month,)).fetchall()
        # Avoid treating missing Excel/monthly records as numeric zero or as proof of compliance.
        source_present=bool(locks)
    return {'month':month,'checked_employee_count':len(eligible),'observed_payments':len([x for x in payments if x['employee_id'] in eligible]),
        'observed_active_adjustments':len(active),'issues':issues,
        'source_month_present':source_present,
        'checks_performed':['حقوق پایه پرونده','تعدد رکورد پرداخت','اعتبار مبلغ اصلاحیه','ثبت کارانه تکراری','تطبیق انتقال کارانه'],
        'not_verified':['صحت فرمول بیمه','صحت لیست مالیات','واریز بانکی','انطباق کامل فایل اکسل','خالص پرداختی واقعی'],
        'notice':'نتیجه، کنترل مقدماتی داده‌های سرور است؛ نه گواه صحت لیست بیمه، مالیات یا پرداخت بانکی.'}


# ---------------- source-linked accountable alerts and actions ---------------------
class AlertAction(BaseModel):
    source_type: Literal['contract_end','probation_pending','allowance_pending']
    source_id: str = Field(min_length=1,max_length=120)
    owner: str = Field(min_length=1,max_length=120)
    due_date: date
    notes: str = Field(default='',max_length=1000)


def alert_sources(conn, actor):
    requires(actor,'view_personnel')
    result=[]
    today=date.today(); cutoff=today+timedelta(days=35)
    rows=conn.execute('''SELECT r.id,r.employee_id,r.data,e.unit_id,e.full_name
        FROM records r JOIN employees e ON e.id=r.employee_id
        WHERE r.collection='contracts' AND r.deleted_at IS NULL AND e.deleted_at IS NULL''').fetchall()
    for r in rows:
        if not in_unit_scope(actor.principal,r['unit_id']):continue
        raw=r['data'].get('end_date')
        try:due=date.fromisoformat(str(raw))
        except (TypeError,ValueError):continue
        if today-timedelta(days=90)<=due<=cutoff:
            result.append({'source_type':'contract_end','source_id':r['id'],'employee_id':r['employee_id'],
               'title':'پیگیری پایان قرارداد مدت‌دار','subject':r['full_name'], 'due_date':str(due),
               'priority':'high' if due<=today+timedelta(days=7) else 'normal'})
    rows=conn.execute('''SELECT p.id,p.employee_id,e.full_name,e.unit_id FROM hr_probation_reviews p
             JOIN employees e ON e.id=p.employee_id WHERE p.status='pending' AND e.deleted_at IS NULL''').fetchall()
    for r in rows:
        if in_unit_scope(actor.principal,r['unit_id']):
            result.append({'source_type':'probation_pending','source_id':str(r['id']),'employee_id':r['employee_id'],
                 'title':'بررسی نتیجه دوره آزمایشی','subject':r['full_name'],'due_date':None,'priority':'normal'})
    if has_permission(actor.principal,'view_salary'):
        rows=conn.execute('''SELECT p.id,p.employee_id,e.full_name,e.unit_id FROM hr_technical_allowance_proposals p
          JOIN employees e ON e.id=p.employee_id WHERE p.status='pending' AND e.deleted_at IS NULL''').fetchall()
        for r in rows:
            if in_unit_scope(actor.principal,r['unit_id']):
                result.append({'source_type':'allowance_pending','source_id':str(r['id']),
                   'employee_id':r['employee_id'],'title':'بررسی پیشنهاد محرمانه حق فنی',
                   'subject':r['full_name'],'due_date':None,'priority':'normal'})
    return result

@router.get('/alerts')
def list_alerts(actor:Actor=Depends(authenticate)):
    with tx() as conn:
        items=alert_sources(conn,actor)
        linked=conn.execute('''SELECT l.source_type,l.source_id,l.action_id,a.owner,a.due_date,a.status
             FROM hr_alert_action_links l JOIN hr_followup_actions a ON a.id=l.action_id''').fetchall()
        mapping={(r['source_type'],r['source_id']):dict(r) for r in linked}
        for item in items:item['action']=mapping.get((item['source_type'],item['source_id']))
    return {'items':items}

@router.post('/alerts/action',status_code=201)
def assign_alert(body:AlertAction,actor:Actor=Depends(authenticate)):
    requires(actor,'view_personnel','write_records')
    with tx() as conn:
        item=next((x for x in alert_sources(conn,actor) if x['source_type']==body.source_type and x['source_id']==body.source_id),None)
        if not item:raise not_found()
        if conn.execute('SELECT action_id FROM hr_alert_action_links WHERE source_type=%s AND source_id=%s',
                        (body.source_type,body.source_id)).fetchone():raise conflict(details={'reason':'ALREADY_ASSIGNED'})
        kind='contract' if body.source_type=='contract_end' else 'performance' if body.source_type=='probation_pending' else 'other'
        action=conn.execute('''INSERT INTO hr_followup_actions(employee_id,category,title,description,owner,due_date,status,result,created_by,updated_by)
             VALUES(%s,%s,%s,%s,%s,%s,'open','',%s,%s) RETURNING *''',
             (item['employee_id'],kind,item['title'],body.notes,body.owner,body.due_date,actor.user_id,actor.user_id)).fetchone()
        conn.execute('INSERT INTO hr_alert_action_links(source_type,source_id,action_id) VALUES(%s,%s,%s)',
                     (body.source_type,body.source_id,action['id']))
        log_event(conn,'assign','hr_alert','ارجاع هشدار به مسئول پیگیری',actor=actor)
    return {'item':dict(action),'notice':'اقدام به مرکز پیگیری موجود اضافه شد و تا ثبت نتیجه قابل دنبال کردن است.'}


# ---------------- audit centre: metadata only, no sensitive snapshots ------------
@router.get('/audit/recent')
def recent_audit(limit:int=100,actor:Actor=Depends(authenticate)):
    requires(actor,'view_audit')
    limit=max(1,min(limit,200))
    with tx() as conn:
        rows=conn.execute('''SELECT id,at,username,user_name,role,action,module,result
            FROM audit_log ORDER BY id DESC LIMIT %s''',(limit,)).fetchall()
    return {'items':[dict(r) for r in rows],
            'notice':'برای حفظ محرمانگی، محتوای قبل/بعد سوابق حقوقی و داده‌های حساس از این نمای عمومی حذف شده است.'}
