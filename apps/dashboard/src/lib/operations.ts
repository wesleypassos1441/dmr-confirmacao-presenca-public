export type OperationalStatusRow = {
  status_confirmacao?: string | null;
  falso_positivo_em?: string | null;
  substituto_nome?: string | null;
};

export function operationalDisplayStatus(row: OperationalStatusRow) {
  if (String(row.substituto_nome ?? "").trim()) return "substituido";
  if (row.falso_positivo_em) return "falso_positivo";
  return row.status_confirmacao ?? "pendente";
}

export function operationResponseSummary(rows: OperationalStatusRow[]) {
  const answered = rows.filter((row) => {
    if (String(row.substituto_nome ?? "").trim() || row.falso_positivo_em) return true;
    return ["confirmado", "nao_comparecera", "tratado_manualmente"].includes(row.status_confirmacao ?? "");
  }).length;

  return {
    total: rows.length,
    answered,
    pending: rows.length - answered,
  };
}

export type RelocationDestination = {
  scheduleId: string;
  company: string;
  label: string;
};

export function buildRelocationDestinations(input: {
  currentScheduleId?: string | null;
  schedules: RelocationDestination[];
}) {
  const unique = new Map<string, RelocationDestination>();
  for (const schedule of input.schedules) {
    if (!schedule.scheduleId || schedule.scheduleId === input.currentScheduleId) continue;
    unique.set(schedule.scheduleId, schedule);
  }
  return [...unique.values()].sort((left, right) => {
    const company = left.company.localeCompare(right.company, "pt-BR", { sensitivity: "base" });
    return company || left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base" });
  });
}
