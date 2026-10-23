"""Shared helpers for routers. UNTESTED (HTTP layer)."""
from typing import Optional

from ..services.pgstore import PgStore
from ..services.sync import Actor


def log_event(conn, action: str, module: str, text: str, *, actor: Optional[Actor] = None, user: Optional[dict] = None,
              username: Optional[str] = None, ip: Optional[str] = None, ua: Optional[str] = None, result: str = "ok", reason=None, after=None):
    """Append one audit row (login, logout, export, download, user change...)."""
    store = PgStore(conn)
    store.audit_add({
        "user_id": actor.user_id if actor else (user["id"] if user else None),
        "username": actor.username if actor else (user["username"] if user else username),
        "user_name": actor.name if actor else (user["name"] if user else None),
        "role": actor.principal.role_id if actor else (user["role"] if user else None),
        "action": action, "module": module, "section": module, "text": text, "ip": ip or (actor.ip if actor else None),
        "ua": ua or (actor.ua if actor else None), "result": result, "reason": reason, "after": after})
