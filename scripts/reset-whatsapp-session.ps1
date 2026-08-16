param(
  [switch]$Force,
  [switch]$NovaSessao
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$botRoot = Join-Path $root "apps\whatsapp-bot"
$envPath = Join-Path $root ".env"
$sessionId = "dmr-confirmacao-presenca"
if (Test-Path -LiteralPath $envPath) {
  $envContent = Get-Content -LiteralPath $envPath -Raw
  $sessionMatch = [regex]::Match($envContent, "(?m)^\s*WHATSAPP_SESSION_ID\s*=\s*(.+?)\s*$")
  if ($sessionMatch.Success -and $sessionMatch.Groups[1].Value.Trim()) {
    $sessionId = $sessionMatch.Groups[1].Value.Trim() -replace "[^a-zA-Z0-9_-]", "-"
  }
}
$sessionPath = Join-Path $botRoot ".wwebjs_auth\session-$sessionId"
$cachePath = Join-Path $botRoot ".wwebjs_cache"

if ($NovaSessao) {
  if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Arquivo .env nao encontrado para configurar uma nova sessao."
  }

  $newSessionId = "dmr-confirmacao-presenca-$((Get-Date).ToString('yyyyMMddHHmmss'))"
  $envContent = Get-Content -LiteralPath $envPath -Raw
  if ($envContent -match "(?m)^\s*WHATSAPP_SESSION_ID\s*=") {
    $envContent = [regex]::Replace($envContent, "(?m)^\s*WHATSAPP_SESSION_ID\s*=.*$", "WHATSAPP_SESSION_ID=$newSessionId")
  } else {
    $envContent = $envContent.TrimEnd() + [Environment]::NewLine + "WHATSAPP_SESSION_ID=$newSessionId" + [Environment]::NewLine
  }
  $utf8WithoutBom = new-object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($envPath, $envContent, $utf8WithoutBom)
  Write-Host "Nova sessao configurada no .env: $newSessionId"
  Write-Host "Agora rode:"
  Write-Host "powershell -ExecutionPolicy Bypass -File scripts/whatsapp-login.ps1"
  exit 0
}

$targets = @($sessionPath, $cachePath) | Where-Object { Test-Path -LiteralPath $_ }

if ($targets.Count -eq 0) {
  Write-Host "Nenhuma sessao/cache local do WhatsApp encontrada para resetar."
  exit 0
}

Write-Host "Isto vai apagar somente a sessao local do WhatsApp deste bot."
Write-Host "Depois, ao iniciar o bot, sera necessario escanear o QR Code novamente."
Write-Host "Sessao atual: $sessionId"
Write-Host ""
foreach ($target in $targets) {
  Write-Host "Alvo: $target"
}

if (-not $Force) {
  $answer = Read-Host "Digite RESETAR para confirmar"
  if ($answer -ne "RESETAR") {
    Write-Host "Operacao cancelada. Nada foi apagado."
    exit 0
  }
}

Write-Host ""
Write-Host "Fechando navegadores/processos que ainda estao usando a sessao local do bot..."
$lockedProcesses = @(Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and (
      $_.CommandLine.IndexOf($sessionPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
      $_.CommandLine.IndexOf($cachePath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    )
  })

foreach ($process in $lockedProcesses) {
  Write-Host "Encerrando processo $($process.ProcessId): $($process.Name)"
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

if ($lockedProcesses.Count -gt 0) {
  Start-Sleep -Seconds 2
}

foreach ($target in $targets) {
  $resolved = (Resolve-Path -LiteralPath $target).Path
  if (-not $resolved.StartsWith($botRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Caminho fora da pasta esperada: $resolved"
  }
  $removed = $false
  for ($attempt = 1; $attempt -le 3 -and -not $removed; $attempt++) {
    try {
      Remove-Item -LiteralPath $resolved -Recurse -Force
      $removed = $true
    } catch {
      if ($attempt -eq 3) {
        throw "Nao consegui apagar $resolved porque ainda existe algum processo usando a sessao. Feche a janela do WhatsApp/bot e rode este script novamente."
      }
      Start-Sleep -Seconds 2
    }
  }
}

Write-Host "Sessao/cache local resetados. Agora rode:"
Write-Host "powershell -ExecutionPolicy Bypass -File scripts/start-bot.ps1"
