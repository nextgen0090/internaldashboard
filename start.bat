@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PORT=8080"
set "BACKEND_URL=http://localhost:5036"

echo.
echo ========================================
echo   Game Vault - Internal Dashboard
echo ========================================
echo.
echo Local:  http://localhost:%PORT%
echo API:    %BACKEND_URL%/api/*  (local .NET)
echo.
echo Vercel: /api/* proxies to https://gamevault222.com/api/*
echo Do NOT use: python -m http.server
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install Python 3 and add it to PATH.
    pause
    exit /b 1
)

echo Freeing port %PORT%...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    echo   stopping PID %%a
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo Starting proxy server on http://localhost:%PORT%
echo.

start /b cmd /c "timeout /t 2 /nobreak >nul && start "" http://localhost:%PORT%"

set PORT=%PORT%
set BACKEND_URL=%BACKEND_URL%
python server.py
if errorlevel 1 (
    echo.
    echo Server exited with an error.
    pause
    exit /b 1
)

endlocal
