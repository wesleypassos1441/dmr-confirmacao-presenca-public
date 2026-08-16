import assert from "node:assert/strict";
import test from "node:test";

import { messageReceivedAt, resolveIncomingPhone } from "../apps/whatsapp-bot/src/incoming.ts";
import { EdgeHttpError, retryTransient } from "../apps/whatsapp-bot/src/network.ts";

test("bot converte identificador LID do WhatsApp Business para telefone real", async () => {
  const requested = [];
  const client = {
    async getContactLidAndPhone(ids) {
      requested.push(...ids);
      return [{ lid: "123456789012345@lid", pn: "5510900000011@c.us" }];
    },
  };
  const message = {
    from: "123456789012345@lid",
    async getContact() {
      return { number: "123456789012345", id: { _serialized: "123456789012345@lid" } };
    },
  };

  const phone = await resolveIncomingPhone(client, message);

  assert.deepEqual(requested, ["123456789012345@lid"]);
  assert.equal(phone, "5510900000011");
});

test("bot preserva telefone direto quando o remetente usa c.us", async () => {
  const client = { async getContactLidAndPhone() { return []; } };
  const message = {
    from: "5510900000011@c.us",
    async getContact() { return { number: "5510900000011" }; },
  };

  assert.equal(await resolveIncomingPhone(client, message), "5510900000011");
});

test("bot envia ao banco o horario original da mensagem do WhatsApp", () => {
  const timestamp = 1782045000;
  assert.equal(messageReceivedAt({ timestamp }), new Date(timestamp * 1000).toISOString());
});

test("retentativa recupera falha temporaria de rede com espera progressiva", async () => {
  let calls = 0;
  const waits = [];
  const result = await retryTransient(async () => {
    calls += 1;
    if (calls < 3) throw new TypeError("fetch failed");
    return "ok";
  }, {
    attempts: 3,
    baseDelayMs: 100,
    sleep: async (ms) => { waits.push(ms); },
  });

  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [100, 200]);
});

test("retentativa nao repete erro funcional HTTP 404", async () => {
  let calls = 0;
  await assert.rejects(() => retryTransient(async () => {
    calls += 1;
    throw new EdgeHttpError(404, "Colaborador nao encontrado.");
  }, {
    attempts: 5,
    baseDelayMs: 100,
    sleep: async () => undefined,
  }), /Colaborador nao encontrado/);
  assert.equal(calls, 1);
});
