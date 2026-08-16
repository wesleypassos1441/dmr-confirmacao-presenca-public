import { config as loadEnv } from "dotenv";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";
import { describeIncomingError, describePollingError, describeSendFailure, safeDiagnosticText } from "./diagnostics.js";
import { messageReceivedAt, resolveIncomingPhone } from "./incoming.js";
import { EdgeHttpError, pollBackoffMs, retryTransient } from "./network.js";
import { resolveWhatsappRecipient } from "./recipient.js";
import { notifyBotIncident, notifyBotRecovery } from "./incident-notifier.js";
import { acquireRuntimeLock, markBrowserProfileClean } from "./runtime-lock.js";
import { writeRuntimeHealthMarker } from "./runtime-marker.js";
import {
  buildWhatsappUserAgent,
  RESTART_EXIT_CODE,
  findWhatsappRuntimeProblem,
  isWhatsappRuntimeHealthy,
  isWhatsappRuntimeUnavailable,
  shouldRecycleWhatsappRuntime,
} from "./runtime-health.js";

loadEnv({ path: new URL("../../../.env", import.meta.url) });

const { Client, LocalAuth } = pkg;

type Priority = "alta" | "normal";
type QueueMessage = {
  id: string;
  escala_colaborador_id: string;
  tipo: string;
  prioridade: Priority;
  telefone_destino: string;
  mensagem: string;
};
type BotIntervals = Record<Priority, { min_segundos?: number; max_segundos?: number }>;

const edgeBaseUrl = requiredEnv("EDGE_FUNCTIONS_BASE_URL").replace(/\/$/, "");
const botToken = requiredEnv("DMR_BOT_TOKEN");
const pollIntervalMs = numberEnv("BOT_POLL_INTERVAL_MS", 3000);
const heartbeatIntervalMs = numberEnv("BOT_HEARTBEAT_INTERVAL_MS", 60_000);
const edgeRequestTimeoutMs = numberEnv("BOT_HTTP_TIMEOUT_MS", 15000);
const safeDebug = process.env.BOT_SAFE_DEBUG === "true";
const whatsappHeadless = process.env.WHATSAPP_HEADLESS !== "false";
const whatsappBrowserPath = resolveBrowserExecutable();
const whatsappUserAgent = process.env.WHATSAPP_USER_AGENT ||
  buildWhatsappUserAgent(whatsappBrowserPath, resolveBrowserVersion(whatsappBrowserPath));
const whatsappPairPhoneNumber = normalizePairingPhoneNumber(process.env.WHATSAPP_PAIR_PHONE_NUMBER);
const whatsappSessionId = normalizeSessionId(process.env.WHATSAPP_SESSION_ID);
const whatsappSessionPath = fileURLToPath(new URL("../.wwebjs_auth", import.meta.url));
const whatsappCachePath = fileURLToPath(new URL("../.wwebjs_cache", import.meta.url));
const whatsappProtocolTimeoutMs = numberEnv("WHATSAPP_PROTOCOL_TIMEOUT_MS", 180000);
const whatsappInitializeTimeoutMs = numberEnv("WHATSAPP_INITIALIZE_TIMEOUT_MS", 120000);
const whatsappSendTimeoutMs = numberEnv("WHATSAPP_SEND_TIMEOUT_MS", 120000);
const whatsappReadyGraceMs = numberEnv("WHATSAPP_READY_GRACE_MS", 15000);
const whatsappMaxUptimeMs = numberEnv("WHATSAPP_MAX_UPTIME_MINUTES", 30) * 60_000;
const whatsappRuntimeProbeTimeoutMs = numberEnv("WHATSAPP_RUNTIME_PROBE_TIMEOUT_MS", 10_000);
const whatsappWindowWidth = numberEnv("WHATSAPP_WINDOW_WIDTH", 720);
const whatsappWindowHeight = numberEnv("WHATSAPP_WINDOW_HEIGHT", 720);
const whatsappWindowX = numberEnv("WHATSAPP_WINDOW_X", 40);
const whatsappWindowY = numberEnv("WHATSAPP_WINDOW_Y", 40);
const runtimeLockPath = fileURLToPath(new URL("../.dmr-bot.lock", import.meta.url));
const runtimeHealthMarkerPath = fileURLToPath(new URL("../../../logs/bot-runtime-health.json", import.meta.url));
const browserPreferencesPath = fileURLToPath(
  new URL(`../.wwebjs_auth/session-${whatsappSessionId}/Default/Preferences`, import.meta.url),
);

const fallbackIntervals = {
  alta: {
    min: numberEnv("BOT_HIGH_PRIORITY_MIN_SECONDS", 6) * 1000,
    max: numberEnv("BOT_HIGH_PRIORITY_MAX_SECONDS", 15) * 1000,
  },
  normal: {
    min: numberEnv("BOT_NORMAL_PRIORITY_MIN_SECONDS", 25) * 1000,
    max: numberEnv("BOT_NORMAL_PRIORITY_MAX_SECONDS", 45) * 1000,
  },
};
const initialBatchIntervals = {
  min: numberEnv("BOT_INITIAL_BATCH_MIN_SECONDS", 2) * 1000,
  max: numberEnv("BOT_INITIAL_BATCH_MAX_SECONDS", 5) * 1000,
};

let isPolling = false;
let isRuntimeCheckRunning = false;
let pollFailureCount = 0;
let nextPollAllowedAt = 0;
let isReady = false;
let readyAt = 0;
let isShuttingDown = false;
let releaseRuntimeLock: () => void = () => undefined;

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: whatsappSessionId,
    dataPath: whatsappSessionPath,
    rmMaxRetries: 8,
  }),
  authTimeoutMs: numberEnv("WHATSAPP_AUTH_TIMEOUT_MS", 90000),
  takeoverOnConflict: true,
  takeoverTimeoutMs: numberEnv("WHATSAPP_TAKEOVER_TIMEOUT_MS", 5000),
  userAgent: whatsappUserAgent ?? (false as unknown as string),
  pairWithPhoneNumber: {
    phoneNumber: whatsappPairPhoneNumber,
    showNotification: true,
    intervalMs: numberEnv("WHATSAPP_PAIR_INTERVAL_MS", 180000),
  },
  webVersionCache: {
    type: "local",
    path: whatsappCachePath,
  },
  puppeteer: {
    headless: whatsappHeadless,
    executablePath: whatsappBrowserPath,
    protocolTimeout: whatsappProtocolTimeoutMs,
    defaultViewport: null,
    // pipe: false usa WebSocket em vez de named-pipe, o que e mais estavel
    // com o Microsoft Edge no Windows (o named-pipe pode ser fechado abruptamente
    // durante a navegacao pos-login do WhatsApp Web).
    pipe: false,
    args: [
      "--new-window",
      `--window-size=${whatsappWindowWidth},${whatsappWindowHeight}`,
      `--window-position=${whatsappWindowX},${whatsappWindowY}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disk-cache-size=67108864",
      "--media-cache-size=33554432",
      "--disable-component-update",
      // --disable-extensions causa falha de inicializacao no Edge (diferente do Chrome);
      // o Edge bloqueia scripts internos necessarios para injecao do whatsapp-web.js.
      // "--disable-extensions",
      "--no-first-run",
      "--profile-directory=Default",
      "--disable-session-crashed-bubble",
      "--disable-infobars",
      "--noerrdialogs",
    ],
  },
});

client.on("qr", (qr: string) => {
  console.log("Escaneie o QR Code abaixo com o WhatsApp da DMR.");
  qrcode.generate(qr, { small: true });
  void reportBotIncident(
    "qr_necessario",
    "WhatsApp solicitou novo QR Code",
    "Abra o Bot DMR e leia o QR Code para restabelecer a autenticacao.",
    "warning",
  );
});

client.on("code", (code: string) => {
  console.log("");
  console.log(`Codigo de pareamento do WhatsApp: ${code}`);
  console.log("No celular da DMR, abra WhatsApp > Aparelhos conectados > Conectar com numero de telefone.");
  console.log("Digite esse codigo para conectar o bot.");
  console.log("");
});

client.on("ready", async () => {
  isReady = true;
  readyAt = Date.now();
  writeRuntimeHealthMarker(runtimeHealthMarkerPath, "ready");
  client.pupBrowser?.once("disconnected", () => {
    if (!isShuttingDown) {
      void reportAndRestartRuntime(
        "erro_desconexao",
        "Navegador do WhatsApp desconectado",
        "A conexao do Edge com o WhatsApp foi perdida. O bot sera reiniciado automaticamente.",
        "navegador_desconectado",
      );
    }
  });
  console.log("Bot WhatsApp conectado.");
  notifyBotRecovery();
  await sendHeartbeat("online");
});

client.on("disconnected", async (reason: string) => {
  isReady = false;
  console.log(`Bot desconectado: ${safeText(reason)}`);
  if (!isShuttingDown) {
    await reportBotIncident(
      "erro_desconexao",
      "WhatsApp desconectado",
      "A sessao do WhatsApp foi desconectada. O bot sera reiniciado automaticamente.",
      "error",
      { reason: safeText(reason) },
    );
    await restartWhatsappRuntime("whatsapp_desconectado");
  }
});

client.on("message", async (message: any) => {
  try {
    if (message.fromMe || message.isStatus) return;
    const phone = await resolveIncomingPhone(client, message);
    const body = typeof message.body === "string" && message.body.trim()
      ? message.body
      : "[mensagem sem texto]";

    const result = await postEdgeWithRetry("bot-register-incoming", {
      telefone_origem: phone,
      mensagem_original: body,
      recebida_em: messageReceivedAt(message),
      whatsapp_message_id: message.id?._serialized,
    }, 5);

    if (result?.resposta_colaborador) {
      await client.sendMessage(message.from, result.resposta_colaborador);
    }
  } catch (error) {
    const incomingError = describeIncomingError(error);
    console.log(incomingError);
    if (!/colaborador nao encontrado|colaborador não encontrado/i.test(incomingError)) {
      void reportBotIncident(
        "erro_resposta",
        "Falha ao registrar resposta",
        "O bot recebeu uma mensagem, mas nao conseguiu registra-la. O sistema continuara tentando.",
        "warning",
      );
    }
  }
});

const pollTimer = setInterval(async () => {
  if (!isReady || isPolling) return;
  if (!(await ensureWhatsappRuntimeOperational("runtime_degradado_na_verificacao"))) return;
  if (Date.now() - readyAt < whatsappReadyGraceMs) return;
  if (Date.now() < nextPollAllowedAt) return;
  isPolling = true;
  try {
    await processNextMessage();
    if (pollFailureCount > 0) {
      console.log("Conexao com o Supabase restabelecida.");
      notifyBotRecovery();
    }
    pollFailureCount = 0;
    nextPollAllowedAt = 0;
  } catch (error) {
    pollFailureCount += 1;
    nextPollAllowedAt = Date.now() + pollBackoffMs(pollFailureCount, pollIntervalMs);
    if (pollFailureCount === 1 || safeDebug) {
      console.log(describePollingError(error));
    }
    if (pollFailureCount === 3) {
      void reportBotIncident(
        "erro_fila",
        "Falha ao consultar a fila",
        "O bot nao conseguiu acessar a fila por tres tentativas seguidas. Verifique a internet e o Supabase.",
        "error",
      );
    }
  } finally {
    isPolling = false;
  }
}, pollIntervalMs);

const heartbeatTimer = setInterval(async () => {
  if (!isReady) return;
  if (!(await ensureWhatsappRuntimeOperational("runtime_degradado_no_heartbeat"))) return;
  if (shouldRecycleWhatsappRuntime({
    uptimeMs: Date.now() - readyAt,
    maxUptimeMs: whatsappMaxUptimeMs,
    busy: isPolling,
  })) {
    await restartWhatsappRuntime("reciclagem_preventiva_do_whatsapp");
    return;
  }
  if (pollFailureCount >= 3) {
    void sendHeartbeat("erro_fila", {
      error: "O bot nao conseguiu acessar a fila de disparos nas ultimas tentativas.",
      tentativas: pollFailureCount,
    });
    return;
  }
  void sendHeartbeat("online");
}, heartbeatIntervalMs);

process.once("SIGINT", () => void shutdownBot("interrompido", 0));
process.once("SIGTERM", () => void shutdownBot("encerrado", 0));

void startBot();

async function startBot() {
  try {
    releaseRuntimeLock = acquireRuntimeLock(runtimeLockPath);
    markBrowserProfileClean(browserPreferencesPath);
    await initializeWhatsappWithTimeout();
  } catch (error) {
    const message = safeText(error);
    console.log(`Falha ao iniciar o WhatsApp Web: ${message}`);
    if (isWhatsappRuntimeUnavailable(error)) {
      console.log("Falha temporaria ao abrir o WhatsApp Web. O executavel tentara novamente automaticamente.");
      if (/out of memory|heap out of memory|allocation failed/i.test(message)) {
        await reportBotIncident(
          "erro_memoria_navegador",
          "Navegador sem memoria",
          "O Edge ficou sem memoria. Caches descartaveis serao limpos e o bot sera reiniciado preservando o login.",
          "error",
        );
      } else {
        await reportBotIncident(
          "erro_inicializacao_transitorio",
          "Falha temporaria ao abrir o WhatsApp",
          "O bot nao conseguiu abrir o WhatsApp Web e tentara novamente automaticamente.",
          "warning",
          { error_original: message },
        );
      }
      await shutdownBot("erro_inicializacao_transitorio", RESTART_EXIT_CODE, false);
      return;
    }
    if (message.includes("Execution context was destroyed")) {
      console.log("O WhatsApp Web recarregou durante a inicializacao. Isso pode ocorrer por conflito de sessao, bloqueio do navegador automatizado ou User-Agent incompatível.");
      console.log("Hoje a geracao de QR pela biblioteca pode falhar. Configure WHATSAPP_PAIR_PHONE_NUMBER no .env para parear por codigo.");
    }
    await reportBotIncident(
      "erro_inicializacao",
      "Bot nao conseguiu iniciar",
      "O Bot DMR nao conseguiu iniciar. Consulte o Painel do Dia e o log operacional.",
      "error",
      { error_original: message },
    );
    await shutdownBot("erro_inicializacao", 1, false);
  }
}

async function ensureWhatsappRuntimeOperational(reason: string) {
  if (isRuntimeCheckRunning) return false;
  isRuntimeCheckRunning = true;
  try {
    const problem = await findWhatsappRuntimeProblem(client, whatsappRuntimeProbeTimeoutMs);
    if (!problem) {
      writeRuntimeHealthMarker(runtimeHealthMarkerPath);
      return true;
    }

    console.log(`WhatsApp Web indisponivel (${problem}). O bot sera reiniciado automaticamente.`);
    if (problem === "pagina_whatsapp_com_erro") {
      await reportBotIncident(
        "erro_memoria_navegador",
        "Navegador sem memoria",
        "O Edge ficou sem memoria. Caches descartaveis serao limpos e o bot sera reiniciado preservando o login.",
        "error",
      );
    } else if (problem === "runtime_sem_resposta") {
      await reportBotIncident(
        "runtime_sem_resposta",
        "WhatsApp Web travou",
        "O Edge deixou de responder ou ficou sem memoria. O bot sera reiniciado preservando o login.",
        "error",
      );
    } else {
      await reportBotIncident(
        "erro_desconexao",
        "WhatsApp Web indisponivel",
        "A pagina do WhatsApp deixou de responder. O bot sera reiniciado automaticamente.",
        "error",
      );
    }
    await restartWhatsappRuntime(reason);
    return false;
  } finally {
    isRuntimeCheckRunning = false;
  }
}
async function initializeWhatsappWithTimeout() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.initialize(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Tempo limite ao abrir o WhatsApp Web."));
        }, whatsappInitializeTimeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function shutdownBot(reason: string, exitCode: number, notify = true) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  isReady = false;
  clearInterval(pollTimer);
  clearInterval(heartbeatTimer);
  if (notify) await sendHeartbeat("desconectado", { reason });
  await client.destroy().catch(() => undefined);
  releaseRuntimeLock();
  process.exitCode = exitCode;
  if (reason !== "erro_inicializacao") console.log("Bot WhatsApp encerrado com seguranca.");
}

async function processNextMessage() {
  const response = await postEdgeWithRetry("bot-next-message", {}, 3);
  const queueMessage = response?.mensagem as QueueMessage | null | undefined;
  if (!queueMessage) return;

  let sent: any;
  try {
    const chatId = await resolveWhatsappRecipient(client, queueMessage.telefone_destino);
    sent = await sendMessageWithTimeout(chatId, queueMessage.mensagem);
  } catch (error) {
    const runtimeUnavailable = isWhatsappRuntimeUnavailable(error);
    console.log(describeSendFailure(queueMessage.telefone_destino, error));
    await postEdgeWithRetry("bot-register-error", {
      fila_mensagem_id: queueMessage.id,
      telefone_destino: queueMessage.telefone_destino,
      erro: safeText(error),
      falha_transitoria_sessao: runtimeUnavailable,
    }, 3);
    await reportBotIncident(
      "erro_envio",
      "Falha no envio de mensagem",
      "Uma mensagem nao pode ser enviada. O bot registrou a falha e continuara o processamento.",
      runtimeUnavailable ? "error" : "warning",
      { fila_mensagem_id: queueMessage.id },
    );
    if (runtimeUnavailable) await restartWhatsappRuntime("falha_transitoria_no_envio");
    return;
  }

  const sentMessageId = sent?.id?._serialized;
  try {
    await postEdgeWithRetry("bot-mark-sent", {
      fila_mensagem_id: queueMessage.id,
      whatsapp_message_id: sentMessageId,
    }, 3);
  } catch (error) {
    console.log(`Mensagem enviada, mas o reconhecimento no banco falhou: ${safeText(error)}`);
    await reportBotIncident(
      "erro_registro_envio",
      "Envio sem confirmacao no banco",
      "A mensagem foi enviada, mas o banco nao confirmou o registro. Verifique o Painel do Dia.",
      "error",
      { fila_mensagem_id: queueMessage.id },
    );
    return;
  }

  const interval = resolveInterval(response?.intervalos as BotIntervals | undefined, queueMessage.prioridade, queueMessage.tipo);
  const waitMs = randomBetween(interval.min, interval.max);
  if (safeDebug) console.log(`Mensagem enviada. Proxima tentativa em ${Math.round(waitMs / 1000)}s.`);
  await delay(waitMs);
}

async function sendMessageWithTimeout(chatId: string, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      client.sendMessage(chatId, message),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Tempo limite ao enviar mensagem pelo WhatsApp Web."));
        }, whatsappSendTimeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function postEdge(functionName: string, body: Record<string, unknown>) {
  const response = await fetch(`${edgeBaseUrl}/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-dmr-bot-token": botToken,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(edgeRequestTimeoutMs),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new EdgeHttpError(response.status, String(data?.error || `Erro HTTP ${response.status}`));
  return data;
}

async function postEdgeWithRetry(functionName: string, body: Record<string, unknown>, attempts: number) {
  return retryTransient(() => postEdge(functionName, body), { attempts });
}

async function sendHeartbeat(status: string, detalhes: Record<string, unknown> = {}) {
  try {
    await postEdge("bot-health", {
      bot_id: "bot-local",
      status,
      detalhes,
    });
  } catch {
    // Heartbeat nao deve interromper envio operacional.
  }
}

async function reportBotIncident(
  status: string,
  title: string,
  message: string,
  severity: "info" | "warning" | "error",
  details: Record<string, unknown> = {},
) {
  console.log(`ALERTA DO BOT: ${message}`);
  notifyBotIncident({
    key: status,
    title,
    message,
    severity,
    cooldownSeconds: 300,
  });
  await sendHeartbeat(status, { error: message, ...details });
}

async function reportAndRestartRuntime(
  status: string,
  title: string,
  message: string,
  reason: string,
) {
  if (isShuttingDown) return;
  await reportBotIncident(status, title, message, "error");
  await restartWhatsappRuntime(reason);
}

async function restartWhatsappRuntime(reason: string) {
  if (isShuttingDown) return;
  console.log("A conexao interna do WhatsApp foi perdida. O bot sera reiniciado automaticamente.");
  await shutdownBot(reason, RESTART_EXIT_CODE);
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function resolveInterval(config: BotIntervals | undefined, priority: Priority, tipo?: string) {
  if (tipo === "confirmacao_inicial" || tipo?.startsWith("alerta_")) return initialBatchIntervals;
  const fallback = fallbackIntervals[priority];
  const minSeconds = Number(config?.[priority]?.min_segundos);
  const maxSeconds = Number(config?.[priority]?.max_segundos);
  if (!Number.isFinite(minSeconds) || !Number.isFinite(maxSeconds) || minSeconds <= 0 || maxSeconds < minSeconds) {
    return fallback;
  }
  return { min: minSeconds * 1000, max: maxSeconds * 1000 };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Variavel obrigatoria ausente: ${name}`);
  return value;
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizePairingPhoneNumber(value: string | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return /^55\d{10,11}$/.test(withCountry) ? withCountry : "";
}

function normalizeSessionId(value: string | undefined) {
  const normalized = String(value ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
  return normalized || "dmr-confirmacao-presenca";
}

function resolveBrowserExecutable() {
  const configured = process.env.WHATSAPP_BROWSER_PATH?.trim();
  const candidates = [
    configured,
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA ?? ""}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => existsSync(candidate));
}

function resolveBrowserVersion(browserPath: string | undefined) {
  if (!browserPath || process.platform !== "win32") return undefined;
  try {
    return execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", "(Get-Item -LiteralPath $env:DMR_BROWSER_PATH).VersionInfo.ProductVersion"],
      {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
        env: { ...process.env, DMR_BROWSER_PATH: browserPath },
      },
    ).trim();
  } catch {
    return undefined;
  }
}

function safeText(value: unknown) {
  return safeDiagnosticText(value);
}
