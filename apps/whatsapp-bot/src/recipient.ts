type WhatsappNumberResolver = {
  getNumberId(number: string): Promise<{ _serialized?: string } | null>;
};

export async function resolveWhatsappRecipient(
  client: WhatsappNumberResolver,
  phone: string,
) {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  const whatsappId = await client.getNumberId(withCountry);
  const serialized = whatsappId?._serialized;

  if (!serialized) {
    throw new Error(`Telefone nao registrado no WhatsApp: final ${withCountry.slice(-4)}.`);
  }

  return serialized;
}
