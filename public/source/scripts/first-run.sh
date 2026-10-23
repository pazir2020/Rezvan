#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../backend"
PY=../.venv/bin/python
$PY -m app.cli init-db --create-db
read -rp "Admin username [admin]: " ADMIN; ADMIN=${ADMIN:-admin}
$PY -m app.cli create-admin "$ADMIN"
echo "Migrate your data:  $PY -m app.cli migrate-preview FILE.json ; $PY -m app.cli migrate-apply FILE.json --files-root OLD_FOLDER"
