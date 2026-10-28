@echo off
setlocal

set "PID_FILE=%~dp0gemini-server.pid"

if not exist "%PID_FILE%" (
  echo No encontre gemini-server.pid. Intentando detener procesos node con gemini-server.js...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*gemini-server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
  echo Listo.
  exit /b 0
)

set /p PID=<"%PID_FILE%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Process -Id %PID% -ErrorAction SilentlyContinue) { Stop-Process -Id %PID% -Force }"
del "%PID_FILE%" >nul 2>nul

echo Servidor Gemini detenido.
endlocal
