"""Authentication endpoints. UNTESTED (needs FastAPI + PostgreSQL); the password/throttle logic is unit-tested."""
import secrets
import time

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from .. import config
from ..core.passwords import hash_password, verify_password
from ..core.throttle import retry_after
from ..db import tx
from ..deps import authenticate, csrf_for, sha
from ..errors import ApiError
from ..services.pgstore import PgStore
from ..services.sync import Actor, SyncService
from .common import log_event

router = APIRouter(prefix="/api/auth", tags=["auth"])
_DUMMY = {"algo": "pbkdf2", "iter": 120000, "salt": "00" * 16, "hash": "00" * 32}       # equalises timing for unknown users


class Login(BaseModel):
    username: str
    password: str


class ChangePassword(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
def login(body: Login, request: Request, response: Response):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    with tx() as conn:
        fails = [float(r["t"]) for r in conn.execute(
            "SELECT extract(epoch from at) AS t FROM login_attempts WHERE success = false AND at > now() - interval '15 minutes' "
            "AND (lower(username) = lower(%s) OR ip = %s::inet)", (body.username, ip))]
        wait = retry_after(fails, time.time())
        if wait:
            response.headers["Retry-After"] = str(wait)
            log_event(conn, "login_failed", "auth", "ورود رد شد: تعداد تلاش‌ها زیاد است", username=body.username, ip=ip, ua=ua, result="RATE_LIMITED")
            raise ApiError("RATE_LIMITED", details={"retry_after": wait})
        store = PgStore(conn)
        u = store.user_by_username(body.username)
        usable = bool(u) and u["active"] and not u["is_system"]
        ok, rehash = verify_password(u["pw"] if usable else _DUMMY, body.password)
        ok = usable and ok
        conn.execute("INSERT INTO login_attempts (username, ip, success) VALUES (%s, %s::inet, %s)", (body.username, ip, ok))
        if not ok:
            log_event(conn, "login_failed", "auth", "ورود ناموفق", username=body.username, ip=ip, ua=ua, result="denied")
            conn.commit()                       # keep the failure record (the exception below would roll it back)
            raise ApiError("UNAUTHENTICATED", "نام کاربری یا رمز عبور درست نیست.", sub="INVALID_CREDENTIALS")
        if rehash:                              # PBKDF2/SHA-256 -> Argon2id after a successful login (no forced reset)
            store.user_set_password(u["id"], hash_password(body.password))
        conn.execute("UPDATE users SET last_login = now() WHERE id = %s", (u["id"],))
        token = secrets.token_urlsafe(32)
        h = sha(token)
        conn.execute("INSERT INTO sessions (token_hash, user_id, csrf_hash, idle_expires_at, abs_expires_at, ip, user_agent) "
                     "VALUES (%s,%s,%s, now() + make_interval(secs => %s), now() + make_interval(secs => %s), %s::inet, %s)",
                     (h, u["id"], sha(csrf_for(h)), config.SESSION_IDLE_SECONDS, config.SESSION_ABSOLUTE_SECONDS, ip, ua))
        log_event(conn, "login", "auth", "ورود به سیستم", user=u, ip=ip, ua=ua)
    response.set_cookie(config.COOKIE_NAME, token, httponly=True, samesite="strict", secure=config.COOKIE_SECURE,
                        max_age=config.SESSION_ABSOLUTE_SECONDS, path="/")
    return {"csrf_token": csrf_for(h), "user": {"username": u["username"], "name": u["name"], "role": u["role"]}}


@router.post("/logout")
def logout(response: Response, actor: Actor = Depends(authenticate)):
    with tx() as conn:
        conn.execute("UPDATE sessions SET revoked_at = now() WHERE token_hash = %s", (actor.session_hash,))
        log_event(conn, "logout", "auth", "خروج از سیستم", actor=actor)
    response.delete_cookie(config.COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(actor: Actor = Depends(authenticate)):
    with tx() as conn:
        info = SyncService(PgStore(conn), actor).me()
    info["csrf_token"] = csrf_for(actor.session_hash)
    return info


@router.post("/change-password")
def change_password(body: ChangePassword, actor: Actor = Depends(authenticate)):
    if len(body.new_password) < config.MIN_PASSWORD_LENGTH:
        raise ApiError("VALIDATION_ERROR", "رمز عبور خیلی کوتاه است.", sub="WEAK_PASSWORD")
    with tx() as conn:
        store = PgStore(conn)
        u = store.user_by_id(actor.user_id)
        ok, _ = verify_password(u["pw"], body.current_password)
        if not ok:
            log_event(conn, "security", "auth", "تغییر رمز رد شد: رمز فعلی نادرست", actor=actor, result="denied")
            conn.commit()
            raise ApiError("UNAUTHENTICATED", "رمز فعلی درست نیست.", sub="INVALID_CREDENTIALS")
        store.user_set_password(u["id"], hash_password(body.new_password))
        conn.execute("UPDATE sessions SET revoked_at = now() WHERE user_id = %s AND token_hash <> %s", (u["id"], actor.session_hash))
        log_event(conn, "security", "auth", "تغییر رمز عبور", actor=actor)
    return {"ok": True}
