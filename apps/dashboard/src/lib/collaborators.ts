type SearchableCollaborator = {
  nome?: unknown;
  telefone?: unknown;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function normalizeDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function filterCollaborators<T extends SearchableCollaborator>(rows: T[], query: string): T[] {
  const textQuery = normalizeText(query);
  const digitQuery = normalizeDigits(query);
  if (!textQuery) return rows;

  return rows.filter((row) => {
    if (normalizeText(row.nome).includes(textQuery)) return true;
    return digitQuery.length > 0 && normalizeDigits(row.telefone).includes(digitQuery);
  });
}

