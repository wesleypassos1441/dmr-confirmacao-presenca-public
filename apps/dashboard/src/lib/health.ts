type HealthRow = Record<string, unknown>;

export type SystemHealthStatus = "online" | "falha" | "offline" | "iniciando";

export type SystemHealthSummary = {
  status: SystemHealthStatus;
  statusLabel: string;
  lastHeartbeatAt: string;
  lastSentAt: string;
  lastIncomingAt: string;
  pendingMessages: number;
  pendingReports: number;
  lastError: string;
};

type BuildHealthInput = {
  now?: string | Date;
  heartbeats?: HealthRow[];
  queue?: HealthRow[];
  incoming?: HealthRow[];
  logs?: HealthRow[];
};

const HEARTBEAT_FRESH_MS = 2 * 60 * 1000;

export function buildSystemHealthSummary(input: BuildHealthInput): SystemHealthSummary {
  const now = toDate(input.now) ?? new Date();
  const latestHeartbeat = latestBy(input.heartbeats ?? [], "criado_em");
  const heartbeatAt = toDate(latestHeartbeat?.criado_em);
  const heartbeatStatus = String(latestHeartbeat?.status ?? "").toLowerCase();
  const heartbeatFresh = heartbeatAt ? now.getTime() - heartbeatAt.getTime() <= HEARTBEAT_FRESH_MS : false;
  const heartbeatError = readError(latestHeartbeat);
  const latestQueueError = latestBy((input.queue ?? []).filter((row) => String(row.status ?? "") === "erro"), "atualizado_em", "criado_em");
  const latestLogError = latestBy((input.logs ?? []).filter((row) => isErrorLike(row)), "criado_em");
  const latestSent = latestBy((input.queue ?? []).filter((row) => String(row.status ?? "") === "enviada"), "enviada_em", "atualizado_em");
  const latestIncoming = latestBy(input.incoming ?? [], "recebida_em", "criado_em");
  const latestHealthyAt = Math.max(
    timestamp(latestSent, "enviada_em", "atualizado_em"),
    timestamp(latestIncoming, "recebida_em", "criado_em"),
    heartbeatFresh && heartbeatStatus === "online" ? heartbeatAt?.getTime() ?? 0 : 0,
  );
  const logErrorIsCurrent = latestLogError
    ? timestamp(latestLogError, "criado_em", "criado_em") > latestHealthyAt
    : false;
  const lastError = heartbeatError || readError(latestQueueError) || (logErrorIsCurrent ? readError(latestLogError) : "");

  let status: SystemHealthStatus = "iniciando";
  if (heartbeatFresh && heartbeatStatus === "online") status = "online";
  else if (heartbeatFresh && (heartbeatStatus.startsWith("erro") || lastError)) status = "falha";
  else if (heartbeatAt) status = "offline";

  return {
    status,
    statusLabel: statusLabel(status),
    lastHeartbeatAt: valueToString(latestHeartbeat?.criado_em),
    lastSentAt: valueToString(latestSent?.enviada_em),
    lastIncomingAt: valueToString(latestIncoming?.recebida_em),
    pendingMessages: (input.queue ?? []).filter((row) => String(row.status ?? "") === "pendente" && String(row.tipo ?? "") !== "relatorio_diario").length,
    pendingReports: (input.queue ?? []).filter((row) => String(row.status ?? "") === "pendente" && String(row.tipo ?? "") === "relatorio_diario").length,
    lastError,
  };
}

export function humanizeSystemError(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/execution context was destroyed|most likely because of a navigation/i.test(raw)) {
    return "O WhatsApp Web foi recarregado e a conexão do bot foi interrompida. O sistema tentará reconectar automaticamente.";
  }
  if (/page\.navigate timed out|navigation timeout|timed out/i.test(raw)) {
    return "O WhatsApp Web demorou mais que o esperado para responder. O sistema tentará reconectar automaticamente.";
  }
  if (/out of memory|heap out of memory|allocation failed/i.test(raw)) {
    return "O navegador do WhatsApp ficou sem memória disponível. O sistema limpará caches descartáveis e reiniciará o bot preservando o login.";
  }
  if (/qr code|qr_necessario|nova leitura de qr/i.test(raw)) {
    return "O WhatsApp solicitou uma nova autenticação. Abra o Bot DMR e leia o QR Code exibido.";
  }
  if (/fila por tres tentativas|acessar a fila de disparos/i.test(raw)) {
    return "O bot não conseguiu acessar a fila de disparos. Verifique a internet; o sistema continuará tentando automaticamente.";
  }
  if (/ebusy|resource busy|resource.*locked|browser is already running/i.test(raw)) {
    return "A sessão do WhatsApp está aberta em outro processo. Feche a outra janela antes de iniciar novamente.";
  }
  if (/fetch failed|failed to dial|network|dns|econnreset|enotfound/i.test(raw)) {
    return "Não foi possível acessar o banco de dados pela internet. O bot continuará tentando automaticamente.";
  }
  if (/telefone nao registrado no whatsapp/i.test(raw)) {
    return "O WhatsApp não confirmou um dos telefones informados. Confira o número no cadastro do colaborador.";
  }
  return "O bot encontrou uma falha operacional. Consulte a Auditoria se o problema continuar.";
}

function statusLabel(status: SystemHealthStatus) {
  const labels: Record<SystemHealthStatus, string> = {
    online: "Bot online",
    falha: "Bot com falha",
    offline: "Bot sem sinal recente",
    iniciando: "Aguardando sinal do bot",
  };
  return labels[status];
}

function latestBy(rows: HealthRow[], primaryField: string, fallbackField = primaryField) {
  return [...rows].sort((a, b) => timestamp(b, primaryField, fallbackField) - timestamp(a, primaryField, fallbackField)).at(0);
}

function timestamp(row: HealthRow | undefined, primaryField: string, fallbackField: string) {
  if (!row) return 0;
  return toDate(row[primaryField])?.getTime() ?? toDate(row[fallbackField])?.getTime() ?? 0;
}

function toDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function valueToString(value: unknown) {
  return String(value ?? "");
}

function readError(row?: HealthRow) {
  if (!row) return "";
  const detalhes = row.detalhes;
  if (detalhes && typeof detalhes === "object") {
    const detailRecord = detalhes as Record<string, unknown>;
    const detailError = detailRecord.error ?? detailRecord.erro ?? detailRecord.motivo ?? detailRecord.reason;
    if (detailError) return String(detailError);
  }
  return String(row.ultimo_erro ?? row.erro ?? row.error ?? "");
}

function isErrorLike(row: HealthRow) {
  return String(row.acao ?? "").toLowerCase().includes("erro") || Boolean(readError(row));
}
