@echo off
TITLE Brightloop Subscription Platform Demo Launcher
echo ========================================================
echo   Brightloop Software - Subscription Management Platform
echo ========================================================
echo.

cd /d "%~dp0\sub-manager\server"
if not exist node_modules (
    echo [1/3] Installing backend dependencies...
    call npm install
)

echo [2/3] Starting Express Backend Server (Port 5000)...
start "Brightloop Server (Port 5000)" cmd /k "node server.js"

timeout /t 2 /nobreak >nul

cd /d "%~dp0\sub-manager\client"
if not exist node_modules (
    echo [3/3] Installing frontend dependencies...
    call npm install
)

echo Starting Frontend Dev Portal (Vite)...
echo Opening http://localhost:3000 in default browser...
start http://localhost:3000
cmd /k "npm run dev"
