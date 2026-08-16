import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const commonUrl = new URL("../scripts/bot-schedule-common.ps1", import.meta.url);
const guardianUrl = new URL("../scripts/bot-smart-guardian.ps1", import.meta.url);
const installerUrl = new URL("../scripts/install-bot-schedule.ps1", import.meta.url);
const scheduledStartUrl = new URL("../scripts/start-bot-scheduled.ps1", import.meta.url);
const statusUrl = new URL("../scripts/status-bot-schedule.ps1", import.meta.url);
const removerUrl = new URL("../scripts/remove-bot-schedule.ps1", import.meta.url);

const common = await readFile(commonUrl, "utf8");
const guardian = await readFile(guardianUrl, "utf8");

function runPowerShell(source) {
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", source],
    { cwd: projectRoot, encoding: "utf8" },
  ).trim();
}

function psLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function waitForFile(path, child, timeoutMs = 8_000) {
  const startedAt = Date.now();
  while (!existsSync(path)) {
    if (child.exitCode !== null) {
      throw new Error(`processo de teste encerrou antes de obter o mutex: ${child.exitCode}`);
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timeout aguardando mutex do guardiao");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) {
      if (child.exitCode === 0) resolve();
      else reject(new Error(`processo concorrente encerrou com codigo ${child.exitCode}`));
      return;
    }
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`processo concorrente encerrou com codigo ${code}`));
    });
  });
}

test("guardiao consulta o endpoint protegido sem expor credenciais", () => {
  assert.match(common, /EDGE_FUNCTIONS_BASE_URL/);
  assert.match(common, /DMR_BOT_TOKEN/);
  assert.match(common, /x-dmr-bot-token/i);
  assert.match(common, /bot-operational-status/i);
  assert.match(common, /Invoke-RestMethod[\s\S]+-Method\s+Post/i);
  assert.match(common, /-TimeoutSec\s+\$?\w+/i);
  assert.match(common, /sucesso[\s\S]+operacional[\s\S]+tem_trabalho/i);
  assert.match(common, /\.functions\.supabase\.co/i);
  assert.match(common, /Scheme[\s\S]+https/i);
  assert.match(common, /UserInfo[\s\S]+Query[\s\S]+Fragment/i);
  assert.doesNotMatch(`${common}\n${guardian}`, /sbp_[a-z0-9]+/i);
  assert.doesNotMatch(`${common}\n${guardian}`, /SUPABASE_DB_PASSWORD/i);
  assert.doesNotMatch(`${common}\n${guardian}`, /Write-(?:Host|Output)[^\n]*(?:DMR_BOT_TOKEN|token)/i);
});

test("guardiao usa somente os controles identificados do bot", () => {
  assert.match(guardian, /Test-BotSupervisorState/);
  assert.match(guardian, /start-bot-background\.ps1/i);
  assert.match(guardian, /stop-bot-background\.ps1/i);
  assert.match(guardian, /Start-Sleep/);
  assert.match(guardian, /\[switch\]\$SinglePass/i);
  assert.match(guardian, /\[int\]\$PollSeconds\s*=\s*0/i);
  assert.match(guardian, /BOT_SCHEDULE_POLL_SECONDS/i);
  assert.match(guardian, /System\.Threading\.Mutex/i);
  assert.match(guardian, /AbandonedMutexException/i);
  assert.match(guardian, /finally[\s\S]+ReleaseMutex/i);
  assert.doesNotMatch(guardian, /Stop-Computer|Restart-Computer|Suspend-Computer|shutdown\.exe/i);
});

test("janela do guardiao respeita madrugada, periodo inativo e noite", () => {
  const output = runPowerShell(`
    $ErrorActionPreference = "Stop"
    . (Resolve-Path "scripts/bot-schedule-common.ps1")
    @(
      "2026-07-24T02:00:00",
      "2026-07-24T06:00:00",
      "2026-07-24T16:00:00",
      "2026-07-24T23:00:00"
    ) | ForEach-Object {
      $window = Get-BotGuardianWindow -Now ([datetime]$_)
      [pscustomobject]@{
        now = $_
        active = [bool]$window.ativa
        deadline = if ($window.limite) { $window.limite.ToString("yyyy-MM-dd HH:mm") } else { $null }
      }
    } | ConvertTo-Json -Compress
  `);
  assert.deepEqual(JSON.parse(output), [
    { now: "2026-07-24T02:00:00", active: true, deadline: "2026-07-24 05:45" },
    { now: "2026-07-24T06:00:00", active: false, deadline: null },
    { now: "2026-07-24T16:00:00", active: true, deadline: "2026-07-25 05:45" },
    { now: "2026-07-24T23:00:00", active: true, deadline: "2026-07-25 05:45" },
  ]);
});

test("SinglePass fora da janela sai sem consultar ou controlar o bot", () => {
  const mutexName = `Local\\DMRGuardianTest-${randomUUID()}`;
  const output = runPowerShell(`
    $ErrorActionPreference = "Stop"
    . (Resolve-Path "scripts/bot-smart-guardian.ps1")
    $calls = 0
    $parameters = @{
      RunOnce = $true
      MutexName = ${psLiteral(mutexName)}
      NowProvider = { [datetime]"2026-07-24T06:00:00" }
      IterationAction = { $calls++; return "nao_deveria_executar" }
      LogAction = { param($Message) }
    }
    $result = Invoke-BotSmartGuardian @parameters
    [pscustomobject]@{ result = $result; calls = $calls } | ConvertTo-Json -Compress
  `);
  assert.deepEqual(JSON.parse(output), { result: "fora_da_janela", calls: 0 });
});

test("consulta envia POST autenticado e aceita somente o envelope operacional", () => {
  const output = runPowerShell(`
    $ErrorActionPreference = "Stop"
    . (Resolve-Path "scripts/bot-schedule-common.ps1")
    function Invoke-RestMethod {
      param($Uri, $Method, $Headers, $ContentType, $Body, $TimeoutSec)
      if ($Uri -notmatch "/bot-operational-status$") { throw "endpoint incorreto" }
      if ($Method -ne "Post") { throw "metodo incorreto" }
      if ($Headers["x-dmr-bot-token"] -ne "token-de-teste") { throw "cabecalho incorreto" }
      if ($TimeoutSec -ne 20) { throw "timeout incorreto" }
      return [pscustomobject]@{
        sucesso = $true
        operacional = [pscustomobject]@{ tem_trabalho = $true }
      }
    }
    $envPath = Join-Path ([System.IO.Path]::GetTempPath()) "dmr-guardian-$([guid]::NewGuid()).env"
    try {
      [System.IO.File]::WriteAllLines($envPath, @(
        "EDGE_FUNCTIONS_BASE_URL=https://projeto-teste.functions.supabase.co",
        "DMR_BOT_TOKEN=token-de-teste"
      ))
      $status = Get-BotOperationalStatus -EnvPath $envPath
      [bool]$status.tem_trabalho
    } finally {
      Remove-Item -LiteralPath $envPath -Force -ErrorAction SilentlyContinue
    }
  `);
  assert.equal(output, "True");
});

test("URL maliciosa e recusada antes de qualquer chamada autenticada", () => {
  const output = runPowerShell(`
    $ErrorActionPreference = "Stop"
    . (Resolve-Path "scripts/bot-schedule-common.ps1")
    $script:calls = 0
    function Invoke-RestMethod { $script:calls++; throw "nao deveria chamar" }
    $urls = @(
      "http://projeto.functions.supabase.co",
      "https://usuario@projeto.functions.supabase.co",
      "https://projeto.functions.supabase.co?redirect=https://evil.example",
      "https://projeto.functions.supabase.co#fragmento",
      "https://evil.example"
    )
    foreach ($url in $urls) {
      $envPath = Join-Path ([System.IO.Path]::GetTempPath()) "dmr-guardian-$([guid]::NewGuid()).env"
      try {
        [System.IO.File]::WriteAllLines($envPath, @(
          "EDGE_FUNCTIONS_BASE_URL=$url",
          "DMR_BOT_TOKEN=token-de-teste"
        ))
        try { Get-BotOperationalStatus -EnvPath $envPath | Out-Null } catch {}
      } finally {
        Remove-Item -LiteralPath $envPath -Force -ErrorAction SilentlyContinue
      }
    }
    $script:calls
  `);
  assert.equal(output, "0");
});

test("iteracao inicia o bot somente quando existe trabalho e ele esta parado", () => {
  const output = runPowerShell(`
    $ErrorActionPreference = "Stop"
    . (Resolve-Path "scripts/bot-smart-guardian.ps1")
    $counters = @{ start = 0; stop = 0 }
    $parameters = @{
      StatusProvider = { [pscustomobject]@{ tem_trabalho = $true } }
      IsBotRunning = { $false }
      StartAction = { $counters.start++ }
      StopAction = { $counters.stop++ }
      LogAction = { param($Message) }
    }
    $result = Invoke-BotGuardianIteration @parameters
    [pscustomobject]@{ result = $result; start = $counters.start; stop = $counters.stop } |
      ConvertTo-Json -Compress
  `);
  assert.deepEqual(JSON.parse(output), { result: "iniciado", start: 1, stop: 0 });
});

test("iteracao encerra somente um bot identificado quando nao existe trabalho", () => {
  const output = runPowerShell(`
    $ErrorActionPreference = "Stop"
    . (Resolve-Path "scripts/bot-smart-guardian.ps1")
    $counters = @{ start = 0; stop = 0 }
    $parameters = @{
      StatusProvider = { [pscustomobject]@{ tem_trabalho = $false } }
      IsBotRunning = { $true }
      StartAction = { $counters.start++ }
      StopAction = { $counters.stop++ }
      LogAction = { param($Message) }
    }
    $result = Invoke-BotGuardianIteration @parameters
    [pscustomobject]@{ result = $result; start = $counters.start; stop = $counters.stop } |
      ConvertTo-Json -Compress
  `);
  assert.deepEqual(JSON.parse(output), { result: "encerrado", start: 0, stop: 1 });
});

test("iteracoes repetidas nao duplicam inicio nem parada", () => {
  const output = runPowerShell(`
    $ErrorActionPreference = "Stop"
    . (Resolve-Path "scripts/bot-smart-guardian.ps1")
    $counters = @{ start = 0; stop = 0 }
    $common = @{
      StartAction = { $counters.start++ }
      StopAction = { $counters.stop++ }
      LogAction = { param($Message) }
    }
    $keepParameters = $common.Clone()
    $keepParameters.StatusProvider = { [pscustomobject]@{ tem_trabalho = $true } }
    $keepParameters.IsBotRunning = { $true }
    $keep = Invoke-BotGuardianIteration @keepParameters
    $idleParameters = $common.Clone()
    $idleParameters.StatusProvider = { [pscustomobject]@{ tem_trabalho = $false } }
    $idleParameters.IsBotRunning = { $false }
    $idle = Invoke-BotGuardianIteration @idleParameters
    [pscustomobject]@{ keep = $keep; idle = $idle; start = $counters.start; stop = $counters.stop } |
      ConvertTo-Json -Compress
  `);
  assert.deepEqual(JSON.parse(output), {
    keep: "mantido",
    idle: "ocioso",
    start: 0,
    stop: 0,
  });
});

test("falha de ambiente, HTTP ou JSON nunca aciona a parada", () => {
  const output = runPowerShell(`
    $ErrorActionPreference = "Stop"
    . (Resolve-Path "scripts/bot-smart-guardian.ps1")
    $counters = @{ start = 0; stop = 0; logs = 0 }
    $parameters = @{
      StatusProvider = { throw "segredo-nao-deve-aparecer" }
      IsBotRunning = { $true }
      StartAction = { $counters.start++ }
      StopAction = { $counters.stop++ }
      LogAction = { param($Message) $counters.logs++; if ($Message -match "segredo-nao-deve-aparecer") { throw "log nao sanitizado" } }
    }
    $result = Invoke-BotGuardianIteration @parameters
    [pscustomobject]@{ result = $result; start = $counters.start; stop = $counters.stop; logs = $counters.logs } |
      ConvertTo-Json -Compress
  `);
  assert.deepEqual(JSON.parse(output), {
    result: "consulta_falhou",
    start: 0,
    stop: 0,
    logs: 1,
  });
});

test("logs distinguem falha de consulta e falha de controle sem erro bruto", () => {
  const output = runPowerShell(`
    $ErrorActionPreference = "Stop"
    . (Resolve-Path "scripts/bot-smart-guardian.ps1")
    $messages = New-Object System.Collections.Generic.List[string]
    $common = @{
      IsBotRunning = { $false }
      StartAction = { throw "detalhe-local-sensivel" }
      StopAction = { throw "nao deveria parar" }
      LogAction = { param($Message) $messages.Add($Message) }
    }
    $queryParameters = $common.Clone()
    $queryParameters.StatusProvider = { throw "detalhe-remoto-sensivel" }
    $query = Invoke-BotGuardianIteration @queryParameters
    $controlParameters = $common.Clone()
    $controlParameters.StatusProvider = { [pscustomobject]@{ tem_trabalho = $true } }
    $control = Invoke-BotGuardianIteration @controlParameters
    [pscustomobject]@{ query = $query; control = $control; logs = @($messages) } |
      ConvertTo-Json -Compress
  `);
  const result = JSON.parse(output);
  assert.equal(result.query, "consulta_falhou");
  assert.equal(result.control, "controle_falhou");
  assert.equal(result.logs.length, 2);
  assert.match(result.logs[0], /consulta operacional falhou/i);
  assert.match(result.logs[1], /controle local falhou/i);
  assert.doesNotMatch(result.logs.join("\n"), /detalhe-(?:remoto|local)-sensivel/i);
});

test("mutex nomeado impede duas instancias de executar decisoes", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "dmr-guardian-mutex-"));
  const readyPath = join(tempDirectory, "ready.txt");
  const mutexName = `Local\\DMRGuardianTest-${randomUUID()}`;
  const holderSource = `
    $ErrorActionPreference = "Stop"
    . (Resolve-Path "scripts/bot-smart-guardian.ps1")
    $parameters = @{
      RunOnce = $true
      MutexName = ${psLiteral(mutexName)}
      NowProvider = { [datetime]"2026-07-24T16:00:00" }
      IterationAction = {
        [System.IO.File]::WriteAllText(${psLiteral(readyPath)}, "ready")
        Start-Sleep -Seconds 2
        return "mantido"
      }
      LogAction = { param($Message) }
    }
    Invoke-BotSmartGuardian @parameters | Out-Null
  `;
  const holder = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", holderSource],
    { cwd: projectRoot, stdio: "ignore" },
  );

  try {
    await waitForFile(readyPath, holder);
    const output = runPowerShell(`
      $ErrorActionPreference = "Stop"
      . (Resolve-Path "scripts/bot-smart-guardian.ps1")
      $calls = 0
      $parameters = @{
        RunOnce = $true
        MutexName = ${psLiteral(mutexName)}
        NowProvider = { [datetime]"2026-07-24T16:00:00" }
        IterationAction = { $calls++; return "nao_deveria_executar" }
        LogAction = { param($Message) }
      }
      $result = Invoke-BotSmartGuardian @parameters
      [pscustomobject]@{ result = $result; calls = $calls } | ConvertTo-Json -Compress
    `);
    assert.deepEqual(JSON.parse(output), { result: "ja_em_execucao", calls: 0 });
    await waitForExit(holder);
  } finally {
    if (holder.exitCode === null) holder.kill();
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("instalador agenda somente as duas tarefas DMR nos dias e horarios configurados", async () => {
  const installer = await readFile(installerUrl, "utf8");

  assert.match(installer, /\$startTaskName\s*=\s*["']DMR Bot - Iniciar["']/);
  assert.match(installer, /\$guardianTaskName\s*=\s*["']DMR Bot - Encerramento inteligente["']/);
  assert.match(installer, /Monday[\s\S]+Tuesday[\s\S]+Wednesday[\s\S]+Thursday[\s\S]+Friday/);
  assert.match(installer, /New-ScheduledTaskTrigger[^\n]+-Weekly[^\n]+-DaysOfWeek[^\n]+-At\s+\$startTime/i);
  assert.match(installer, /New-ScheduledTaskTrigger[^\n]+-Weekly[^\n]+-DaysOfWeek[^\n]+-At\s+\$guardianTime/i);
  assert.doesNotMatch(installer, /Saturday|Sunday/);
});

test("instalador usa caminhos absolutos, usuario atual e configuracao segura", async () => {
  const installer = await readFile(installerUrl, "utf8");

  assert.match(installer, /SystemRoot[\s\S]+System32[\\/]WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe/i);
  assert.match(installer, /System\.IO\.Path\]::GetFullPath/i);
  assert.match(installer, /start-bot-scheduled\.ps1/i);
  assert.doesNotMatch(installer, /start-bot-background\.ps1/i);
  assert.match(installer, /bot-smart-guardian\.ps1/i);
  assert.match(installer, /-NoProfile\s+-ExecutionPolicy\s+Bypass\s+-File\s+`?"/i);
  assert.match(installer, /WindowsIdentity\]::GetCurrent\(\)\.Name/i);
  assert.match(installer, /New-ScheduledTaskPrincipal[^\n]+-UserId[^\n]+-LogonType\s+Interactive[^\n]+-RunLevel\s+Limited/i);
  assert.match(installer, /StartWhenAvailable/i);
  assert.match(installer, /WakeToRun/i);
  assert.match(installer, /MultipleInstances\s+IgnoreNew/i);
  assert.match(installer, /New-TimeSpan\s+-Minutes\s+15/i);
  assert.match(installer, /\$guardianEndMinutes\s*\+=\s*24\s*\*\s*60/i);
  assert.match(installer, /New-TimeSpan\s+-Minutes\s+\$guardianWindowMinutes/i);
  assert.equal((installer.match(/AllowStartIfOnBatteries/g) ?? []).length, 2);
  assert.equal((installer.match(/DontStopIfGoingOnBatteries/g) ?? []).length, 2);
  assert.equal((installer.match(/Register-ScheduledTask[^\n]+-Action[^\n]+-Force/g) ?? []).length, 2);
  assert.match(installer, /Register-ScheduledTask[^\n]+-Xml[^\n]+-Force/i);
  assert.doesNotMatch(installer, /DMR_BOT_TOKEN|SUPABASE_DB_PASSWORD|sbp_[a-z0-9]+/i);
});

test("launcher automatico inicia somente em dia util e na janela permitida", async () => {
  const scheduledStart = await readFile(scheduledStartUrl, "utf8");
  assert.match(scheduledStart, /start-bot-background\.ps1/i);
  assert.match(scheduledStart, /System\.IO\.Path\]::GetFullPath/i);
  assert.doesNotMatch(scheduledStart, /DMR_BOT_TOKEN|SUPABASE_DB_PASSWORD|sbp_[a-z0-9]+/i);

  const output = runPowerShell(`
    $ErrorActionPreference = "Stop"
    . (Resolve-Path "scripts/start-bot-scheduled.ps1")
    $script:starts = 0
    $cases = @(
      [pscustomobject]@{ value = [datetime]"2026-07-24T06:00:00"; expected = "iniciado" },
      [pscustomobject]@{ value = [datetime]"2026-07-25T06:00:00"; expected = "fora_da_janela" },
      [pscustomobject]@{ value = [datetime]"2026-07-27T05:49:59"; expected = "fora_da_janela" },
      [pscustomobject]@{ value = [datetime]"2026-07-27T05:50:00"; expected = "iniciado" },
      [pscustomobject]@{ value = [datetime]"2026-07-27T15:59:59"; expected = "iniciado" },
      [pscustomobject]@{ value = [datetime]"2026-07-27T16:00:00"; expected = "fora_da_janela" }
    )
    $results = foreach ($case in $cases) {
      $result = Invoke-DmrScheduledBotStart -Now $case.value -StartAction { $script:starts++ }
      [pscustomobject]@{ result = $result; expected = $case.expected }
    }
    [pscustomobject]@{ starts = $script:starts; cases = @($results) } | ConvertTo-Json -Depth 4 -Compress
  `);
  assert.deepEqual(JSON.parse(output), {
    starts: 3,
    cases: [
      { result: "iniciado", expected: "iniciado" },
      { result: "fora_da_janela", expected: "fora_da_janela" },
      { result: "fora_da_janela", expected: "fora_da_janela" },
      { result: "iniciado", expected: "iniciado" },
      { result: "iniciado", expected: "iniciado" },
      { result: "fora_da_janela", expected: "fora_da_janela" },
    ],
  });
});

test("instalacao restaura as duas definicoes anteriores se o segundo registro falhar", () => {
  const output = runPowerShell(`
    $ErrorActionPreference = "Stop"
    . (Resolve-Path "scripts/install-bot-schedule.ps1")
    $state = @{
      "DMR Bot - Iniciar" = "xml-inicio-anterior"
      "DMR Bot - Encerramento inteligente" = "xml-guardiao-anterior"
    }
    function Get-ScheduledTask {
      param($TaskName, $ErrorAction)
      if ($state.ContainsKey($TaskName)) { return [pscustomobject]@{ TaskName = $TaskName } }
    }
    function Export-ScheduledTask { param($TaskName) return $state[$TaskName] }
    function New-ScheduledTaskPrincipal { param($UserId, $LogonType, $RunLevel) return @{} }
    function New-ScheduledTaskAction { param($Execute, $Argument, $WorkingDirectory) return @{} }
    function New-ScheduledTaskTrigger { param([switch]$Weekly, $DaysOfWeek, $At) return @{} }
    function New-ScheduledTaskSettingsSet {
      param([switch]$StartWhenAvailable, [switch]$WakeToRun, $MultipleInstances, $ExecutionTimeLimit,
        [switch]$AllowStartIfOnBatteries, [switch]$DontStopIfGoingOnBatteries)
      return @{}
    }
    function Register-ScheduledTask {
      param($TaskName, $Description, $Action, $Trigger, $Settings, $Principal, $Xml, [switch]$Force)
      if ($PSBoundParameters.ContainsKey("Xml")) { $state[$TaskName] = $Xml; return }
      if ($TaskName -eq "DMR Bot - Encerramento inteligente") { throw "falha simulada" }
      $state[$TaskName] = "nova-definicao"
    }
    function Unregister-ScheduledTask { param($TaskName, [switch]$Confirm) $state.Remove($TaskName) | Out-Null }
    $failed = $false
    try { Install-DmrBotSchedule } catch { $failed = $true }
    [pscustomobject]@{
      failed = $failed
      start = $state["DMR Bot - Iniciar"]
      guardian = $state["DMR Bot - Encerramento inteligente"]
    } | ConvertTo-Json -Compress
  `);
  assert.deepEqual(JSON.parse(output), {
    failed: true,
    start: "xml-inicio-anterior",
    guardian: "xml-guardiao-anterior",
  });
});

test("instalacao remove somente tarefas novas se nao havia estado anterior", () => {
  const output = runPowerShell(`
    $ErrorActionPreference = "Stop"
    . (Resolve-Path "scripts/install-bot-schedule.ps1")
    $state = @{}
    function Get-ScheduledTask {
      param($TaskName, $ErrorAction)
      if ($state.ContainsKey($TaskName)) { return [pscustomobject]@{ TaskName = $TaskName } }
    }
    function Export-ScheduledTask { param($TaskName) throw "nao deveria exportar" }
    function New-ScheduledTaskPrincipal { param($UserId, $LogonType, $RunLevel) return @{} }
    function New-ScheduledTaskAction { param($Execute, $Argument, $WorkingDirectory) return @{} }
    function New-ScheduledTaskTrigger { param([switch]$Weekly, $DaysOfWeek, $At) return @{} }
    function New-ScheduledTaskSettingsSet {
      param([switch]$StartWhenAvailable, [switch]$WakeToRun, $MultipleInstances, $ExecutionTimeLimit,
        [switch]$AllowStartIfOnBatteries, [switch]$DontStopIfGoingOnBatteries)
      return @{}
    }
    function Register-ScheduledTask {
      param($TaskName, $Description, $Action, $Trigger, $Settings, $Principal, $Xml, [switch]$Force)
      if ($TaskName -eq "DMR Bot - Encerramento inteligente") { throw "falha simulada" }
      $state[$TaskName] = "nova-definicao"
    }
    function Unregister-ScheduledTask { param($TaskName, [switch]$Confirm) $state.Remove($TaskName) | Out-Null }
    $failed = $false
    try { Install-DmrBotSchedule } catch { $failed = $true }
    [pscustomobject]@{ failed = $failed; remaining = $state.Count } | ConvertTo-Json -Compress
  `);
  assert.deepEqual(JSON.parse(output), { failed: true, remaining: 0 });
});

test("status consulta somente as tarefas DMR e trata tarefas ausentes", async () => {
  const statusScript = await readFile(statusUrl, "utf8");

  assert.match(statusScript, /DMR Bot - Iniciar/);
  assert.match(statusScript, /DMR Bot - Encerramento inteligente/);
  assert.match(statusScript, /Get-ScheduledTask\s+-TaskName\s+\$taskName\s+-ErrorAction\s+SilentlyContinue/i);
  assert.match(statusScript, /Get-ScheduledTaskInfo\s+-TaskName\s+\$taskName/i);
  assert.match(statusScript, /NAO INSTALADA/i);
  assert.match(statusScript, /Estado:/i);
  assert.match(statusScript, /Proxima execucao:/i);
  assert.match(statusScript, /Ultima execucao:/i);
  assert.match(statusScript, /Ultimo resultado:/i);
  assert.doesNotMatch(statusScript, /Get-ScheduledTask\s*(?:\r?\n|\|)/i);
  assert.doesNotMatch(statusScript, /DMR_BOT_TOKEN|SUPABASE_DB_PASSWORD|sbp_[a-z0-9]+/i);
});

test("remocao exige confirmacao e remove somente as duas tarefas DMR", async () => {
  const remover = await readFile(removerUrl, "utf8");

  assert.match(remover, /\[switch\]\$Force/i);
  assert.match(remover, /Read-Host/i);
  assert.match(remover, /DMR Bot - Iniciar/);
  assert.match(remover, /DMR Bot - Encerramento inteligente/);
  assert.match(remover, /Unregister-ScheduledTask\s+-TaskName\s+\$taskName\s+-Confirm:\$false/i);
  assert.doesNotMatch(remover, /Stop-Process|Remove-Item|supabase|fila_mensagens|DMR_BOT_TOKEN|SUPABASE_DB_PASSWORD|sbp_[a-z0-9]+/i);
});

test("atalhos CMD resolvem a propria pasta e mantem o resultado visivel", async () => {
  const wrappers = await Promise.all([
    readFile(new URL("../Instalar Agenda Bot DMR.cmd", import.meta.url), "utf8"),
    readFile(new URL("../Status Agenda Bot DMR.cmd", import.meta.url), "utf8"),
    readFile(new URL("../Remover Agenda Bot DMR.cmd", import.meta.url), "utf8"),
  ]);

  for (const wrapper of wrappers) {
    assert.match(wrapper, /%~dp0/i);
    assert.match(wrapper, /powershell(?:\.exe)?\s+-NoProfile\s+-ExecutionPolicy\s+Bypass\s+-File/i);
    assert.match(wrapper, /pause/i);
    assert.doesNotMatch(wrapper, /DMR_BOT_TOKEN|SUPABASE_DB_PASSWORD|sbp_[a-z0-9]+/i);
  }
});

test("scripts da agenda possuem sintaxe valida no PowerShell 5.1", () => {
  const output = runPowerShell(`
    $ErrorActionPreference = "Stop"
    $files = @(
      "scripts/install-bot-schedule.ps1",
      "scripts/start-bot-scheduled.ps1",
      "scripts/status-bot-schedule.ps1",
      "scripts/remove-bot-schedule.ps1"
    )
    $messages = New-Object System.Collections.Generic.List[string]
    foreach ($file in $files) {
      $tokens = $null
      $errors = $null
      [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $file),
        [ref]$tokens,
        [ref]$errors
      ) | Out-Null
      foreach ($parseError in $errors) {
        $messages.Add("\${file}: $($parseError.Message)")
      }
    }
    if ($messages.Count -gt 0) { throw ($messages -join [Environment]::NewLine) }
    "OK"
  `);
  assert.equal(output, "OK");
});
