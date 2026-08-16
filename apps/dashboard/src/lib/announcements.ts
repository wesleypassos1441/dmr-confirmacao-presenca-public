const ALLOWED_VARIABLES = new Set(["nome", "empresa", "data", "horario"]);

export type AnnouncementAudience = "todos" | "pendentes" | "manual";

export function validateAnnouncementTemplate(value: string) {
  const found = [...String(value).matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const unknown = [...new Set(found.filter((name) => !ALLOWED_VARIABLES.has(name)))];
  return { valid: value.trim().length >= 2 && unknown.length === 0, unknown };
}

export function renderAnnouncement(value: string, variables: Record<string, string>) {
  return value.replace(/\{(nome|empresa|data|horario)\}/g, (_, name: string) => variables[name] ?? "");
}

export function announcementRecipients(
  rows: Array<{ id: string; status: string }>,
  audience: AnnouncementAudience,
  selectedIds: string[],
) {
  if (audience === "manual") {
    return [...new Set(selectedIds)].filter((id) => rows.some((row) => row.id === id)).sort();
  }
  if (audience === "pendentes") {
    const finalStatuses = new Set(["confirmado", "nao_comparecera", "cancelado", "tratado_manualmente"]);
    return rows.filter((row) => !finalStatuses.has(row.status)).map((row) => row.id);
  }
  return rows.map((row) => row.id);
}
