"""Payroll lock endpoints (thin wrappers over the sync service transitions). UNTESTED (HTTP layer)."""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from fastapi import Body

from ..deps import authenticate
from ..errors import ApiError
from ..services.sync import Actor
from .sync_api import _run

router = APIRouter(prefix="/api/payroll/locks", tags=["payroll"])
_now_iso = lambda: __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()


@router.get("")
def list_locks(actor: Actor = Depends(authenticate)):
    return _run(actor, lambda s: s.list_collection("payrollLocks"), "payrollLocks")


def _lock(s, lid):
    r = s.s.get("payrollLocks", lid)
    if not r:
        raise ApiError("NOT_FOUND")
    return r


@router.post("/{lid}/review")
def review(lid: str, actor: Actor = Depends(authenticate)):
    def go(s):
        r = _lock(s, lid)
        hist = list(r.data.get("history") or []) + [{"status": "hr_reviewed", "at": _now_iso(), "by": actor.name}]
        return s.push([{"c": "payrollLocks", "op": "update", "id": lid, "v": r.version, "set": {"status": "hr_reviewed", "reviewed_at": _now_iso(), "history": hist}}])["results"][0]
    return _run(actor, go, "payrollLocks")


@router.post("/{lid}/lock")
def lock(lid: str, body: Dict[str, Any] = Body(...), actor: Actor = Depends(authenticate)):
    """body = the snapshot payload computed by the client (Path A): snapshot rows, rulesSnapshot, leavePolicySnapshot,
    eidiSnapshot, holidaysCountSnapshot, laborCostComponentsSnapshot, snapshotVersion, workingDays, dailyHours, rulesYear."""
    def go(s):
        r = _lock(s, lid)
        sets = dict(body)
        hist = list(r.data.get("history") or []) + [{"status": "locked", "at": _now_iso(), "by": actor.name}]
        sets.update(status="locked", approved_at=_now_iso(), history=hist)
        return s.push([{"c": "payrollLocks", "op": "update", "id": lid, "v": r.version, "set": sets}])["results"][0]
    return _run(actor, go, "payrollLocks")


@router.post("/{lid}/unlock")
def unlock(lid: str, body: Dict[str, Any] = Body(...), actor: Actor = Depends(authenticate)):
    reason = str(body.get("reason", "")).strip()
    def go(s):
        r = _lock(s, lid)
        hist = list(r.data.get("history") or []) + [{"status": "unlocked", "at": _now_iso(), "by": actor.name, "note": reason}]
        return s.push([{"c": "payrollLocks", "op": "update", "id": lid, "v": r.version,
                        "set": {"status": "hr_reviewed", "unlock_reason": reason, "unlocked_at": _now_iso(), "history": hist}}])["results"][0]
    return _run(actor, go, "payrollLocks")
