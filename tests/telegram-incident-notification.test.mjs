import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const notificationScriptPath = fileURLToPath(
  new URL("../scripts/notify-bot-incident.ps1", import.meta.url),
);
const telegramSetupPath = fileURLToPath(
  new URL("../scripts/telegram-setup.ps1", import.meta.url),
);
const envExamplePath = fileURLToPath(new URL("../.env.example", import.meta.url));
const incidentNotifierPath = fileURLToPath(
  new URL("../apps/whatsapp-bot/src/incident-notifier.ts", import.meta.url),
);
const botIndexPath = fileURLToPath(
  new URL("../apps/whatsapp-bot/src/index.ts", import.meta.url),
);

test("notificacao de incidente envia Telegram e respeita o cooldown existente", {
  skip: process.platform !== "win32",
}, async () => {
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({
        method: request.method,
        url: request.url,
        body: new URLSearchParams(body),
      });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const stateDirectory = await mkdtemp(join(tmpdir(), "dmr-telegram-test-"));
  const environment = {
    ...process.env,
    DMR_DISABLE_DESKTOP_NOTIFICATIONS: "true",
    TELEGRAM_ALERTS_ENABLED: "true",
    TELEGRAM_BOT_TOKEN: "token-de-teste",
    TELEGRAM_CHAT_ID: "1234567890",
    TELEGRAM_API_BASE_URL: `http://127.0.0.1:${address.port}`,
  };

  try {
    const first = await runPowerShell([
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", notificationScriptPath,
      "-ThrottleKey", "falha_teste",
      "-Title", "Bot DMR precisa de atencao",
      "-Message", "Falha controlada para validar o Telegram.",
      "-Severity", "error",
      "-CooldownSeconds", "900",
      "-StateDirectory", stateDirectory,
    ], environment);

    assert.equal(first.code, 0, first.stderr || first.stdout);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].url, "/bottoken-de-teste/sendMessage");
    assert.equal(requests[0].body.get("chat_id"), "8537645069");
    assert.match(requests[0].body.get("text"), /Bot DMR precisa de atencao/);
    assert.match(requests[0].body.get("text"), /Falha controlada/);

    const repeated = await runPowerShell([
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", notificationScriptPath,
      "-ThrottleKey", "falha_teste",
      "-Title", "Bot DMR precisa de atencao",
      "-Message", "Falha controlada para validar o Telegram.",
      "-Severity", "error",
      "-CooldownSeconds", "900",
      "-StateDirectory", stateDirectory,
    ], environment);

    assert.equal(repeated.code, 0, repeated.stderr || repeated.stdout);
    assert.equal(requests.length, 1, "o mesmo incidente nao pode gerar spam no Telegram");

    const recovery = await runPowerShell([
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", notificationScriptPath,
      "-ThrottleKey", "bot_recuperado",
      "-Title", "Bot DMR restabelecido",
      "-Message", "O WhatsApp voltou a operar normalmente.",
      "-Severity", "info",
      "-StateDirectory", stateDirectory,
      "-Recovery",
    ], environment);

    assert.equal(recovery.code, 0, recovery.stderr || recovery.stdout);
    assert.equal(requests.length, 2);
    assert.match(requests[1].body.get("text"), /Bot DMR restabelecido/);

    const repeatedRecovery = await runPowerShell([
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", notificationScriptPath,
      "-ThrottleKey", "bot_recuperado",
      "-Title", "Bot DMR restabelecido",
      "-Message", "O WhatsApp voltou a operar normalmente.",
      "-Severity", "info",
      "-StateDirectory", stateDirectory,
      "-Recovery",
    ], environment);

    assert.equal(repeatedRecovery.code, 0, repeatedRecovery.stderr || repeatedRecovery.stdout);
    assert.equal(requests.length, 2, "a recuperacao sem incidente ativo nao deve gerar mensagem");
  } finally {
    server.close();
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("bot informa recuperacao apenas quando uma falha ativa foi resolvida", async () => {
  const [notifier, botIndex] = await Promise.all([
    readFile(incidentNotifierPath, "utf8"),
    readFile(botIndexPath, "utf8"),
  ]);

  assert.match(notifier, /export function notifyBotRecovery/);
  assert.match(notifier, /"-Recovery"/);
  assert.match(botIndex, /notifyBotRecovery/);
  assert.match(botIndex, /client\.on\("ready"[\s\S]*notifyBotRecovery/);
  assert.match(
    botIndex,
    /pollFailureCount > 0[\s\S]*notifyBotRecovery[\s\S]*pollFailureCount = 0/,
  );
});

test("notificacao do Telegram tenta novamente depois de falha temporaria", {
  skip: process.platform !== "win32",
}, async () => {
  let attempts = 0;
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      attempts += 1;
      if (attempts < 3) {
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: false }));
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, result: { message_id: 3 } }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const stateDirectory = await mkdtemp(join(tmpdir(), "dmr-telegram-retry-test-"));
  const environment = {
    ...process.env,
    DMR_DISABLE_DESKTOP_NOTIFICATIONS: "true",
    TELEGRAM_ALERTS_ENABLED: "true",
    TELEGRAM_BOT_TOKEN: "token-de-teste",
    TELEGRAM_CHAT_ID: "1234567890",
    TELEGRAM_API_BASE_URL: `http://127.0.0.1:${address.port}`,
    TELEGRAM_RETRY_ATTEMPTS: "3",
    TELEGRAM_RETRY_DELAY_MS: "10",
  };

  try {
    const result = await runPowerShell([
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", notificationScriptPath,
      "-ThrottleKey", "falha_transitoria_teste",
      "-Title", "Teste de retentativa",
      "-Message", "O terceiro envio precisa funcionar.",
      "-Severity", "error",
      "-StateDirectory", stateDirectory,
    ], environment);

    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.equal(attempts, 3);
    const incidentLog = await readFile(join(stateDirectory, "bot-incidents.log"), "utf8");
    assert.doesNotMatch(incidentLog, /Nao foi possivel enviar o alerta pelo Telegram/);
  } finally {
    server.close();
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("configuracao guiada mantem o token fora do codigo e do frontend", async () => {
  assert.equal(existsSync(telegramSetupPath), true, "scripts/telegram-setup.ps1 deve existir");
  const [setupScript, envExample] = await Promise.all([
    readFile(telegramSetupPath, "utf8"),
    readFile(envExamplePath, "utf8"),
  ]);

  assert.match(setupScript, /Read-Host[\s\S]*-AsSecureString/);
  assert.match(setupScript, /getMe/);
  assert.match(setupScript, /sendMessage/);
  assert.doesNotMatch(setupScript, /\d{8,12}:[A-Za-z0-9_-]{30,}/);
  assert.doesNotMatch(
    setupScript,
    /\[System\.Collections\.Generic\.List\[string\]\]\(Get-Content/,
    "o cast direto de Get-Content cria uma colecao de tamanho fixo no PowerShell 5.1",
  );
  assert.match(
    setupScript,
    /New-Object ['"]System\.Collections\.Generic\.List\[string\]['"]/,
  );

  assert.match(envExample, /^TELEGRAM_ALERTS_ENABLED=false$/m);
  assert.match(envExample, /^TELEGRAM_BOT_TOKEN=$/m);
  assert.match(envExample, /^TELEGRAM_CHAT_ID=$/m);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_TELEGRAM/);
});

function runPowerShell(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", args, {
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}
