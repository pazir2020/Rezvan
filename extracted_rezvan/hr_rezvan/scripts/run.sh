#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data
cd backend
nohup ../.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > ../data/server.log 2>&1 &
echo $! > ../data/server.pid
echo "Started (PID $(cat ../data/server.pid)) - http://localhost:8000"
