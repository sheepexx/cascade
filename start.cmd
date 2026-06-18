@echo off
REM ── mania-editor launcher ────────────────────────────────────────────
REM Double-click this file to start the editor. It cd's into its own
REM folder, makes sure Node is on PATH, installs deps the first time,
REM then runs the dev server and opens the browser.

cd /d "%~dp0"

REM Make sure the user-local Node install is reachable.
set "PATH=%LOCALAPPDATA%\nodejs;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [!] Node.js was not found. Expected it at:
  echo     %LOCALAPPDATA%\nodejs
  echo     Reinstall Node or fix your PATH, then try again.
  echo.
  pause
  exit /b 1
)

REM First run: install dependencies if they are missing.
if not exist "node_modules" (
  echo Installing dependencies, one moment...
  call npm install
)

REM Open the browser shortly after the server starts.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:5173"

echo.
echo Starting mania-editor ... (close this window to stop the server)
echo.
call npm run dev
pause
