const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const BRAZIL_DATE_ONLY = /^(\d{2})\/(\d{2})\/(\d{4})$/;

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

export function parseDateBrazil(value: unknown) {
  const match = BRAZIL_DATE_ONLY.exec(String(value ?? "").trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
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

export function maskPhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export function today() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}
