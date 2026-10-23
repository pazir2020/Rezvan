#!/usr/bin/env bash
# Verify checksums/pg_restore listing, then restore in a unique throw-away DB.
# Requires PostgreSQL client tools and an administrator connection.
set -euo pipefail
[ $# -ge 1 ] || { echo 'usage: verify-backup.sh BACKUP_FOLDER' >&2; exit 1; }
cd "$(dirname "$0")/../backend"
../.venv/bin/python -m app.ops verify "$1"
../.venv/bin/python -m app.ops restore-test "$1"
