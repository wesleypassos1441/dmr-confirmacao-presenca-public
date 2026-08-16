$script:BotRoot = Split-Path -Parent $PSScriptRoot
$script:BotStatePath = Join-Path $script:BotRoot "apps\whatsapp-bot\.dmr-bot-supervisor.json"
$script:BotLogDirectory = Join-Path $script:BotRoot "logs"
$script:BotLogPath = Join-Path $script:BotLogDirectory "bot-background.log"
$script:BotRuntimeHealthPath = Join-Path $script:BotLogDirectory "bot-runtime-health.json"
$script:BotSupervisorPath = Join-Path $PSScriptRoot "bot-supervisor.ps1"

function Import-BotEnvironment {
  $envPath = Join-Path $script:BotRoot ".env"
  if (-not (Test-Path -LiteralPath $envPath)) { return }

  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^\s*([^#][^=]*)=(.*)$') {
      [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim('"'), "Process")
    }
  }
}

function Get-BotSupervisorState {
  if (-not (Test-Path -LiteralPath $script:BotStatePath)) {
    return $null
  }

  try {
    return Get-Content -LiteralPath $script:BotStatePath -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Get-BotProcess {
  param([int]$ProcessId)

  try {
    return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
  } catch {
    return $null
  }
}

function Test-BotSupervisorState {
  param($State = (Get-BotSupervisorState))

  if (-not $State -or -not $State.pid) {
    return $false
  }

  $process = Get-BotProcess -ProcessId ([int]$State.pid)
  if (-not $process -or -not $process.CommandLine) {
    return $false
  }

  $expectedScript = [System.IO.Path]::GetFullPath($script:BotSupervisorPath)
  return $process.CommandLine.IndexOf("bot-supervisor.ps1", [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $process.CommandLine.IndexOf($expectedScript, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Set-BotSupervisorState {
  param(
    [int]$ProcessId,
    [string]$Status,
    [datetime]$StartedAt
  )

  $state = [ordered]@{
    pid = $ProcessId
    status = $Status
    started_at = $StartedAt.ToUniversalTime().ToString("o")
    project_root = $script:BotRoot
    log_path = $script:BotLogPath
  }
  $json = $state | ConvertTo-Json
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($script:BotStatePath, $json, $utf8)
}

function Remove-BotSupervisorState {
  param([int]$ExpectedProcessId = 0)

  $state = Get-BotSupervisorState
  if ($ExpectedProcessId -gt 0 -and $state -and [int]$state.pid -ne $ExpectedProcessId) {
    return
  }
  Remove-Item -LiteralPath $script:BotStatePath -Force -ErrorAction SilentlyContinue
}

function Write-BotBackgroundLog {
  param([string]$Message)

  if (-not (Test-Path -LiteralPath $script:BotLogDirectory)) {
    New-Item -ItemType Directory -Path $script:BotLogDirectory -Force | Out-Null
  }
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $script:BotLogPath -Value "[$timestamp] $Message" -Encoding UTF8
}
