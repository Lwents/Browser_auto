@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist node_modules (
  echo Dang cai dependencies...
  call npm install
  if errorlevel 1 goto :error
)

node src/index.js %*
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo Co loi xay ra. Xem log trong thu muc logs\.
pause
exit /b 1
