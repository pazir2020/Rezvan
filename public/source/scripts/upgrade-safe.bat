@echo off
REM Run AFTER a verified backup on the server. Additive DB migration only.
setlocal
cd /d "%~dp0..\backend"
"..\.venv\Scripts\python.exe" -m app.cli upgrade-safe || exit /b 1
echo Database upgrade completed.
