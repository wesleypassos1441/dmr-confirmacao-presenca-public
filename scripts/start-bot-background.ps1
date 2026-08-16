$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "bot-background-common.ps1")
$supervisorPath = Join-Path $PSScriptRoot "bot-supervisor.ps1"

$state = Get-BotSupervisorState
if ($state -and (Test-BotSupervisorState -State $state)) {
  Write-Host "O Bot DMR ja esta executando em segundo plano."
  Write-Host "Use 'Status Bot DMR.cmd' para consultar o estado."
  exit 0
}

Remove-BotSupervisorState
if (-not (Test-Path -LiteralPath $script:BotLogDirectory)) {
  New-Item -ItemType Directory -Path $script:BotLogDirectory -Force | Out-Null
}
if ((Test-Path -LiteralPath $script:BotLogPath) -and (Get-Item -LiteralPath $script:BotLogPath).Length -gt 5MB) {
  Move-Item -LiteralPath $script:BotLogPath -Destination "$($script:BotLogPath).1" -Force
}

$process = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$supervisorPath`""
)

Start-Sleep -Milliseconds 800
if ($process.HasExited) {
  Write-Host "Nao foi possivel iniciar o Bot DMR. Consulte: $script:BotLogPath"
  exit 1
}

Write-Host "Bot DMR iniciado em segundo plano."
Write-Host "Use 'Status Bot DMR.cmd' para confirmar quando estiver ONLINE."
