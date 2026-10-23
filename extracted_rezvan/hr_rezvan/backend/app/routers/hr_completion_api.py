"""HR completion controls, independently approved payroll review and payslip PDF archive.

No automatic wages/tax changes. The real PDF archive uses explicit user upload,
secure employee-scoped storage and SHA-256 integrity metadata.
"""
from datetime import date
import hashlib
import os
import secrets
from uuid import uuid4
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator
from psycopg.types.json import Jsonb
from ..deps import authenticate
from ..db import tx
from .. import config
from .documents_api import full_path, safe_name
from ..services.sync import Actor
from ..errors import forbidden, not_found, conflict
from ..core.policy import has_permission, in_unit_scope
from ..core.hr_completion_rules import (
    PAYROLL_CHECKS, valid_jalali_month, evidence_quality,
    contract_month_status, repeated_membership,
)
from ..core.team_registry import period_span
from ..core.payroll_review_gate import payroll_source_fingerprint
from ..core.payslip_archive import store_payslip_pdf
from .common import log_event

router = APIRouter(prefix='/api/hr-completion', tags=['HR completion'])


def require(actor, *perms):
    for perm in perms:
        if not has_permission(actor.principal, perm):
            raise forbidden(details={'permission':perm})


def emp(conn, eid, actor):
    row=conn.execute('SELECT id,full_name,unit_id FROM employees WHERE id=%s AND deleted_at IS NULL',(eid,)).fetchone()
    if not row:raise not_found()
    if not in_unit_scope(actor.principal,row['unit_id']):
        raise forbidden(details={'reason':'OUT_OF_UNIT_SCOPE'})
    return row


def event(conn, category, eid, action, actor, detail):
    conn.execute('''INSERT INTO hr_completion_events(category,entity_id,action,actor_id,detail)
                    VALUES(%s,%s,%s,%s,%s)''',
                 (category,str(eid),action,actor.user_id,Jsonb(detail)))
    log_event(conn,action,'hr_completion',f'{category}: {action}',actor=actor)


def fingerprint(conn, month):
    return payroll_source_fingerprint(conn, month)


# ------------ human-verified payroll readiness (separate from actual lock) ------------
class Packet(BaseModel):
    month: str
    checklist: dict[str,bool]
    evidence_refs: dict[str,str]
    note: str = Field(min_length=10,max_length=1200)
    expected_version: int = Field(default=0,ge=0)
    @model_validator(mode='after')
    def checked(self):
        valid_jalali_month(self.month)
        if set(self.checklist)-set(PAYROLL_CHECKS) or set(self.evidence_refs)-set(PAYROLL_CHECKS):
            raise ValueError('نام بند کنترل ناشناخته است')
        if any(not isinstance(v,bool) for v in self.checklist.values()):
            raise ValueError('گزینه‌های کنترل باید صحیح یا غلط باشند')
        if any(not isinstance(v,str) or len(v)>300 for v in self.evidence_refs.values()):
            raise ValueError('ارجاع مستند نامعتبر یا بلند است')
        return self

class PacketDecision(BaseModel):
    decision:Literal['approved','rejected']
    expected_version:int=Field(ge=1)
    note:str=Field(min_length=10,max_length=1200)

@router.get('/payroll/review')
def payroll_readiness(month:str,actor:Actor=Depends(authenticate)):
    require(actor,'view_salary')
    if not actor.principal.all_units:raise forbidden(details={'reason':'GLOBAL_PAYROLL_REQUIRES_ALL_UNITS'})
    valid_jalali_month(month)
    with tx() as conn:
        row=conn.execute('SELECT * FROM hr_payroll_review_packets WHERE month=%s',(month,)).fetchone()
        h,count=fingerprint(conn,month)
    return {'item':dict(row) if row else None,'check_names':list(PAYROLL_CHECKS),
            'source_items_count':count,'source_changed':bool(row and row['source_fingerprint']!=h),
            'notice':'بررسی انسانی با مستندات؛ جایگزین تطبیق رسمی بیمه، مالیات، بانک یا قفل حقوق نیست.'}

@router.post('/payroll/review')
def prepare_packet(body:Packet,actor:Actor=Depends(authenticate)):
    require(actor,'view_salary','write_records')
    if not actor.principal.all_units:raise forbidden(details={'reason':'GLOBAL_PAYROLL_REQUIRES_ALL_UNITS'})
    with tx() as conn:
        old=conn.execute('SELECT * FROM hr_payroll_review_packets WHERE month=%s FOR UPDATE',(body.month,)).fetchone()
        if (old['version'] if old else 0)!=body.expected_version:raise conflict()
        if old and old['status']=='approved':raise HTTPException(409,'برای اصلاح گزارش تأییدشده به گردش اصلاح رسمی نیاز است')
        h,_=fingerprint(conn,body.month)
        row=conn.execute('''INSERT INTO hr_payroll_review_packets(month,checklist,evidence_refs,note,source_fingerprint,prepared_by)
            VALUES(%s,%s,%s,%s,%s,%s)
            ON CONFLICT(month) DO UPDATE SET checklist=EXCLUDED.checklist,evidence_refs=EXCLUDED.evidence_refs,
            note=EXCLUDED.note,source_fingerprint=EXCLUDED.source_fingerprint,prepared_by=EXCLUDED.prepared_by,
            prepared_at=NOW(),status='draft',version=hr_payroll_review_packets.version+1,
            reviewed_by=NULL,reviewed_at=NULL,review_note=NULL RETURNING *''',
            (body.month,Jsonb(body.checklist),Jsonb(body.evidence_refs),body.note,h,actor.user_id)).fetchone()
        event(conn,'payroll_packet',body.month,'prepare',actor,{'version':row['version']})
    return {'item':dict(row),'notice':'کنترل ثبت شد، اما فیش، حقوق یا ماه بسته نشده است.'}

@router.post('/payroll/review/{month}/decision')
def decide_packet(month:str,body:PacketDecision,actor:Actor=Depends(authenticate)):
    require(actor,'view_salary','approve_payroll')
    if not actor.principal.all_units:raise forbidden(details={'reason':'GLOBAL_PAYROLL_REQUIRES_ALL_UNITS'})
    valid_jalali_month(month)
    with tx() as conn:
        row=conn.execute('SELECT * FROM hr_payroll_review_packets WHERE month=%s FOR UPDATE',(month,)).fetchone()
        if not row:raise not_found()
        if row['status']!='draft' or row['version']!=body.expected_version:raise conflict()
        if row['prepared_by']==actor.user_id:raise forbidden(details={'reason':'SELF_APPROVAL_NOT_ALLOWED'})
        if body.decision=='approved':
            good,missing=evidence_quality(row['checklist'],row['evidence_refs'])
            h,n=fingerprint(conn,month)
            if not good:raise HTTPException(409,{'reason':'INCOMPLETE_CHECKS','missing':missing})
            if h!=row['source_fingerprint']:raise HTTPException(409,'اطلاعات حقوق پس از تهیه گزارش تغییر کرده است؛ بررسی را تکرار کنید')
            if n==0:raise HTTPException(409,'هیچ سندی از این ماه در سرور وجود ندارد؛ تأیید ممکن نیست')
        updated=conn.execute('''UPDATE hr_payroll_review_packets SET status=%s,reviewed_by=%s,
          reviewed_at=NOW(),review_note=%s,version=version+1 WHERE month=%s RETURNING *''',
          (body.decision,actor.user_id,body.note,month)).fetchone()
        event(conn,'payroll_packet',month,body.decision,actor,{'version':updated['version']})
    return {'item':dict(updated),'notice':'این تصمیم تأیید چک‌لیست است؛ فیش صادر یا حقوق قفل نشده است.'}


class ReopenApprovedPacket(BaseModel):
    expected_version:int=Field(ge=1)
    reason:str=Field(min_length=12,max_length=1200)


@router.post('/payroll/review/{month}/reopen')
def reopen_approved_packet(month:str,body:ReopenApprovedPacket,actor:Actor=Depends(authenticate)):
    # Explicit audited recovery when records or digest logic invalidate a review.
    require(actor,'view_salary','approve_payroll')
    if not actor.principal.all_units:raise forbidden(details={'reason':'GLOBAL_PAYROLL_REQUIRES_ALL_UNITS'})
    valid_jalali_month(month)
    with tx() as conn:
        row=conn.execute('SELECT * FROM hr_payroll_review_packets WHERE month=%s FOR UPDATE',(month,)).fetchone()
        if not row:raise not_found()
        if row['version']!=body.expected_version or row['status']!='approved':raise conflict()
        digest,_=fingerprint(conn,month)
        if digest==row['source_fingerprint']:
            raise HTTPException(409,'کنترل تأییدشده هنوز معتبر است؛ بازگشایی بی‌دلیل مجاز نیست')
        updated=conn.execute('''UPDATE hr_payroll_review_packets SET
            status='draft',checklist='{}'::jsonb,evidence_refs='{}'::jsonb,
            source_fingerprint=%s,prepared_by=%s,prepared_at=NOW(),
            reviewed_by=NULL,reviewed_at=NULL,review_note=NULL,
            note=%s,version=version+1 WHERE month=%s RETURNING *''',
            (digest,actor.user_id,'بازگشایی برای بازبینی اجباری: '+body.reason,month)).fetchone()
        event(conn,'payroll_packet',month,'reopen_for_review',actor,
              {'version':updated['version'],'reason':body.reason,'old_fingerprint':row['source_fingerprint']})
    return {'item':dict(updated),'notice':'کنترل قبلی برای بازبینی مجدد باز شد؛ همه بندها و مدارک باید دوباره ثبت و مستقل تأیید شوند.'}


# ------------ payslip issuance references, never fake an archived PDF ------------
class IssueReference(BaseModel):
    month:str
    employee_id:str=Field(min_length=1,max_length=120)
    source_reference:str=Field(min_length=8,max_length=300)
    note:str=Field(min_length=8,max_length=900)
    @model_validator(mode='after')
    def checked(self):valid_jalali_month(self.month);return self

@router.get('/payslips')
def issued_references(month:str,actor:Actor=Depends(authenticate)):
    require(actor,'view_salary');valid_jalali_month(month)
    with tx() as conn:
        rows=conn.execute('''SELECT p.*,e.full_name,e.unit_id FROM hr_payslip_issue_register p
            JOIN employees e ON e.id=p.employee_id WHERE p.month=%s ORDER BY e.full_name''',(month,)).fetchall()
    return {'items':[{k:v for k,v in dict(x).items() if k!='unit_id'} for x in rows if in_unit_scope(actor.principal,x['unit_id'])],
            'archive_type':'issuance_reference_only',
            'notice':'مرجع صدور ثبت شده است؛ فایل PDF واقعی، در صورت بارگذاری مجاز، در بایگانی PDF جداگانه قابل دریافت است.'}

@router.post('/payslips',status_code=201)
def register_issue(body:IssueReference,actor:Actor=Depends(authenticate)):
    require(actor,'view_salary','approve_payroll')
    with tx() as conn:
        emp(conn,body.employee_id,actor)
        approved=conn.execute("SELECT source_fingerprint FROM hr_payroll_review_packets WHERE month=%s AND status='approved'",(body.month,)).fetchone()
        if not approved:
            raise HTTPException(409,'قبل از ثبت صدور، تأیید کنترل ماه حقوق الزامی است')
        current_fingerprint,_=fingerprint(conn,body.month)
        if current_fingerprint!=approved['source_fingerprint']:
            raise HTTPException(409,'اقلام حقوق بعد از تأیید کنترل تغییر کرده‌اند؛ بررسی و ثبت مجدد لازم است')
        if conn.execute('SELECT id FROM hr_payslip_issue_register WHERE month=%s AND employee_id=%s',(body.month,body.employee_id)).fetchone():
            raise conflict(details={'reason':'PAYSILP_REFERENCE_ALREADY_EXISTS'})
        row=conn.execute('''INSERT INTO hr_payslip_issue_register(month,employee_id,source_reference,note,issued_by)
            VALUES(%s,%s,%s,%s,%s) RETURNING *''',(body.month,body.employee_id,body.source_reference,body.note,actor.user_id)).fetchone()
        event(conn,'payslip_issuance',row['id'],'register',actor,{'month':body.month,'employee_id':body.employee_id})
    return {'item':dict(row),'notice':'فقط مشخصات صدور ثبت شد؛ PDF از طریق فرم اصلی فیش چاپ یا ذخیره می‌شود.'}


# ------------ actual immutable PDF archive (requires explicit upload) ------------


@router.post('/payslips/archive',status_code=201)
def archive_pdf(month: str=Form(...), employee_id: str=Form(...),
                confirmed_payslip: bool=Form(False), file: UploadFile=File(...),
                actor: Actor=Depends(authenticate)):
    require(actor,'view_salary','approve_payroll')
    valid_jalali_month(month)
    if not confirmed_payslip:
        raise HTTPException(422,'تأیید انتساب این فیش به کارمند و ماه مربوط الزامی است')
    if not (file.filename or '').lower().endswith('.pdf'):
        raise HTTPException(422,'تنها PDF قابل پذیرش است')
    rel = 'فیش-حقوقی/'+month+'/'+secrets.token_hex(18)+'.pdf'
    dest = full_path(rel)
    os.makedirs(os.path.dirname(dest),exist_ok=True)
    try:
        with tx() as conn:
            emp(conn,employee_id,actor)
            issue=conn.execute('SELECT id FROM hr_payslip_issue_register WHERE month=%s AND employee_id=%s FOR UPDATE',
                               (month,employee_id)).fetchone()
            if not issue:
                raise HTTPException(409,'ابتدا مرجع صدور فیش این کارمند و ماه را ثبت کنید')
            old=conn.execute('SELECT id FROM hr_payslip_pdf_archive WHERE issue_id=%s',(issue['id'],)).fetchone()
            if old:
                raise HTTPException(409,'PDF این فیش قبلاً بایگانی شده است و بدون گردش اصلاح نباید جایگزین شود')
            review=conn.execute("SELECT source_fingerprint FROM hr_payroll_review_packets WHERE month=%s AND status='approved'",(month,)).fetchone()
            digest,_=fingerprint(conn,month)
            if not review or review['source_fingerprint']!=digest:
                raise HTTPException(409,'پس از تغییر اقلام حقوق، کنترل مجدد ماه ضروری است')
            try:
                size,checksum=store_payslip_pdf(file.file,dest,min(config.MAX_UPLOAD_MB,25)*1024*1024)
            except ValueError as exc:
                raise HTTPException(422,str(exc)) from exc
            row=conn.execute('''INSERT INTO hr_payslip_pdf_archive
             (issue_id,month,employee_id,original_filename,stored_relative_path,size_bytes,sha256,archived_by,source_fingerprint)
             VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)
             RETURNING id,month,employee_id,original_filename,size_bytes,sha256,archived_at''',
             (issue['id'],month,employee_id,safe_name(file.filename),rel,size,checksum,actor.user_id,digest)).fetchone()
            event(conn,'payslip_archive',row['id'],'archive_pdf',actor,
                  {'month':month,'employee_id':employee_id,'sha256':checksum,'size_bytes':size})
        return {'item':dict(row),'notice':'نسخه PDF واقعی بایگانی شد؛ تأیید صحت مبالغ همچنان به مسئول مالی وابسته است.'}
    except Exception:
        if os.path.isfile(dest):
            os.remove(dest)
        raise
    finally:
        file.file.close()


@router.get('/payslips/archive')
def list_archived_pdfs(month: str,actor: Actor=Depends(authenticate)):
    require(actor,'view_salary');valid_jalali_month(month)
    with tx() as conn:
        rows=conn.execute('''SELECT a.id,a.month,a.employee_id,a.original_filename,a.size_bytes,
                    a.sha256,a.archived_at,e.full_name,e.unit_id
                    FROM hr_payslip_pdf_archive a JOIN employees e ON e.id=a.employee_id
                    WHERE a.month=%s ORDER BY e.full_name''',(month,)).fetchall()
    return {'items':[{k:v for k,v in dict(x).items() if k!='unit_id'}
                      for x in rows if in_unit_scope(actor.principal,x['unit_id'])],
            'archive_type':'pdf_bytes_on_server'}


@router.get('/payslips/archive/{archive_id}/download')
def download_archived_pdf(archive_id: int,actor: Actor=Depends(authenticate)):
    require(actor,'view_salary')
    with tx() as conn:
        r=conn.execute('''SELECT a.*,e.unit_id FROM hr_payslip_pdf_archive a
               JOIN employees e ON e.id=a.employee_id WHERE a.id=%s''',(archive_id,)).fetchone()
        if not r or not in_unit_scope(actor.principal,r['unit_id']):
            raise not_found()
    dest=full_path(r['stored_relative_path'])
    if not os.path.isfile(dest):
        raise HTTPException(404,'فایل PDF در مخزن سرور یافت نشد')
    # Integrity against accidental/corrupt replacement on disk.
    check=hashlib.sha256()
    with open(dest,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):
            check.update(chunk)
    if check.hexdigest()!=r['sha256']:
        raise HTTPException(409,'فایل ذخیره‌شده با امضای زمان بایگانی تطابق ندارد')
    with tx() as conn:
        event(conn,'payslip_archive',archive_id,'download_pdf',actor,
              {'month':r['month'],'employee_id':r['employee_id']})
    return FileResponse(dest,media_type='application/pdf',filename=r['original_filename'],
       content_disposition_type='attachment',headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})


# ------------ controlled create-from-approved-candidate (no legal contract/pay) ---
class OnboardCandidate(BaseModel):
    candidate_id:str=Field(min_length=1,max_length=120)
    employee_code:str=Field(min_length=2,max_length=32,pattern=r'^[\w\-]+$')
    unit_id:int=Field(ge=1)
    hire_date:date
    note:str=Field(min_length=12,max_length=1000)
    confirmed_by_hr:bool

APPROVED_STAGES={'approved','accepted','hired','selected','تأییدشده','تایید شده','پذیرفته‌شده','استخدام شده'}

def candidate_approved(stage):
    return str(stage or '').strip().casefold() in APPROVED_STAGES

@router.post('/hiring/create-employee',status_code=201)
def onboard(body:OnboardCandidate,actor:Actor=Depends(authenticate)):
    require(actor,'view_recruitment','write_recruitment','write_personnel','approve_records')
    if body.confirmed_by_hr is not True:
        raise HTTPException(422,'تأیید صریح تبدیل داوطلب به پرونده کارمند الزامی است')
    with tx() as conn:
        c=conn.execute("SELECT id,data FROM records WHERE collection='candidates' AND id=%s AND deleted_at IS NULL FOR UPDATE",(body.candidate_id,)).fetchone()
        if not c:raise not_found()
        if not candidate_approved(c['data'].get('stage')):
            raise HTTPException(409,'داوطلب باید ابتدا در فرآیند جذب به وضعیت تأییدشده منتقل شود')
        if conn.execute('SELECT id FROM hr_hiring_cases WHERE candidate_id=%s',(body.candidate_id,)).fetchone():
            raise HTTPException(409,'برای این داوطلب قبلاً پرونده استخدام ایجاد یا متصل شده است')
        name=str(c['data'].get('name') or '').strip()
        if len(name)<3 or len(name)>200:raise HTTPException(409,'نام کامل داوطلب معتبر نیست')
        unit=conn.execute('SELECT id,name FROM units WHERE id=%s',(body.unit_id,)).fetchone()
        if not unit:raise not_found()
        if not in_unit_scope(actor.principal,unit['id']):raise forbidden(details={'reason':'OUT_OF_UNIT_SCOPE'})
        if conn.execute('SELECT id FROM employees WHERE code=%s AND deleted_at IS NULL',(body.employee_code,)).fetchone():
            raise conflict(details={'reason':'DUPLICATE_EMPLOYEE_CODE'})
        eid='emp_'+uuid4().hex[:24]
        phone=str(c['data'].get('phone') or '').strip()[:100] or None
        conn.execute('''INSERT INTO employees(id,code,full_name,unit_id,department_legacy,hire_date,phone,created_by)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s)''',
            (eid,body.employee_code,name,body.unit_id,unit['name'],body.hire_date,phone,actor.user_id))
        row=conn.execute('''INSERT INTO hr_hiring_cases(candidate_id,employee_id,stage,note,created_by)
                VALUES(%s,%s,'linked',%s,%s) RETURNING *''',
                (body.candidate_id,eid,body.note,actor.user_id)).fetchone()
        event(conn,'candidate_onboarding',eid,'create',actor,{'candidate_id':body.candidate_id,'unit_id':body.unit_id})
    return {'employee_id':eid,'case':dict(row),
            'notice':'پرونده پایه ایجاد شد؛ حقوق، حق فنی، قرارداد، شماره ملی و وضعیت دائم خودکار ثبت نشده‌اند.'}

@router.get('/hiring/units')
def hiring_units(actor:Actor=Depends(authenticate)):
    require(actor,'view_recruitment','view_personnel')
    with tx() as conn:
        rows=conn.execute('SELECT id,name FROM units ORDER BY name').fetchall()
    return {'items':[dict(x) for x in rows if in_unit_scope(actor.principal,x['id'])]}


# ------------ monthly contract completeness (read-only) ---------------------------
@router.get('/contracts/calendar')
def contract_calendar(year:int,from_month:int=1,actor:Actor=Depends(authenticate)):
    require(actor,'view_personnel')
    if not 1400<=year<=1498 or not 1<=from_month<=12:
        raise HTTPException(422,'سال یا ماه شمسی خارج از محدوده است')
    months=[f'{year}-{m:02d}' for m in range(from_month,13)]
    with tx() as conn:
        employees=conn.execute('''SELECT e.id,e.full_name,e.unit_id,h.stage FROM employees e
             LEFT JOIN hr_hiring_cases h ON h.employee_id=e.id
             WHERE e.deleted_at IS NULL AND e.exit_date IS NULL ORDER BY e.full_name''').fetchall()
        contracts=conn.execute("SELECT employee_id,data FROM records WHERE collection='contracts' AND deleted_at IS NULL").fetchall()
    by_emp={}
    for x in contracts:by_emp.setdefault(x['employee_id'],[]).append(dict(x))
    result=[]
    for e in employees:
        if not in_unit_scope(actor.principal,e['unit_id']):continue
        if e['stage'] not in ('confirmed','monthly_contracts'):
            status='needs_hr_classification'
            result.append({'employee_id':e['id'],'full_name':e['full_name'],'status':status,'months':{}})
            continue
        statuses={}
        for key in months:
            start,end=period_span(key)
            statuses[key]=contract_month_status(by_emp.get(e['id'],[]),start,end)
        result.append({'employee_id':e['id'],'full_name':e['full_name'],
                       'status':'tracked','months':statuses})
    return {'months':months,'items':result,'note':'این گزارش قرارداد صادر نمی‌کند؛ کارکنان بدون تأیید وضعیت داخلی برای طبقه‌بندی HR مشخص شده‌اند.'}


# ------------ KPI grievance: signed decision without silently changing scores -----
class Grievance(BaseModel):
    period_id:int=Field(ge=1)
    employee_id:str=Field(min_length=1,max_length=120)
    statement:str=Field(min_length=15,max_length=1600)

class GrievanceDecision(BaseModel):
    decision:Literal['upheld','dismissed']
    expected_version:int=Field(ge=1)
    note:str=Field(min_length=12,max_length=1500)

@router.get('/kpi/grievances')
def grievances(actor:Actor=Depends(authenticate)):
    require(actor,'view_personnel')
    with tx() as conn:
        rows=conn.execute('''SELECT g.*,e.full_name,e.unit_id,p.period_key FROM hr_kpi_grievances g
             JOIN employees e ON e.id=g.employee_id
             JOIN hr_team_kpi_periods p ON p.id=g.period_id ORDER BY g.id DESC LIMIT 600''').fetchall()
    return {'items':[{k:v for k,v in dict(x).items() if k!='unit_id'} for x in rows if in_unit_scope(actor.principal,x['unit_id'])]}

@router.post('/kpi/grievances',status_code=201)
def lodge_grievance(body:Grievance,actor:Actor=Depends(authenticate)):
    require(actor,'view_personnel','write_records')
    with tx() as conn:
        emp(conn,body.employee_id,actor)
        p=conn.execute('SELECT * FROM hr_team_kpi_periods WHERE id=%s',(body.period_id,)).fetchone()
        if not p:raise not_found()
        if p['status']!='approved':raise HTTPException(409,'اعتراض فقط برای ارزیابی تأییدشده ثبت می‌شود')
        person=conn.execute('SELECT ratings FROM hr_team_kpi_people WHERE period_id=%s AND employee_id=%s',
                            (body.period_id,body.employee_id)).fetchone()
        if not person:raise HTTPException(422,'کارمند عضو این ارزیابی نبوده است')
        if conn.execute('SELECT id FROM hr_kpi_grievances WHERE period_id=%s AND employee_id=%s AND status=%s',
                        (body.period_id,body.employee_id,'pending')).fetchone():raise conflict()
        score=sum(w*n/4 for w,n in zip(p['weights'],person['ratings']))
        row=conn.execute('''INSERT INTO hr_kpi_grievances(period_id,employee_id,statement,original_score,filed_by)
            VALUES(%s,%s,%s,%s,%s) RETURNING *''',
            (body.period_id,body.employee_id,body.statement,score,actor.user_id)).fetchone()
        event(conn,'kpi_grievance',row['id'],'file',actor,{'period_id':body.period_id,'employee_id':body.employee_id})
    return {'item':dict(row),'notice':'اعتراض ثبت شد؛ امتیاز تأییدشده و سهم کارانه تغییری نکرده است.'}

@router.post('/kpi/grievances/{gid}/decision')
def decide_grievance(gid:int,body:GrievanceDecision,actor:Actor=Depends(authenticate)):
    require(actor,'view_personnel','approve_records')
    with tx() as conn:
        r=conn.execute('SELECT * FROM hr_kpi_grievances WHERE id=%s FOR UPDATE',(gid,)).fetchone()
        if not r:raise not_found()
        emp(conn,r['employee_id'],actor)
        if r['filed_by']==actor.user_id:raise forbidden(details={'reason':'SELF_APPROVAL_NOT_ALLOWED'})
        if r['status']!='pending' or r['version']!=body.expected_version:raise conflict()
        row=conn.execute('''UPDATE hr_kpi_grievances SET status=%s,reviewed_by=%s,reviewed_at=NOW(),
                decision_note=%s,version=version+1 WHERE id=%s RETURNING *''',
                (body.decision,actor.user_id,body.note,gid)).fetchone()
        event(conn,'kpi_grievance',gid,body.decision,actor,{'period_id':r['period_id']})
    return {'item':dict(row),'notice':'تصمیم ثبت شد؛ اصلاح امتیاز و کارانه نیازمند گردش اصلاح جداگانه است.'}


# ------------ mid-month transfer: review and HOLD bonus, no invented weighting ------
class TransferReview(BaseModel):
    employee_id:str=Field(min_length=1,max_length=120)
    period_key:str
    reason:str=Field(min_length=12,max_length=1200)
    @model_validator(mode='after')
    def checked(self):valid_jalali_month(self.period_key);return self

class TransferDecision(BaseModel):
    expected_version:int=Field(ge=1)
    decision:Literal['reviewed','closed']
    note:str=Field(min_length=12,max_length=1200)

@router.get('/teams/transfers')
def transfer_review_list(period_key:str,actor:Actor=Depends(authenticate)):
    require(actor,'view_personnel');valid_jalali_month(period_key)
    start,end=period_span(period_key)
    with tx() as conn:
        rows=conn.execute('''SELECT m.*,e.full_name,e.unit_id FROM hr_team_memberships m
          JOIN employees e ON e.id=m.employee_id
          WHERE m.valid_from<=%s AND (m.valid_to IS NULL OR m.valid_to>=%s)
          ORDER BY e.full_name,m.valid_from''',(end,start)).fetchall()
        tracked=conn.execute('SELECT * FROM hr_team_transfer_reviews WHERE period_key=%s',(period_key,)).fetchall()
    by_emp={}
    for r in rows:
        if in_unit_scope(actor.principal,r['unit_id']):by_emp.setdefault(r['employee_id'],[]).append(r)
    affected=[{'employee_id':eid,'full_name':rr[0]['full_name'],'assignments':[
               {'team_kind':x['team_kind'],'team_number':x['team_number'],'valid_from':str(x['valid_from']),
                'valid_to':str(x['valid_to']) if x['valid_to'] else None} for x in rr]}
              for eid,rr in by_emp.items() if repeated_membership(rr,start,end)]
    return {'affected':affected,'cases':[dict(x) for x in tracked if x['employee_id'] in by_emp],
            'allocation_status':'HELD_FOR_HR_POLICY','note':'تا تصویب قاعده سهم بخشی از ماه، کارانه به‌صورت خودکار توزیع نمی‌شود.'}

@router.post('/teams/transfers',status_code=201)
def register_transfer(body:TransferReview,actor:Actor=Depends(authenticate)):
    require(actor,'view_personnel','write_records')
    start,end=period_span(body.period_key)
    with tx() as conn:
        emp(conn,body.employee_id,actor)
        rows=conn.execute('''SELECT * FROM hr_team_memberships WHERE employee_id=%s
          AND valid_from<=%s AND (valid_to IS NULL OR valid_to>=%s)''',(body.employee_id,end,start)).fetchall()
        if not repeated_membership(rows,start,end):
            raise HTTPException(409,'برای این دوره عضویت ناقص یا جابه‌جایی مستند پیدا نشد')
        if conn.execute('SELECT id FROM hr_team_transfer_reviews WHERE employee_id=%s AND period_key=%s',
                        (body.employee_id,body.period_key)).fetchone():raise conflict()
        row=conn.execute('''INSERT INTO hr_team_transfer_reviews(employee_id,period_key,reason,filed_by)
                    VALUES(%s,%s,%s,%s) RETURNING *''',
                    (body.employee_id,body.period_key,body.reason,actor.user_id)).fetchone()
        event(conn,'team_transfer',row['id'],'open',actor,{'employee_id':body.employee_id,'month':body.period_key})
    return {'item':dict(row),'notice':'برای بررسی منابع انسانی ثبت شد؛ مبلغی محاسبه یا به فیش منتقل نشد.'}

@router.post('/teams/transfers/{tid}/decision')
def transfer_decision(tid:int,body:TransferDecision,actor:Actor=Depends(authenticate)):
    require(actor,'view_personnel','approve_records')
    with tx() as conn:
        row=conn.execute('SELECT * FROM hr_team_transfer_reviews WHERE id=%s FOR UPDATE',(tid,)).fetchone()
        if not row:raise not_found()
        emp(conn,row['employee_id'],actor)
        if row['filed_by']==actor.user_id:raise forbidden(details={'reason':'SELF_APPROVAL_NOT_ALLOWED'})
        if row['version']!=body.expected_version or row['status']=='closed':raise conflict()
        update=conn.execute('''UPDATE hr_team_transfer_reviews SET status=%s,reviewed_by=%s,
                reviewed_at=NOW(),decision_note=%s,version=version+1 WHERE id=%s RETURNING *''',
                (body.decision,actor.user_id,body.note,tid)).fetchone()
        event(conn,'team_transfer',tid,body.decision,actor,{'month':row['period_key']})
    return {'item':dict(update),'notice':'تعیین تکلیف اداری انجام شد؛ محاسبه سهم جابه‌جایی هنوز به تصویب روش توزیع نیاز دارد.'}
