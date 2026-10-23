"""Uniform API error model: {"error": {"code", "message", "details"}} (Persian messages for the UI)."""

MESSAGES = {
    "UNAUTHENTICATED": "ابتدا وارد سیستم شوید.",
    "FORBIDDEN": "شما اجازه‌ی انجام این عملیات را ندارید.",
    "NOT_FOUND": "مورد درخواستی پیدا نشد.",
    "CONFLICT": "این رکورد هم‌زمان توسط کاربر دیگری تغییر کرده است.",
    "PAYROLL_LOCKED": "این رکورد در دوره حقوق قفل شده است.",
    "LOCK_AMENDMENT_REQUIRED": "ماه حقوق قفل است؛ ابتدا باید اصلاحیه ثبت شود.",
    "VALIDATION_ERROR": "داده‌ی ارسالی معتبر نیست.",
    "RATE_LIMITED": "تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.",
    "INTERNAL_ERROR": "خطای داخلی سرور.",
}
STATUS = {"UNAUTHENTICATED": 401, "FORBIDDEN": 403, "NOT_FOUND": 404, "CONFLICT": 409, "PAYROLL_LOCKED": 423,
          "LOCK_AMENDMENT_REQUIRED": 423, "VALIDATION_ERROR": 422, "RATE_LIMITED": 429, "INTERNAL_ERROR": 500}


class ApiError(Exception):
    """code is one of STATUS keys; `sub` is a more specific machine reason (UNIT_ACCESS_DENIED, VERSION_CONFLICT, ...)."""

    def __init__(self, code: str, message: str = "", *, sub: str = None, details=None, status: int = None):
        super().__init__(message or MESSAGES.get(code, code))
        self.code = code
        self.status = status or STATUS.get(code, 400)
        self.message = message or MESSAGES.get(code, code)
        self.sub = sub
        self.details = details

    def body(self) -> dict:
        err = {"code": self.code, "message": self.message}
        if self.sub:
            err["reason"] = self.sub
        if self.details is not None:
            err["details"] = self.details
        return {"error": err}


def forbidden(sub="PERMISSION_DENIED", details=None, message=""):
    return ApiError("FORBIDDEN", message, sub=sub, details=details)


def not_found():
    return ApiError("NOT_FOUND")


def conflict(sub="VERSION_CONFLICT", details=None, message=""):
    return ApiError("CONFLICT", message, sub=sub, details=details)


def invalid(sub="VALIDATION_ERROR", details=None, message=""):
    return ApiError("VALIDATION_ERROR", message, sub=sub, details=details)
