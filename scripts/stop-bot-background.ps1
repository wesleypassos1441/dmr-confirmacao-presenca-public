$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "bot-background-common.ps1")

$envContent = Get-Content -LiteralPath (Join-Path $script:BotRoot ".env") -Raw
$sessionId = "dmr-confirmacao-presenca"
$sessionMatch = [regex]::Match($envContent, "(?m)^\s*WHATSAPP_SESSION_ID\s*=\s*(.+?)\s*$")
if ($sessionMatch.Success -and $sessionMatch.Groups[1].Value.Trim()) {
  $sessionId = $sessionMatch.Groups[1].Value.Trim() -replace "[^a-zA-Z0-9_-]", "-"
}
$sessionPath = Join-Path $script:BotRoot "apps\whatsapp-bot\.wwebjs_auth\session-$sessionId"
$runtimeLockPath = Join-Path $script:BotRoot "apps\whatsapp-bot\.dmr-bot.lock"
$allProcesses = @(Get-CimInstance Win32_Process)
$sessionProcessIds = @($allProcesses |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine.IndexOf($sessionPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
  } |
  ForEach-Object { [int]$_.ProcessId })

function Get-BotRuntimeLockProcessIds {
  if (-not (Test-Path -LiteralPath $runtimeLockPath)) {
    return @()
  }

  $runtimePidText = (Get-Content -LiteralPath $runtimeLockPath -Raw -ErrorAction SilentlyContinue).Trim()
  $runtimePid = 0
  if (-not [int]::TryParse($runtimePidText, [ref]$runtimePid)) {
    return @()
  }

  $runtimeProcess = $allProcesses | Where-Object { [int]$_.ProcessId -eq $runtimePid } | Select-Object -First 1
  if (-not $runtimeProcess -or -not $runtimeProcess.CommandLine) {
    return @()
  }

  $isBotNode = $runtimeProcess.Name -ieq "node.exe" -and
    ($runtimeProcess.CommandLine -match "dist/index\.js" -or
      $runtimeProcess.CommandLine -match "src/index\.ts" -or
      $runtimeProcess.CommandLine.IndexOf("whatsapp-bot", [System.StringComparison]::OrdinalIgnoreCase) -ge 0)

  if (-not $isBotNode) {
    return @()
  }

  return @([int]$runtimeProcess.ProcessId)
}

$runtimeLockProcessIds = @(Get-BotRuntimeLockProcessIds)

$state = Get-BotSupervisorState
if (-not $state -or -not (Test-BotSupervisorState -State $state)) {
  foreach ($runtimeProcessId in $runtimeLockProcessIds) {
    Stop-Process -Id $runtimeProcessId -Force -ErrorAction SilentlyContinue
  }
  foreach ($sessionProcessId in $sessionProcessIds) {
    Stop-Process -Id $sessionProcessId -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $runtimeLockPath -Force -ErrorAction SilentlyContinue
  Remove-BotSupervisorState
  Write-Host "O Bot DMR ja esta OFFLINE."
  exit 0
}

$supervisorId = [int]$state.pid
$descendants = New-Object System.Collections.Generic.List[int]
$pendingParents = New-Object System.Collections.Generic.Queue[int]
$pendingParents.Enqueue($supervisorId)

while ($pendingParents.Count -gt 0) {
  $parentId = $pendingParents.Dequeue()
  foreach ($child in $allProcesses | Where-Object { [int]$_.ParentProcessId -eq $parentId }) {
    $childId = [int]$child.ProcessId
    $descendants.Add($childId)
    $pendingParents.Enqueue($childId)
  }
}

for ($index = $descendants.Count - 1; $index -ge 0; $index--) {
  Stop-Process -Id $descendants[$index] -Force -ErrorAction SilentlyContinue
}
foreach ($runtimeProcessId in $runtimeLockProcessIds) {
  Stop-Process -Id $runtimeProcessId -Force -ErrorAction SilentlyContinue
}
foreach ($sessionProcessId in $sessionProcessIds) {
  Stop-Process -Id $sessionProcessId -Force -ErrorAction SilentlyContinue
}
Stop-Process -Id $supervisorId -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
Remove-Item -LiteralPath $runtimeLockPath -Force -ErrorAction SilentlyContinue
Remove-BotSupervisorState -ExpectedProcessId $supervisorId
Write-BotBackgroundLog "Bot desligado pelo comando do usuario."
Write-Host "Bot DMR desligado corretamente."
