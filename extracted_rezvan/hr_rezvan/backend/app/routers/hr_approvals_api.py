"""Auditable HR decision requests. APPROVAL IS NOT CONTRACT ISSUANCE OR PAYROLL MUTATION."""
from datetime import date
import json
from typing import Literal
from fastapi import APIRouter,Depends
from pydantic import BaseModel,Field
from psycopg.types.json import Jsonb
from ..deps import authenticate
from ..services.sync import Actor
from ..core.policy import has_permission,in_unit_scope
from ..db import tx
from ..errors import forbidden,not_found,conflict
from .hr_development_api import employee_check

router=APIRouter(prefix='/api/hr-approvals',tags=['HR approvals'])

class ProbationReview(BaseModel):
 employee_id:str=Field(min_length=1,max_length=120)
 evaluation_date:date
 outcome:Literal['continue','reject','needs_review']
 skill_assessment_id:int|None=None
 notes:str=Field(min_length=10,max_length=1500)

class AllowanceProposal(BaseModel):
 employee_id:str=Field(min_length=1,max_length=120)
 skill_assessment_id:int
 training_action_id:int|None=None
 proposed_amount_toman:int=Field(ge=0)
 effective_date:date
 justification:str=Field(min_length=10,max_length=1500)

class ReviewDecision(BaseModel):
 decision:Literal['approved','rejected']
 note:str=Field(min_length=5,max_length=1000)
 expected_version:int=Field(ge=1)

def require(actor,permission):
 if not has_permission(actor.principal,permission):raise forbidden(details={'permission':permission})

def verify_skill(conn,employee_id,skill_id):
 row=conn.execute('SELECT id,employee_id,skill_level,evidence,training_needed FROM hr_skill_assessments WHERE id=%s',(skill_id,)).fetchone()
 if not row or row['employee_id']!=employee_id:raise not_found()
 return row

def audit(conn,entity,row,operation,actor):
 # The financial snapshots are kept in a protected table. Do not expose them via generic HR actions.
 conn.execute('INSERT INTO hr_approval_events(entity,entity_id,operation,actor_id,snapshot) VALUES(%s,%s,%s,%s,%s)',(entity,row['id'],operation,actor.user_id,Jsonb(json.loads(json.dumps(dict(row),default=str)))))

def filtered(actor,rows):
 return [dict(r) for r in rows if in_unit_scope(actor.principal,r['unit_id'])]

@router.get('/probations')
def probations(actor:Actor=Depends(authenticate)):
 require(actor,'view_personnel')
 with tx() as conn:
  rows=conn.execute('SELECT p.*,e.unit_id,e.full_name FROM hr_probation_reviews p JOIN employees e ON e.id=p.employee_id WHERE e.deleted_at IS NULL ORDER BY p.id DESC LIMIT 2000').fetchall()
 return {'items':filtered(actor,rows)}

@router.post('/probations',status_code=201)
def propose_probation(body:ProbationReview,actor:Actor=Depends(authenticate)):
 require(actor,'write_records')
 with tx() as conn:
  employee_check(conn,body.employee_id,actor)
  if body.skill_assessment_id:verify_skill(conn,body.employee_id,body.skill_assessment_id)
  row=conn.execute('INSERT INTO hr_probation_reviews(employee_id,evaluation_date,outcome,skill_assessment_id,notes,submitted_by) VALUES(%s,%s,%s,%s,%s,%s) RETURNING *',(body.employee_id,body.evaluation_date,body.outcome,body.skill_assessment_id,body.notes,actor.user_id)).fetchone()
  audit(conn,'probation',row,'submit',actor)
 return {'item':dict(row)}

@router.post('/probations/{rid}/decision')
def decide_probation(rid:int,body:ReviewDecision,actor:Actor=Depends(authenticate)):
 require(actor,'approve_records')
 with tx() as conn:
  row=conn.execute('SELECT * FROM hr_probation_reviews WHERE id=%s FOR UPDATE',(rid,)).fetchone()
  if not row:raise not_found()
  employee_check(conn,row['employee_id'],actor)
  if row['submitted_by']==actor.user_id:raise forbidden(details={'reason':'SELF_APPROVAL_NOT_ALLOWED'})
  if row['status']!='pending' or row['version']!=body.expected_version:raise conflict()
  updated=conn.execute('UPDATE hr_probation_reviews SET status=%s,reviewer_note=%s,reviewed_by=%s,reviewed_at=NOW(),version=version+1 WHERE id=%s RETURNING *',(body.decision,body.note,actor.user_id,rid)).fetchone()
  audit(conn,'probation',updated,body.decision,actor)
 return {'item':dict(updated),'notice':'تأیید ارزیابی صرفاً ثبت تصمیم داخلی است؛ قرارداد جدید به‌صورت خودکار صادر نمی‌شود.'}

@router.get('/allowances')
def allowances(actor:Actor=Depends(authenticate)):
 require(actor,'view_salary')
 with tx() as conn:
  rows=conn.execute('SELECT p.*,e.unit_id,e.full_name FROM hr_technical_allowance_proposals p JOIN employees e ON e.id=p.employee_id WHERE e.deleted_at IS NULL ORDER BY p.id DESC LIMIT 2000').fetchall()
 return {'items':filtered(actor,rows)}

@router.post('/allowances',status_code=201)
def propose_allowance(body:AllowanceProposal,actor:Actor=Depends(authenticate)):
 require(actor,'view_salary');require(actor,'write_records')
 with tx() as conn:
  employee_check(conn,body.employee_id,actor)
  skill=verify_skill(conn,body.employee_id,body.skill_assessment_id)
  if skill['skill_level']<2 or not (skill['evidence'] or '').strip():raise conflict(details={'reason':'EVIDENCED_SKILL_REQUIRED'})
  if body.training_action_id:
   action=conn.execute('SELECT employee_id,category,status FROM hr_followup_actions WHERE id=%s',(body.training_action_id,)).fetchone()
   if not action or action['employee_id']!=body.employee_id or action['category']!='training' or action['status']!='done':raise conflict(details={'reason':'COMPLETED_TRAINING_REQUIRED'})
  row=conn.execute('INSERT INTO hr_technical_allowance_proposals(employee_id,skill_assessment_id,training_action_id,proposed_amount_toman,effective_date,justification,submitted_by) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING *',(body.employee_id,body.skill_assessment_id,body.training_action_id,body.proposed_amount_toman,body.effective_date,body.justification,actor.user_id)).fetchone()
  audit(conn,'allowance',row,'submit',actor)
 return {'item':dict(row)}

@router.post('/allowances/{rid}/decision')
def decide_allowance(rid:int,body:ReviewDecision,actor:Actor=Depends(authenticate)):
 require(actor,'approve_payroll');require(actor,'view_salary')
 with tx() as conn:
  row=conn.execute('SELECT * FROM hr_technical_allowance_proposals WHERE id=%s FOR UPDATE',(rid,)).fetchone()
  if not row:raise not_found()
  employee_check(conn,row['employee_id'],actor)
  if row['submitted_by']==actor.user_id:raise forbidden(details={'reason':'SELF_APPROVAL_NOT_ALLOWED'})
  if row['status']!='pending' or row['version']!=body.expected_version:raise conflict()
  updated=conn.execute('UPDATE hr_technical_allowance_proposals SET status=%s,reviewer_note=%s,reviewed_by=%s,reviewed_at=NOW(),version=version+1 WHERE id=%s RETURNING *',(body.decision,body.note,actor.user_id,rid)).fetchone()
  audit(conn,'allowance',updated,body.decision,actor)
 return {'item':dict(updated),'notice':'تصویب پیشنهاد حق فنی، داده حقوق یا قرارداد را تغییر نمی‌دهد؛ اعمال نهایی نیازمند عملیات مستقل کارگزینی و کنترل حقوق است.'}
