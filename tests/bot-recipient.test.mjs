import assert from "node:assert/strict";
import test from "node:test";

import { resolveWhatsappRecipient } from "../apps/whatsapp-bot/src/recipient.ts";

test("bot usa o identificador retornado pelo WhatsApp para enviar a mensagem", async () => {
  const requested = [];
  const client = {
    async getNumberId(number) {
      requested.push(number);
      return { _serialized: "123456789012345@lid" };
    },
  };

  const recipient = await resolveWhatsappRecipient(client, "31 9 9981-3833");

  assert.deepEqual(requested, ["5510900000011"]);
  assert.equal(recipient, "123456789012345@lid");
});

test("bot informa quando o telefone nao esta registrado no WhatsApp", async () => {
  const client = {
    async getNumberId() {
      return null;
    },
  };

  await assert.rejects(
    () => resolveWhatsappRecipient(client, "5510900000008"),
    /Telefone nao registrado no WhatsApp/,
  );
});
