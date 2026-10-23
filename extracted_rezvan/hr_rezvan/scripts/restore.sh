#!/usr/bin/env bash
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: restore.sh BACKUP_FOLDER (stop the server first)"; exit 1; }
cd "$(dirname "$0")/../backend"
../.venv/bin/python -m app.ops restore "$1" --yes
