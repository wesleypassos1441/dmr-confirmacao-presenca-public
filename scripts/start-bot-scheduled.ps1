[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "bot-schedule-common.ps1")

function Invoke-DmrScheduledBotStart {
  [CmdletBinding()]
  param(
    [datetime]$Now = (Get-Date),
    [scriptblock]$StartAction
  )

  $allowedDays = @(
    [System.DayOfWeek]::Monday,
    [System.DayOfWeek]::Tuesday,
    [System.DayOfWeek]::Wednesday,
    [System.DayOfWeek]::Thursday,
    [System.DayOfWeek]::Friday
  )

  # Carregar horarios do .env (com fallback para os valores padrao)
  $schedule     = Get-BotScheduleSettings
  $windowStart  = ConvertTo-BotTimeOfDay -HHmm $schedule.BOT_SCHEDULE_START
  $windowEnd    = ConvertTo-BotTimeOfDay -HHmm $schedule.BOT_SCHEDULE_GUARDIAN_START

  if ($Now.DayOfWeek -notin $allowedDays -or $Now.TimeOfDay -lt $windowStart -or $Now.TimeOfDay -ge $windowEnd) {
    Write-Verbose "Inicio automatico ignorado: fora dos dias ou da janela operacional."
    return "fora_da_janela"
  }

  if ($null -eq $StartAction) {
    $powershellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $startScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "start-bot-background.ps1"))

    if (-not (Test-Path -LiteralPath $powershellExe -PathType Leaf)) {
      throw "O Windows PowerShell necessario para iniciar o Bot DMR nao foi encontrado."
    }
    if (-not (Test-Path -LiteralPath $startScript -PathType Leaf)) {
      throw "O inicializador em segundo plano do Bot DMR nao foi encontrado."
    }

    $StartAction = {
      & $powershellExe -NoProfile -ExecutionPolicy Bypass -File $startScript
      if ($LASTEXITCODE -ne 0) {
        throw "O inicio automatico do Bot DMR nao foi concluido."
      }
    }.GetNewClosure()
  }

  & $StartAction | Out-Null
  return "iniciado"
}

if ($MyInvocation.InvocationName -ne ".") {
  Invoke-DmrScheduledBotStart | Out-Null
}
