@echo off
set LOGFILE="%~dp0app_launch_log.txt"
echo [%date% %time%] Intentando iniciar aplicacion... >> %LOGFILE%
cd /d "c:\Users\tc_fr\.gemini\antigravity\scratch\concursos-parana"

echo Iniciando el servidor de Next.js...
echo El navegador se abrira automaticamente en unos segundos.
echo Presiona Ctrl+C para detener el programa.
echo.

:: Abrir el navegador en segundo plano despues de un breve retraso
start /b cmd /c "timeout /t 5 >nul && start http://localhost:3002"

call npm run dev
if %errorlevel% neq 0 (
    echo [ERROR] El programa se detuvo con codigo %errorlevel%
    echo [%date% %time%] ERROR: codigo %errorlevel% >> %LOGFILE%
    pause
)
