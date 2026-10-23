"""Order-by-order bakery oven tracking, no manufacturing-line assumptions.
Read requires view_reports; create/edit requires write_records. Existing PostgreSQL
must be upgraded by the administrator using `python -m app.cli init-db` first.
"""
from datetime import date
import json
from psycopg.types.json import Jsonb
from typing import Optional, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, ConfigDict, model_validator
from ..db import tx
from ..deps import authenticate
from ..core.policy import has_permission
from ..errors import forbidden, not_found, conflict
from ..services.sync import Actor
from .common import log_event

router = APIRouter(prefix="/api/oven-orders", tags=["oven tracking"])

Model = Literal['تنور سنگک متحرک بزرگ','تنور سنگک متحرک متوسط','تنور سنگک متحرک کوچک','تنور سنگک متحرک مینی','تنور سنگک ثابت آپشنال','لارج']
Forge = Literal['pending','working','ready','accepted','correction']
Masonry = Literal['pending','working','finished','correction']

class Fields(BaseModel):
    model_config = ConfigDict(extra='forbid')
    customer_name: str = Field(min_length=1,max_length=150)
    oven_model: Model
    facade_name: str = Field(min_length=1,max_length=150)
    forge_team: Optional[int] = Field(default=None,ge=1,le=2)
    masonry_team: Optional[int] = Field(default=None,ge=1,le=3)
    forge_status: Forge = 'pending'
    masonry_status: Masonry = 'pending'
    brickwork: bool = False
    cementwork: bool = False
    insulation: bool = False
    facade_done: bool = False
    forge_start: Optional[date] = None
    forge_finish: Optional[date] = None
    handed_over: Optional[date] = None
    masonry_start: Optional[date] = None
    masonry_finish: Optional[date] = None
    quality_note: str = Field(default='',max_length=1500)
    notes: str = Field(default='',max_length=1500)

    @model_validator(mode='after')
    def dates_and_progress(self):
        for first,last in ((self.forge_start,self.forge_finish),(self.forge_finish,self.handed_over),
                           (self.handed_over,self.masonry_start),(self.masonry_start,self.masonry_finish)):
            if first and last and last < first:
                raise ValueError('ترتیب تاریخ‌های ساخت و تحویل صحیح نیست')
        if self.forge_status in ('ready','accepted') and not self.forge_team:
            raise ValueError('تیم آهنگری سازنده الزامی است')
        if self.masonry_status != 'pending' and not self.masonry_team:
            raise ValueError('تیم بنایی الزامی است')
        if self.masonry_status == 'finished' and not all((self.brickwork,self.cementwork,self.insulation,self.facade_done)):
            raise ValueError('برای اتمام بنایی، همه مراحل اصلی را تأیید کنید')
        return self

class Update(Fields):
    expected_version: int = Field(ge=1)


def allowed(actor, write=False):
    perm='write_records' if write else 'view_reports'
    if not has_permission(actor.principal,perm):
        raise forbidden(details={'permission':perm})


@router.get('')
def list_ovens(actor:Actor=Depends(authenticate)):
    allowed(actor)
    with tx() as conn:
        orders=conn.execute('SELECT * FROM oven_orders ORDER BY id DESC LIMIT 2000').fetchall()
    return {'items':[dict(x) for x in orders]}


@router.post('',status_code=201)
def add_oven(body:Fields,actor:Actor=Depends(authenticate)):
    allowed(actor,True)
    d=body.model_dump(mode='json')
    cols=list(d)
    with tx() as conn:
        vals=[d[k] for k in cols]
        row=conn.execute('INSERT INTO oven_orders ('+','.join(cols)+',created_by,updated_by) VALUES ('+
                         ','.join(['%s']*(len(cols)+2))+') RETURNING *',(*vals,actor.user_id,actor.user_id)).fetchone()
        conn.execute('INSERT INTO oven_order_events(oven_id,changed_by,current) VALUES (%s,%s,%s)',
                     (row['id'],actor.user_id,Jsonb(json.loads(json.dumps(dict(row),default=str)))))
        log_event(conn,'create','oven_orders','ثبت سفارش تنور '+str(row['id']),actor=actor)
    return {'item':dict(row)}


@router.put('/{oid}')
def update_oven(oid:int,body:Update,actor:Actor=Depends(authenticate)):
    allowed(actor,True)
    data=body.model_dump(mode='json',exclude={'expected_version'})
    cols=list(data)
    with tx() as conn:
        old=conn.execute('SELECT * FROM oven_orders WHERE id=%s FOR UPDATE',(oid,)).fetchone()
        if not old:raise not_found()
        if old['version']!=body.expected_version:raise conflict()
        changes=','.join(k+'=%s' for k in cols)
        row=conn.execute('UPDATE oven_orders SET '+changes+',version=version+1,updated_at=now(),updated_by=%s WHERE id=%s RETURNING *',
                         (*[data[k] for k in cols],actor.user_id,oid)).fetchone()
        conn.execute('INSERT INTO oven_order_events(oven_id,changed_by,previous,current) VALUES (%s,%s,%s,%s)',
                     (oid,actor.user_id,Jsonb(json.loads(json.dumps(dict(old),default=str))),Jsonb(json.loads(json.dumps(dict(row),default=str)))))
        log_event(conn,'edit','oven_orders','ویرایش سفارش تنور '+str(oid),actor=actor)
    return {'item':dict(row)}


@router.get('/{oid}/history')
def oven_history(oid:int,actor:Actor=Depends(authenticate)):
    allowed(actor)
    with tx() as conn:
        rows=conn.execute('SELECT changed_at,changed_by,previous,current FROM oven_order_events WHERE oven_id=%s ORDER BY id DESC LIMIT 100',(oid,)).fetchall()
    return {'items':[dict(x) for x in rows]}
