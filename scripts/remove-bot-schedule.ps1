[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Remove-DmrBotSchedule {
  [CmdletBinding()]
  param(
    [switch]$SkipConfirmation
  )

  $taskNames = @("DMR Bot - Iniciar", "DMR Bot - Encerramento inteligente")

  if (-not $SkipConfirmation) {
    Write-Host "Esta acao remove somente os dois horarios automaticos do Bot DMR." -ForegroundColor Yellow
    Write-Host "O bot, o banco de dados e o WhatsApp nao serao apagados."
    $answer = Read-Host "Digite REMOVER para continuar"
    if ($answer.Trim().ToUpperInvariant() -ne "REMOVER") {
      Write-Host "Remocao cancelada. Nenhuma tarefa foi alterada."
      return
    }
  }

  $removed = 0
  foreach ($taskName in $taskNames) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) {
      Write-Host "$($taskName): nao estava instalada."
      continue
    }

    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "$($taskName): removida."
    $removed++
  }

  if ($removed -gt 0) {
    Write-Host "Agenda automatica do Bot DMR removida." -ForegroundColor Green
  } else {
    Write-Host "Nenhuma tarefa da agenda DMR precisava ser removida."
  }
}

if ($MyInvocation.InvocationName -ne ".") {
  Remove-DmrBotSchedule -SkipConfirmation:$Force
}
