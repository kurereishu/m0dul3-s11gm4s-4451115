@echo off
setlocal

set "LOG_FILE=%~dp0gemini-server.log"
set "ERR_FILE=%~dp0gemini-server-error.log"

if not exist "%LOG_FILE%" (
  echo Todavia no existe el log.
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Write-Host '--- gemini-server.log ---'; if (Test-Path -LiteralPath $env:LOG_FILE) { Get-Content -LiteralPath $env:LOG_FILE -Tail 60 }; Write-Host ''; Write-Host '--- gemini-server-error.log ---'; if (Test-Path -LiteralPath $env:ERR_FILE) { Get-Content -LiteralPath $env:ERR_FILE -Tail 60 }; Write-Host ''; Write-Host 'Actualizando log principal...'; if (Test-Path -LiteralPath $env:LOG_FILE) { Get-Content -LiteralPath $env:LOG_FILE -Tail 20 -Wait }"
endlocal
