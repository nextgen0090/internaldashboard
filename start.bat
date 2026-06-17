@echo off
cd /d "%~dp0"

echo.
echo ========================================
echo   Game Vault - DB Visual Report
echo ========================================
echo.
echo Do NOT use: python -m http.server
echo.

echo Freeing port 8080...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
    echo   stopping PID %%a
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo Starting proxy server on http://localhost:8080
echo API proxy -^> http://localhost:5036
echo.

start "" "http://localhost:8080"
set PORT=8080
set BACKEND_URL=http://localhost:5036
python server.py
