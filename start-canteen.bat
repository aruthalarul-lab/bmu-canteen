@echo off
title BMU Canteen Server & Operator Console
color 0A
echo =========================================================
echo             🍽️  BMU CANTEEN MANAGEMENT SYSTEM
echo =========================================================
echo.
echo Starting Node.js Fullstack Server on Port 5000...
echo.

:: Check if node is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not found on your system PATH!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Open Operator Console in default browser after 2 seconds in the background
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:5000/?view=operator"

:: Start the application server
node server/server.js
pause
