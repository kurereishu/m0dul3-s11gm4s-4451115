$ErrorActionPreference = "Stop"

if (-not $env:GEMINI_API_KEY) {
  $env:GEMINI_API_KEY = Read-Host "Pega tu GEMINI_API_KEY"
}

node "$PSScriptRoot\gemini-server.js"
