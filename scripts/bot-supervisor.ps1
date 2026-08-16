$ErrorActionPreference = "Continue"
. (Join-Path $PSScriptRoot "bot-background-common.ps1")
. (Join-Path $PSScriptRoot "bot-runtime-exit-code.ps1")

$RESTART_EXIT_CODE = 75
$RECOVERABLE_EXIT_CODES = @(75, 134)
$notificationScript = Join-Path $PSScriptRoot "notify-bot-incident.ps1"
$startBotScript = Join-Path $PSScriptRoot "start-bot.ps1"
$runtimeOutputPath = Join-Path $script:BotLogDirectory "bot-runtime-output.log"
$runtimeErrorPath = Join-Path $script:BotLogDirectory "bot-runtime-error.log"
$runtimeExitCodePath = Join-Path $script:BotLogDirectory "bot-runtime-exit-code.txt"
$startedAt = [datetime]::UtcNow
$existing = Get-BotSupervisorState
$consecutiveRestarts = 0

$env:NPM_CONFIG_UPDATE_NOTIFIER = "false"
$env:NO_UPDATE_NOTIFIER = "1"

function Get-PositiveEnvironmentInteger {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][int]$DefaultValue,
    [int]$Minimum = 1,
    [int]$Maximum = 3600
  )

  $parsed = 0
  if (-not [int]::TryParse([Environment]::GetEnvironmentVariable($Name), [ref]$parsed)) {
    return $DefaultValue
  }
  return [Math]::Max($Minimum, [Math]::Min($Maximum, $parsed))
}

function Stop-BotProcessTree {
  param([Parameter(Mandatory = $true)][int]$ProcessId)

  $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue)
  foreach ($child in $children) {
    Stop-BotProcessTree -ProcessId ([int]$child.ProcessId)
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Get-RuntimeMarkerAgeSeconds {
  if (-not (Test-Path -LiteralPath $script:BotRuntimeHealthPath)) {
    return $null
  }

  try {
    $marker = Get-Content -LiteralPath $script:BotRuntimeHealthPath -Raw | ConvertFrom-Json
    $checkedAt = [datetime]::Parse(
      [string]$marker.checked_at,
      [System.Globalization.CultureInfo]::InvariantCulture,
      [System.Globalization.DateTimeStyles]::RoundtripKind
    )
    return ([datetime]::UtcNow - $checkedAt.ToUniversalTime()).TotalSeconds
  } catch {
    return ([datetime]::UtcNow - (Get-Item -LiteralPath $script:BotRuntimeHealthPath).LastWriteTimeUtc).TotalSeconds
  }
}

function Send-SupervisorIncident {
  param(
    [Parameter(Mandatory = $true)][string]$ThrottleKey,
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Message
  )

  & powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $notificationScript `
    -ThrottleKey $ThrottleKey `
    -Title $Title `
    -Message $Message `
    -Severity "error" `
    -CooldownSeconds 300
}

function Save-RuntimeOutput {
  foreach ($path in @($runtimeOutputPath, $runtimeErrorPath)) {
    if (Test-Path -LiteralPath $path) {
      Get-Content -LiteralPath $path -ErrorAction SilentlyContinue |
        Add-Content -LiteralPath $script:BotLogPath -Encoding UTF8
    }
  }
}

$watchdogIntervalSeconds = Get-PositiveEnvironmentInteger `
  -Name "BOT_WATCHDOG_INTERVAL_SECONDS" -DefaultValue 3 -Minimum 1 -Maximum 60
$watchdogStaleSeconds = Get-PositiveEnvironmentInteger `
  -Name "BOT_WATCHDOG_STALE_SECONDS" -DefaultValue 60 -Minimum 15 -Maximum 600
$watchdogStartupGraceSeconds = Get-PositiveEnvironmentInteger `
  -Name "BOT_WATCHDOG_STARTUP_GRACE_SECONDS" -DefaultValue 180 -Minimum 60 -Maximum 1800

if ($existing -and (Test-BotSupervisorState -State $existing) -and [int]$existing.pid -ne $PID) {
  exit 0
}

if (-not (Test-Path -LiteralPath $script:BotLogDirectory)) {
  New-Item -ItemType Directory -Path $script:BotLogDirectory -Force | Out-Null
}

Set-BotSupervisorState -ProcessId $PID -Status "starting" -StartedAt $startedAt
Write-BotBackgroundLog "Supervisor iniciado (PID $PID)."

try {
  while ($true) {
    Set-BotSupervisorState -ProcessId $PID -Status "running" -StartedAt $startedAt
    Write-BotBackgroundLog "Iniciando processo operacional do bot com watchdog externo."
    $attemptStartedAt = [datetime]::UtcNow
    $markerSeen = $false
    $watchdogTriggered = $false
    Remove-Item -LiteralPath $script:BotRuntimeHealthPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $runtimeOutputPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $runtimeErrorPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $runtimeExitCodePath -Force -ErrorAction SilentlyContinue
    $env:DMR_BOT_EXIT_CODE_PATH = $runtimeExitCodePath

    $botProcess = Start-Process `
      -FilePath "powershell.exe" `
      -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $startBotScript) `
      -WindowStyle Hidden `
      -RedirectStandardOutput $runtimeOutputPath `
      -RedirectStandardError $runtimeErrorPath `
      -PassThru

    while ($true) {
      $botProcess.Refresh()
      if ($botProcess.HasExited) {
        break
      }

      $markerAgeSeconds = Get-RuntimeMarkerAgeSeconds
      if ($null -ne $markerAgeSeconds) {
        $markerSeen = $true
        if ($markerAgeSeconds -gt $watchdogStaleSeconds) {
          Write-BotBackgroundLog "Watchdog detectou runtime sem resposta ha $([int]$markerAgeSeconds) segundos."
          Send-SupervisorIncident `
            -ThrottleKey "runtime_sem_resposta" `
            -Title "WhatsApp Web travou" `
            -Message "O Edge deixou de responder por mais de $watchdogStaleSeconds segundos. O bot sera reiniciado, com limpeza de cache e preservacao do login."
          Stop-BotProcessTree -ProcessId $botProcess.Id
          $watchdogTriggered = $true
          break
        }
      } elseif (-not $markerSeen -and
          ([datetime]::UtcNow - $attemptStartedAt).TotalSeconds -gt $watchdogStartupGraceSeconds) {
        Write-BotBackgroundLog "Watchdog nao recebeu sinal inicial do bot dentro do limite."
        Send-SupervisorIncident `
          -ThrottleKey "runtime_sem_resposta_inicial" `
          -Title "Bot DMR nao concluiu a inicializacao" `
          -Message "O WhatsApp Web nao respondeu dentro de $watchdogStartupGraceSeconds segundos. O bot sera reiniciado automaticamente."
        Stop-BotProcessTree -ProcessId $botProcess.Id
        $watchdogTriggered = $true
        break
      }

      Start-Sleep -Seconds $watchdogIntervalSeconds
    }

    if (-not $botProcess.HasExited) {
      $botProcess.WaitForExit(10000) | Out-Null
      $botProcess.Refresh()
    }
    if (-not $botProcess.HasExited) {
      Stop-BotProcessTree -ProcessId $botProcess.Id
      $botProcess.WaitForExit(5000) | Out-Null
      $botProcess.Refresh()
    }
    Save-RuntimeOutput
    $observedExitCode = $null
    if ($botProcess.HasExited) {
      try {
        $observedExitCode = $botProcess.ExitCode
      } catch {
        $observedExitCode = $null
      }
    }
    $exitCode = Resolve-BotRuntimeExitCode `
      -WatchdogTriggered $watchdogTriggered `
      -ProcessExitCode $observedExitCode `
      -Path $runtimeExitCodePath `
      -RestartExitCode $RESTART_EXIT_CODE

    if ($RECOVERABLE_EXIT_CODES -contains $exitCode) {
      if ($exitCode -eq 134) {
        Send-SupervisorIncident `
          -ThrottleKey "memoria_nativa" `
          -Title "Bot DMR ficou sem memoria" `
          -Message "O processo foi encerrado por falta de memoria e sera reiniciado com limpeza de caches."
      }
      $attemptDurationSeconds = ([datetime]::UtcNow - $attemptStartedAt).TotalSeconds
      if ($attemptDurationSeconds -ge 120) {
        $consecutiveRestarts = 0
      } else {
        $consecutiveRestarts++
      }
      $retryExponent = [Math]::Max(0, [Math]::Min(3, $consecutiveRestarts - 1))
      $retryDelaySeconds = [int][Math]::Min(60, 5 * [Math]::Pow(2, $retryExponent))
      Write-BotBackgroundLog "Runtime do WhatsApp indisponivel. Nova tentativa em $retryDelaySeconds segundos."
      Start-Sleep -Seconds $retryDelaySeconds
      continue
    }

    if ($exitCode -ne 0) {
      Send-SupervisorIncident `
        -ThrottleKey "falha_fatal_$exitCode" `
        -Title "Bot DMR precisa de atencao" `
        -Message "O processo encerrou com o codigo $exitCode e nao conseguiu reiniciar automaticamente."
    }
    Write-BotBackgroundLog "Processo operacional encerrado com codigo $exitCode."
    break
  }
} catch {
  Write-BotBackgroundLog "Supervisor encontrou falha: $($_.Exception.Message)"
  Send-SupervisorIncident `
    -ThrottleKey "falha_supervisor" `
    -Title "Supervisor do Bot DMR falhou" `
    -Message "O monitor automatico encontrou um erro: $($_.Exception.Message)"
} finally {
  Remove-BotSupervisorState -ExpectedProcessId $PID
  Write-BotBackgroundLog "Supervisor encerrado."
}
