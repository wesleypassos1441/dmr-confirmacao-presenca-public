type LidMapping = { lid?: string; pn?: string };

type IncomingClient = {
  getContactLidAndPhone?: (ids: string[]) => Promise<LidMapping[]>;
};

function identifier(value: unknown) {
  return String(value ?? "").trim();
}

function phoneFrom(value: unknown) {
  const raw = identifier(value);
  if (!raw || /@lid$/i.test(raw)) return "";
  const phone = raw.replace(/@c\.us$/i, "").replace(/\D/g, "");
  return phone.length >= 10 && phone.length <= 13 ? phone : "";
}

export async function resolveIncomingPhone(client: IncomingClient, message: any) {
  const contact = typeof message.getContact === "function"
    ? await message.getContact().catch(() => null)
    : null;
  const identifiers = [
    message.author,
    message.from,
    contact?.id?._serialized,
  ].map(identifier).filter(Boolean);
  const lidIdentifiers = [...new Set(identifiers.filter((value) => /@lid$/i.test(value)))];

  let mappings: LidMapping[] = [];
  if (lidIdentifiers.length && typeof client.getContactLidAndPhone === "function") {
    mappings = await client.getContactLidAndPhone(lidIdentifiers).catch(() => []);
  }

  const candidates = [
    ...mappings.map((mapping) => mapping?.pn),
    contact?.number,
    contact?.id?.user,
    ...identifiers,
  ];
  const phone = candidates.map(phoneFrom).find(Boolean);
  if (!phone) throw new Error("Nao foi possivel identificar o telefone real do remetente.");
  return phone;
}

export function messageReceivedAt(message: any) {
  const timestamp = Number(message?.timestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    const milliseconds = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}
