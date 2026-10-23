@echo off
REM Usage: restore.bat C:\path\to\backups\20261008-020000   (stop the server first)
setlocal
cd /d "%~dp0..\backend"
if "%~1"=="" ( echo usage: restore.bat BACKUP_FOLDER & exit /b 1 )
..\.venv\Scripts\python.exe -m app.ops restore "%~1" --yes
