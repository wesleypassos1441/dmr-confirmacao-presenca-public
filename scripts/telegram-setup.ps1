$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env"
$apiBaseUrl = "https://api.telegram.org"

function Set-EnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $lines = New-Object 'System.Collections.Generic.List[string]'
  if (Test-Path -LiteralPath $envPath) {
    foreach ($line in Get-Content -LiteralPath $envPath) {
      $lines.Add([string]$line)
    }
  }

  $escapedName = [Regex]::Escape($Name)
  $updated = $false
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match "^\s*$escapedName\s*=") {
      $lines[$index] = "$Name=$Value"
      $updated = $true
      break
    }
  }
  if (-not $updated) {
    $lines.Add("$Name=$Value")
  }

  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($envPath, $lines, $utf8)
}

Write-Host ""
Write-Host "CONFIGURACAO GUIADA DO TELEGRAM" -ForegroundColor Cyan
Write-Host "O token e o Chat ID ficarao somente no .env local do bot."
Write-Host "Eles nao serao enviados ao GitHub, Netlify ou frontend."
Write-Host ""

$tokenSeguro = Read-Host "Cole o NOVO token do Telegram Bot" -AsSecureString
$credencial = New-Object System.Management.Automation.PSCredential("telegram", $tokenSeguro)
$token = $credencial.GetNetworkCredential().Password

try {
  if ($token -notmatch "^\d{6,12}:[A-Za-z0-9_-]{30,}$") {
    throw "O token informado nao possui o formato esperado do Telegram."
  }

  Write-Host "Validando o token com o Telegram..."
  $bot = Invoke-RestMethod -Uri "$apiBaseUrl/bot$token/getMe" -TimeoutSec 15
  if (-not $bot.ok) {
    throw "O Telegram nao confirmou o token informado."
  }

  $chatId = (Read-Host "Cole o Chat ID obtido no teste").Trim()
  if ($chatId -notmatch "^-?\d+$") {
    throw "O Chat ID deve conter somente numeros."
  }

  Write-Host "Enviando mensagem de validacao..."
  $test = Invoke-RestMethod `
    -Method Post `
    -Uri "$apiBaseUrl/bot$token/sendMessage" `
    -Body @{
      chat_id = $chatId
      text = "DMR: notificacoes operacionais do Telegram configuradas com sucesso."
    } `
    -TimeoutSec 15
  if (-not $test.ok) {
    throw "O Telegram nao confirmou o envio da mensagem de validacao."
  }

  Set-EnvValue -Name "TELEGRAM_ALERTS_ENABLED" -Value "true"
  Set-EnvValue -Name "TELEGRAM_BOT_TOKEN" -Value $token
  Set-EnvValue -Name "TELEGRAM_CHAT_ID" -Value $chatId
  Set-EnvValue -Name "TELEGRAM_ALERT_COOLDOWN_SECONDS" -Value "900"

  Write-Host ""
  Write-Host "Telegram configurado com sucesso." -ForegroundColor Green
  Write-Host "Reinicie o Bot DMR para carregar a configuracao."
} finally {
  Remove-Variable token, tokenSeguro, credencial, bot, chatId, test -ErrorAction SilentlyContinue
}
