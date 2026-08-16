$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env")) {
  Write-Host "Arquivo .env nao encontrado."
  exit 1
}

$envContent = Get-Content ".env" -Raw
$configuredBrowser = $null
$match = [regex]::Match($envContent, "(?m)^\s*WHATSAPP_BROWSER_PATH\s*=\s*(.+?)\s*$")
if ($match.Success) {
  $configuredBrowser = $match.Groups[1].Value.Trim()
}
$configuredSession = "dmr-confirmacao-presenca"
$sessionMatch = [regex]::Match($envContent, "(?m)^\s*WHATSAPP_SESSION_ID\s*=\s*(.+?)\s*$")
if ($sessionMatch.Success -and $sessionMatch.Groups[1].Value.Trim()) {
  $configuredSession = $sessionMatch.Groups[1].Value.Trim() -replace "[^a-zA-Z0-9_-]", "-"
}

$browserCandidates = @(
  $configuredBrowser,
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

if ($browserCandidates.Count -eq 0) {
  Write-Host "Nao encontrei Chrome ou Edge instalado."
  Write-Host "Preencha WHATSAPP_BROWSER_PATH no .env com o caminho do chrome.exe ou msedge.exe."
  exit 1
}

$browserPath = $browserCandidates[0]
$sessionPath = Join-Path $root "apps\whatsapp-bot\.wwebjs_auth\session-$configuredSession"
New-Item -ItemType Directory -Force -Path $sessionPath | Out-Null

Write-Host "Abrindo WhatsApp Web com a mesma sessao local usada pelo bot..."
Write-Host "Sessao: $configuredSession"
Write-Host "Navegador: $browserPath"
Write-Host "Na janela que abrir, use o WhatsApp da DMR em Aparelhos conectados para escanear o QR Code."
Write-Host "Quando a tela de conversas carregar, volte aqui e pressione Enter."

$args = @(
  "--user-data-dir=$sessionPath",
  "--no-first-run",
  "--new-window",
  "https://web.whatsapp.com/"
)

Start-Process -FilePath $browserPath -ArgumentList $args | Out-Null

Read-Host "Depois de conectar em Aparelhos conectados e ver suas conversas, pressione Enter"
Write-Host "Encerrando somente o navegador visual desta sessao antes de iniciar o bot..."
$sessionProcesses = @(Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine.IndexOf($sessionPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
  })

foreach ($process in $sessionProcesses) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

for ($attempt = 1; $attempt -le 10; $attempt++) {
  $remaining = @(Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine.IndexOf($sessionPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    })
  if ($remaining.Count -eq 0) { break }
  Start-Sleep -Milliseconds 500
}

if ($remaining.Count -gt 0) {
  throw "O navegador visual ainda esta usando a sessao. Feche essa janela e rode o login novamente."
}

Write-Host "A sessao visual foi encerrada corretamente e ficou livre para o bot."
Write-Host "Agora rode:"
Write-Host "powershell -ExecutionPolicy Bypass -File scripts/start-bot.ps1"
