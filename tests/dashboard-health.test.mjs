import test from "node:test";
import assert from "node:assert/strict";

import { buildSystemHealthSummary, humanizeSystemError } from "../apps/dashboard/src/lib/health.ts";

test("resumo de saude marca bot online com heartbeat recente", () => {
  const now = "2026-07-08T12:00:00.000Z";
  const summary = buildSystemHealthSummary({
    now,
    heartbeats: [{ status: "online", criado_em: "2026-07-08T11:59:10.000Z" }],
    queue: [
      { status: "pendente", tipo: "confirmacao_inicial", agendado_para: "2026-07-08T12:01:00.000Z" },
      { status: "pendente", tipo: "relatorio_diario", agendado_para: "2026-07-08T12:02:00.000Z" },
      { status: "enviada", tipo: "confirmacao_inicial", enviada_em: "2026-07-08T11:58:00.000Z" },
    ],
    incoming: [{ recebida_em: "2026-07-08T11:57:00.000Z" }],
    logs: [],
  });

  assert.equal(summary.status, "online");
  assert.equal(summary.statusLabel, "Bot online");
  assert.equal(summary.pendingMessages, 1);
  assert.equal(summary.pendingReports, 1);
  assert.equal(summary.lastSentAt, "2026-07-08T11:58:00.000Z");
  assert.equal(summary.lastIncomingAt, "2026-07-08T11:57:00.000Z");
});

test("resumo de saude nao mantem erro historico quando houve envio posterior bem-sucedido", () => {
  const summary = buildSystemHealthSummary({
    now: "2026-07-08T22:45:00.000Z",
    heartbeats: [{ status: "online", criado_em: "2026-07-08T22:44:30.000Z" }],
    queue: [
      {
        status: "enviada",
        tipo: "lembrete_2",
        enviada_em: "2026-07-08T22:30:00.000Z",
        atualizado_em: "2026-07-08T22:30:00.000Z",
      },
    ],
    incoming: [],
    logs: [
      {
        acao: "erro_bot",
        criado_em: "2026-07-08T21:31:00.000Z",
        detalhes: { erro: "Telefone nao registrado no WhatsApp: final 2386." },
      },
    ],
  });

  assert.equal(summary.status, "online");
  assert.equal(summary.lastError, "");
});

test("resumo de saude marca falha quando heartbeat recente registra erro", () => {
  const summary = buildSystemHealthSummary({
    now: "2026-07-08T12:00:00.000Z",
    heartbeats: [{ status: "erro_inicializacao", criado_em: "2026-07-08T11:59:40.000Z", detalhes: { error: "Page.navigate timed out" } }],
    queue: [{ status: "erro", tipo: "confirmacao_inicial", ultimo_erro: "fetch failed", atualizado_em: "2026-07-08T11:59:20.000Z" }],
    incoming: [],
    logs: [{ acao: "erro_bot", criado_em: "2026-07-08T11:59:30.000Z", detalhes: { erro: "fetch failed" } }],
  });

  assert.equal(summary.status, "falha");
  assert.equal(summary.statusLabel, "Bot com falha");
  assert.match(summary.lastError, /Page\.navigate timed out|fetch failed/);
});

test("resumo de saude marca offline quando heartbeat esta antigo", () => {
  const summary = buildSystemHealthSummary({
    now: "2026-07-08T12:00:00.000Z",
    heartbeats: [{ status: "online", criado_em: "2026-07-08T11:40:00.000Z" }],
    queue: [],
    incoming: [],
    logs: [],
  });

  assert.equal(summary.status, "offline");
  assert.equal(summary.statusLabel, "Bot sem sinal recente");
});

test("painel traduz falhas tecnicas do navegador para linguagem operacional", () => {
  assert.equal(
    humanizeSystemError("Execution context was destroyed, most likely because of a navigation."),
    "O WhatsApp Web foi recarregado e a conexão do bot foi interrompida. O sistema tentará reconectar automaticamente.",
  );
  assert.equal(
    humanizeSystemError("Page.navigate timed out"),
    "O WhatsApp Web demorou mais que o esperado para responder. O sistema tentará reconectar automaticamente.",
  );
  assert.doesNotMatch(humanizeSystemError("erro interno desconhecido"), /erro interno desconhecido/i);
});
