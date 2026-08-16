[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Format-DmrScheduleDate {
  [CmdletBinding()]
  param(
    [AllowNull()]
    [object]$Value,
    [string]$EmptyText = "Nao agendada"
  )

  if ($null -eq $Value) {
    return $EmptyText
  }

  $date = [datetime]$Value
  if ($date -eq [datetime]::MinValue -or $date.Year -le 1901) {
    return $EmptyText
  }

  return $date.ToString("dd/MM/yyyy HH:mm")
}

function Convert-DmrTaskState {
  [CmdletBinding()]
  param([object]$State)

  switch ([string]$State) {
    "Ready" { return "Pronta" }
    "Running" { return "Em execucao" }
    "Disabled" { return "Desativada" }
    "Queued" { return "Na fila" }
    default { return [string]$State }
  }
}

function Convert-DmrTaskResult {
  [CmdletBinding()]
  param([object]$Code)

  switch ([long]$Code) {
    0 { return "Concluida com sucesso (0)" }
    267009 { return "Em execucao (267009)" }
    267011 { return "Ainda nao executada (267011)" }
    default { return "Codigo informado pelo Windows: $Code" }
  }
}

function Show-DmrBotScheduleStatus {
  [CmdletBinding()]
  param()

  $taskNames = @("DMR Bot - Iniciar", "DMR Bot - Encerramento inteligente")
  Write-Host "Agenda automatica do Bot DMR" -ForegroundColor Cyan
  Write-Host ""

  foreach ($taskName in $taskNames) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) {
      Write-Host "$($taskName): NAO INSTALADA" -ForegroundColor Yellow
      Write-Host ""
      continue
    }

    Write-Host $taskName -ForegroundColor Cyan
    Write-Host "Estado: $(Convert-DmrTaskState -State $task.State)"

    try {
      $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop
      Write-Host "Proxima execucao: $(Format-DmrScheduleDate -Value $info.NextRunTime)"
      Write-Host "Ultima execucao: $(Format-DmrScheduleDate -Value $info.LastRunTime -EmptyText 'Ainda nao executada')"
      Write-Host "Ultimo resultado: $(Convert-DmrTaskResult -Code $info.LastTaskResult)"
    } catch {
      Write-Host "Proxima execucao: informacao indisponivel"
      Write-Host "Ultima execucao: informacao indisponivel"
      Write-Host "Ultimo resultado: informacao indisponivel"
    }

    Write-Host ""
  }
}

if ($MyInvocation.InvocationName -ne ".") {
  Show-DmrBotScheduleStatus
}
