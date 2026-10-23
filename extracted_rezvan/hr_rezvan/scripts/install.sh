#!/usr/bin/env bash
# One-time setup (Linux). Requires python3.11+, python3-venv and PostgreSQL 14+.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r backend/requirements.txt
(cd backend && ../.venv/bin/python -m app.cli gen-env)
echo "Edit backend/.env (HR_ADMIN_DATABASE_URL), then run scripts/first-run.sh"
