export type NamedPanelRow = {
  status_confirmacao?: unknown;
  respondido_em?: unknown;
  alerta_sem_resposta_enviado_em?: unknown;
  colaboradores?: { nome?: unknown } | null;
};

export function compareNamesPtBr(a: unknown, b: unknown) {
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", {
    sensitivity: "base",
    numeric: true,
  });
}

export function sortByName<T>(rows: readonly T[], getName: (row: T) => unknown) {
  return [...rows].sort((a, b) => compareNamesPtBr(getName(a), getName(b)));
}

export type CompanyScheduleNameRow = {
  empresa?: unknown;
  "entrada/saída"?: unknown;
  nome?: unknown;
};

export function scheduleStartMinutes(value: unknown) {
  const match = String(value ?? "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function compareScheduleLabels(a: unknown, b: unknown) {
  return scheduleStartMinutes(a) - scheduleStartMinutes(b) ||
    compareNamesPtBr(a, b);
}

export function compareCompanyScheduleNameRows(a: CompanyScheduleNameRow, b: CompanyScheduleNameRow) {
  return compareNamesPtBr(a.empresa, b.empresa) ||
    compareScheduleLabels(a["entrada/saída"], b["entrada/saída"]) ||
    compareNamesPtBr(a.nome, b.nome);
}

export function panelStatusOrder(row: NamedPanelRow) {
  return row.respondido_em || row.status_confirmacao === "confirmado" || row.status_confirmacao === "nao_comparecera" ? 1 : 0;
}

export function comparePanelRows(a: NamedPanelRow, b: NamedPanelRow) {
  return panelStatusOrder(a) - panelStatusOrder(b) ||
    compareNamesPtBr(a.colaboradores?.nome, b.colaboradores?.nome);
}
