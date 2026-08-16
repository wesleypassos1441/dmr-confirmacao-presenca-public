import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

export type BotIncidentSeverity = "info" | "warning" | "error";

type BotIncident = {
  key: string;
  title: string;
  message: string;
  severity?: BotIncidentSeverity;
  cooldownSeconds?: number;
};

const notificationScriptPath = fileURLToPath(
  new URL("../../../scripts/notify-bot-incident.ps1", import.meta.url),
);

export function notifyBotIncident(incident: BotIncident) {
  if (process.platform !== "win32") return false;

  const key = sanitizeArgument(incident.key, 80) || "bot_incident";
  const title = sanitizeArgument(incident.title, 100) || "Bot DMR";
  const message = sanitizeArgument(incident.message, 280) || "O Bot DMR precisa de atencao.";
  const severity = incident.severity ?? "warning";
  const cooldownSeconds = Math.max(30, Math.trunc(incident.cooldownSeconds ?? 300));

  return runNotification([
    "-ThrottleKey", key,
    "-Title", title,
    "-Message", message,
    "-Severity", severity,
    "-CooldownSeconds", String(cooldownSeconds),
  ]);
}

export function notifyBotRecovery() {
  if (process.platform !== "win32") return false;

  return runNotification([
    "-ThrottleKey", "bot_recuperado",
    "-Title", "Bot DMR restabelecido",
    "-Message", "O WhatsApp e a fila de mensagens voltaram a operar normalmente.",
    "-Severity", "info",
    "-Recovery",
  ]);
}

function runNotification(notificationArguments: string[]) {
  const child = execFile(
    "powershell.exe",
    [
      "-NoProfile",
      "-WindowStyle", "Hidden",
      "-ExecutionPolicy", "Bypass",
      "-File", notificationScriptPath,
      ...notificationArguments,
    ],
    {
      windowsHide: true,
      timeout: 15_000,
    },
    () => undefined,
  );
  child.unref();
  return true;
}

function sanitizeArgument(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
