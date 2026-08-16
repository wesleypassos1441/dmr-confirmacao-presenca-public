param(
  [int]$TimeoutSeconds = 45
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env"

$sessionId = "dmr-confirmacao-presenca"
if (Test-Path -LiteralPath $envPath) {
  $envContent = Get-Content -LiteralPath $envPath -Raw
  $sessionMatch = [regex]::Match($envContent, "(?m)^\s*WHATSAPP_SESSION_ID\s*=\s*(.+?)\s*$")
  if ($sessionMatch.Success -and $sessionMatch.Groups[1].Value.Trim()) {
    $sessionId = $sessionMatch.Groups[1].Value.Trim() -replace "[^a-zA-Z0-9_-]", "-"
  }
}

$sessionPath = Join-Path $root "apps\whatsapp-bot\.wwebjs_auth\session-$sessionId"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class DmrBotWaitWindow {
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$SW_RESTORE = 9

while ((Get-Date) -lt $deadline) {
  $sessionProcesses = @(Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine.IndexOf($sessionPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    })

  foreach ($sessionProcess in $sessionProcesses) {
    $process = Get-Process -Id $sessionProcess.ProcessId -ErrorAction SilentlyContinue
    if ($process -and $process.MainWindowHandle -ne 0) {
      [DmrBotWaitWindow]::ShowWindowAsync($process.MainWindowHandle, $SW_RESTORE) | Out-Null
      [DmrBotWaitWindow]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
      Write-Host "Janela do WhatsApp do bot aberta."
      exit 0
    }
  }

  Start-Sleep -Seconds 2
}

Write-Host "Bot iniciado em segundo plano. A janela visual do WhatsApp ainda nao apareceu."
Write-Host "Use 'Status Bot DMR.cmd' para conferir o estado ou 'Mostrar Bot DMR.cmd' para tentar restaurar depois."
