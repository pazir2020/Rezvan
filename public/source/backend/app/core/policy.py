"""Effective Access = Permission AND Unit Scope AND Record Scope.

Pure logic (no I/O). Status: logic exercised by tests/test_core.py (stdlib unittest, run in the
authoring sandbox); NOT exercised against a real database or HTTP stack.

Rules:
  * view_* never authorizes create/edit/delete/approve (enforced in `check_operation`).
  * all_units only widens the Unit Scope. It never grants a Permission and never lifts Record Scope.
  * roles.all_permissions (admin '*') is a ROLE property, independent from all_units.
"""
from dataclasses import dataclass, field
from typing import Dict, FrozenSet, Iterable, Optional

from ..specs import ROLE_PERMS


@dataclass(frozen=True)
class Principal:
    user_id: str
    role_id: str
    all_units: bool = False
    unit_ids: FrozenSet[int] = frozenset()
    unit_roles: Dict[int, str] = field(default_factory=dict)   # unit_id -> role_id override
    add: FrozenSet[str] = frozenset()                          # user_permission_overrides effect=add
    remove: FrozenSet[str] = frozenset()                       # effect=remove
    role_perms: Optional[Dict[str, Iterable[str]]] = None      # injected from DB; defaults to code table

    def _perms_of(self, role_id: str) -> set:
        table = self.role_perms if self.role_perms is not None else ROLE_PERMS
        return set(table.get(role_id, ()))


@dataclass(frozen=True)
class Decision:
    allowed: bool
    code: str = "OK"          # OK | PERMISSION_DENIED | UNIT_ACCESS_DENIED | RECORD_SCOPE_DENIED
    detail: str = ""


def has_permission(p: Principal, perm: str, unit_id: Optional[int] = None) -> bool:
    role = p.unit_roles.get(unit_id, p.role_id) if unit_id is not None else p.role_id
    base = p._perms_of(role)
    if "*" in base:
        granted = True
    else:
        granted = perm in base or perm in p.add
    if perm in p.remove and "*" not in base:
        granted = False
    return granted


def in_unit_scope(p: Principal, unit_id: Optional[int], *, employee_scoped: bool = True) -> bool:
    if not employee_scoped:
        return True
    if p.all_units:
        return True
    return unit_id is not None and unit_id in p.unit_ids


def check_access(p: Principal, perms: Iterable[str], *, unit_id: Optional[int] = None,
                 employee_scoped: bool = True, record_in_scope: bool = True) -> Decision:
    """All of `perms` (AND) + Unit Scope + Record Scope."""
    for perm in perms:
        if not has_permission(p, perm, unit_id):
            return Decision(False, "PERMISSION_DENIED", perm)
    if not in_unit_scope(p, unit_id, employee_scoped=employee_scoped):
        return Decision(False, "UNIT_ACCESS_DENIED", str(unit_id))
    if not record_in_scope:
        return Decision(False, "RECORD_SCOPE_DENIED")
    return Decision(True)


_OPS = ("create", "edit", "delete", "approve", "reject", "restore", "manage", "upload")


def check_operation(p: Principal, *, operation: str, operation_permission: str,
                    also_requires: Iterable[str] = (), **scope) -> Decision:
    """Operation permission AND data-read permissions AND scope. A view_* permission can never be the
    operation permission of a mutating operation."""
    if operation in _OPS and operation_permission.startswith("view_"):
        return Decision(False, "PERMISSION_DENIED", "view permission cannot authorize " + operation)
    return check_access(p, [operation_permission, *also_requires], **scope)
