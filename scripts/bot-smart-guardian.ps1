[CmdletBinding()]
param(
  [int]$PollSeconds = 0,
  [switch]$SinglePass
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "bot-background-common.ps1")
. (Join-Path $PSScriptRoot "bot-schedule-common.ps1")

$script:BotStartScriptPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "start-bot-background.ps1"))
$script:BotStopScriptPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "stop-bot-background.ps1"))
$script:BotGuardianMutexName = "Local\DMRConfirmacaoPresencaBotSmartGuardian"

function Invoke-BotControlScript {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$ScriptPath
  )

  $powershellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $process = Start-Process `
    -FilePath $powershellExe `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$ScriptPath`"") `
    -WindowStyle Hidden `
    -Wait `
    -PassThru

  if ($process.ExitCode -ne 0) {
    throw "O controle local do bot nao foi concluido."
  }
}

function Invoke-BotGuardianLogAction {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$LogAction,
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  try {
    & $LogAction $Message
  } catch {
    # A falha do arquivo de log nao pode interromper a protecao operacional.
  }
}

function Invoke-BotGuardianIteration {
  [CmdletBinding()]
  param(
    [scriptblock]$StatusProvider = { Get-BotOperationalStatus },
    [scriptblock]$IsBotRunning = { Test-BotSupervisorState },
    [scriptblock]$StartAction = { Invoke-BotControlScript -ScriptPath $script:BotStartScriptPath },
    [scriptblock]$StopAction = { Invoke-BotControlScript -ScriptPath $script:BotStopScriptPath },
    [scriptblock]$LogAction = { param($Message) Write-BotBackgroundLog -Message $Message }
  )

  try {
    $operational = & $StatusProvider
    if ($null -eq $operational) {
      throw "Estado operacional invalido."
    }
    $workProperty = $operational.PSObject.Properties["tem_trabalho"]
    if ($null -eq $workProperty -or $operational.tem_trabalho -isnot [bool]) {
      throw "Estado operacional invalido."
    }
  } catch {
    Invoke-BotGuardianLogAction -LogAction $LogAction -Message "Guardiao preservou o bot: consulta operacional falhou."
    return "consulta_falhou"
  }

  try {
    $botIsRunning = [bool](& $IsBotRunning)
    if ([bool]$operational.tem_trabalho) {
      if (-not $botIsRunning) {
        & $StartAction
        Invoke-BotGuardianLogAction -LogAction $LogAction -Message "Guardiao iniciou o bot: existe trabalho operacional pendente."
        return "iniciado"
      }

      Invoke-BotGuardianLogAction -LogAction $LogAction -Message "Guardiao manteve o bot ativo: existe trabalho operacional pendente."
      return "mantido"
    }

    if ($botIsRunning) {
      & $StopAction
      Invoke-BotGuardianLogAction -LogAction $LogAction -Message "Guardiao encerrou o bot identificado: nenhum trabalho operacional pendente."
      return "encerrado"
    }

    Invoke-BotGuardianLogAction -LogAction $LogAction -Message "Guardiao confirmou o bot ocioso: nenhum trabalho operacional pendente."
    return "ocioso"
  } catch {
    Invoke-BotGuardianLogAction -LogAction $LogAction -Message "Guardiao preservou o estado: controle local falhou."
    return "controle_falhou"
  }
}

function Enter-BotGuardianMutex {
  [CmdletBinding()]
  param(
    [string]$Name = $script:BotGuardianMutexName
  )

  try {
    $mutex = [System.Threading.Mutex]::new($false, $Name)
  } catch {
    throw "Nao foi possivel criar a exclusividade do guardiao."
  }

  $acquired = $false
  $abandoned = $false
  try {
    $acquired = $mutex.WaitOne(0)
  } catch [System.Threading.AbandonedMutexException] {
    $acquired = $true
    $abandoned = $true
  } catch {
    $mutex.Dispose()
    throw "Nao foi possivel obter a exclusividade do guardiao."
  }

  return [pscustomobject]@{
    Mutex = $mutex
    Acquired = [bool]$acquired
    Abandoned = [bool]$abandoned
  }
}

function Invoke-BotSmartGuardian {
  [CmdletBinding()]
  param(
    [int]$IntervalSeconds = 0,
    [switch]$RunOnce,
    [string]$MutexName = $script:BotGuardianMutexName,
    [string]$GuardianStart = "",
    [string]$GuardianEnd   = "",
    [scriptblock]$NowProvider = { Get-Date },
    [scriptblock]$IterationAction = { Invoke-BotGuardianIteration },
    [scriptblock]$LogAction = { param($Message) Write-BotBackgroundLog -Message $Message }
  )

  # Carregar configuracoes do .env se os parametros nao forem fornecidos
  $scheduleSettings = Get-BotScheduleSettings
  if (-not $GuardianStart) { $GuardianStart = $scheduleSettings.BOT_SCHEDULE_GUARDIAN_START }
  if (-not $GuardianEnd)   { $GuardianEnd   = $scheduleSettings.BOT_SCHEDULE_GUARDIAN_END }
  if ($IntervalSeconds -eq 0) { $IntervalSeconds = [int]$scheduleSettings.BOT_SCHEDULE_POLL_SECONDS }

  $lock = $null
  try {
    try {
      $lock = Enter-BotGuardianMutex -Name $MutexName
    } catch {
      Invoke-BotGuardianLogAction -LogAction $LogAction -Message "Guardiao nao executou decisoes: exclusividade local indisponivel."
      return "mutex_falhou"
    }

    if (-not $lock.Acquired) {
      Invoke-BotGuardianLogAction -LogAction $LogAction -Message "Guardiao ja esta em execucao; segunda instancia encerrada."
      return "ja_em_execucao"
    }

    if ($lock.Abandoned) {
      Invoke-BotGuardianLogAction -LogAction $LogAction -Message "Guardiao recuperou com seguranca uma exclusividade abandonada."
    }

    $initialNow = & $NowProvider
    $window = Get-BotGuardianWindow -Now $initialNow -GuardianStart $GuardianStart -GuardianEnd $GuardianEnd
    if (-not $window.ativa) {
      Invoke-BotGuardianLogAction -LogAction $LogAction -Message "Guardiao fora da janela operacional; nenhuma consulta ou controle executado."
      return "fora_da_janela"
    }

    $deadline = $window.limite
    do {
      $iterationResult = & $IterationAction
      if ($RunOnce) {
        return $iterationResult
      }

      $now = & $NowProvider
      if ($now -ge $deadline) {
        break
      }

      $remainingSeconds = [int][Math]::Ceiling(($deadline - $now).TotalSeconds)
      $sleepSeconds = [Math]::Min($IntervalSeconds, $remainingSeconds)
      if ($sleepSeconds -gt 0) {
        Start-Sleep -Seconds $sleepSeconds
      }
    } while ((& $NowProvider) -lt $deadline)

    return "janela_encerrada"
  } finally {
    if ($null -ne $lock) {
      if ($lock.Acquired) {
        try {
          $lock.Mutex.ReleaseMutex()
        } catch {
          # O mutex sera descartado mesmo se o runtime ja tiver liberado a posse.
        }
      }
      $lock.Mutex.Dispose()
    }
  }
}

if ($MyInvocation.InvocationName -ne ".") {
  $entrySettings = Get-BotScheduleSettings
  $entryInterval = if ($PollSeconds -gt 0) { $PollSeconds } else { [int]$entrySettings.BOT_SCHEDULE_POLL_SECONDS }
  Invoke-BotSmartGuardian `
    -IntervalSeconds $entryInterval `
    -RunOnce:$SinglePass `
    -GuardianStart $entrySettings.BOT_SCHEDULE_GUARDIAN_START `
    -GuardianEnd   $entrySettings.BOT_SCHEDULE_GUARDIAN_END | Out-Null
}
