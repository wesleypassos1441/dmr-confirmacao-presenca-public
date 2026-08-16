[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "bot-schedule-common.ps1")

function Install-DmrBotSchedule {
  [CmdletBinding()]
  param()

  $startTaskName    = "DMR Bot - Iniciar"
  $guardianTaskName = "DMR Bot - Encerramento inteligente"
  $weekdays         = @("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
  $powershellExe    = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $currentUser      = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

  if (-not (Test-Path -LiteralPath $powershellExe -PathType Leaf)) {
    throw "O Windows PowerShell necessario para criar a agenda nao foi encontrado."
  }

  $startScript    = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "start-bot-scheduled.ps1"))
  $guardianScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "bot-smart-guardian.ps1"))

  foreach ($scriptPath in @($startScript, $guardianScript)) {
    if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
      throw "Um arquivo necessario para a agenda do Bot DMR nao foi encontrado."
    }
  }

  # Ler configuracoes do .env (com fallback para os valores padrao)
  $schedule = Get-BotScheduleSettings
  $startTime    = $schedule.BOT_SCHEDULE_START
  $guardianTime = $schedule.BOT_SCHEDULE_GUARDIAN_START
  $guardianEnd  = $schedule.BOT_SCHEDULE_GUARDIAN_END
  $pollSeconds  = [int]$schedule.BOT_SCHEDULE_POLL_SECONDS

  # Calcular o ExecutionTimeLimit do guardiao dinamicamente:
  # do horario de inicio ate o fim da janela, mais 1 minuto de folga.
  $guardianStartParts = $guardianTime -split ":"
  $guardianEndParts   = $guardianEnd  -split ":"
  $guardianStartMinutes = [int]$guardianStartParts[0] * 60 + [int]$guardianStartParts[1]
  $guardianEndMinutes   = [int]$guardianEndParts[0]   * 60 + [int]$guardianEndParts[1]
  if ($guardianEndMinutes -le $guardianStartMinutes) {
    $guardianEndMinutes += 24 * 60
  }
  $guardianWindowMinutes = $guardianEndMinutes - $guardianStartMinutes + 1

  $workingDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
  $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

  $startArguments   = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
  $startAction      = New-ScheduledTaskAction -Execute $powershellExe -Argument $startArguments -WorkingDirectory $workingDirectory
  $startTrigger     = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $weekdays -At $startTime
  $startSettings    = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

  $guardianArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$guardianScript`" -PollSeconds $pollSeconds"
  $guardianAction    = New-ScheduledTaskAction -Execute $powershellExe -Argument $guardianArguments -WorkingDirectory $workingDirectory
  $guardianTrigger   = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $weekdays -At $guardianTime
  $guardianSettings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes $guardianWindowMinutes)

  $taskNames = @($startTaskName, $guardianTaskName)
  $previousDefinitions = @{}
  foreach ($taskName in $taskNames) {
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -ne $existingTask) {
      $previousDefinitions[$taskName] = Export-ScheduledTask -TaskName $taskName
    } else {
      $previousDefinitions[$taskName] = $null
    }
  }

  try {
    Register-ScheduledTask -TaskName $startTaskName -Description "Inicia o Bot DMR em segundo plano nos dias uteis." -Action $startAction -Trigger $startTrigger -Settings $startSettings -Principal $principal -Force | Out-Null
    Register-ScheduledTask -TaskName $guardianTaskName -Description "Mantem ou encerra o Bot DMR conforme o trabalho operacional pendente." -Action $guardianAction -Trigger $guardianTrigger -Settings $guardianSettings -Principal $principal -Force | Out-Null
  } catch {
    $rollbackErrors = New-Object System.Collections.Generic.List[string]
    foreach ($taskName in $taskNames) {
      try {
        $previousXml = $previousDefinitions[$taskName]
        if ($null -ne $previousXml) {
          Register-ScheduledTask -TaskName $taskName -Xml $previousXml -Force | Out-Null
        } else {
          $createdTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
          if ($null -ne $createdTask) {
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
          }
        }
      } catch {
        $rollbackErrors.Add($taskName)
      }
    }

    if ($rollbackErrors.Count -gt 0) {
      throw "A instalacao falhou e nao foi possivel restaurar integralmente a agenda anterior."
    }
    throw "A instalacao falhou. A agenda anterior foi restaurada."
  }

  Write-Host "Agenda do Bot DMR instalada ou atualizada com sucesso." -ForegroundColor Green
  Write-Host "Inicio: segunda a sexta, as $startTime."
  Write-Host "Encerramento inteligente: segunda a sexta, a partir das $guardianTime (ate $guardianEnd, $guardianWindowMinutes min)."
  Write-Host "Intervalo de verificacao do guardiao: $pollSeconds segundos."
  Write-Host "Usuario Windows: $currentUser"
}

if ($MyInvocation.InvocationName -ne ".") {
  Install-DmrBotSchedule
}
