@echo off
setlocal

set "NODE_EXE=C:\Users\HANDRESTH\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "SERVER_JS=%~dp0gemini-server.js"
set "LOG_FILE=%~dp0gemini-server.log"
set "ERR_FILE=%~dp0gemini-server-error.log"
set "PID_FILE=%~dp0gemini-server.pid"

if not exist "%NODE_EXE%" (
  echo No se encontro Node en:
  echo %NODE_EXE%
  pause
  exit /b 1
)

if "%GEMINI_API_KEY%"=="" (
  set /p GEMINI_API_KEY=Pega tu GEMINI_API_KEY: 
)

if "%GEMINI_API_KEY%"=="" (
  echo Falta GEMINI_API_KEY.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$env:GEMINI_API_KEY=$env:GEMINI_API_KEY; $p = Start-Process -WindowStyle Hidden -FilePath $env:NODE_EXE -ArgumentList $env:SERVER_JS -RedirectStandardOutput $env:LOG_FILE -RedirectStandardError $env:ERR_FILE -PassThru; Set-Content -LiteralPath $env:PID_FILE -Value $p.Id"

echo Servidor Gemini iniciado en segundo plano.
echo Log: %LOG_FILE%
echo Errores: %ERR_FILE%
echo PID: 
type "%PID_FILE%"
echo.
echo Puedes cerrar esta ventana.
endlocal
