@echo off
REM Database + documents backup with verification. Schedule it daily with Windows Task Scheduler.
setlocal
cd /d "%~dp0..\backend"
..\.venv\Scripts\python.exe -m app.ops backup
