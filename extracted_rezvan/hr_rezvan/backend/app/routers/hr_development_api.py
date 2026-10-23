"""HR skill matrix and tracked follow-ups; no salary, KPI or bonus mutations."""
import json
from datetime import date
from typing import Literal
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field
from psycopg.types.json import Jsonb
from ..deps import authenticate
from ..db import tx
from ..services.sync import Actor
from ..core.policy import has_permission,in_unit_scope
from ..errors import forbidden,not_found,conflict
from .common import log_event
router=APIRouter(prefix='/api/hr-development',tags=['HR development'])

class Skill(BaseModel):
 employee_id:str=Field(min_length=1,max_length=120)
 skill_name:str=Field(min_length=2,max_length=100)
 skill_level:int=Field(ge=0,le=4)
 assessment_date:date
 evidence:str=Field(default='',max_length=1200)
 training_needed:bool=False
 next_review:date|None=None
class Action(BaseModel):
 employee_id:str|None=None
 category:Literal['training','contract','equipment','safety','performance','other']
 title:str=Field(min_length=3,max_length=150)
 description:str=Field(default='',max_length=1500)
 owner:str=Field(min_length=1,max_length=120)
 due_date:date|None=None
 status:Literal['open','working','done','cancelled']='open'
 result:str=Field(default='',max_length=1200)
class ChangeSkill(Skill):expected_version:int=Field(ge=1)
class ChangeAction(Action):expected_version:int=Field(ge=1)

def require(actor,write=False):
 perm='write_records' if write else 'view_personnel'
 if not has_permission(actor.principal,perm):raise forbidden(details={'permission':perm})

def employee_check(conn,emp_id,actor):
 row=conn.execute('SELECT id,unit_id FROM employees WHERE id=%s AND deleted_at IS NULL',(emp_id,)).fetchone()
 if not row:raise not_found()
 if not in_unit_scope(actor.principal,row['unit_id']):raise forbidden(details={'reason':'OUT_OF_UNIT_SCOPE'})
 return row

def audit(conn,entity,row,actor,operation,old=None):
 fmt=lambda x:Jsonb(json.loads(json.dumps(dict(x),default=str))) if x else None
 conn.execute('INSERT INTO hr_development_events(entity,entity_id,operation,changed_by,old_value,new_value) VALUES(%s,%s,%s,%s,%s,%s)',(entity,row['id'],operation,actor.user_id,fmt(old),fmt(row)))
 log_event(conn,operation,'hr_'+entity,'تغییر پرونده توسعه منابع انسانی',actor=actor)

def visible(actor,row):
 return actor.principal.all_units or in_unit_scope(actor.principal,row.get('unit_id'))

@router.get('/employees')
def employees(actor:Actor=Depends(authenticate)):
 require(actor)
 with tx() as conn:
  rows=conn.execute('SELECT id,full_name,unit_id FROM employees WHERE deleted_at IS NULL ORDER BY full_name LIMIT 3000').fetchall()
 return {'items':[dict(r) for r in rows if visible(actor,r)]}

@router.get('/skills')
def list_skills(actor:Actor=Depends(authenticate)):
 require(actor)
 with tx() as conn:
  rows=conn.execute('SELECT s.*,e.unit_id,e.full_name FROM hr_skill_assessments s JOIN employees e ON e.id=s.employee_id WHERE e.deleted_at IS NULL ORDER BY s.id DESC LIMIT 3000').fetchall()
 return {'items':[dict(r) for r in rows if visible(actor,r)]}

@router.post('/skills',status_code=201)
def create_skill(body:Skill,actor:Actor=Depends(authenticate)):
 require(actor,True)
 with tx() as conn:
  employee_check(conn,body.employee_id,actor)
  d=body.model_dump(mode='json');fields=list(d)
  if conn.execute('SELECT id FROM hr_skill_assessments WHERE employee_id=%s AND skill_name=%s',(body.employee_id,body.skill_name)).fetchone():raise conflict()
  row=conn.execute('INSERT INTO hr_skill_assessments ('+','.join(fields)+',created_by,updated_by) VALUES ('+','.join(['%s']*(len(fields)+2))+') RETURNING *',(*[d[f] for f in fields],actor.user_id,actor.user_id)).fetchone()
  audit(conn,'skill',row,actor,'create')
 return {'item':dict(row)}

@router.put('/skills/{sid}')
def update_skill(sid:int,body:ChangeSkill,actor:Actor=Depends(authenticate)):
 require(actor,True)
 with tx() as conn:
  old=conn.execute('SELECT * FROM hr_skill_assessments WHERE id=%s FOR UPDATE',(sid,)).fetchone()
  if not old:raise not_found()
  employee_check(conn,old['employee_id'],actor)
  employee_check(conn,body.employee_id,actor)
  if old['version']!=body.expected_version:raise conflict()
  d=body.model_dump(mode='json',exclude={'expected_version'});fields=list(d)
  row=conn.execute('UPDATE hr_skill_assessments SET '+','.join(f+'=%s' for f in fields)+',version=version+1,updated_by=%s,updated_at=NOW() WHERE id=%s RETURNING *',(*[d[f] for f in fields],actor.user_id,sid)).fetchone()
  audit(conn,'skill',row,actor,'edit',old)
 return {'item':dict(row)}

@router.get('/actions')
def list_actions(actor:Actor=Depends(authenticate)):
 require(actor)
 with tx() as conn:
  rows=conn.execute('SELECT a.*,e.unit_id,e.full_name FROM hr_followup_actions a LEFT JOIN employees e ON e.id=a.employee_id ORDER BY a.id DESC LIMIT 3000').fetchall()
 return {'items':[dict(r) for r in rows if (r['employee_id'] is not None and visible(actor,r)) or (r['employee_id'] is None and actor.principal.all_units)]}

@router.post('/actions',status_code=201)
def create_action(body:Action,actor:Actor=Depends(authenticate)):
 require(actor,True)
 with tx() as conn:
  if body.employee_id:employee_check(conn,body.employee_id,actor)
  elif not actor.principal.all_units:raise forbidden(details={'reason':'GLOBAL_ACTION_NEEDS_ALL_UNITS'})
  d=body.model_dump(mode='json');fields=list(d)
  row=conn.execute('INSERT INTO hr_followup_actions ('+','.join(fields)+',created_by,updated_by) VALUES ('+','.join(['%s']*(len(fields)+2))+') RETURNING *',(*[d[f] for f in fields],actor.user_id,actor.user_id)).fetchone()
  audit(conn,'action',row,actor,'create')
 return {'item':dict(row)}

@router.put('/actions/{aid}')
def update_action(aid:int,body:ChangeAction,actor:Actor=Depends(authenticate)):
 require(actor,True)
 with tx() as conn:
  old=conn.execute('SELECT * FROM hr_followup_actions WHERE id=%s FOR UPDATE',(aid,)).fetchone()
  if not old:raise not_found()
  if old['employee_id']:employee_check(conn,old['employee_id'],actor)
  elif not actor.principal.all_units:raise forbidden()
  if body.employee_id:employee_check(conn,body.employee_id,actor)
  elif not actor.principal.all_units:raise forbidden()
  if old['version']!=body.expected_version:raise conflict()
  d=body.model_dump(mode='json',exclude={'expected_version'});fields=list(d)
  row=conn.execute('UPDATE hr_followup_actions SET '+','.join(f+'=%s' for f in fields)+',version=version+1,updated_by=%s,updated_at=NOW() WHERE id=%s RETURNING *',(*[d[f] for f in fields],actor.user_id,aid)).fetchone()
  audit(conn,'action',row,actor,'edit',old)
 return {'item':dict(row)}
