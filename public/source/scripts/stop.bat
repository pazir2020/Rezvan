@echo off
setlocal
cd /d "%~dp0.."
if not exist data\server.pid ( echo not running & exit /b 0 )
set /p PID=<data\server.pid
taskkill /PID %PID% /T /F
del data\server.pid
