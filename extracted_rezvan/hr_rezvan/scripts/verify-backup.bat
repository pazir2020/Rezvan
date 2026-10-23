@echo off
setlocal
cd /d "%~dp0..\backend"
if "%~1"=="" ( echo usage: verify-backup.bat BACKUP_FOLDER & exit /b 1 )
..\.venv\Scripts\python.exe -m app.ops verify "%~1"
..\.venv\Scripts\python.exe -m app.ops restore-test "%~1"
