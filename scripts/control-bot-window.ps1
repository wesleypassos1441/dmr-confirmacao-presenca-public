param(
  [ValidateSet("minimize", "restore")]
  [string]$Action = "minimize"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env"
$envContent = ""
$headlessConfigured = $false

$sessionId = "dmr-confirmacao-presenca"
if (Test-Path -LiteralPath $envPath) {
  $envContent = Get-Content -LiteralPath $envPath -Raw
  $headlessMatch = [regex]::Match($envContent, "(?m)^\s*WHATSAPP_HEADLESS\s*=\s*(.+?)\s*$")
  $headlessConfigured = $headlessMatch.Success -and
    $headlessMatch.Groups[1].Value.Trim().Trim('"') -ine "false"
  $sessionMatch = [regex]::Match($envContent, "(?m)^\s*WHATSAPP_SESSION_ID\s*=\s*(.+?)\s*$")
  if ($sessionMatch.Success -and $sessionMatch.Groups[1].Value.Trim()) {
    $sessionId = $sessionMatch.Groups[1].Value.Trim() -replace "[^a-zA-Z0-9_-]", "-"
  }
}

$sessionPath = Join-Path $root "apps\whatsapp-bot\.wwebjs_auth\session-$sessionId"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class DmrBotWindow {
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

$SW_MINIMIZE = 6
$SW_RESTORE = 9

$sessionProcesses = @(Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine.IndexOf($sessionPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
  })

$windows = @()
foreach ($sessionProcess in $sessionProcesses) {
  $process = Get-Process -Id $sessionProcess.ProcessId -ErrorAction SilentlyContinue
  if ($process -and $process.MainWindowHandle -ne 0) {
    $windows += $process
  }
}

if ($windows.Count -eq 0) {
  $runningHeadless = @($sessionProcesses | Where-Object {
      $_.CommandLine -and $_.CommandLine -match "--headless(?:=new)?"
    }).Count -gt 0

  if ($Action -eq "restore" -and ($headlessConfigured -or $runningHeadless)) {
    if (-not (Test-Path -LiteralPath $envPath)) {
      throw "Arquivo .env nao encontrado. Nao foi possivel ativar o modo visual."
    }

    if ($envContent -match "(?m)^\s*WHATSAPP_HEADLESS\s*=") {
      $envContent = [regex]::Replace(
        $envContent,
        "(?m)^\s*WHATSAPP_HEADLESS\s*=.*$",
        "WHATSAPP_HEADLESS=false"
      )
    } else {
      $envContent = $envContent.TrimEnd() + [Environment]::NewLine + "WHATSAPP_HEADLESS=false" + [Environment]::NewLine
    }

    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($envPath, $envContent, $utf8)

    Write-Host "O bot estava em modo invisivel. Reiniciando a mesma sessao no Edge visual..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "stop-bot-background.ps1")
    if ($LASTEXITCODE -ne 0) {
      throw "Nao foi possivel encerrar o modo invisivel do bot."
    }

    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "start-bot-background.ps1")
    if ($LASTEXITCODE -ne 0) {
      throw "Nao foi possivel reiniciar o bot no modo visual."
    }

    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "wait-and-show-bot-window.ps1")
    exit $LASTEXITCODE
  }

  if ($Action -eq "restore") {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "wait-and-show-bot-window.ps1")
    exit $LASTEXITCODE
  }

  Write-Host "Nao encontrei uma janela visual do WhatsApp do bot."
  Write-Host "Use 'Mostrar Bot DMR.cmd' para abrir o Edge visual."
  Write-Host "Para encerrar o bot, use: Desligar Bot DMR.cmd"
  exit 0
}

foreach ($window in $windows) {
  if ($Action -eq "minimize") {
    [DmrBotWindow]::ShowWindowAsync($window.MainWindowHandle, $SW_MINIMIZE) | Out-Null
  } else {
    [DmrBotWindow]::ShowWindowAsync($window.MainWindowHandle, $SW_RESTORE) | Out-Null
    [DmrBotWindow]::SetForegroundWindow($window.MainWindowHandle) | Out-Null
  }
}

if ($Action -eq "minimize") {
  Write-Host "Janela do WhatsApp do bot minimizada."
} else {
  Write-Host "Janela do WhatsApp do bot restaurada."
}
