"""Users, roles, permissions, units. Passwords are hashed on the server (Argon2id). UNTESTED (HTTP layer)."""
import secrets
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .. import config
from ..core.passwords import hash_password
from ..db import tx
from ..deps import authenticate
from ..errors import ApiError, forbidden, invalid
from ..services.pgstore import PgStore
from ..services.sync import Actor
from ..core.policy import has_permission
from .common import log_event

router = APIRouter(prefix="/api", tags=["users"])


def _need_manage(actor: Actor):
    if not has_permission(actor.principal, "manage_users"):
        raise forbidden("PERMISSION_DENIED", {"permission": "manage_users"})


def _public(u: dict) -> dict:
    return {k: u.get(k) for k in ("id", "username", "name", "role", "active", "all_units", "perms_add", "perms_remove", "unit_ids", "created_at", "last_login", "is_system")}


class UserIn(BaseModel):
    username: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    password: Optional[str] = None
    all_units: Optional[bool] = None
    unit_ids: Optional[List[int]] = None
    perms_add: Optional[List[str]] = None
    perms_remove: Optional[List[str]] = None


def _check_refs(conn, role, perms, unit_ids):
    if role and not conn.execute("SELECT 1 FROM roles WHERE id = %s", (role,)).fetchone():
        raise invalid("UNKNOWN_ROLE")
    known = {r["code"] for r in conn.execute("SELECT code FROM permissions")}
    bad = [p for p in (perms or []) if p not in known]
    if bad:
        raise invalid("UNKNOWN_PERMISSION", [{"permissions": bad}])
    if unit_ids:
        ids = {r["id"] for r in conn.execute("SELECT id FROM units")}
        if any(u not in ids for u in unit_ids):
            raise invalid("UNKNOWN_UNIT")


def _active_admins(store: PgStore, excluding: Optional[str] = None) -> int:
    return sum(1 for u in store.users_all() if u["role"] == "admin" and u["active"] and not u["is_system"] and u["id"] != excluding)


@router.get("/users")
def list_users(actor: Actor = Depends(authenticate)):
    _need_manage(actor)
    with tx() as conn:
        return [_public(u) for u in PgStore(conn).users_all()]


@router.post("/users", status_code=201)
def create_user(b: UserIn, actor: Actor = Depends(authenticate)):
    _need_manage(actor)
    if not b.username or not b.name or not b.role or not b.password:
        raise invalid("MISSING_FIELD")
    if len(b.password) < config.MIN_PASSWORD_LENGTH:
        raise invalid("WEAK_PASSWORD", message="رمز عبور خیلی کوتاه است.")
    with tx() as conn:
        store = PgStore(conn)
        if store.user_by_username(b.username):
            raise ApiError("CONFLICT", "این نام کاربری قبلاً ثبت شده است.", sub="DUPLICATE_USERNAME")
        _check_refs(conn, b.role, (b.perms_add or []) + (b.perms_remove or []), b.unit_ids)
        u = {"id": "usr" + secrets.token_hex(7), "username": b.username.strip(), "name": b.name.strip(), "role": b.role, "active": True,
             "all_units": bool(b.all_units), "unit_ids": b.unit_ids or [], "perms_add": b.perms_add or [], "perms_remove": b.perms_remove or [],
             "pw": hash_password(b.password)}
        store.user_save(u)
        log_event(conn, "create", "users", "ایجاد کاربر «%s» با نقش %s" % (u["username"], u["role"]), actor=actor, after={"user": u["username"], "role": u["role"]})
    return _public(u)


@router.patch("/users/{uid}")
def update_user(uid: str, b: UserIn, actor: Actor = Depends(authenticate)):
    _need_manage(actor)
    with tx() as conn:
        store = PgStore(conn)
        u = store.user_by_id(uid)
        if not u or u["is_system"]:
            raise ApiError("NOT_FOUND")
        _check_refs(conn, b.role, (b.perms_add or []) + (b.perms_remove or []), b.unit_ids)
        was_admin = u["role"] == "admin" and u["active"]
        changes = []
        for field, val in (("name", b.name), ("role", b.role), ("active", b.active), ("all_units", b.all_units),
                           ("unit_ids", b.unit_ids), ("perms_add", b.perms_add), ("perms_remove", b.perms_remove)):
            if val is not None and u.get(field) != val:
                changes.append(field)
                u[field] = val
        if was_admin and not (u["role"] == "admin" and u["active"]) and _active_admins(store, uid) == 0:
            raise ApiError("CONFLICT", "حداقل یک مدیر فعال باید باقی بماند.", sub="LAST_ADMIN")
        if b.password:
            if len(b.password) < config.MIN_PASSWORD_LENGTH:
                raise invalid("WEAK_PASSWORD")
            u["pw"] = hash_password(b.password)
            changes.append("password")
        store.user_save(u)
        if "role" in changes or "perms_add" in changes or "perms_remove" in changes or "unit_ids" in changes or "all_units" in changes:
            action = "permission_change"
        else:
            action = "update"
        if b.active is False or "password" in changes or "role" in changes:
            conn.execute("UPDATE sessions SET revoked_at = now() WHERE user_id = %s AND revoked_at IS NULL", (uid,))
        log_event(conn, action, "users", "تغییر کاربر «%s»: %s" % (u["username"], "، ".join(changes) or "بدون تغییر"), actor=actor, after={"fields": changes})
    return _public(u)


@router.delete("/users/{uid}")
def delete_user(uid: str, actor: Actor = Depends(authenticate)):
    _need_manage(actor)
    if uid == actor.user_id:
        raise ApiError("CONFLICT", "نمی‌توانید حساب خودتان را حذف کنید.", sub="SELF_DELETE")
    with tx() as conn:
        store = PgStore(conn)
        u = store.user_by_id(uid)
        if not u or u["is_system"]:
            raise ApiError("NOT_FOUND")
        if u["role"] == "admin" and u["active"] and _active_admins(store, uid) == 0:
            raise ApiError("CONFLICT", "حداقل یک مدیر فعال باید باقی بماند.", sub="LAST_ADMIN")
        store.user_delete(uid)
        log_event(conn, "delete", "users", "حذف کاربر «%s»" % u["username"], actor=actor)
    return {"ok": True}


@router.get("/roles")
def roles(actor: Actor = Depends(authenticate)):
    with tx() as conn:
        out = []
        for r in conn.execute("SELECT id, label, all_permissions FROM roles ORDER BY id"):
            perms = [p["permission_code"] for p in conn.execute("SELECT permission_code FROM role_permissions WHERE role_id = %s ORDER BY 1", (r["id"],))]
            out.append({"id": r["id"], "label": r["label"], "all_permissions": r["all_permissions"], "permissions": perms})
    return out


@router.get("/permissions")
def permissions(actor: Actor = Depends(authenticate)):
    with tx() as conn:
        return [dict(r) for r in conn.execute("SELECT code, category, sensitive FROM permissions ORDER BY code")]


@router.get("/units")
def units(actor: Actor = Depends(authenticate)):
    with tx() as conn:
        return PgStore(conn).units_all()


@router.post("/units", status_code=201)
def create_unit(body: Dict[str, Any], actor: Actor = Depends(authenticate)):
    _need_manage(actor)
    name = str(body.get("name", "")).strip()
    if not name:
        raise invalid("MISSING_FIELD")
    with tx() as conn:
        store = PgStore(conn)
        if store.unit_by_name(name) is not None:
            raise ApiError("CONFLICT", sub="DUPLICATE_UNIT")
        uid = store.unit_create(name)
        log_event(conn, "create", "units", "ایجاد واحد «%s»" % name, actor=actor)
    return {"id": uid, "name": name}


@router.patch("/units/{uid}")
def rename_unit(uid: int, body: Dict[str, Any], actor: Actor = Depends(authenticate)):
    # Renaming a unit would silently detach settings.unitSchedules (keyed by department name): forbidden by design.
    raise ApiError("CONFLICT", "تغییر نام واحد سازمانی ممنوع است (برنامه‌ی کاری واحد با نام آن ثبت شده است).", sub="UNIT_RENAME_FORBIDDEN")
