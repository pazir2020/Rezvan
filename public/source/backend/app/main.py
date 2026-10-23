"""FastAPI application: API under /api, the (adapted) dashboard served at /. UNTESTED at runtime — FastAPI is not installable here.
Start: uvicorn app.main:app --host 0.0.0.0 --port 8000   (scripts/run.bat | scripts/run.sh)
Route order matters: specific routers first; the generic /api/{collection} router is LAST."""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import config, db
from .errors import ApiError
from .routers import auth, documents_api, migration_api, misc_api, payroll_api, sync_api, users_api, oven_orders_api, team_analytics_api, team_hours_api, hr_development_api, hr_approvals_api, kpi_api, kpi_payroll_api, hr_operations_api, team_registry_api, individual_kpi_api, hr_completion_api


@asynccontextmanager
async def lifespan(app):
    if len(config.SECRET_KEY) < 32:
        raise RuntimeError("HR_SECRET_KEY must be set (>= 32 characters). Run scripts/run.* once; it generates .env")
    os.makedirs(config.DOC_ROOT, exist_ok=True)
    db.open_pool()
    yield
    db.close_pool()


app = FastAPI(title="HR Rezvan API", lifespan=lifespan, docs_url=None, redoc_url=None)
for r in (auth.router, users_api.router, documents_api.router, migration_api.router, payroll_api.router, misc_api.router, oven_orders_api.router, team_analytics_api.router, team_hours_api.router, hr_development_api.router, hr_approvals_api.router, kpi_api.router, kpi_payroll_api.router, hr_operations_api.router, team_registry_api.router, individual_kpi_api.router, hr_completion_api.router, sync_api.router):
    app.include_router(r)


@app.exception_handler(ApiError)
async def _api_error(request: Request, e: ApiError):
    return JSONResponse(status_code=e.status, content=e.body(), headers=({"Retry-After": str(e.details["retry_after"])} if e.code == "RATE_LIMITED" and isinstance(e.details, dict) and "retry_after" in e.details else None))


@app.exception_handler(RequestValidationError)
async def _validation(request: Request, e: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": {"code": "VALIDATION_ERROR", "message": "داده‌ی ارسالی معتبر نیست.", "details": [{"loc": list(x["loc"]), "msg": x["msg"]} for x in e.errors()]}})


@app.exception_handler(StarletteHTTPException)
async def _http(request: Request, e: StarletteHTTPException):
    code = {404: "NOT_FOUND", 405: "NOT_FOUND"}.get(e.status_code, "HTTP_%d" % e.status_code)
    return JSONResponse(status_code=e.status_code, content={"error": {"code": code, "message": str(e.detail)}})


@app.exception_handler(Exception)
async def _unhandled(request: Request, e: Exception):
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": "خطای داخلی سرور."}})


@app.get("/healthz", include_in_schema=False)
def healthz():
    return {"ok": True}


_index = os.path.join(config.FRONTEND_DIR, "dashboard-41.html")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(_index, media_type="text/html")


if os.path.isdir(config.FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=config.FRONTEND_DIR), name="static")
