"""Bootstrap + change-push for the legacy client, plus REST wrappers over the same service. UNTESTED (HTTP layer)."""
import secrets
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..db import tx
from ..deps import audit_denied, authenticate
from ..errors import ApiError
from ..services.pgstore import PgStore
from ..services.sync import Actor, SyncService
from ..specs import COLLECTION_SPECS

router = APIRouter(prefix="/api", tags=["sync"])
ALIASES = {"discipline": "disciplinary"}
REST_COLLECTIONS = set(COLLECTION_SPECS) - {"documents"} | {"employees"}


class Push(BaseModel):
    ops: List[Dict[str, Any]]


def _run(actor: Actor, fn, what: str):
    try:
        with tx() as conn:
            return fn(SyncService(PgStore(conn), actor))
    except ApiError as e:
        if e.code in ("FORBIDDEN", "PAYROLL_LOCKED", "LOCK_AMENDMENT_REQUIRED", "CONFLICT", "VALIDATION_ERROR"):
            audit_denied(actor, e, what)
        raise


@router.get("/bootstrap")
def bootstrap(actor: Actor = Depends(authenticate)):
    return _run(actor, lambda s: s.bootstrap(), "bootstrap")


@router.post("/sync/push")
def push(body: Push, actor: Actor = Depends(authenticate)):
    return _run(actor, lambda s: s.push(body.ops), "sync")


def _coll(name: str) -> str:
    c = ALIASES.get(name, name)
    if c not in REST_COLLECTIONS:
        raise ApiError("NOT_FOUND")
    return c


def _new_id(c: str) -> str:
    return c[:3] + secrets.token_hex(7)


@router.get("/{collection}")
def list_items(collection: str, actor: Actor = Depends(authenticate)):
    c = _coll(collection)
    return _run(actor, lambda s: s.list_collection(c), c)


@router.get("/{collection}/{rid}")
def get_item(collection: str, rid: str, actor: Actor = Depends(authenticate)):
    c = _coll(collection)
    res = _run(actor, lambda s: s.list_collection(c), c)
    for it in res["items"]:
        if it.get("id") == rid:
            return {"item": it, "version": res["versions"].get(rid)}
    raise ApiError("NOT_FOUND")


@router.post("/{collection}", status_code=201)
def create_item(collection: str, body: Dict[str, Any], actor: Actor = Depends(authenticate)):
    c = _coll(collection)
    rid = str(body.pop("id", "") or _new_id(c))
    return _run(actor, lambda s: s.push([{"c": c, "op": "create", "id": rid, "data": body}])["results"][0], c)


@router.patch("/{collection}/{rid}")
def update_item(collection: str, rid: str, body: Dict[str, Any], expected_version: int, actor: Actor = Depends(authenticate)):
    c = _coll(collection)
    return _run(actor, lambda s: s.push([{"c": c, "op": "update", "id": rid, "v": expected_version, "set": body}])["results"][0], c)


@router.delete("/{collection}/{rid}")
def delete_item(collection: str, rid: str, expected_version: int, actor: Actor = Depends(authenticate)):
    c = _coll(collection)
    return _run(actor, lambda s: s.push([{"c": c, "op": "delete", "id": rid, "v": expected_version}])["results"][0], c)
