"""Team-based KPI evaluation and *simulation* of the 60/40 pool division.
Never pays, updates payroll, or modifies production points. All monetary outputs are permission-gated.
"""
import json
from decimal import Decimal,ROUND_HALF_UP
from typing import Literal
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field,model_validator
from psycopg.types.json import Jsonb
from ..deps import authenticate
from ..db import tx
from ..services.sync import Actor
from ..core.policy import has_permission,in_unit_scope
from ..core.team_registry import DEFAULT_WEIGHTS, team_assignment_issues, supervisor_teams
from ..errors import forbidden,conflict,not_found
from .common import log_event
router=APIRouter(prefix='/api/kpi', tags=['team KPI'])
WEIGHTS=DEFAULT_WEIGHTS
class Member(BaseModel):
 employee_id:str=Field(min_length=1,max_length=120)
 ratings:list[int]=Field(min_length=5,max_length=5)
 evidence:str=Field(default='',max_length=1200)
 @model_validator(mode='after')
 def valid(self):
  if any(type(x) is not int or x<0 or x>4 for x in self.ratings):raise ValueError('امتیاز هر معیار باید از ۰ تا ۴ باشد')
  if any(x in (0,1,4) for x in self.ratings) and len(self.evidence.strip())<10:raise ValueError('برای امتیاز ۰، ۱ یا ۴ توضیح مستند الزامی است')
  return self
class Period(BaseModel):
 period_key:str=Field(pattern=r'^14[0-9]{2}-(0[1-9]|1[0-2])$')
 team_kind:Literal['forge','masonry']
 team_number:int=Field(ge=1,le=3)
 production_points:Decimal|None=Field(default=None,ge=0,le=100000)
 members:list[Member]=Field(min_length=4,max_length=4)
 @model_validator(mode='after')
 def valid(self):
  if self.team_kind=='forge' and self.team_number>2:raise ValueError('فقط دو تیم آهنگری موجود است')
  if len(set(x.employee_id for x in self.members))!=4:raise ValueError('چهار کارمند متفاوت انتخاب کنید')
  return self
class Revision(Period):expected_version:int=Field(ge=1)
class Decision(BaseModel):
 expected_version:int=Field(ge=1)
 decision:Literal['approved','rejected']
def permit(actor,perm):
 if not has_permission(actor.principal,perm):raise forbidden(details={'permission':perm})
def score(ratings,weights=WEIGHTS):return sum(Decimal(w)*Decimal(n)/Decimal(4) for w,n in zip(weights,ratings))
def money_access(actor):return has_permission(actor.principal,'view_salary')
def aggregate_access(actor):return money_access(actor) or has_permission(actor.principal,'view_payroll_totals')
def ensure_people(conn,actor,members):
 rows=conn.execute('SELECT id,unit_id,full_name FROM employees WHERE id=ANY(%s) AND deleted_at IS NULL',([m.employee_id for m in members],)).fetchall()
 if len(rows)!=4:raise HTTPException(422,'چهار کارمند فعال معتبر انتخاب کنید')
 if any(not in_unit_scope(actor.principal,r['unit_id']) for r in rows):raise forbidden(details={'reason':'OUT_OF_UNIT_SCOPE'})
 # Prevent accidentally combining staff from unrelated units. Team membership confirmation remains supervisor's responsibility.
 if len({r['unit_id'] for r in rows})!=1:raise HTTPException(422,'چهار عضو باید در یک واحد سازمانی باشند')
def can_edit_team(conn, actor, period_key, team_kind, team_number):
 # HR manager may coordinate the whole HR process; a unit-scoped supervisor
 # may edit ONLY teams explicitly assigned to that account for that month.
 if has_permission(actor.principal,'edit_settings'):
  return True
 return (team_kind,team_number) in supervisor_teams(conn,actor.user_id,period_key)

def require_edit_team(conn, actor, period_key, team_kind, team_number):
 if not can_edit_team(conn,actor,period_key,team_kind,team_number):
  raise forbidden(details={'reason':'TEAM_SUPERVISOR_SCOPE_REQUIRED'})

def snapshot(conn,pid):
 p=conn.execute('SELECT * FROM hr_team_kpi_periods WHERE id=%s',(pid,)).fetchone()
 if not p:raise not_found()
 people=conn.execute('SELECT k.employee_id,e.full_name,e.unit_id,k.ratings,k.evidence FROM hr_team_kpi_people k JOIN employees e ON e.id=k.employee_id WHERE k.period_id=%s ORDER BY k.employee_id',(pid,)).fetchall()
 return p,people
def safe_result(actor,p,people,membership_issues=None):
 if any(not in_unit_scope(actor.principal,x['unit_id']) for x in people):raise forbidden(details={'reason':'OUT_OF_UNIT_SCOPE'})
 scores=[score(x['ratings'],p['weights']) for x in people];total=sum(scores)
 base={'id':p['id'],'period_key':p['period_key'],'team_kind':p['team_kind'],'team_number':p['team_number'],'status':p['status'],'version':p['version'],'weights':p['weights'],
  'membership_verified': membership_issues == [],'membership_issues':membership_issues if membership_issues is not None else ['نیازمند بررسی ترکیب تیم'],
  'people':[{'employee_id':x['employee_id'],'full_name':x['full_name'],'ratings':x['ratings'],'evidence':x['evidence'],'score':float(s)} for x,s in zip(people,scores)]}
 if aggregate_access(actor):
  points=p['production_points'];pool=int((max(Decimal(0),points-Decimal(50))*Decimal(1000000)).quantize(Decimal('1'))) if points is not None else None
  base.update({'production_points':float(points) if points is not None else None,'pool_toman':pool,'threshold_points':50,'point_value_toman':1000000,'monetary_status':'simulation_only'})
  # Aggregated-payroll access does not authorize individual bonus amounts.
  if money_access(actor) and membership_issues == [] and pool is not None and total>0 and len(people)==4:
   raw=[Decimal(pool)*(Decimal('0.60')/4+Decimal('0.40')*s/total) for s in scores]
   shares=[int(x.quantize(Decimal('1'),rounding=ROUND_HALF_UP)) for x in raw]
   shares[-1]+=pool-sum(shares)
   for entry,money in zip(base['people'],shares):entry['illustrative_share_toman']=money
 return base
@router.get('/periods')
def list_periods(actor:Actor=Depends(authenticate)):
 permit(actor,'view_personnel')
 with tx() as conn:
  rows=conn.execute('SELECT id FROM hr_team_kpi_periods ORDER BY id DESC LIMIT 150').fetchall()
  items=[]
  for r in rows:
   p,people=snapshot(conn,r['id'])
   if people and all(in_unit_scope(actor.principal,x['unit_id']) for x in people):
    if not can_edit_team(conn,actor,p['period_key'],p['team_kind'],p['team_number']) and not has_permission(actor.principal,'view_ceo'):
     continue
    issues=team_assignment_issues(conn,p['period_key'],p['team_kind'],p['team_number'],[x['employee_id'] for x in people])
    items.append(safe_result(actor,p,people,issues))
 return {'items':items}
@router.post('/periods',status_code=201)
def create(body:Period,actor:Actor=Depends(authenticate)):
 permit(actor,'write_records')
 with tx() as conn:
  ensure_people(conn,actor,body.members)
  require_edit_team(conn,actor,body.period_key,body.team_kind,body.team_number)
  w=conn.execute("SELECT weights FROM hr_team_kpi_weights WHERE team_kind=%s",(body.team_kind,)).fetchone()
  weights=list(w["weights"]) if w else list(WEIGHTS)
  try:
   p=conn.execute('INSERT INTO hr_team_kpi_periods(period_key,team_kind,team_number,production_points,created_by,weights) VALUES(%s,%s,%s,%s,%s,%s) RETURNING *',(body.period_key,body.team_kind,body.team_number,body.production_points,actor.user_id,Jsonb(weights))).fetchone()
  except Exception as e:
   if getattr(e,'sqlstate',None)=='23505':raise conflict()
   raise
  for m in body.members:conn.execute('INSERT INTO hr_team_kpi_people(period_id,employee_id,ratings,evidence) VALUES(%s,%s,%s,%s)',(p['id'],m.employee_id,Jsonb(m.ratings),m.evidence))
  p,people=snapshot(conn,p['id'])
  conn.execute('INSERT INTO hr_team_kpi_events(period_id,action,actor_id,snapshot) VALUES(%s,%s,%s,%s)',(p['id'],'create',actor.user_id,Jsonb({'status':'draft'})))
  log_event(conn,'create','hr_team_kpi','ثبت ارزیابی تیمی',actor=actor)
  issues=team_assignment_issues(conn,p['period_key'],p['team_kind'],p['team_number'],[x['employee_id'] for x in people])
 return {'item':safe_result(actor,p,people,issues)}
@router.put('/periods/{pid}')
def update(pid:int,body:Revision,actor:Actor=Depends(authenticate)):
 permit(actor,'write_records')
 with tx() as conn:
  old=conn.execute('SELECT * FROM hr_team_kpi_periods WHERE id=%s FOR UPDATE',(pid,)).fetchone()
  if not old:raise not_found()
  if old['status']!='draft':raise HTTPException(409,'ارزیابی تعیین تکلیف‌شده قابل ویرایش نیست')
  if old['version']!=body.expected_version:raise conflict()
  if (old['period_key'],old['team_kind'],old['team_number'])!=(body.period_key,body.team_kind,body.team_number):raise HTTPException(422,'ماه و تیم پس از ثبت قابل تغییر نیستند')
  ensure_people(conn,actor,body.members)
  require_edit_team(conn,actor,old['period_key'],old['team_kind'],old['team_number'])
  conn.execute('UPDATE hr_team_kpi_periods SET production_points=%s,version=version+1 WHERE id=%s',(body.production_points,pid))
  conn.execute('DELETE FROM hr_team_kpi_people WHERE period_id=%s',(pid,))
  for m in body.members:conn.execute('INSERT INTO hr_team_kpi_people(period_id,employee_id,ratings,evidence) VALUES(%s,%s,%s,%s)',(pid,m.employee_id,Jsonb(m.ratings),m.evidence))
  p,people=snapshot(conn,pid)
  conn.execute('INSERT INTO hr_team_kpi_events(period_id,action,actor_id,snapshot) VALUES(%s,%s,%s,%s)',(pid,'edit',actor.user_id,Jsonb({'version':p['version']})))
  log_event(conn,'edit','hr_team_kpi','اصلاح ارزیابی تیمی',actor=actor)
  issues=team_assignment_issues(conn,p['period_key'],p['team_kind'],p['team_number'],[x['employee_id'] for x in people])
 return {'item':safe_result(actor,p,people,issues)}
@router.post('/periods/{pid}/review')
def review(pid:int,body:Decision,actor:Actor=Depends(authenticate)):
 permit(actor,'approve_records')
 with tx() as conn:
  old=conn.execute('SELECT * FROM hr_team_kpi_periods WHERE id=%s FOR UPDATE',(pid,)).fetchone()
  if not old:raise not_found()
  if old['version']!=body.expected_version:raise conflict()
  if old['status']!='draft':raise HTTPException(409,'این ارزیابی قبلاً تعیین تکلیف شده است')
  if old['created_by']==actor.user_id:raise HTTPException(403,'ثبت‌کننده نمی‌تواند ارزیابی خود را تأیید کند')
  _,people=snapshot(conn,pid)
  if len(people)!=4 or any(not in_unit_scope(actor.principal,x['unit_id']) for x in people):raise forbidden()
  issues=team_assignment_issues(conn,old['period_key'],old['team_kind'],old['team_number'],[x['employee_id'] for x in people])
  if body.decision=='approved' and issues:
   raise HTTPException(409, {'reason':'TEAM_MEMBERSHIP_NOT_CONFIRMED','issues':issues})
  p=conn.execute('UPDATE hr_team_kpi_periods SET status=%s,reviewed_by=%s,reviewed_at=now(),version=version+1 WHERE id=%s RETURNING *',(body.decision,actor.user_id,pid)).fetchone()
  conn.execute('INSERT INTO hr_team_kpi_events(period_id,action,actor_id,snapshot) VALUES(%s,%s,%s,%s)',(pid,'review',actor.user_id,Jsonb({'decision':body.decision})))
  log_event(conn,'review','hr_team_kpi','بررسی ارزیابی تیمی',actor=actor)
 return {'item':safe_result(actor,p,people,issues)}
