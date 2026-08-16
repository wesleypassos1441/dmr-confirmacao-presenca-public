const SAO_PAULO_OFFSET = '-03:00';

const POSITIVE_RESPONSES = new Set([
  '1',
  'sim',
  's',
  'ss',
  '1 sim',
  'si',
  'yes',
  'confirmo',
  'confirmado',
  'vou',
  'irei',
  'pode',
  'pode contar',
  'pode contar comigo',
  'estarei presente',
  'vou comparecer',
  'eu vou',
]);
const NEGATIVE_RESPONSES = new Set([
  '2',
  'nao',
  'n',
  '2 nao',
  'no',
  'nao vou',
  'nao irei',
  'nao consigo',
  'nao posso',
  'nao poderei',
  'nao comparecerei',
  'nao estarei presente',
  'nao vou comparecer',
  'estou impossibilitado',
  'estou impossibilitada',
]);

const FINAL_CONFIRMATION_STATUSES = new Set(['confirmado', 'nao_comparecera', 'cancelado', 'tratado_manualmente']);

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseTime(horarioInicio) {
  const match = String(horarioInicio ?? '').match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new Error('Horario de inicio invalido. Use HH:mm.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('Horario de inicio invalido.');
  return { hour, minute };
}

function parseDateParts(dataEscala) {
  const match = String(dataEscala ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('Data da escala invalida. Use YYYY-MM-DD.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('Data da escala invalida. Use YYYY-MM-DD.');
  }

  return { year, month, day };
}

function addMinutesToLocal(dataEscala, horarioInicio, offsetMinutes) {
  parseDateParts(dataEscala);
  const { hour, minute } = parseTime(horarioInicio);
  const local = new Date(`${dataEscala}T${pad2(hour)}:${pad2(minute)}:00${SAO_PAULO_OFFSET}`);
  if (Number.isNaN(local.getTime())) throw new Error('Data da escala invalida. Use YYYY-MM-DD.');
  local.setUTCMinutes(local.getUTCMinutes() + offsetMinutes);

  const localMs = local.getTime() + (-3 * 60 * 60 * 1000);
  const shifted = new Date(localMs);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}T${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}:00${SAO_PAULO_OFFSET}`;
}

export function validarHorarioDisparoFuturo(input) {
  parseDateParts(input.dataEscala);
  const { hour, minute } = parseTime(input.horarioInicioDisparo);
  const scheduled = new Date(`${input.dataEscala}T${pad2(hour)}:${pad2(minute)}:00${SAO_PAULO_OFFSET}`);
  const now = input.nowIso ? new Date(input.nowIso) : new Date();

  if (Number.isNaN(scheduled.getTime())) throw new Error('Data da escala invalida. Use YYYY-MM-DD.');
  if (Number.isNaN(now.getTime())) throw new Error('Data atual invalida.');
  if (scheduled.getTime() <= now.getTime()) {
    throw new Error('Horario de Disparo ja passou. Escolha uma data ou horario futuro.');
  }

  return true;
}

function minutesOfDay(horarioInicio) {
  const { hour, minute } = parseTime(horarioInicio);
  return hour * 60 + minute;
}

function addDays(dataEscala, days) {
  const { year, month, day } = parseDateParts(dataEscala);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function resolveOperationDates(dataEscala, horarioInicioDisparo, horarioEntrada) {
  const entradaData = minutesOfDay(horarioInicioDisparo) > minutesOfDay(horarioEntrada)
    ? addDays(dataEscala, 1)
    : dataEscala;
  return { inicioData: dataEscala, entradaData };
}

export function calcularAgendaFixaEnvio(input) {
  const dates = resolveOperationDates(input.dataEscala, input.horarioInicioDisparo, input.horarioEntrada);
  const { minute } = parseTime(input.horarioInicioDisparo);
  const minutosAteProximoLimite = 30 - (minute % 30);
  const lembrete1 = addMinutesToLocal(
    dates.inicioData,
    input.horarioInicioDisparo,
    minutosAteProximoLimite,
  );
  const lembrete2 = addMinutesToLocal(
    dates.inicioData,
    input.horarioInicioDisparo,
    minutosAteProximoLimite + 30,
  );
  const alertaBase = addMinutesToLocal(dates.entradaData, input.horarioEntrada, -90);
  const lembrete2Time = new Date(lembrete2).getTime();
  const alertaBaseTime = new Date(alertaBase).getTime();

  return {
    confirmacao_inicial: addMinutesToLocal(dates.inicioData, input.horarioInicioDisparo, 0),
    lembrete_1: lembrete1,
    lembrete_2: lembrete2,
    alerta_sem_resposta: lembrete2Time === alertaBaseTime
      ? addMinutesToLocal(dates.inicioData, input.horarioInicioDisparo, minutosAteProximoLimite + 35)
      : alertaBase,
  };
}

export function resolverPrioridadeOperacional(input) {
  return input?.turno === 'alta' ? 'alta' : 'normal';
}

function removeAccents(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export function normalizarRespostaPresenca(value) {
  const normalized = removeAccents(String(value ?? '').trim().toLowerCase())
    .replace(/[.,!?;:()[\]{}"'`´-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (NEGATIVE_RESPONSES.has(normalized)) {
    return { tipo: 'nao_comparecera', resposta_normalizada: 'nao' };
  }
  if (POSITIVE_RESPONSES.has(normalized)) {
    return { tipo: 'confirmado', resposta_normalizada: 'sim' };
  }
  return { tipo: 'incompreensivel', resposta_normalizada: null };
}

export function parseColaboradoresLote(value) {
  return String(value ?? '')
    .split(/\s*(?:\r?\n|[;,])\s*/)
    .map((line, index) => parseColaboradorLine(line, index))
    .filter(Boolean);
}

function parseColaboradorLine(line, index) {
  const text = String(line ?? '').trim();
  if (!text) return null;

  const separatorIndex = text.indexOf(':');
  if (separatorIndex < 1) {
    throw new Error(`Revise o item ${index + 1}: use Nome: telefone.`);
  }

  const nome = text.slice(0, separatorIndex).trim();
  const telefoneText = text.slice(separatorIndex + 1).trim();
  if (telefoneText.includes(':')) {
    throw new Error('Separe cada pessoa por linha, virgula ou ponto e virgula.');
  }

  if (!nome) {
    throw new Error(`Revise o item ${index + 1}: use Nome: telefone.`);
  }

  return { nome, telefone: normalizarTelefoneBrasil(telefoneText) };
}

export function normalizarTelefoneBrasil(value) {
  let phoneDigits = String(value ?? '').replace(/\D/g, '');
  if (phoneDigits.startsWith('550')) phoneDigits = `55${phoneDigits.slice(3)}`;
  if (phoneDigits.startsWith('0') && (phoneDigits.length === 11 || phoneDigits.length === 12)) {
    phoneDigits = phoneDigits.slice(1);
  }

  if (phoneDigits.startsWith('55')) {
    const national = phoneDigits.slice(2);
    if (national.length >= 10 && national.length <= 11) return phoneDigits;
  }

  if (phoneDigits.length >= 10 && phoneDigits.length <= 11) return `55${phoneDigits}`;

  throw new Error('Telefone invalido. Use DDD + numero, por exemplo: (31) 9 9667-1334.');
}

export function telefonesEquivalentesBrasil(value) {
  const normalized = normalizarTelefoneBrasil(value);
  const national = normalized.slice(2);
  return [...new Set([normalized, national])];
}

export function gerarChaveFila(escalaColaboradorId, tipo, contatoAlertaId = null) {
  return [escalaColaboradorId, tipo, contatoAlertaId].filter(Boolean).join(':');
}

export function mascararTelefone(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const digits = text.replace(/\D/g, '');
  if (digits.length <= 4) return '*'.repeat(text.length || digits.length);

  if (text.startsWith('+') && digits.length >= 12) {
    return text.replace(/(\d{5})(?=-\d{4}$)/, '*****');
  }

  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export function calcularTiposFilaPendentes(input) {
  if (FINAL_CONFIRMATION_STATUSES.has(input.statusConfirmacao) || input.respondidoEm) return [];

  const now = new Date(input.nowIso);
  if (Number.isNaN(now.getTime())) throw new Error('Data atual invalida.');

  const pendentes = [];
  const due = (iso) => new Date(iso).getTime() <= now.getTime();

  if (due(input.agenda.confirmacao_inicial) && !input.mensagemEnviadaEm) {
    pendentes.push('confirmacao_inicial');
  }

  if (due(input.agenda.lembrete_1) && input.mensagemEnviadaEm && !input.primeiroLembreteEnviadoEm) {
    pendentes.push('lembrete_1');
  }

  if (due(input.agenda.lembrete_2) && input.primeiroLembreteEnviadoEm && !input.segundoLembreteEnviadoEm) {
    pendentes.push('lembrete_2');
  }

  if (
    due(input.agenda.alerta_sem_resposta) &&
    input.mensagemEnviadaEm &&
    input.primeiroLembreteEnviadoEm &&
    input.segundoLembreteEnviadoEm &&
    !input.alertaSemRespostaEnviadoEm
  ) {
    pendentes.push('alerta_sem_resposta');
  }

  if (
    Number(input.tentativasIncompreensiveis ?? 0) >= 3 &&
    !input.alertaIncompreensivelEnviadoEm
  ) {
    pendentes.push('alerta_resposta_incompreensivel');
    return pendentes;
  }

  if (
    Number(input.tentativasIncompreensiveis ?? 0) > 0 &&
    input.ultimaRespostaIncompreensivelEm &&
    !input.alertaIncompreensivelEnviadoEm
  ) {
    const elapsedMs = now.getTime() - new Date(input.ultimaRespostaIncompreensivelEm).getTime();
    if (elapsedMs >= 30 * 60 * 1000) {
      pendentes.push('alerta_resposta_incompreensivel_expirada');
    }
  }

  return pendentes;
}

export function buildPresenceMessage(input) {
  const hour = Number(input.nowHour);
  const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const intro = input.tipo === 'confirmacao_inicial'
    ? `${saudacao} *${input.colaboradorNome}*. Você poderá comparecer na empresa *${String(input.empresaNome).toUpperCase()}* hoje?`
    : `${saudacao} *${input.colaboradorNome}*. Ainda precisamos da sua resposta. Você poderá comparecer na empresa *${String(input.empresaNome).toUpperCase()}* hoje?`;
  const endereco = input.empresaEndereco || 'Endereço não informado';
  const horarioSaida = input.horarioSaida || '--:--';

  return `${intro}

Endereço: *${endereco}*

Horário: *${input.horarioEntrada} as ${horarioSaida}*

1 - SIM
2 - NÃO`;
}

export function buildAbsenceAlert(input) {
  return `ALERTA DE AUSÊNCIA

${input.colaboradorNome} informou que NÃO poderá comparecer.

Empresa: ${input.empresaNome}
Data: ${formatDateBrazil(input.data)}
Horário de entrada: ${input.horarioInicio}
Resposta recebida às: ${formatTimeBrazil(input.respondidoEm)}

Providenciar substituição.`;
}

export function buildUnclearAlert(input) {
  const intro = input.expired
    ? `${input.colaboradorNome} enviou uma resposta incompreensível e não confirmou presença depois disso.`
    : `O colaborador ${input.colaboradorNome} respondeu mensagens que o sistema não conseguiu entender.`;

  return `ATENÇÃO

${intro}

Empresa: ${input.empresaNome}
Data: ${formatDateBrazil(input.data)}
Horário de entrada: ${input.horarioInicio}
Última resposta recebida: "${input.ultimaRespostaOriginal}"

Verificar manualmente com o colaborador.`;
}
const BRAZIL_TIME_ZONE = 'America/Sao_Paulo';
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateValue(value) {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateBrazil(value) {
  const raw = String(value ?? '').trim();
  const dateOnly = DATE_ONLY.exec(raw);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const date = dateValue(value);
  if (!date) return raw || '-';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRAZIL_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatTimeBrazil(value) {
  const date = dateValue(value);
  if (!date) return String(value ?? '-');
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRAZIL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDateTimeBrazil(value) {
  const date = dateValue(value);
  if (!date) return String(value ?? '-');
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRAZIL_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}
