"""Payroll-lock policy that REPRODUCES the behaviour observed in dashboard-41.html (decision D-E).
No new strictness is added. Side snapshots (holidays/leave/eidi) are REQUIRES CODE VERIFICATION and not modelled.

Observed in code:
  HARD_BLOCK        overtime status change / delete in a locked month (otSetStatus, otDel);
                    permanent employee delete when the employee is in a locked snapshot, has payrollPayments or settlements
  AMEND_WITH_REASON base salary change (updateSalary), loan create/remove (submitLoan/removeLoan, only when the loan
                    is active in the locked current month), payrollAdjustments create/edit/remove (when apply_to_payroll)
                    -> allowed, but a lock amendment row + audit entry is mandatory
  everything else   NONE_OBSERVED -> allowed
Status: tested logic, no DB.
"""
from dataclasses import dataclass
from typing import Optional, Set


@dataclass(frozen=True)
class LockDecision:
    allowed: bool
    mode: str                 # NONE | HARD_BLOCK | AMEND_WITH_REASON
    amendment_required: bool = False
    code: str = "OK"          # OK | PAYROLL_LOCKED | LOCK_AMENDMENT_REQUIRED


_HARD = {("overtime", "decision"), ("overtime", "delete")}
_AMEND = {("loans", "create"), ("loans", "delete"), ("payrollAdjustments", "create"),
          ("payrollAdjustments", "edit"), ("payrollAdjustments", "delete"), ("employees.salary", "edit")}


def decide(collection: str, operation: str, month: Optional[str], locked_months: Set[str], *,
           has_amendment_reason: bool = False, applies_to_payroll: bool = True) -> LockDecision:
    if not month or month not in locked_months:
        return LockDecision(True, "NONE")
    key = (collection, operation)
    if key in _HARD:
        return LockDecision(False, "HARD_BLOCK", code="PAYROLL_LOCKED")
    if key in _AMEND:
        if collection == "payrollAdjustments" and not applies_to_payroll:
            return LockDecision(True, "NONE")
        if not has_amendment_reason:
            return LockDecision(False, "AMEND_WITH_REASON", True, "LOCK_AMENDMENT_REQUIRED")
        return LockDecision(True, "AMEND_WITH_REASON", True)
    return LockDecision(True, "NONE")


def employee_delete_blocked(in_locked_snapshot: bool, has_payments: bool, has_settlement: bool) -> bool:
    """Mirror of the removeEmployee wrapper (dashboard-41.html line ~8572)."""
    return in_locked_snapshot or has_payments or has_settlement
