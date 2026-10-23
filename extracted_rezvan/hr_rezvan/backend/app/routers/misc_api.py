"""Settings (exists:false instead of 404), alerts, audit (read-only). UNTESTED (HTTP layer)."""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends

from ..core.policy import has_permission
from ..db import tx
from ..deps import authenticate
from ..errors import ApiError, forbidden
from ..services.pgstore import PgStore
from ..services.sync import Actor
from .common import log_event
from .sync_api import _run

router = APIRouter(prefix="/api", tags=["misc"])


@router.get("/settings")
def all_settings(actor: Actor = Depends(authenticate)):
    with tx() as conn:
        return {k: {"value": v, "version": n} for k, (v, n) in PgStore(conn).kv_all("settings").items()}


@router.get("/settings/{key}")
def get_setting(key: str, actor: Actor = Depends(authenticate)):
    with tx() as conn:
        r = PgStore(conn).kv_get("settings", key)
    return {"exists": True, "value": r[0], "version": r[1]} if r else {"exists": False, "value": None}


@router.put("/settings/{key}")
def put_setting(key: str, body: Dict[str, Any], actor: Actor = Depends(authenticate)):
    ver = body.get("expected_version")
    return _run(actor, lambda s: s.push([{"c": "settings", "op": "put", "id": key, "value": body.get("value"), "v": ver}])["results"][0], "settings")


@router.get("/alerts")
def alerts(actor: Actor = Depends(authenticate)):
    if not (has_permission(actor.principal, "view_alerts") or has_permission(actor.principal, "manage_alerts")):
        raise forbidden("PERMISSION_DENIED", {"permission": "view_alerts"})
    with tx() as conn:
        return {k: {"value": v, "version": n} for k, (v, n) in PgStore(conn).kv_all("alertStates").items()}


@router.put("/alerts/{key}")
def put_alert(key: str, body: Dict[str, Any], actor: Actor = Depends(authenticate)):
    return _run(actor, lambda s: s.push([{"c": "alertStates", "op": "put", "id": key, "value": body}])["results"][0], "alertStates")


@router.get("/audit")
def audit(limit: int = 200, actor: Actor = Depends(authenticate)):
    """Read-only. There is NO route that updates or deletes audit rows, for any role."""
    if not has_permission(actor.principal, "view_audit"):
        raise forbidden("PERMISSION_DENIED", {"permission": "view_audit"})
    with tx() as conn:
        log_event(conn, "view_audit", "audit", "مشاهده‌ی گزارش ثبت وقایع", actor=actor)
        return PgStore(conn).audit_list(max(1, min(limit, 1000)))
