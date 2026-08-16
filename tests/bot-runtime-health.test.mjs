import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWhatsappUserAgent,
  RESTART_EXIT_CODE,
  findWhatsappRuntimeProblem,
  isWhatsappRuntimeHealthy,
  isWhatsappRuntimeUnavailable,
  shouldRecycleWhatsappRuntime,
} from "../apps/whatsapp-bot/src/runtime-health.ts";

test("classifica detached frame como indisponibilidade do navegador", () => {
  assert.equal(isWhatsappRuntimeUnavailable(new Error("Attempted to use detached Frame 'ABC'.")), true);
  assert.equal(isWhatsappRuntimeUnavailable(new Error("Page.navigate timed out. Increase the 'protocolTimeout' setting.")), true);
  assert.equal(isWhatsappRuntimeUnavailable(new Error("Telefone nao registrado no WhatsApp")), false);
});

test("runtime exige browser conectado e pagina aberta", () => {
  assert.equal(isWhatsappRuntimeHealthy({
    pupBrowser: { connected: true },
    pupPage: { isClosed: () => false },
  }), true);
  assert.equal(isWhatsappRuntimeHealthy({
    pupBrowser: { connected: false },
    pupPage: { isClosed: () => false },
  }), false);
  assert.equal(isWhatsappRuntimeHealthy({
    pupBrowser: { connected: true },
    pupPage: { isClosed: () => true },
  }), false);
});

test("runtime detecta pagina de erro de memoria do navegador", async () => {
  const problem = await findWhatsappRuntimeProblem({
    pupBrowser: { connected: true },
    pupPage: {
      isClosed: () => false,
      url: () => "edge-error://edgewebdata/",
      title: async () => "Esta pagina esta com problemas",
      evaluate: async () => "Codigo de erro: Out of Memory",
    },
  });

  assert.equal(problem, "pagina_whatsapp_com_erro");
});

test("runtime interrompe verificacao travada dentro do limite configurado", async () => {
  const startedAt = Date.now();
  const problem = await findWhatsappRuntimeProblem({
    pupBrowser: { connected: true },
    pupPage: {
      isClosed: () => false,
      url: () => "https://web.whatsapp.com",
      title: () => new Promise(() => undefined),
      evaluate: async () => "",
    },
  }, 25);

  assert.equal(problem, "runtime_sem_resposta");
  assert.ok(Date.now() - startedAt < 500, "a verificacao travada precisa terminar rapidamente");
});
test("usa codigo reservado para reinicio supervisionado", () => {
  assert.equal(RESTART_EXIT_CODE, 75);
});

test("reciclagem preventiva espera o envio terminar", () => {
  assert.equal(shouldRecycleWhatsappRuntime({ uptimeMs: 90 * 60_000, maxUptimeMs: 90 * 60_000, busy: false }), true);
  assert.equal(shouldRecycleWhatsappRuntime({ uptimeMs: 91 * 60_000, maxUptimeMs: 90 * 60_000, busy: true }), false);
  assert.equal(shouldRecycleWhatsappRuntime({ uptimeMs: 30 * 60_000, maxUptimeMs: 90 * 60_000, busy: false }), false);
});

test("user agent acompanha a versao real do navegador", () => {
  assert.equal(
    buildWhatsappUserAgent("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "150.0.4078.105"),
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0",
  );
  assert.equal(
    buildWhatsappUserAgent("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "149.0.1234.10"),
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  );
});
