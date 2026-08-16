import { EdgeHttpError } from "./network.js";

export function describeIncomingError(error: unknown) {
  if (error instanceof EdgeHttpError && error.status === 404) {
    return "Resposta ignorada: telefone sem fila ativa no sistema. Isso costuma ser mensagem antiga, contato fora da operação do dia ou colaborador não cadastrado naquele horário.";
  }
  if (isNetworkError(error)) {
    return `Falha de rede ao registrar resposta no Supabase: ${safeDiagnosticText(error)}`;
  }
  if (error instanceof EdgeHttpError) {
    return `Edge Function bot-register-incoming retornou HTTP ${error.status}: ${safeDiagnosticText(error)}`;
  }
  return `Não foi possível registrar resposta recebida: ${safeDiagnosticText(error)}`;
}

export function describePollingError(error: unknown) {
  if (isNetworkError(error)) {
    return `Falha de rede ao consultar o Supabase: ${safeDiagnosticText(error)}. Nova tentativa automática em instantes.`;
  }
  if (error instanceof EdgeHttpError) {
    return `Edge Function bot-next-message retornou HTTP ${error.status}: ${safeDiagnosticText(error)}. Nova tentativa automática em instantes.`;
  }
  return `Falha ao verificar fila de disparos: ${safeDiagnosticText(error)}. Nova tentativa automática em instantes.`;
}

export function describeSendFailure(phone: string, error: unknown) {
  return `Falha ao enviar para ${maskPhone(phone)}: ${safeDiagnosticText(error)}`;
}

export function safeDiagnosticText(value: unknown) {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return message.replace(/[A-Za-z0-9-_]{24,}/g, "[redigido]").slice(0, 240);
}

function isNetworkError(error: unknown) {
  const message = safeDiagnosticText(error).toLowerCase();
  return message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("enotfound");
}

function maskPhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}
