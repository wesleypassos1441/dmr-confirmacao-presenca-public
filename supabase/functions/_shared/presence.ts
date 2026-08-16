export type QueueType =
  | "confirmacao_inicial"
  | "lembrete_1"
  | "lembrete_2"
  | "resposta_incompreensivel"
  | "alerta_sem_resposta"
  | "alerta_resposta_incompreensivel"
  | "alerta_resposta_incompreensivel_expirada"
  | "alerta_nao_comparecera";

const POSITIVE = new Set([
  "1",
  "sim",
  "s",
  "ss",
  "1 sim",
  "si",
  "yes",
  "confirmo",
  "confirmado",
  "vou",
  "irei",
  "pode",
  "pode contar",
  "pode contar comigo",
  "estarei presente",
  "vou comparecer",
  "eu vou",
]);
const NEGATIVE = new Set([
  "2",
  "nao",
  "n",
  "2 nao",
  "no",
  "nao vou",
  "nao irei",
  "nao consigo",
  "nao posso",
  "nao poderei",
  "nao comparecerei",
  "nao estarei presente",
  "nao vou comparecer",
  "estou impossibilitado",
  "estou impossibilitada",
]);

export function normalizarResposta(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[.,!?;:()[\]{}"'`´-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (NEGATIVE.has(normalized)) return { tipo: "nao_comparecera", resposta_normalizada: "nao" };
  if (POSITIVE.has(normalized)) return { tipo: "confirmado", resposta_normalizada: "sim" };
  return { tipo: "incompreensivel", resposta_normalizada: null };
}

export type ContractType = "freelancer" | "intermitente" | string | null | undefined;

export function contractHeading(type: ContractType) {
  if (type === "freelancer") return "*Freelancer: SEM VÍNCULO EMPREGATÍCIO*";
  if (type === "intermitente") return "*Contrato Intermitente: Conforme diárias trabalhadas*";
  return "";
}

export function confirmationReply(collaboratorName: string) {
  return `Obrigado pela sua confirmação *${collaboratorName}*. Contamos com a sua presença.`;
}

export function absenceReply(collaboratorName: string, type: ContractType) {
  const base = `Obrigado pela sua resposta *${collaboratorName}*.`;
  return type === "freelancer" ? `${base} Gostaria de indicar alguém para ir em seu lugar?` : base;
}

export function chaveFila(escalaColaboradorId: string, tipo: QueueType, contatoId?: string | null) {
  return [escalaColaboradorId, tipo, contatoId].filter(Boolean).join(":");
}

export function unclearGuidance() {
  return `Não consegui entender sua resposta.

Por favor, responda:
1 - Sim
2 - Não`;
}

export function absenceAlert(input: {
  colaboradorNome: string;
  empresaNome: string;
  data: string;
  horarioInicio: string;
  respondidoEm: string;
}) {
  return `ALERTA DE AUSÊNCIA

${input.colaboradorNome} informou que NÃO poderá comparecer.

Empresa: ${input.empresaNome}
Data: ${formatDateBrazil(input.data)}
Horário de entrada: ${input.horarioInicio}
Resposta recebida às: ${formatTimeBrazil(input.respondidoEm)}

Providenciar substituição.`;
}

export function unclearAlert(input: {
  colaboradorNome: string;
  empresaNome: string;
  data: string;
  horarioInicio: string;
  ultimaResposta: string;
  expired?: boolean;
}) {
  const intro = input.expired
    ? `${input.colaboradorNome} enviou uma resposta incompreensível e não confirmou presença depois disso.`
    : `O colaborador ${input.colaboradorNome} respondeu mensagens que o sistema não conseguiu entender.`;
  return `ATENÇÃO

${intro}

Empresa: ${input.empresaNome}
Data: ${formatDateBrazil(input.data)}
Horário de entrada: ${input.horarioInicio}
Última resposta recebida: "${input.ultimaResposta}"

Verificar manualmente com o colaborador.`;
}
import { formatDateBrazil, formatTimeBrazil } from "./date-time.ts";
