$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "bot-background-common.ps1")

function Write-BotScheduleSummary {
  Write-Host ""
  Write-Host "AGENDA AUTOMATICA" -ForegroundColor Cyan
  foreach ($taskName in @("DMR Bot - Iniciar", "DMR Bot - Encerramento inteligente")) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -eq $task) {
      Write-Host "$taskName`: NAO INSTALADA" -ForegroundColor Yellow
      continue
    }

    try {
      $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop
      $nextRun = if ($taskInfo.NextRunTime -and $taskInfo.NextRunTime -gt [datetime]::MinValue) {
        $taskInfo.NextRunTime.ToString("dd/MM/yyyy HH:mm")
      } else { "sem proxima execucao" }
      $lastRun = if ($taskInfo.LastRunTime -and $taskInfo.LastRunTime -gt [datetime]::MinValue) {
        $taskInfo.LastRunTime.ToString("dd/MM/yyyy HH:mm")
      } else { "ainda nao executada" }
      Write-Host "$taskName`: $($task.State) | Proxima: $nextRun | Ultima: $lastRun"
    } catch {
      Write-Host "$taskName`: instalada, mas sem detalhes disponiveis agora." -ForegroundColor DarkYellow
    }
  }
}

$state = Get-BotSupervisorState
if (-not $state -or -not (Test-BotSupervisorState -State $state)) {
  Remove-BotSupervisorState
  Write-Host "STATUS: OFFLINE" -ForegroundColor Yellow
  Write-Host "Abra 'Ligar Bot DMR.cmd' para iniciar."
  Write-BotScheduleSummary
  exit 0
}

Import-BotEnvironment
$startedAt = [datetime]::Parse($state.started_at).ToUniversalTime()
$latestHeartbeat = $null
$sessionId = "dmr-confirmacao-presenca"
if ($env:WHATSAPP_SESSION_ID) {
  $sessionId = $env:WHATSAPP_SESSION_ID -replace "[^a-zA-Z0-9_-]", "-"
}
$sessionPath = Join-Path $script:BotRoot "apps\whatsapp-bot\.wwebjs_auth\session-$sessionId"
$hasWhatsappSessionProcess = @(Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine.IndexOf($sessionPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
  }).Count -gt 0

try {
  $baseUrl = if ($env:SUPABASE_URL) { $env:SUPABASE_URL } else { $env:NEXT_PUBLIC_SUPABASE_URL }
  $serviceKey = $env:SUPABASE_SERVICE_ROLE_KEY
  if ($baseUrl -and $serviceKey) {
    $headers = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }
    $uri = "$($baseUrl.TrimEnd('/'))/rest/v1/bot_heartbeats?select=status,criado_em&bot_id=eq.bot-local&order=criado_em.desc&limit=1"
    $rows = @(Invoke-RestMethod -Uri $uri -Headers $headers -Method Get -TimeoutSec 15)
    $latestHeartbeat = $rows | Select-Object -First 1
  }
} catch {
  Write-Host "Nao foi possivel consultar o heartbeat remoto agora." -ForegroundColor DarkYellow
}

$freshLimit = [datetime]::UtcNow.AddMinutes(-2)
if ($latestHeartbeat) {
  $heartbeatAt = [datetime]::Parse($latestHeartbeat.criado_em).ToUniversalTime()
  $belongsToCurrentRun = $heartbeatAt -ge $startedAt.AddSeconds(-10)
  if ($latestHeartbeat.status -eq "online" -and $heartbeatAt -ge $freshLimit -and $belongsToCurrentRun) {
    Write-Host "STATUS: ONLINE" -ForegroundColor Green
    Write-Host "Ultimo sinal: $($heartbeatAt.ToLocalTime().ToString('dd/MM/yyyy HH:mm:ss'))"
    Write-Host "O bot esta trabalhando em segundo plano."
    Write-BotScheduleSummary
    exit 0
  }

}

if ($hasWhatsappSessionProcess) {
  Write-Host "STATUS: AGUARDANDO LOGIN" -ForegroundColor Cyan
  Write-Host "A janela do WhatsApp do bot esta aberta ou carregando, mas ainda nao confirmou conexao."
  Write-Host "Se aparecer QR Code ou codigo de pareamento, conclua o login pelo celular da DMR."
  Write-Host "Log: $script:BotLogPath"
  Write-BotScheduleSummary
  exit 0
}

if ($latestHeartbeat) {
  $heartbeatAt = [datetime]::Parse($latestHeartbeat.criado_em).ToUniversalTime()
  $belongsToCurrentRun = $heartbeatAt -ge $startedAt.AddSeconds(-10)
  if ($belongsToCurrentRun -and $latestHeartbeat.status -like "erro*") {
    Write-Host "STATUS: COM FALHA" -ForegroundColor Red
    Write-Host "Estado informado: $($latestHeartbeat.status)"
    Write-Host "Consulte o log: $script:BotLogPath"
    Write-BotScheduleSummary
    exit 1
  }
}

if ($startedAt -lt [datetime]::UtcNow.AddMinutes(-2)) {
  Write-Host "STATUS: COM FALHA" -ForegroundColor Red
  Write-Host "O processo existe, mas nao enviou heartbeat recente."
  Write-Host "Consulte o log: $script:BotLogPath"
  Write-BotScheduleSummary
  exit 1
}

Write-Host "STATUS: INICIANDO" -ForegroundColor Cyan
Write-Host "Aguarde alguns instantes e consulte novamente."
Write-Host "Log: $script:BotLogPath"
Write-BotScheduleSummary
