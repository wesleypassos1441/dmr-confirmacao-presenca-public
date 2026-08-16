param(
  [Parameter(Mandatory = $true)]
  [string]$ThrottleKey,

  [Parameter(Mandatory = $true)]
  [string]$Title,

  [Parameter(Mandatory = $true)]
  [string]$Message,

  [ValidateSet("info", "warning", "error")]
  [string]$Severity = "warning",

  [int]$CooldownSeconds = 300,

  [string]$StateDirectory = "",

  [switch]$Recovery
)

$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot
$logDirectory = if ([string]::IsNullOrWhiteSpace($StateDirectory)) {
  Join-Path $root "logs"
} else {
  [System.IO.Path]::GetFullPath($StateDirectory)
}
$statePath = Join-Path $logDirectory "bot-notification-state.json"
$activeIncidentsPath = Join-Path $logDirectory "bot-active-incidents.json"
$incidentLogPath = Join-Path $logDirectory "bot-incidents.log"
$safeKey = ($ThrottleKey -replace '[^a-zA-Z0-9_-]', '_').Substring(
  0,
  [Math]::Min(80, ($ThrottleKey -replace '[^a-zA-Z0-9_-]', '_').Length)
)

if (-not (Test-Path -LiteralPath $logDirectory)) {
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
}

function Get-DmrEnvironmentValue {
  param([Parameter(Mandatory = $true)][string]$Name)

  $processValue = [Environment]::GetEnvironmentVariable($Name)
  if (-not [string]::IsNullOrWhiteSpace($processValue)) {
    return $processValue.Trim()
  }

  $envPath = Join-Path $root ".env"
  if (-not (Test-Path -LiteralPath $envPath)) {
    return ""
  }

  $escapedName = [Regex]::Escape($Name)
  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match "^\s*$escapedName\s*=(.*)$") {
      $value = $matches[1].Trim()
      if ($value.Length -ge 2) {
        $quoted = ($value.StartsWith('"') -and $value.EndsWith('"')) -or
          ($value.StartsWith("'") -and $value.EndsWith("'"))
        if ($quoted) {
          $value = $value.Substring(1, $value.Length - 2)
        }
      }
      return $value
    }
  }

  return ""
}

$configuredCooldown = 0
[int]::TryParse(
  (Get-DmrEnvironmentValue -Name "TELEGRAM_ALERT_COOLDOWN_SECONDS"),
  [ref]$configuredCooldown
) | Out-Null
if ($configuredCooldown -gt 0) {
  $CooldownSeconds = $configuredCooldown
}

function Read-StateFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  $result = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $result
  }

  try {
    $savedState = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    foreach ($property in $savedState.PSObject.Properties) {
      $result[$property.Name] = [string]$property.Value
    }
  } catch {
    $result = @{}
  }

  return $result
}

function Write-StateFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][hashtable]$Value
  )

  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json), $utf8)
}

$state = Read-StateFile -Path $statePath
$activeIncidents = Read-StateFile -Path $activeIncidentsPath
$now = [datetime]::UtcNow

if ($Recovery) {
  if ($activeIncidents.Count -eq 0) {
    exit 0
  }

  foreach ($incidentKey in @($activeIncidents.Keys)) {
    $state.Remove($incidentKey)
  }
} else {
  $activeIncidents[$safeKey] = $now.ToString("o")
  Write-StateFile -Path $activeIncidentsPath -Value $activeIncidents
}

$lastNotification = [datetime]::MinValue
$hasLastNotification = $false
if (-not $Recovery -and $state.ContainsKey($safeKey)) {
  $hasLastNotification = [datetime]::TryParse(
    [string]$state[$safeKey],
    [System.Globalization.CultureInfo]::InvariantCulture,
    [System.Globalization.DateTimeStyles]::RoundtripKind,
    [ref]$lastNotification
  )
}

if ($hasLastNotification -and
    ($now - $lastNotification).TotalSeconds -lt [Math]::Max(30, $CooldownSeconds)) {
  exit 0
}

$state[$safeKey] = $now.ToString("o")
Write-StateFile -Path $statePath -Value $state

$localTimestamp = Get-Date -Format "dd/MM/yyyy HH:mm:ss"
Add-Content -LiteralPath $incidentLogPath -Value "[$localTimestamp] [$Severity] $Title - $Message" -Encoding UTF8

$telegramEnabled = (Get-DmrEnvironmentValue -Name "TELEGRAM_ALERTS_ENABLED") -eq "true"
$telegramToken = Get-DmrEnvironmentValue -Name "TELEGRAM_BOT_TOKEN"
$telegramChatId = Get-DmrEnvironmentValue -Name "TELEGRAM_CHAT_ID"
if ($telegramEnabled -and
    -not [string]::IsNullOrWhiteSpace($telegramToken) -and
    -not [string]::IsNullOrWhiteSpace($telegramChatId)) {
  $telegramApiBaseUrl = Get-DmrEnvironmentValue -Name "TELEGRAM_API_BASE_URL"
  if ([string]::IsNullOrWhiteSpace($telegramApiBaseUrl)) {
    $telegramApiBaseUrl = "https://api.telegram.org"
  }
  $telegramApiBaseUrl = $telegramApiBaseUrl.TrimEnd("/")
  $telegramText = "[$($Severity.ToUpperInvariant())] $Title`n`n$Message`n`nHorario de Brasilia: $localTimestamp"

  $telegramRetryAttempts = 3
  [int]::TryParse((Get-DmrEnvironmentValue -Name "TELEGRAM_RETRY_ATTEMPTS"), [ref]$telegramRetryAttempts) | Out-Null
  $telegramRetryAttempts = [Math]::Max(1, [Math]::Min(5, $telegramRetryAttempts))
  $telegramRetryDelayMs = 1000
  [int]::TryParse((Get-DmrEnvironmentValue -Name "TELEGRAM_RETRY_DELAY_MS"), [ref]$telegramRetryDelayMs) | Out-Null
  $telegramRetryDelayMs = [Math]::Max(10, [Math]::Min(10000, $telegramRetryDelayMs))
  $telegramSent = $false

  for ($attempt = 1; $attempt -le $telegramRetryAttempts; $attempt++) {
    try {
      Invoke-RestMethod `
        -Method Post `
        -Uri "$telegramApiBaseUrl/bot$telegramToken/sendMessage" `
        -Body @{
          chat_id = $telegramChatId
          text = $telegramText
          disable_web_page_preview = "true"
        } `
        -ContentType "application/x-www-form-urlencoded" `
        -TimeoutSec 10 | Out-Null
      $telegramSent = $true
      break
    } catch {
      if ($attempt -lt $telegramRetryAttempts) {
        Start-Sleep -Milliseconds ($telegramRetryDelayMs * $attempt)
      }
    }
  }

  if (-not $telegramSent) {
    Add-Content `
      -LiteralPath $incidentLogPath `
      -Value "[$localTimestamp] [warning] Nao foi possivel enviar o alerta pelo Telegram." `
      -Encoding UTF8
  }
}

$desktopNotificationsDisabled =
  (Get-DmrEnvironmentValue -Name "DMR_DISABLE_DESKTOP_NOTIFICATIONS") -eq "true"
if (-not $desktopNotificationsDisabled) {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $notification = New-Object System.Windows.Forms.NotifyIcon
    $notification.Icon = if ($Severity -eq "error") {
      [System.Drawing.SystemIcons]::Error
    } elseif ($Severity -eq "warning") {
      [System.Drawing.SystemIcons]::Warning
    } else {
      [System.Drawing.SystemIcons]::Information
    }
    $notification.BalloonTipIcon = if ($Severity -eq "error") {
      [System.Windows.Forms.ToolTipIcon]::Error
    } elseif ($Severity -eq "warning") {
      [System.Windows.Forms.ToolTipIcon]::Warning
    } else {
      [System.Windows.Forms.ToolTipIcon]::Info
    }
    $notification.BalloonTipTitle = $Title
    $notification.BalloonTipText = $Message
    $notification.Visible = $true
    $notification.ShowBalloonTip(10000)
    Start-Sleep -Milliseconds 2500
    $notification.Dispose()
  } catch {
    # O log continua disponivel quando as notificacoes do Windows estiverem bloqueadas.
  }
}

if ($Recovery) {
  Remove-Item -LiteralPath $activeIncidentsPath -Force -ErrorAction SilentlyContinue
}
