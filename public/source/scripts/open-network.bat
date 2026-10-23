@echo off
REM Run ONCE on the server PC: right-click -> "Run as administrator".
REM It opens port 8000 for the private (company) network and prints the address the other PCs must type in their browser.
setlocal enabledelayedexpansion
net session >nul 2>&1
if errorlevel 1 ( echo.& echo Please right-click this file and choose "Run as administrator".& pause & exit /b 1 )
netsh advfirewall firewall delete rule name="HR Rezvan" >nul 2>&1
netsh advfirewall firewall add rule name="HR Rezvan" dir=in action=allow protocol=TCP localport=8000 profile=private,domain >nul
echo.
echo Port 8000 is now open for the company network.
echo.
echo Give THIS address to the other computers (type it in their browser):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "ip=%%a"
  set "ip=!ip: =!"
  echo     http://!ip!:8000
)
echo     (or by name:  http://%COMPUTERNAME%:8000 )
echo.
echo Tip: if the server PC is on Wi-Fi, prefer a network cable; the address must not change (ask your IT person or the router "DHCP reservation").
pause
