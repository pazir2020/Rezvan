"""Non-payroll monthly professional KPIs for electrical, technical, finance and HR.

Profiles are editable with versioned snapshots. Approval does NOT create a bonus,
modify salary, or trigger payments; no financial formula is invented.
"""
from typing import Literal
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from psycopg.types.json import Jsonb
from ..db import tx
from ..deps import authenticate
from ..services.sync import Actor
from ..core.policy import has_permission, in_unit_scope
from ..errors import not_found, conflict, forbidden
from .common import log_event

router=APIRouter(prefix='/api/individual-kpi', tags=['individual professional KPI'])
Profile=Literal['electrical','technical','finance','hr']
DEFAULTS={
 'electrical':['کیفیت رفع عیب و عدم خرابی تکراری','سرویس پیشگیرانه تجهیزات برق','دقت عیب‌یابی و پاسخ‌گویی','رعایت ایمنی برق','همکاری و گزارش فنی'],
 'technical':['کیفیت تعمیرات مکانیکی','تکمیل سرویس‌های پیشگیرانه','عیب‌یابی و بهره‌وری عملیات','رعایت ایمنی تعمیرات','همکاری و انتقال دانش'],
 'finance':['صحت اسناد مالی','تحویل به‌موقع گزارش‌ها','مغایرت‌گیری و کنترل حساب‌ها','رعایت کنترل‌های مالی','همکاری و پاسخ‌گویی'],
 'hr':['صحت اطلاعات پرسنلی','مدیریت قراردادهای ماهانه','صحت اطلاعات کارکرد و حقوق','رسیدگی به درخواست‌ها','محرمانگی و همکاری']
}
WEIGHTS=[30,25,20,15,10]
DEPT_PART={'electrical':('برق',), 'technical':('فنی',), 'finance':('مالی',), 'hr':('منابع انسانی','اداری')}

def must(actor,perm):
 if not has_permission(actor.principal,perm):raise forbidden(details={'permission':perm})

def person(conn,emp_id,actor,kind=None):
 row=conn.execute('SELECT id,full_name,unit_id,department FROM employees WHERE id=%s AND deleted_at IS NULL',(emp_id,)).fetchone()
 if not row:raise not_found()
 if not in_unit_scope(actor.principal,row['unit_id']):raise forbidden(details={'reason':'OUT_OF_UNIT_SCOPE'})
 if kind is not None and not any(w in (row['department'] or '') for w in DEPT_PART[kind]):
  raise HTTPException(409,'واحد سازمانی پرونده با فرم تخصصی انتخاب‌شده تطابق ندارد؛ ابتدا اطلاعات پرسنلی را اصلاح کنید')
 return row

def config(conn,kind):
 row=conn.execute('SELECT labels,weights,version FROM hr_individual_kpi_profiles WHERE profile_kind=%s',(kind,)).fetchone()
 return {'labels':list(row['labels']),'weights':list(row['weights']),'version':row['version']} if row else {'labels':DEFAULTS[kind],'weights':WEIGHTS,'version':0}

def points(row):return sum(Decimal(w)*Decimal(r)/4 for w,r in zip(row['weights'],row['ratings']))

class ProfileUpdate(BaseModel):
 profile_kind:Profile
 labels:list[str]=Field(min_length=5,max_length=5)
 weights:list[int]=Field(min_length=5,max_length=5)
 expected_version:int=Field(ge=0)
 reason:str=Field(min_length=8,max_length=500)
 @model_validator(mode='after')
 def checked(self):
  if any(not label.strip() or len(label)>100 for label in self.labels):raise ValueError('عنوان شاخص نامعتبر است')
  if any(type(x) is not int or x<0 or x>100 for x in self.weights) or sum(self.weights)!=100:
   raise ValueError('مجموع پنج وزن باید ۱۰۰ باشد')
  return self

class EvalCreate(BaseModel):
 employee_id:str=Field(min_length=1,max_length=120)
 period_key:str=Field(pattern=r'^14[0-9]{2}-(0[1-9]|1[0-2])$')
 profile_kind:Profile
 ratings:list[int]=Field(min_length=5,max_length=5)
 evidence:str=Field(default='',max_length=1500)
 @model_validator(mode='after')
 def valid(self):
  if any(type(x) is not int or not 0<=x<=4 for x in self.ratings):raise ValueError('نمرات باید صفر تا چهار باشند')
  if any(x in (0,1,4) for x in self.ratings) and len(self.evidence.strip())<10:
   raise ValueError('امتیاز صفر، یک یا چهار نیازمند شواهد مستند است')
  return self
class EvalReview(BaseModel):
 decision:Literal['approved','rejected']
 expected_version:int=Field(ge=1)
 note:str=Field(min_length=8,max_length=700)

@router.get('/profiles')
def profiles(actor:Actor=Depends(authenticate)):
 must(actor,'view_personnel')
 with tx() as conn:
  return {'profiles':{k:config(conn,k) for k in DEFAULTS}, 'editable':has_permission(actor.principal,'edit_settings')}

@router.put('/profiles')
def update_profile(body:ProfileUpdate,actor:Actor=Depends(authenticate)):
 must(actor,'edit_settings')
 with tx() as conn:
  current=conn.execute('SELECT * FROM hr_individual_kpi_profiles WHERE profile_kind=%s FOR UPDATE',(body.profile_kind,)).fetchone()
  v=current['version'] if current else 0
  if v!=body.expected_version:raise conflict()
  out=conn.execute('''INSERT INTO hr_individual_kpi_profiles(profile_kind,labels,weights,version,updated_by,reason)
    VALUES(%s,%s,%s,1,%s,%s) ON CONFLICT (profile_kind) DO UPDATE SET labels=EXCLUDED.labels,
    weights=EXCLUDED.weights,version=hr_individual_kpi_profiles.version+1,
    updated_by=EXCLUDED.updated_by,updated_at=NOW(),reason=EXCLUDED.reason RETURNING *''',
    (body.profile_kind,Jsonb(body.labels),Jsonb(body.weights),actor.user_id,body.reason)).fetchone()
  conn.execute('INSERT INTO hr_individual_kpi_events(period_id,action,actor_id,detail) VALUES(NULL,%s,%s,%s)',
    ('profile_changed',actor.user_id,Jsonb({'kind':body.profile_kind,'old_version':v,'labels':body.labels,'weights':body.weights,'reason':body.reason})))
  log_event(conn,'update','hr_individual_kpi','تغییر پروفایل ارزیابی تخصصی برای دوره‌های آینده',actor=actor)
 return {'profile_kind':body.profile_kind,'version':out['version']}

def public_row(row):
 out=dict(row)
 out['score']=float(points(row))
 out['independent_of_payroll']=True
 return out

@router.get('/evaluations')
def list_evaluations(actor:Actor=Depends(authenticate)):
 must(actor,'view_personnel')
 with tx() as conn:
  rows=conn.execute('''SELECT k.*,e.full_name,e.unit_id FROM hr_individual_kpi_periods k
   JOIN employees e ON e.id=k.employee_id WHERE e.deleted_at IS NULL
   ORDER BY k.id DESC LIMIT 500''').fetchall()
 return {'items':[public_row(r) for r in rows if in_unit_scope(actor.principal,r['unit_id'])]}

@router.post('/evaluations',status_code=201)
def create_eval(body:EvalCreate,actor:Actor=Depends(authenticate)):
 must(actor,'write_records')
 with tx() as conn:
  person(conn,body.employee_id,actor,body.profile_kind)
  cfg=config(conn,body.profile_kind)
  try:
   row=conn.execute('''INSERT INTO hr_individual_kpi_periods(employee_id,period_key,profile_kind,labels,weights,ratings,evidence,created_by)
     VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *''',
     (body.employee_id,body.period_key,body.profile_kind,Jsonb(cfg['labels']),Jsonb(cfg['weights']),Jsonb(body.ratings),body.evidence,actor.user_id)).fetchone()
  except Exception as ex:
   if getattr(ex,'sqlstate',None)=='23505':raise conflict()
   raise
  conn.execute('INSERT INTO hr_individual_kpi_events(period_id,action,actor_id,detail) VALUES(%s,%s,%s,%s)',
    (row['id'],'created',actor.user_id,Jsonb({'scores':body.ratings,'profile_version':cfg['version']})))
  log_event(conn,'create','hr_individual_kpi','ارزیابی تخصصی مستقل از کارانه',actor=actor)
 return {'item':public_row(row)}

@router.post('/evaluations/{eid}/review')
def review(eid:int,body:EvalReview,actor:Actor=Depends(authenticate)):
 must(actor,'approve_records')
 with tx() as conn:
  row=conn.execute('SELECT * FROM hr_individual_kpi_periods WHERE id=%s FOR UPDATE',(eid,)).fetchone()
  if not row:raise not_found()
  person(conn,row['employee_id'],actor)
  if row['created_by']==actor.user_id:raise forbidden(details={'reason':'SELF_APPROVAL_NOT_ALLOWED'})
  if row['version']!=body.expected_version or row['status']!='draft':raise conflict()
  out=conn.execute('''UPDATE hr_individual_kpi_periods SET status=%s,version=version+1,reviewed_by=%s,
  reviewed_at=NOW(),review_note=%s WHERE id=%s RETURNING *''',
     (body.decision,actor.user_id,body.note,eid)).fetchone()
  conn.execute('INSERT INTO hr_individual_kpi_events(period_id,action,actor_id,detail) VALUES(%s,%s,%s,%s)',
    (eid,body.decision,actor.user_id,Jsonb({'reason':body.note,'score':float(points(row))})))
  log_event(conn,'review','hr_individual_kpi','تصمیم درباره ارزیابی تخصصی؛ بدون اثر بر حقوق',actor=actor)
 return {'item':public_row(out)}
