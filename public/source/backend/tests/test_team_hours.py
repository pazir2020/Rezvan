"""Unit tests independent from PostgreSQL; actual SQL integration requires staging LAN."""
import pytest
from datetime import date
from decimal import Decimal
from pydantic import ValidationError
from app.analytics.team_hours_models import Entry, Approval

BASE={'oven_id':14,'team_kind':'forge','team_number':2,'work_date':date(2026,10,21),'ordinary_person_hours':'28'}
def test_valid_four_person_team_order_day():
    m=Entry(**BASE,overtime_person_hours=Decimal('4'),overtime_reason='سفارش فوری',excluded_person_hours=Decimal('2'),exclusion_reason='خرابی ابزار')
    assert m.ordinary_person_hours==28
    assert m.overtime_person_hours==4

def test_no_unexplained_overtime():
    with pytest.raises(ValidationError):Entry(**BASE,overtime_person_hours='2')

def test_no_unexplained_stoppages():
    with pytest.raises(ValidationError):Entry(**BASE,excluded_person_hours='1')

def test_no_impossible_excluded_hours():
    with pytest.raises(ValidationError):Entry(**BASE,excluded_person_hours='29',exclusion_reason='کمبود مصالح')

def test_forge_only_has_two_teams():
    with pytest.raises(ValidationError):Entry(**{**BASE,'team_number':3})

def test_nonnegative_and_finite_decimal():
    with pytest.raises(ValidationError):Entry(**{**BASE,'ordinary_person_hours':'-1'})
    with pytest.raises(ValidationError):Entry(**{**BASE,'ordinary_person_hours':'Infinity'})

def test_approval_only_valid_statuses():
    assert Approval(expected_version=1,decision='approved').decision=='approved'
    with pytest.raises(ValidationError):Approval(expected_version=1,decision='paid')
