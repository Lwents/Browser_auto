@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo === Cai dependencies ===
call npm install
if errorlevel 1 goto :error

echo.
echo === Cai Chromium cho Playwright ===
call npx playwright install chromium
if errorlevel 1 goto :error

echo.
echo Xong. Mo config.json va proxies.txt de cau hinh, sau do chay start.cmd
pause
exit /b 0

:error
echo.
echo Cai dat that bai. Kiem tra ket noi mang roi thu lai.
pause
exit /b 1
