$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Set-Location (Join-Path $PSScriptRoot "..")

function Invoke-CheckedCommand([string]$Description, [scriptblock]$Command) {
  Write-Host $Description
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Description falhou com exit code $LASTEXITCODE."
  }
}

function Deploy-Function([string]$Name, [bool]$NoVerifyJwt) {
  $jwtFlag = @()
  if ($NoVerifyJwt) {
    $jwtFlag = @("--no-verify-jwt")
  }

  Write-Host "Deploy Edge Function via API: $Name"
  & npx supabase functions deploy $Name @jwtFlag --use-api
  if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel fazer deploy da function $Name pela API."
  }
}

$botFunctions = @(
  "bot-operational-status",
  "bot-next-message",
  "bot-mark-sent",
  "bot-register-incoming",
  "bot-register-error",
  "bot-health"
)

foreach ($fn in $botFunctions) {
  Write-Host "Function sem JWT, protegida por DMR_BOT_TOKEN: $fn"
  Deploy-Function $fn $true
}

Invoke-CheckedCommand "Listando functions remotas..." {
  & npx supabase functions list
}
