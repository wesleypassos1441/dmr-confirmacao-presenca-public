function Write-BotRuntimeExitCode {
  param(
    [string]$Path,
    [Parameter(Mandatory = $true)][int]$Code
  )

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return
  }

  $directory = Split-Path -Parent $Path
  if ($directory -and -not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  [System.IO.File]::WriteAllText($Path, [string]$Code)
}

function Resolve-BotRuntimeExitCode {
  param(
    [Parameter(Mandatory = $true)][bool]$WatchdogTriggered,
    [AllowNull()][object]$ProcessExitCode,
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$RestartExitCode = 75
  )

  if ($WatchdogTriggered) {
    return $RestartExitCode
  }

  if (Test-Path -LiteralPath $Path) {
    $markerCode = 0
    $markerValue = (Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue).Trim()
    if ([int]::TryParse($markerValue, [ref]$markerCode)) {
      return $markerCode
    }
  }

  $observedCode = 0
  if ($null -ne $ProcessExitCode -and
      [int]::TryParse([string]$ProcessExitCode, [ref]$observedCode)) {
    return $observedCode
  }

  return 1
}
