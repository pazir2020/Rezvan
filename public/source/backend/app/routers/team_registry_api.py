"""Historical team roster, supervisor scope, and editable KPI weights.

Writes require HR/administrative permissions; salary data is never exposed here.
Assignments are append-only; closing an assignment preserves its history.
"""
from datetime import date
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from psycopg.types.json import Jsonb
from ..deps import authenticate
from ..db import tx
from ..services.sync import Actor
from ..core.policy import has_permission, in_unit_scope
from ..core.team_registry import DEFAULT_WEIGHTS, team_assignment_issues
from ..errors import forbidden, not_found, conflict
from .common import log_event

router = APIRouter(prefix='/api/team-registry', tags=['team registry'])
Kind = Literal['forge', 'masonry']

def require(actor, perm):
    if not has_permission(actor.principal, perm):
        raise forbidden(details={'permission':perm})

def valid_team(kind, number):
    if (kind == 'forge' and number not in (1,2)) or (kind == 'masonry' and number not in (1,2,3)):
        raise HTTPException(422, 'شماره تیم معتبر نیست')

def full_scope(actor):
    require(actor,'edit_settings')

class MemberAssignment(BaseModel):
    employee_id: str = Field(min_length=1, max_length=120)
    team_kind: Kind
    team_number: int = Field(ge=1, le=3)
    valid_from: date
    valid_to: date | None = None
    note: str = Field(min_length=5, max_length=500)
    @model_validator(mode='after')
    def date_ok(self):
        valid_team(self.team_kind,self.team_number)
        if self.valid_to and self.valid_to < self.valid_from:raise ValueError('پایان قبل از شروع است')
        return self

class CloseAssignment(BaseModel):
    end_date: date
    note: str = Field(min_length=8, max_length=500)

class TeamSupervisor(BaseModel):
    user_id: str = Field(min_length=1,max_length=120)
    team_kind: Kind
    team_number: int = Field(ge=1,le=3)
    valid_from: date
    valid_to: date | None = None
    note: str = Field(min_length=5,max_length=500)
    @model_validator(mode='after')
    def valid(self):
        valid_team(self.team_kind,self.team_number)
        if self.valid_to and self.valid_to < self.valid_from:raise ValueError('تاریخ پایان نامعتبر است')
        return self

class WeightProfile(BaseModel):
    team_kind: Kind
    weights: list[int] = Field(min_length=5,max_length=5)
    expected_version: int = Field(ge=0)
    note: str = Field(min_length=8,max_length=500)
    @model_validator(mode='after')
    def checked(self):
        if any(type(w) is not int or not 0<=w<=100 for w in self.weights) or sum(self.weights)!=100:
            raise ValueError('پنج وزن باید عدد صحیح و مجموعاً ۱۰۰ باشند')
        return self

@router.get('/settings')
def settings(actor:Actor=Depends(authenticate)):
    require(actor,'view_personnel')
    with tx() as conn:
        rows=conn.execute('SELECT team_kind,weights,version FROM hr_team_kpi_weights').fetchall()
    d={r['team_kind']:{'weights':r['weights'],'version':r['version']} for r in rows}
    for kind in ('forge','masonry'):d.setdefault(kind,{'weights':list(DEFAULT_WEIGHTS),'version':0})
    return {'profiles':d, 'editable':has_permission(actor.principal,'edit_settings'), 'weights_change_only_future_periods':True}

@router.put('/settings')
def update_settings(body:WeightProfile,actor:Actor=Depends(authenticate)):
    full_scope(actor)
    with tx() as conn:
        current=conn.execute('SELECT weights,version FROM hr_team_kpi_weights WHERE team_kind=%s FOR UPDATE',(body.team_kind,)).fetchone()
        v=current['version'] if current else 0
        if v!=body.expected_version:raise conflict()
        row=conn.execute('''INSERT INTO hr_team_kpi_weights(team_kind,weights,version,updated_by,note) VALUES(%s,%s,1,%s,%s)
            ON CONFLICT (team_kind) DO UPDATE SET weights=EXCLUDED.weights, version=hr_team_kpi_weights.version+1,
            updated_by=EXCLUDED.updated_by,updated_at=NOW(),note=EXCLUDED.note RETURNING *''',
            (body.team_kind,Jsonb(body.weights),actor.user_id,body.note)).fetchone()
        conn.execute('''INSERT INTO hr_team_registry_events(action,entity_id,actor_id,detail) VALUES(%s,%s,%s,%s)''',
                     ('weights_update',body.team_kind,actor.user_id,Jsonb({'before':current['weights'] if current else list(DEFAULT_WEIGHTS),'after':body.weights,'reason':body.note})))
        log_event(conn,'update','hr_team_kpi_weights','تغییر وزن KPI فقط برای دوره‌های آینده',actor=actor)
    return {'profile':{'team_kind':body.team_kind,'weights':row['weights'],'version':row['version']}}

@router.get('/memberships')
def list_memberships(actor:Actor=Depends(authenticate)):
    require(actor,'view_personnel')
    with tx() as conn:
        rows=conn.execute('''SELECT m.*,e.full_name,e.unit_id FROM hr_team_memberships m
            JOIN employees e ON e.id=m.employee_id WHERE e.deleted_at IS NULL ORDER BY m.valid_from DESC,m.id DESC LIMIT 1000''').fetchall()
    return {'items':[dict(r) for r in rows if in_unit_scope(actor.principal,r['unit_id'])],
            'editable':has_permission(actor.principal,'edit_settings')}

@router.post('/memberships', status_code=201)
def create_member(body:MemberAssignment,actor:Actor=Depends(authenticate)):
    full_scope(actor)
    with tx() as conn:
        person=conn.execute('SELECT id,unit_id FROM employees WHERE id=%s AND deleted_at IS NULL',(body.employee_id,)).fetchone()
        if not person:raise not_found()
        if not in_unit_scope(actor.principal,person['unit_id']):raise forbidden(details={'reason':'OUT_OF_UNIT_SCOPE'})
        conn.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',(body.employee_id,))
        other=conn.execute('''SELECT id FROM hr_team_memberships WHERE employee_id=%s
          AND valid_from<=COALESCE(%s::date,'infinity'::date)
          AND COALESCE(valid_to,'infinity'::date)>=%s::date LIMIT 1''',
          (body.employee_id,body.valid_to,body.valid_from)).fetchone()
        if other:raise HTTPException(409,'تداخل تاریخی عضویت: ابتدا دوره قبلی را پایان دهید')
        row=conn.execute('''INSERT INTO hr_team_memberships(employee_id,team_kind,team_number,valid_from,valid_to,note,assigned_by)
          VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING *''',
          (body.employee_id,body.team_kind,body.team_number,body.valid_from,body.valid_to,body.note,actor.user_id)).fetchone()
        conn.execute('INSERT INTO hr_team_registry_events(action,entity_id,actor_id,detail) VALUES(%s,%s,%s,%s)',
                     ('member_add',str(row['id']),actor.user_id,Jsonb(dict(body.model_dump(mode='json')))))
        log_event(conn,'create','hr_team_membership','ثبت عضویت تاریخی تیم تولید',actor=actor)
    return {'item':dict(row)}

@router.post('/memberships/{mid}/close')
def close_member(mid:int,body:CloseAssignment,actor:Actor=Depends(authenticate)):
    full_scope(actor)
    with tx() as conn:
        row=conn.execute('''SELECT m.*,e.unit_id FROM hr_team_memberships m JOIN employees e ON e.id=m.employee_id WHERE m.id=%s FOR UPDATE''',(mid,)).fetchone()
        if not row:raise not_found()
        if not in_unit_scope(actor.principal,row['unit_id']):raise forbidden()
        if body.end_date < row['valid_from'] or (row['valid_to'] is not None and body.end_date > row['valid_to']):
            raise HTTPException(409,'تاریخ پایان نامعتبر است؛ برای اصلاح تاریخی نیاز به فرایند رسمی دارید')
        updated=conn.execute('UPDATE hr_team_memberships SET valid_to=%s WHERE id=%s RETURNING *',(body.end_date,mid)).fetchone()
        conn.execute('INSERT INTO hr_team_registry_events(action,entity_id,actor_id,detail) VALUES(%s,%s,%s,%s)',
                     ('member_close',str(mid),actor.user_id,Jsonb({'previous_end':str(row['valid_to']),'new_end':str(body.end_date),'note':body.note})))
        log_event(conn,'update','hr_team_membership','تاریخ پایان عضویت تاریخی تیم',actor=actor)
    return {'item':dict(updated)}

@router.get('/supervisors')
def supervisors(actor:Actor=Depends(authenticate)):
    require(actor,'view_personnel')
    with tx() as conn:
        rows=conn.execute('SELECT user_id,team_kind,team_number,valid_from,valid_to FROM hr_team_supervisors ORDER BY team_kind,team_number,valid_from DESC').fetchall()
    if has_permission(actor.principal,'manage_users'):
        return {'items':[dict(r) for r in rows], 'editable':True}
    return {'items':[dict(r) for r in rows if r['user_id']==actor.user_id], 'editable':False}

@router.post('/supervisors',status_code=201)
def set_supervisor(body:TeamSupervisor,actor:Actor=Depends(authenticate)):
    require(actor,'manage_users')
    with tx() as conn:
        u=conn.execute('SELECT id FROM users WHERE id=%s AND active=TRUE AND is_system=FALSE',(body.user_id,)).fetchone()
        if not u:raise not_found()
        row=conn.execute('''INSERT INTO hr_team_supervisors(user_id,team_kind,team_number,valid_from,valid_to,assigned_by,note)
        VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING *''',(body.user_id,body.team_kind,body.team_number,body.valid_from,body.valid_to,actor.user_id,body.note)).fetchone()
        conn.execute('INSERT INTO hr_team_registry_events(action,entity_id,actor_id,detail) VALUES(%s,%s,%s,%s)',
                     ('supervisor_add',str(row['id']),actor.user_id,Jsonb(body.model_dump(mode='json'))))
        log_event(conn,'create','hr_team_supervisor','تخصیص مسئول ارزیابی تیم',actor=actor)
    return {'item':dict(row)}
