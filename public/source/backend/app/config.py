"""Environment configuration (see .env.example). Loaded from environment variables; `python -m app.cli` also reads .env."""
import os


def _env_file():
    p = os.environ.get("HR_ENV_FILE", os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_env_file()
DATABASE_URL = os.environ.get("HR_DATABASE_URL", "postgresql://hr_app:CHANGE_ME@localhost:5432/hr_rezvan")
ADMIN_DATABASE_URL = os.environ.get("HR_ADMIN_DATABASE_URL", "postgresql://postgres:CHANGE_ME@localhost:5432/hr_rezvan")
SECRET_KEY = os.environ.get("HR_SECRET_KEY", "")                      # required in production (CSRF token derivation)
DOC_ROOT = os.environ.get("HR_DOC_ROOT", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "documents"))
FRONTEND_DIR = os.environ.get("HR_FRONTEND_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend"))
BACKUP_DIR = os.environ.get("HR_BACKUP_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "backups"))
COOKIE_NAME = "hr_session"
COOKIE_SECURE = os.environ.get("HR_COOKIE_SECURE", "0") == "1"          # plain-HTTP LAN => 0; behind HTTPS => 1
SESSION_IDLE_SECONDS = int(os.environ.get("HR_SESSION_IDLE_SECONDS", str(30 * 60)))
SESSION_ABSOLUTE_SECONDS = int(os.environ.get("HR_SESSION_ABSOLUTE_SECONDS", str(12 * 3600)))
MAX_UPLOAD_MB = int(os.environ.get("HR_MAX_UPLOAD_MB", "25"))
MIN_PASSWORD_LENGTH = int(os.environ.get("HR_MIN_PASSWORD_LENGTH", "6"))   # same as the current UI
ALLOWED_UPLOAD_EXT = tuple(x.strip().lower() for x in os.environ.get("HR_UPLOAD_EXT", "pdf,jpg,jpeg,png,gif,webp,doc,docx,xls,xlsx,txt,csv,zip").split(","))
