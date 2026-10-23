#!/usr/bin/env bash
# AFTER verified backup, on the server. Does not replace or delete HR records.
set -euo pipefail
cd "$(dirname "$0")/../backend"
../.venv/bin/python -m app.cli upgrade-safe
