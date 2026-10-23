"""LAN-only production person-hours register; separate from statutory overtime payroll.
One row per oven + team + date; approvals are explicit and audited.
"""
from datetime import date
import json
from psycopg.types.json import Jsonb
from fastapi import APIRouter, Depends, Query, HTTPException
from ..db import tx
from ..deps import authenticate
from ..core.policy import has_permission
from ..errors import forbidden, not_found, conflict
from ..services.sync import Actor
from .common import log_event
from ..analytics.team_hours_models import Entry, Edit, Approval

router=APIRouter(prefix='/api/team-hours',tags=['oven team hours'])


def permit(actor,perm):
    if not has_permission(actor.principal,perm):raise forbidden(details={'permission':perm})

def jsonrow(row):return Jsonb(json.loads(json.dumps(dict(row),default=str)))

def check_order(conn,body):
    o=conn.execute('SELECT forge_team,masonry_team FROM oven_orders WHERE id=%s FOR SHARE',(body.oven_id,)).fetchone()
    if not o:raise not_found()
    if o[body.team_kind+'_team']!=body.team_number:raise HTTPException(422,'این تیم به سفارش انتخابی منتسب نیست')

def event(conn,row,actor,action,old=None):
    conn.execute('INSERT INTO oven_team_hours_events(entry_id,changed_by,action,previous,current) VALUES(%s,%s,%s,%s,%s)',
                 (row['id'],actor.user_id,action,jsonrow(old) if old else None,jsonrow(row)))
    log_event(conn,action,'oven_team_hours',f'نفرساعت سفارش {row["oven_id"]} تیم {row["team_kind"]}-{row["team_number"]}',actor=actor)

@router.get('')
def list_entries(start:date|None=None,end:date|None=None,actor:Actor=Depends(authenticate)):
    permit(actor,'view_reports')
    if start and end and end<start:raise HTTPException(422,'بازه تاریخ نامعتبر است')
    with tx() as conn:
        rows=conn.execute('SELECT * FROM oven_team_hours WHERE (%s::date IS NULL OR work_date >= %s::date) AND (%s::date IS NULL OR work_date <= %s::date) ORDER BY work_date DESC,id DESC LIMIT 5000',(start,start,end,end)).fetchall()
    return {'items':[dict(x) for x in rows]}

@router.post('',status_code=201)
def create(body:Entry,actor:Actor=Depends(authenticate)):
    permit(actor,'write_records')
    d=body.model_dump(mode='json');keys=list(d)
    with tx() as conn:
        check_order(conn,body)
        exists=conn.execute('SELECT id FROM oven_team_hours WHERE oven_id=%s AND team_kind=%s AND work_date=%s',(body.oven_id,body.team_kind,body.work_date)).fetchone()
        if exists:raise conflict()
        try:
            row=conn.execute('INSERT INTO oven_team_hours ('+','.join(keys)+',created_by,updated_by) VALUES ('+','.join(['%s']*(len(keys)+2))+') RETURNING *',(*[d[k] for k in keys],actor.user_id,actor.user_id)).fetchone()
        except Exception as e:
            if getattr(e,'sqlstate',None)=='23505':raise conflict()
            raise
        event(conn,row,actor,'create')
    return {'item':dict(row)}

@router.put('/{entry_id}')
def update(entry_id:int,body:Edit,actor:Actor=Depends(authenticate)):
    permit(actor,'write_records')
    d=body.model_dump(mode='json',exclude={'expected_version'});keys=list(d)
    with tx() as conn:
        old=conn.execute('SELECT * FROM oven_team_hours WHERE id=%s FOR UPDATE',(entry_id,)).fetchone()
        if not old:raise not_found()
        if old['approval']!='pending':raise HTTPException(409,'ردیف تأییدشده یا ردشده قابل ویرایش نیست')
        if old['version']!=body.expected_version:raise conflict()
        check_order(conn,body)
        row=conn.execute('UPDATE oven_team_hours SET '+','.join(k+'=%s' for k in keys)+',version=version+1,updated_by=%s,updated_at=now() WHERE id=%s RETURNING *',(*[d[k] for k in keys],actor.user_id,entry_id)).fetchone()
        event(conn,row,actor,'edit',old)
    return {'item':dict(row)}

@router.post('/{entry_id}/review')
def review(entry_id:int,body:Approval,actor:Actor=Depends(authenticate)):
    permit(actor,'approve_records')
    with tx() as conn:
        old=conn.execute('SELECT * FROM oven_team_hours WHERE id=%s FOR UPDATE',(entry_id,)).fetchone()
        if not old:raise not_found()
        if old['version']!=body.expected_version:raise conflict()
        if old['approval']!='pending':raise HTTPException(409,'این ردیف قبلاً تعیین تکلیف شده است')
        if old['created_by']==actor.user_id:raise HTTPException(403,'ثبت‌کننده نمی‌تواند ردیف خودش را تأیید کند')
        row=conn.execute('UPDATE oven_team_hours SET approval=%s,approver=%s,approved_at=now(),version=version+1,updated_by=%s,updated_at=now() WHERE id=%s RETURNING *',(body.decision,actor.user_id,actor.user_id,entry_id)).fetchone()
        event(conn,row,actor,'review',old)
    return {'item':dict(row)}

@router.get('/summary')
def summary(start:date|None=None,end:date|None=None,actor:Actor=Depends(authenticate)):
    permit(actor,'view_reports')
    if start and end and end<start:raise HTTPException(422,'بازه تاریخ نامعتبر است')
    with tx() as conn:
        rows=conn.execute('''SELECT team_kind,team_number,approval,
            COUNT(*) AS record_count,
            COALESCE(SUM(ordinary_person_hours),0) AS ordinary,
            COALESCE(SUM(overtime_person_hours),0) AS overtime,
            COALESCE(SUM(excluded_person_hours),0) AS excluded
            FROM oven_team_hours
            WHERE (%s::date IS NULL OR work_date >= %s::date)
              AND (%s::date IS NULL OR work_date <= %s::date)
            GROUP BY team_kind,team_number,approval''',(start,start,end,end)).fetchall()
        # Detect potential double booking across different ovens on the same day.
        warnings=conn.execute('''SELECT team_kind,team_number,work_date,
          SUM(ordinary_person_hours) AS ordinary, SUM(overtime_person_hours) AS overtime
          FROM oven_team_hours WHERE approval='approved'
           AND (%s::date IS NULL OR work_date >= %s::date)
           AND (%s::date IS NULL OR work_date <= %s::date)
          GROUP BY team_kind,team_number,work_date
          HAVING SUM(ordinary_person_hours)>32 OR SUM(ordinary_person_hours+overtime_person_hours)>64
          ORDER BY work_date DESC LIMIT 100''',(start,start,end,end)).fetchall()
    teams=[]
    for kind,count in [('forge',2),('masonry',3)]:
        for number in range(1,count+1):
            selected=[r for r in rows if r['team_kind']==kind and r['team_number']==number]
            accepted=next((r for r in selected if r['approval']=='approved'),None)
            pending=sum(int(r['record_count']) for r in selected if r['approval']=='pending')
            rejected=sum(int(r['record_count']) for r in selected if r['approval']=='rejected')
            ordinary=accepted['ordinary'] if accepted else 0
            overtime=accepted['overtime'] if accepted else 0
            excluded=accepted['excluded'] if accepted else 0
            total=ordinary+overtime
            teams.append({'kind':kind,'number':number,'name':('آهنگری ' if kind=='forge' else 'بنایی ')+str(number),
              'approved_entries':int(accepted['record_count']) if accepted else 0,
              'pending_entries':pending,'rejected_entries':rejected,
              'ordinary_person_hours':float(ordinary),'overtime_person_hours':float(overtime),
              'excluded_person_hours':float(excluded),
              'effective_person_hours':float(max(0,total-excluded)),
              'overtime_fraction':float(overtime/total) if total else None})
    return {'teams':teams,'warnings':[dict(x) for x in warnings],
            'scope':'فقط نفرساعت ردیف‌های تأییدشده؛ نه ساعات حقوق و دستمزد و نه کارانه. بدون زمان استاندارد و خروجی کنترل‌کیفیت‌شده، بهره‌وری واقعی محاسبه نمی‌شود.',
            'assumptions':'حد هشدار ۳۲ نفرساعت موظفی و ۶۴ نفرساعت مجموع روزانه برای یک تیم چهار نفره، صرفاً کنترل اولیه داده است و نیاز به تأیید تنظیمات شیفت دارد.'}
