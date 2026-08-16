import test from "node:test";
import assert from "node:assert/strict";

import { EdgeHttpError } from "../apps/whatsapp-bot/src/network.ts";
import { describeIncomingError, describePollingError, describeSendFailure } from "../apps/whatsapp-bot/src/diagnostics.ts";

test("diagnostico diferencia contato fora da fila ativa", () => {
  const message = describeIncomingError(new EdgeHttpError(404, "Colaborador nao encontrado."));
  assert.match(message, /Resposta ignorada/i);
  assert.match(message, /sem fila ativa/i);
});

test("diagnostico diferencia falha de rede ao consultar Supabase", () => {
  const message = describePollingError(new TypeError("fetch failed"));
  assert.match(message, /Falha de rede/i);
  assert.match(message, /Supabase/i);
});

test("diagnostico diferencia erro da Edge Function", () => {
  const message = describePollingError(new EdgeHttpError(500, "Erro interno"));
  assert.match(message, /Edge Function/i);
  assert.match(message, /500/);
});

test("diagnostico de envio mostra telefone mascarado e motivo", () => {
  const message = describeSendFailure("5510900000010", new Error("Telefone nao registrado no WhatsApp: final 0128."));
  assert.match(message, /553\*\*\*\*0128/);
  assert.match(message, /Telefone nao registrado/);
});
