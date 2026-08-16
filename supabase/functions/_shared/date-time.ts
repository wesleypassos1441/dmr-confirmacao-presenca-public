const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateValue(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateBrazil(value: unknown) {
  const raw = String(value ?? "").trim();
  const dateOnly = DATE_ONLY.exec(raw);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const date = dateValue(value);
  if (!date) return raw || "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRAZIL_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatTimeBrazil(value: unknown) {
  const date = dateValue(value);
  if (!date) return String(value ?? "-");
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRAZIL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDateTimeBrazil(value: unknown) {
  const date = dateValue(value);
  if (!date) return String(value ?? "-");
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRAZIL_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
