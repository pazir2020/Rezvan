@echo off
REM Starts the HR Rezvan server in the background (PostgreSQL must be running). Open http://THIS-PC-NAME:8000 from any PC on the LAN.
setlocal
cd /d "%~dp0.."
if not exist backend\.env ( echo backend\.env missing - run scripts\install.bat first & exit /b 1 )
if not exist data mkdir data
powershell -NoProfile -Command "$p=Start-Process -PassThru -WindowStyle Minimized -FilePath '%CD%\.venv\Scripts\python.exe' -ArgumentList '-m','uvicorn','app.main:app','--host','0.0.0.0','--port','8000' -WorkingDirectory '%CD%\backend'; $p.Id | Out-File -Encoding ascii '%CD%\data\server.pid'"
echo Started. PID in data\server.pid  -  http://localhost:8000
