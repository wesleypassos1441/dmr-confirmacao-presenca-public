import { compareNamesPtBr, compareScheduleLabels } from "./sort.ts";

export type ReportSourceRow = {
  status_confirmacao?: unknown;
  resposta_normalizada?: unknown;
  resposta_original?: unknown;
  substituto_nome?: unknown;
  substituido_em?: unknown;
  falso_positivo_em?: unknown;
  falso_positivo_motivo?: unknown;
  respondido_em?: unknown;
  horario_inicio?: unknown;
  escalas?: {
    empresas?: { nome?: unknown } | null;
  } | null;
  turnos_empresa?: {
    nome?: unknown;
  } | null;
  colaboradores?: {
    nome?: unknown;
    telefone?: unknown;
  } | null;
};

export type NominalReportItem = {
  nome: string;
  telefone?: string;
  resposta?: string;
  substituto?: string;
  motivo?: string;
  confirmadoEm?: string;
  revertidoEm?: string;
  substituidoEm?: string;
};

export type NominalReportGroup = {
  key: string;
  empresa: string;
  turno: string;
  confirmados: NominalReportItem[];
  naoComparecera: NominalReportItem[];
  substituidos: NominalReportItem[];
  falsosPositivos: NominalReportItem[];
  aguardando: NominalReportItem[];
  incompreensiveis: NominalReportItem[];
  outros: NominalReportItem[];
  total: number;
};

export type NominalReportFilter = "todos" | "confirmados" | "nao_comparecera" | "substituidos" | "falsos_positivos" | "aguardando";

const WAITING_STATUSES = new Set(["pendente", "mensagem_agendada", "mensagem_enviada", "sem_resposta", "erro_envio"]);

function blankGroup(key: string, empresa: string, turno: string): NominalReportGroup {
  return {
    key,
    empresa,
    turno,
    confirmados: [],
    naoComparecera: [],
    substituidos: [],
    falsosPositivos: [],
    aguardando: [],
    incompreensiveis: [],
    outros: [],
    total: 0,
  };
}

function cleanText(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function sortedItems(items: NominalReportItem[]) {
  return [...items].sort((a, b) => compareNamesPtBr(a.nome, b.nome));
}

export function buildNominalReportGroups(rows: readonly ReportSourceRow[]) {
  const map = new Map<string, NominalReportGroup>();

  for (const row of rows) {
    const empresa = cleanText(row.escalas?.empresas?.nome, "Sem empresa");
    const turno = cleanText(row.turnos_empresa?.nome, String(row.horario_inicio ?? "").slice(0, 5) || "Sem turno");
    const key = `${empresa}|${turno}`;
    const group = map.get(key) ?? blankGroup(key, empresa, turno);
    const item: NominalReportItem = {
      nome: cleanText(row.colaboradores?.nome, "Sem nome"),
      telefone: cleanText(row.colaboradores?.telefone, ""),
      resposta: cleanText(row.resposta_original || row.resposta_normalizada, ""),
      confirmadoEm: cleanText(row.respondido_em, "") || undefined,
      revertidoEm: cleanText(row.falso_positivo_em, "") || undefined,
      substituidoEm: cleanText(row.substituido_em, "") || undefined,
    };
    const status = String(row.status_confirmacao ?? "");
    const substituto = cleanText(row.substituto_nome, "");
    const falsoPositivo = Boolean(row.falso_positivo_em);
    const motivo = cleanText(row.falso_positivo_motivo, "");

    group.total += 1;
    if (substituto && (status === "nao_comparecera" || falsoPositivo)) group.substituidos.push({ ...item, substituto, motivo });
    else if (falsoPositivo) group.falsosPositivos.push({ ...item, motivo });
    else if (status === "confirmado") group.confirmados.push(item);
    else if (status === "nao_comparecera") group.naoComparecera.push(item);
    else if (status === "resposta_incompreensivel") group.incompreensiveis.push(item);
    else if (WAITING_STATUSES.has(status)) group.aguardando.push(item);
    else group.outros.push(item);

    map.set(key, group);
  }

  return [...map.values()]
    .map((group) => ({
      ...group,
      confirmados: sortedItems(group.confirmados),
      naoComparecera: sortedItems(group.naoComparecera),
      substituidos: sortedItems(group.substituidos),
      falsosPositivos: sortedItems(group.falsosPositivos),
      aguardando: sortedItems(group.aguardando),
      incompreensiveis: sortedItems(group.incompreensiveis),
      outros: sortedItems(group.outros),
    }))
    .sort((a, b) => compareNamesPtBr(a.empresa, b.empresa) || compareScheduleLabels(a.turno, b.turno));
}

export function filterNominalReportGroups(
  groups: readonly NominalReportGroup[],
  filter: NominalReportFilter,
) {
  if (filter === "todos") return groups;

  return groups.flatMap((group) => {
    const filtered = blankGroup(group.key, group.empresa, group.turno);
    if (filter === "confirmados") filtered.confirmados = group.confirmados;
    if (filter === "nao_comparecera") filtered.naoComparecera = group.naoComparecera;
    if (filter === "substituidos") filtered.substituidos = group.substituidos;
    if (filter === "falsos_positivos") filtered.falsosPositivos = group.falsosPositivos;
    if (filter === "aguardando") {
      filtered.aguardando = group.aguardando;
      filtered.incompreensiveis = group.incompreensiveis;
    }
    filtered.total = filtered.confirmados.length + filtered.naoComparecera.length +
      filtered.substituidos.length + filtered.falsosPositivos.length + filtered.aguardando.length + filtered.incompreensiveis.length;
    return filtered.total ? [filtered] : [];
  });
}
