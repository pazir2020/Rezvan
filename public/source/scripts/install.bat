@echo off
REM One-time setup on the server PC: Python venv + packages + .env. Requires Python 3.11+ and PostgreSQL 14+ already installed.
setlocal
cd /d "%~dp0.."
if not exist ".venv\Scripts\python.exe" ( py -3 -m venv .venv || goto :err )
call ".venv\Scripts\python.exe" -m pip install --upgrade pip || goto :err
call ".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt || goto :err
pushd backend
"..\.venv\Scripts\python.exe" -m app.cli gen-env || goto :err
popd
echo.
echo 1) Open backend\.env and put the PostgreSQL "postgres" user password in HR_ADMIN_DATABASE_URL.
echo 2) Run scripts\first-run.bat
exit /b 0
:err
echo FAILED. See the message above.
exit /b 1
