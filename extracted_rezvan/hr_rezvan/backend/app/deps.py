"""Authentication dependency (session cookie + CSRF), DB helpers and error handling glue. UNTESTED (needs FastAPI + PostgreSQL)."""
import hashlib
import hmac
import secrets
from typing import Optional

from fastapi import Request

from . import config
from .core.policy import Principal
from .db import tx
from .errors import ApiError
from .services.pgstore import PgStore
from .services.sync import Actor

SAFE = {"GET", "HEAD", "OPTIONS"}


def sha(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def csrf_for(session_hash: str) -> str:
    """Deterministic CSRF token bound to the session (HMAC with the server secret), so /me can re-issue it after a page reload."""
    return hmac.new(config.SECRET_KEY.encode(), session_hash.encode(), hashlib.sha256).hexdigest()


def build_principal(store: PgStore, user: dict) -> Principal:
    roles = {}
    for r in store.conn.execute("SELECT id, all_permissions FROM roles"):
        roles[r["id"]] = {"*"} if r["all_permissions"] else set()
    for r in store.conn.execute("SELECT role_id, permission_code FROM role_permissions"):
        roles.setdefault(r["role_id"], set()).add(r["permission_code"])
    unit_roles = {r["unit_id"]: r["role_id"] for r in store.conn.execute(
        "SELECT unit_id, role_id FROM user_units WHERE user_id = %s AND role_id IS NOT NULL", (user["id"],))}
    return Principal(user_id=user["id"], role_id=user["role"], all_units=user["all_units"], unit_ids=frozenset(user["unit_ids"]),
                     unit_roles=unit_roles, add=frozenset(user["perms_add"] or []), remove=frozenset(user["perms_remove"] or []), role_perms=roles)


def authenticate(request: Request) -> Actor:
    token = request.cookies.get(config.COOKIE_NAME)
    if not token:
        raise ApiError("UNAUTHENTICATED")
    h = sha(token)
    with tx() as conn:
        s = conn.execute(
            "SELECT s.user_id FROM sessions s WHERE s.token_hash = %s AND s.revoked_at IS NULL AND s.idle_expires_at > now() AND s.abs_expires_at > now()", (h,)).fetchone()
        if not s:
            raise ApiError("UNAUTHENTICATED", "نشست شما منقضی شده است؛ دوباره وارد شوید.")
        store = PgStore(conn)
        user = store.user_by_id(s["user_id"])
        if not user or not user["active"] or user["is_system"]:
            raise ApiError("UNAUTHENTICATED")
        if request.method not in SAFE:
            sent = request.headers.get("X-CSRF-Token", "")
            if not sent or not hmac.compare_digest(sent, csrf_for(h)):
                raise ApiError("FORBIDDEN", "توکن CSRF نامعتبر است.", sub="CSRF_FAILED")
        conn.execute("UPDATE sessions SET last_seen_at = now(), idle_expires_at = now() + make_interval(secs => %s) WHERE token_hash = %s",
                     (config.SESSION_IDLE_SECONDS, h))
        principal = build_principal(store, user)
    a = Actor(principal, user["id"], user["username"], user["name"], request.client.host if request.client else None, request.headers.get("user-agent"))
    a.session_hash = h        # type: ignore[attr-defined]
    return a


def audit_denied(actor: Actor, err: ApiError, what: str):
    """Denied/failed attempts are audited in their own transaction (the failed one was rolled back)."""
    try:
        with tx() as conn:
            PgStore(conn).audit_add({"user_id": actor.user_id, "username": actor.username, "user_name": actor.name, "role": actor.principal.role_id,
                                     "action": "denied", "module": what, "section": what, "text": "عملیات رد شد: %s" % (err.sub or err.code),
                                     "ip": actor.ip, "ua": actor.ua, "result": err.code, "after": err.details if isinstance(err.details, dict) else None})
    except Exception:
        pass
