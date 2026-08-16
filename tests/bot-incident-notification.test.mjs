import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const bot = await readFile(new URL("../apps/whatsapp-bot/src/index.ts", import.meta.url), "utf8");
const notifier = await readFile(new URL("../apps/whatsapp-bot/src/incident-notifier.ts", import.meta.url), "utf8");
const notificationScript = await readFile(new URL("../scripts/notify-bot-incident.ps1", import.meta.url), "utf8");
const supervisor = await readFile(new URL("../scripts/bot-supervisor.ps1", import.meta.url), "utf8");
const supervisorCommon = await readFile(new URL("../scripts/bot-background-common.ps1", import.meta.url), "utf8");
const startBot = await readFile(new URL("../scripts/start-bot.ps1", import.meta.url), "utf8");
const maintenance = await readFile(new URL("../scripts/maintain-whatsapp-profile.ps1", import.meta.url), "utf8");

test("bot mantem verificacoes de 3 segundos, 60 segundos e reciclagem de 30 minutos", () => {
  assert.match(bot, /BOT_POLL_INTERVAL_MS", 3000/);
  assert.match(bot, /const heartbeatIntervalMs = numberEnv\("BOT_HEARTBEAT_INTERVAL_MS", 60_000\)/);
  assert.match(bot, /WHATSAPP_MAX_UPTIME_MINUTES", 30/);
  assert.match(bot, /setInterval\(async \(\) => \{[\s\S]*ensureWhatsappRuntimeOperational[\s\S]*\}, pollIntervalMs\)/);
  assert.match(bot, /setInterval\(async \(\) => \{[\s\S]*shouldRecycleWhatsappRuntime[\s\S]*\}, heartbeatIntervalMs\)/);
});

test("incidentes criticos geram aviso local e heartbeat de falha", () => {
  assert.match(bot, /reportBotIncident\(\s*"qr_necessario"/);
  assert.match(bot, /reportBotIncident\(\s*"erro_memoria_navegador"/);
  assert.match(bot, /reportBotIncident\(\s*"erro_envio"/);
  assert.match(bot, /reportBotIncident\(\s*"erro_fila"/);
  assert.match(bot, /reportBotIncident\(\s*"erro_desconexao"/);
  assert.match(bot, /notifyBotIncident/);
  assert.match(bot, /sendHeartbeat\(status, \{ error: message/);
});

test("notificacao local usa argumentos seguros e limita repeticao", () => {
  assert.match(notifier, /execFile\(\s*"powershell\.exe"/);
  assert.match(notifier, /-WindowStyle", "Hidden"/);
  assert.match(notifier, /-ThrottleKey/);
  assert.match(notifier, /-CooldownSeconds/);
  assert.doesNotMatch(notifier, /exec\(/);

  assert.match(notificationScript, /NotifyIcon/);
  assert.match(notificationScript, /bot-notification-state\.json/);
  assert.match(notificationScript, /CooldownSeconds/);
  assert.match(notificationScript, /bot-incidents\.log/);
});

test("supervisor recupera tanto reinicio controlado quanto heap out of memory", () => {
  assert.match(supervisor, /RECOVERABLE_EXIT_CODES\s*=\s*@\(75,\s*134\)/);
  assert.match(supervisor, /\$RECOVERABLE_EXIT_CODES\s+-contains\s+\$exitCode/);
  assert.match(supervisor, /notify-bot-incident\.ps1/);
  assert.match(supervisor, /memoria_nativa/);
});

test("codigo recuperavel sobrevive quando o Windows nao informa ExitCode", () => {
  assert.match(supervisor, /Resolve-BotRuntimeExitCode/);
  assert.match(supervisor, /DMR_BOT_EXIT_CODE_PATH/);
  assert.match(startBot, /Write-BotRuntimeExitCode/);
});

test("watchdog externo reinicia o bot quando o navegador para de responder", () => {
  assert.match(bot, /WHATSAPP_RUNTIME_PROBE_TIMEOUT_MS/);
  assert.match(bot, /isRuntimeCheckRunning/);
  assert.match(bot, /bot-runtime-health\.json/);
  assert.match(supervisor, /\$startBotScript[\s\S]*start-bot\.ps1/);
  assert.match(supervisor, /Start-Process[\s\S]*\$startBotScript/);
  assert.match(supervisor, /BOT_WATCHDOG_INTERVAL_SECONDS/);
  assert.match(supervisor, /BOT_WATCHDOG_STALE_SECONDS/);
  assert.match(supervisorCommon, /bot-runtime-health\.json/);
  assert.match(supervisor, /Stop-BotProcessTree/);
  assert.match(supervisor, /runtime_sem_resposta/);
});

test("alerta do Telegram possui retentativas para falhas temporarias", () => {
  assert.match(notificationScript, /TELEGRAM_RETRY_ATTEMPTS/);
  assert.match(notificationScript, /TELEGRAM_RETRY_DELAY_MS/);
  assert.match(notificationScript, /for \(\$attempt = 1;/);
});

test("limpeza automatica continua preservando os dados de autenticacao", () => {
  assert.match(maintenance, /Default\\Cache/);
  assert.match(maintenance, /Default\\Service Worker\\CacheStorage/);
  assert.doesNotMatch(maintenance, /Remove-Item[^\r\n]*(Cookies|IndexedDB|Local Storage|Session Storage|Preferences)/i);
});

test("manutencao real remove somente cache da sessao de teste", {
  skip: process.platform !== "win32",
}, async () => {
  const authRoot = fileURLToPath(
    new URL("../apps/whatsapp-bot/.wwebjs_auth/", import.meta.url),
  );
  await mkdir(authRoot, { recursive: true });
  const fixture = await mkdtemp(join(authRoot, "session-test-maintenance-"));
  const cacheFile = join(fixture, "Default", "Cache", "temporary.bin");
  const indexedDbFile = join(fixture, "Default", "IndexedDB", "authentication.bin");

  try {
    await mkdir(join(fixture, "Default", "Cache"), { recursive: true });
    await mkdir(join(fixture, "Default", "IndexedDB"), { recursive: true });
    await writeFile(cacheFile, "discard");
    await writeFile(indexedDbFile, "preserve");

    const result = spawnSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", fileURLToPath(new URL("../scripts/maintain-whatsapp-profile.ps1", import.meta.url)),
      "-SessionPath", fixture,
    ], {
      encoding: "utf8",
      windowsHide: true,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    await assert.rejects(access(cacheFile), { code: "ENOENT" });
    assert.equal(await readFile(indexedDbFile, "utf8"), "preserve");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
