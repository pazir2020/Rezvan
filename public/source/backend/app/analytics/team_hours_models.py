from datetime import date
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, Field, model_validator

class Entry(BaseModel):
    oven_id:int=Field(gt=0)
    team_kind:Literal['forge','masonry']
    team_number:int=Field(ge=1,le=3)
    work_date:date
    ordinary_person_hours:Decimal=Field(ge=0,le=96,max_digits=8,decimal_places=2)
    overtime_person_hours:Decimal=Field(default=Decimal('0'),ge=0,le=96,max_digits=8,decimal_places=2)
    excluded_person_hours:Decimal=Field(default=Decimal('0'),ge=0,le=96,max_digits=8,decimal_places=2)
    overtime_reason:str=Field(default='',max_length=500)
    exclusion_reason:str=Field(default='',max_length=500)
    note:str=Field(default='',max_length=1000)

    @model_validator(mode='after')
    def consistent(self):
        if self.team_kind=='forge' and self.team_number>2:raise ValueError('شماره تیم آهنگری نامعتبر است')
        total=self.ordinary_person_hours+self.overtime_person_hours
        if total<=0:raise ValueError('نفرساعت صفر قابل ثبت نیست')
        if self.excluded_person_hours>total:raise ValueError('توقف بیشتر از کل نفرساعت است')
        if self.overtime_person_hours and not self.overtime_reason.strip():raise ValueError('دلیل اضافه‌کاری الزامی است')
        if self.excluded_person_hours and not self.exclusion_reason.strip():raise ValueError('دلیل توقف الزامی است')
        return self

class Edit(Entry):
    expected_version:int=Field(ge=1)

class Approval(BaseModel):
    expected_version:int=Field(ge=1)
    decision:Literal['approved','rejected']
