"""Reversible KPI bonus-to-payslip transfer.

Preview is READ ONLY. Approval creates an isolated bonus adjustment for each
member, without touching salaries or other adjustments. Reversal cancels only
these generated adjustments. Uses exact KPI version and row locking.
"""
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from psycopg.types.json import Jsonb
from ..deps import authenticate
from ..db import tx
from ..services.sync import Actor
from ..core.policy import has_permission, in_unit_scope
from ..errors import forbidden, not_found
from .common import log_event
from .kpi_api import snapshot, score
from ..core.team_registry import team_assignment_issues
from ..core.payroll_period import jalali_payroll_bucket

router = APIRouter(prefix='/api/kpi/payroll', tags=['KPI payroll approval'])

class Approval(BaseModel):
    kpi_version: int = Field(ge=1)
    note: str = Field(min_length=8, max_length=1000)
    payroll_month: str = Field(pattern=r"^20[0-9]{2}-(0[1-9]|1[0-2])$")

class Revert(BaseModel):
    note: str = Field(min_length=8, max_length=1000)

def permission(actor, write=False):
    for perm in (('view_salary', 'approve_payroll') if write else ('view_salary',)):
        if not has_permission(actor.principal, perm):
            raise forbidden(details={'permission': perm})

def context(conn, period_id, actor, lock=False):
    p, people = snapshot(conn, period_id)
    if p['status'] != 'approved' or len(people) != 4:
        raise HTTPException(409, 'برای انتقال به حقوق، ارزیابی چهار نفر باید ابتدا تأیید شده باشد')
    if any(not in_unit_scope(actor.principal, x['unit_id']) for x in people):
        raise forbidden(details={'reason': 'OUT_OF_UNIT_SCOPE'})
    # Never post when source points are unknown, scores are all zero, or production allocation is unresolved.
    if p['production_points'] is None:
        raise HTTPException(409, 'امتیاز تولید واحد هنوز مشخص نشده است')
    issues=team_assignment_issues(conn,p['period_key'],p['team_kind'],p['team_number'],[x['employee_id'] for x in people])
    if issues:raise HTTPException(409,{'reason':'TEAM_MEMBERSHIP_NOT_CONFIRMED','issues':issues})
    scores = [score(x['ratings'],p['weights']) for x in people]
    if sum(scores) <= 0:
        raise HTTPException(409, 'مجموع امتیازات ارزیابی صفر است')
    pool = int((max(Decimal(0), p['production_points'] - Decimal(50)) * Decimal(1000000)).quantize(Decimal('1')))
    if pool <= 0:
        raise HTTPException(409, 'برای امتیاز ۵۰ یا کمتر، کارانه قابل انتقال وجود ندارد')
    raw = [Decimal(pool) * (Decimal('0.60') / Decimal(4) + Decimal('0.40') * s / sum(scores)) for s in scores]
    shares = [int(v.quantize(Decimal('1'), rounding=ROUND_HALF_UP)) for v in raw]
    shares[-1] += pool - sum(shares)
    return p, people, shares, pool

def assure_unlocked(conn, month):
    """Fail closed on a payroll month that can no longer be changed safely.

    The original payslip calculator only recomputes the current Gregorian
    bucket. Earlier months rely on locked snapshots; never silently amend one.
    """
    current = datetime.now(timezone(timedelta(hours=3, minutes=30))).strftime('%Y-%m')
    if month != current:
        raise HTTPException(409, 'این ماه، ماه جاری موتور فیش نیست؛ ثبت کارانه فقط پس از تطبیق و بازگشایی رسمی دوره مجاز است')
    locks = conn.execute("""SELECT id,data FROM records WHERE collection='payrollLocks'
        AND deleted_at IS NULL AND data->>'month'=%s FOR UPDATE""", (month,)).fetchall()
    if any(x['data'].get('status') not in ('open', 'hr_reviewed') for x in locks):
        raise HTTPException(409, 'حقوق این ماه قفل یا واردشده از اکسل است؛ تغییر مستقیم کارانه مجاز نیست')
    payments = conn.execute("""SELECT id FROM records WHERE collection='payrollPayments'
        AND deleted_at IS NULL AND data->>'month'=%s LIMIT 1""", (month,)).fetchone()
    if payments:
        raise HTTPException(409, 'برای این ماه پرداخت ثبت شده است؛ تأیید یا بازگشت کارانه مستقیم مسدود است')


def transfer_row(conn, pid, for_update=False):
    suffix = ' FOR UPDATE' if for_update else ''
    return conn.execute('SELECT * FROM hr_kpi_payroll_transfers WHERE period_id=%s'+suffix, (pid,)).fetchone()

def preview_data(conn, pid, actor):
    p, people, shares, pool = context(conn, pid, actor)
    payroll_month, anchor = jalali_payroll_bucket(p['period_key'])
    existing = transfer_row(conn, pid)
    status = existing['status'] if existing else 'not_applied'
    results = []
    # A KPI transfer never modifies unrelated payroll adjustments.
    for emp, proposed in zip(people, shares):
        others = conn.execute("""SELECT data FROM records WHERE collection='payrollAdjustments'
            AND employee_id=%s AND deleted_at IS NULL AND data->>'payroll_month'=%s
            AND COALESCE(data->>'apply_to_payroll','false')='true'
            AND COALESCE(data->>'status','')<>'cancelled' AND id<>%s""",
            (emp['employee_id'], payroll_month, f'kpi-pay-{pid}-{emp["employee_id"]}')).fetchall()
        other_bonus = sum(int(Decimal(str(x['data'].get('amount') or 0))) for x in others if x['data'].get('kind') == 'bonus')
        other_penalty = sum(int(Decimal(str(x['data'].get('amount') or 0))) for x in others if x['data'].get('kind') == 'penalty')
        current = 0
        if status == 'applied':
            matches = [r for r in existing['snapshot'] if r['employee_id'] == emp['employee_id']]
            if len(matches) != 1:
                raise HTTPException(409, 'اطلاعات انتقال قبلی نیازمند بررسی است')
            current = matches[0]['amount_toman']
        results.append({'employee_id':emp['employee_id'], 'full_name':emp['full_name'],
                        'kpi_score':float(score(emp['ratings'],p['weights'])),
                        'previous_kpi_toman':current,
                        'proposed_kpi_toman':proposed,
                        'delta_if_apply_toman':proposed-current,
                        'delta_if_revert_toman':-current,
                        'other_bonus_toman':other_bonus,
                        'other_penalty_toman':other_penalty})
    current_month = datetime.now(timezone(timedelta(hours=3, minutes=30))).strftime('%Y-%m')
    warnings=[]
    if payroll_month != current_month:
        warnings.append('ماه KPI با ماه جاری موتور فیش یکسان نیست؛ امکان تأیید یا بازگشت مستقیم وجود ندارد')
    return {'period_id':pid, 'jalali_month':p['period_key'], 'payroll_month':payroll_month,
            'month':payroll_month, 'anchor_date':anchor,
            'kpi_version':p['version'], 'pool_toman':pool,
            'status':status, 'default_applies_to_payslip':False, 'requires_manual_approval':True,
            'period_matches_current_payslip':payroll_month==current_month,
            'people':results, 'warnings':warnings,
            'note':'KPI و کارانه مستقل باقی می‌مانند. فقط با تأیید صریح به فیش منتقل می‌شوند؛ مقایسه خالص فقط در صورت دسترسی به موتور فیش معتبر است.'}

@router.get('/{period_id}/preview')
def preview(period_id:int, actor:Actor=Depends(authenticate)):
    permission(actor)
    with tx() as conn:
        return preview_data(conn,period_id,actor)

@router.post('/{period_id}/approve')
def apply(period_id:int, body:Approval, actor:Actor=Depends(authenticate)):
    permission(actor,True)
    with tx() as conn:
        p=conn.execute('SELECT * FROM hr_team_kpi_periods WHERE id=%s FOR UPDATE',(period_id,)).fetchone()
        if not p:raise not_found()
        actual, people, shares, pool=context(conn,period_id,actor)
        if actual['version'] != body.kpi_version:
            raise HTTPException(409,'ارزیابی بعد از پیش‌نمایش تغییر کرده است؛ پیش‌نمایش را تازه کنید')
        if p['created_by']==actor.user_id:
            raise HTTPException(403,'ثبت‌کننده ارزیابی نمی‌تواند انتقال همان ارزیابی به حقوق را تأیید کند')
        payroll_month, anchor_date = jalali_payroll_bucket(p['period_key'])
        if body.payroll_month != payroll_month:
            raise HTTPException(409,'ماه فیش پس از پیش‌نمایش با دوره ارزیابی تطابق ندارد؛ پیش‌نمایش را تازه کنید')
        assure_unlocked(conn,payroll_month)
        old=transfer_row(conn,period_id,True)
        if old:
            raise HTTPException(409,'این ارزیابی قبلاً انتقال یافته یا بازگردانی شده است؛ تغییر جدید نیازمند فرایند اصلاح مستقل است')
        # Only a single approved transfer per KPI period; reversal is an explicit irreversible event.
        snapshot_rows=[]
        for emp,amount in zip(people,shares):
            rid=f'kpi-pay-{period_id}-{emp["employee_id"]}'
            if conn.execute('SELECT id FROM records WHERE collection=%s AND id=%s',('payrollAdjustments',rid)).fetchone():
                raise HTTPException(409,'رکورد کارانه تکراری یافت شد؛ انتقال لغو شد')
            data={'employee_id':emp['employee_id'],'kind':'bonus','type':'kpi_team','type_label':'کارانه ارزیابی تیمی ۶۰/۴۰',
                  'calc':'amount','amount':amount,'date':anchor_date,
                  'payroll_month':payroll_month,'apply_to_payroll':True,
                  'notes':f'KPI period {period_id}; approved by {actor.username}; {body.note}',
                  'created_by':actor.username,'created_by_name':actor.name}
            conn.execute("""INSERT INTO records(collection,id,employee_id,data,created_by)
                      VALUES('payrollAdjustments',%s,%s,%s,%s)""",(rid,emp['employee_id'],Jsonb(data),actor.user_id))
            snapshot_rows.append({'record_id':rid,'employee_id':emp['employee_id'],'amount_toman':amount})
        conn.execute('INSERT INTO hr_kpi_payroll_transfers(period_id,month,status,approved_by,approve_note,snapshot) VALUES(%s,%s,%s,%s,%s,%s)',
                     (period_id,payroll_month,'applied',actor.user_id,body.note,Jsonb(snapshot_rows)))
        conn.execute('INSERT INTO hr_kpi_payroll_transfer_events(period_id,action,actor_id,detail) VALUES(%s,%s,%s,%s)',
                     (period_id,'approved',actor.user_id,Jsonb({'jalali_month':p['period_key'],'payroll_month':payroll_month,'pool_toman':pool,'items':snapshot_rows,'note':body.note})))
        log_event(conn,'approve','kpi_payroll',f'انتقال اختیاری کارانه {period_id} به فیش {payroll_month}',actor=actor)
        return {'status':'applied','month':payroll_month,'jalali_month':p['period_key'],'pool_toman':pool,'items':snapshot_rows,
                'notice':'کارانه در اقلام پاداش فیش ثبت شد. برای دیدن فیش به‌روز، داده‌ها را از سرور بازخوانی کنید.'}

@router.post('/{period_id}/revert')
def revert(period_id:int,body:Revert,actor:Actor=Depends(authenticate)):
    permission(actor,True)
    with tx() as conn:
        p=conn.execute('SELECT * FROM hr_team_kpi_periods WHERE id=%s FOR UPDATE',(period_id,)).fetchone()
        if not p:raise not_found()
        _, people,_,pool=context(conn,period_id,actor)
        transfer=transfer_row(conn,period_id,True)
        if not transfer or transfer['status']!='applied':
            raise HTTPException(409,'کارانه اعمال‌شده‌ای برای بازگشت وجود ندارد')
        payroll_month, _ = jalali_payroll_bucket(p['period_key'])
        if transfer['month'] != payroll_month:
            raise HTTPException(409,'ماه انتقال قبلی با ماه فیش تطابق ندارد؛ نیازمند بررسی مالی است')
        assure_unlocked(conn,payroll_month)
        rows=transfer['snapshot']
        for entry in rows:
            rec=conn.execute("SELECT * FROM records WHERE collection='payrollAdjustments' AND id=%s FOR UPDATE",(entry['record_id'],)).fetchone()
            if not rec or rec['deleted_at'] is not None or rec['employee_id']!=entry['employee_id'] or rec['data'].get('type')!='kpi_team' or rec['data'].get('payroll_month')!=payroll_month or rec['data'].get('apply_to_payroll') is not True or int(rec['data'].get('amount') or -1)!=entry['amount_toman']:
                raise HTTPException(409,'رکورد کارانه با نسخه تأییدشده تطابق ندارد؛ برای جلوگیری از حذف اشتباه، بازگشت متوقف شد')
            data=dict(rec['data']);data['apply_to_payroll']=False;data['status']='cancelled'
            conn.execute('UPDATE records SET data=%s,version=version+1,updated_at=NOW(),updated_by=%s WHERE collection=%s AND id=%s',
                         (Jsonb(data),actor.user_id,'payrollAdjustments',entry['record_id']))
        conn.execute("UPDATE hr_kpi_payroll_transfers SET status='reverted',reverted_by=%s,revert_note=%s,reverted_at=NOW() WHERE period_id=%s",(actor.user_id,body.note,period_id))
        conn.execute('INSERT INTO hr_kpi_payroll_transfer_events(period_id,action,actor_id,detail) VALUES(%s,%s,%s,%s)',
                     (period_id,'reverted',actor.user_id,Jsonb({'note':body.note,'items':rows})))
        log_event(conn,'revert','kpi_payroll',f'بازگشت کارانه تیم {period_id} به وضعیت قبلی',actor=actor)
        return {'status':'reverted','month':payroll_month,'notice':'فقط آیتم‌های کارانه همین ارزیابی لغو شدند؛ حقوق پایه، حق فنی و پاداش‌های دیگر بدون تغییر ماندند.'}
