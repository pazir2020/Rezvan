"""Read-only team production overview from recorded oven orders.

No invented employee-hours, wages, defect rates, production targets, or bonus amounts.
The dashboard measures order status only; data gaps are disclosed explicitly.
"""
from datetime import date
from fastapi import APIRouter, Depends, Query
from ..db import tx
from ..deps import authenticate
from ..core.policy import has_permission
from ..errors import forbidden
from ..services.sync import Actor
from ..analytics.team_metrics import summarize

router = APIRouter(prefix='/api/team-performance', tags=['production overview'])

@router.get('')
def overview(start: date | None = Query(default=None), end: date | None = Query(default=None), actor: Actor = Depends(authenticate)):
    if not has_permission(actor.principal, 'view_reports'):
        raise forbidden(details={'permission':'view_reports'})
    if start and end and end < start:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail='تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد')
    # Using the date of the actual event instead of order creation means an order
    # finished in a later reporting period is attributed to the correct period.
    with tx() as conn:
        rows = conn.execute('''SELECT id, oven_model, facade_name, forge_team, masonry_team,
               forge_status, masonry_status, forge_start, forge_finish, handed_over,
               masonry_start, masonry_finish, brickwork, cementwork, insulation, facade_done
               FROM oven_orders ORDER BY id DESC''').fetchall()
    return summarize([dict(row) for row in rows], start, end)
