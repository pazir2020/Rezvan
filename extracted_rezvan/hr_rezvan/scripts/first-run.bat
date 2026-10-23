@echo off
REM Creates the database, the application role, tables, reference data and the first admin; optionally migrates your data file.
setlocal
cd /d "%~dp0..\backend"
set PY=..\.venv\Scripts\python.exe
%PY% -m app.cli init-db --create-db || goto :err
echo.
set /p ADMIN=Admin username (default: admin): 
if "%ADMIN%"=="" set ADMIN=admin
%PY% -m app.cli create-admin %ADMIN% || goto :err
echo.
echo To migrate your existing data (read the PREVIEW first):
echo   %PY% -m app.cli migrate-preview C:\path\hr-dashboard-data.json
echo   %PY% -m app.cli migrate-apply C:\path\hr-dashboard-data.json --files-root "C:\path\to\old\data\folder"
exit /b 0
:err
echo FAILED. See the message above.
exit /b 1
