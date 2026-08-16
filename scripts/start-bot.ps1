$ErrorActionPreference = "Stop"
$RESTART_EXIT_CODE = 75
. (Join-Path $PSScriptRoot "bot-runtime-exit-code.ps1")

function Exit-BotRuntime {
  param([Parameter(Mandatory = $true)][int]$Code)

  Write-BotRuntimeExitCode -Path $env:DMR_BOT_EXIT_CODE_PATH -Code $Code
  exit $Code
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:NPM_CONFIG_UPDATE_NOTIFIER = "false"
$env:NO_UPDATE_NOTIFIER = "1"

if (-not (Test-Path ".env")) {
  Write-Host "Arquivo .env nao encontrado."
  Write-Host "Copie .env.example para .env e preencha DMR_BOT_TOKEN antes de iniciar o bot."
  Exit-BotRuntime -Code 1
}

$envContent = Get-Content ".env" -Raw
$sessionId = "dmr-confirmacao-presenca"
$sessionMatch = [regex]::Match($envContent, "(?m)^\s*WHATSAPP_SESSION_ID\s*=\s*(.+?)\s*$")
if ($sessionMatch.Success -and $sessionMatch.Groups[1].Value.Trim()) {
  $sessionId = $sessionMatch.Groups[1].Value.Trim() -replace "[^a-zA-Z0-9_-]", "-"
}
$sessionPath = Join-Path $root "apps\whatsapp-bot\.wwebjs_auth\session-$sessionId"
$sessionProcesses = @(Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine.IndexOf($sessionPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
  })

if ($sessionProcesses.Count -gt 0) {
  Write-Host "A sessao do bot ja esta aberta em outro navegador."
  Write-Host "Feche a janela de login do WhatsApp e tente iniciar o bot novamente."
  Write-Host "Processos encontrados: $($sessionProcesses.ProcessId -join ', ')"
  Exit-BotRuntime -Code $RESTART_EXIT_CODE
}

$profileMaintenanceScript = Join-Path $PSScriptRoot "maintain-whatsapp-profile.ps1"
& powershell -NoProfile -ExecutionPolicy Bypass -File $profileMaintenanceScript -SessionPath $sessionPath
if ($LASTEXITCODE -ne 0) {
  Write-Host "A manutencao preventiva do Edge falhou. O bot nao sera aberto com um perfil possivelmente inconsistente."
  Exit-BotRuntime -Code $LASTEXITCODE
}

if ($envContent -notmatch "EDGE_FUNCTIONS_BASE_URL\s*=\s*https://example-project-ref\.functions\.supabase\.co") {
  Write-Host "EDGE_FUNCTIONS_BASE_URL ausente ou diferente do projeto Supabase esperado."
  Write-Host "Use: EDGE_FUNCTIONS_BASE_URL=https://example-project-ref.functions.supabase.co"
  Exit-BotRuntime -Code 1
}

if ($envContent -match "DMR_BOT_TOKEN\s*=\s*(cole_aqui|$)") {
  Write-Host "DMR_BOT_TOKEN ainda nao foi preenchido no .env."
  Exit-BotRuntime -Code 1
}

if ($envContent -notmatch "WHATSAPP_PAIR_PHONE_NUMBER\s*=\s*55\d{10,11}") {
  Write-Host "WHATSAPP_PAIR_PHONE_NUMBER nao esta configurado com um telefone valido."
  Write-Host "Como o QR interno do WhatsApp Web pode falhar, preencha no .env o telefone do WhatsApp da DMR."
  Write-Host "Exemplo: WHATSAPP_PAIR_PHONE_NUMBER=5510900000008"
  Write-Host "Ou use o login visual antes de iniciar:"
  Write-Host "powershell -ExecutionPolicy Bypass -File scripts/whatsapp-login.ps1"
}

Write-Host "Preparando bot WhatsApp local em modo operacional..."
npm run build -w apps/whatsapp-bot
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build do bot falhou. Corrija as mensagens acima antes de iniciar."
  Exit-BotRuntime -Code $LASTEXITCODE
}

Write-Host "Iniciando bot WhatsApp local..."
npm run start -w apps/whatsapp-bot
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Se o erro mencionar 'EBUSY', o navegador ainda manteve um arquivo da sessao bloqueado."
  Write-Host "Feche a janela do WhatsApp aberta pelo bot e rode scripts/reset-whatsapp-session.ps1."
  Write-Host "Se o erro mencionar 'Execution context was destroyed', a sessao local do WhatsApp pode ter quebrado."
  Write-Host "Se quiser uma sessao limpa, rode primeiro:"
  Write-Host "powershell -ExecutionPolicy Bypass -File scripts/reset-whatsapp-session.ps1"
  Write-Host "Para autenticar visualmente usando a mesma sessao do bot, rode:"
  Write-Host "powershell -ExecutionPolicy Bypass -File scripts/whatsapp-login.ps1"
  Write-Host "Depois rode novamente:"
  Write-Host "powershell -ExecutionPolicy Bypass -File scripts/start-bot.ps1"
  Exit-BotRuntime -Code $LASTEXITCODE
}

Exit-BotRuntime -Code 0
