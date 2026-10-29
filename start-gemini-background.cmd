@echo off
setlocal

set "NODE_EXE="
set "SERVER_DIR=%~dp0"
set "SERVER_JS=%~dp0gemini-server.js"
set "LOG_FILE=%~dp0gemini-server.log"
set "ERR_FILE=%~dp0gemini-server-error.log"
set "PID_FILE=%~dp0gemini-server.pid"

rem Prefer Node.js installed on this computer; also allow a bundled portable copy.
for /f "delims=" %%N in ('where.exe node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
if not defined NODE_EXE if exist "%~dp0runtime\node.exe" set "NODE_EXE=%~dp0runtime\node.exe"

if not defined NODE_EXE (
  echo No se encontro Node.js. Instala Node.js o coloca node.exe en la carpeta runtime junto a este lanzador.
  pause
  exit /b 1
)

if not exist "%NODE_EXE%" (
  echo No se encontro Node.js. Instala Node.js o coloca node.exe en la carpeta runtime junto a este lanzador.
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

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$env:GEMINI_API_KEY=$env:GEMINI_API_KEY; $p = Start-Process -WindowStyle Hidden -WorkingDirectory $env:SERVER_DIR -FilePath $env:NODE_EXE -ArgumentList 'gemini-server.js' -RedirectStandardOutput $env:LOG_FILE -RedirectStandardError $env:ERR_FILE -PassThru; Set-Content -LiteralPath $env:PID_FILE -Value $p.Id"

echo Servidor Gemini iniciado en segundo plano.
echo Log: %LOG_FILE%
echo Errores: %ERR_FILE%
echo PID: 
type "%PID_FILE%"
echo.
echo Puedes cerrar esta ventana.
endlocal
