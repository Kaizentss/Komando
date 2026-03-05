@echo off
title Komando - Shop Management
color 0A
echo.
echo  =============================================
echo   KOMANDO - Shop Management System
echo   with FREE VIN Decoder
echo  =============================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Node.js is not installed!
    echo.
    echo  Please install Node.js from: https://nodejs.org
    echo  Download the LTS version and run the installer.
    echo.
    pause
    exit /b
)

:: Check for node_modules
if not exist "node_modules" (
    echo  [SETUP] First time setup - Installing dependencies...
    echo  This will take about 1-2 minutes...
    echo.
    call npm install
    echo.
    echo  [OK] Dependencies installed!
    echo.
)

echo  [STARTING] Launching Komando...
echo  The app will open in your browser at http://localhost:5173
echo.
echo  Press Ctrl+C to stop the server when done.
echo.
call npm start
