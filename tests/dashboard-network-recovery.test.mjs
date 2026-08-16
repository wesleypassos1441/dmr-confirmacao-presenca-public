import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardLoadErrorMessage,
  isTransientNetworkError,
  retryTransientDashboardLoad,
} from "../apps/dashboard/src/lib/network-recovery.ts";

test("recarrega o painel depois de uma falha de rede transitória", async () => {
  let attempts = 0;

  const result = await retryTransientDashboardLoad(async () => {
    attempts += 1;
    if (attempts < 3) throw new TypeError("Failed to fetch");
    return { empresas: [{ id: "empresa-1" }] };
  }, { delaysMs: [0, 0] });

  assert.equal(attempts, 3);
  assert.deepEqual(result, { empresas: [{ id: "empresa-1" }] });
});

test("não repete erros funcionais retornados pelo banco", async () => {
  let attempts = 0;
  const databaseError = { code: "42501", message: "permission denied" };

  await assert.rejects(
    retryTransientDashboardLoad(async () => {
      attempts += 1;
      throw databaseError;
    }, { delaysMs: [0, 0] }),
    (error) => error === databaseError,
  );

  assert.equal(attempts, 1);
});

test("identifica variações comuns de falha de conexão", () => {
  assert.equal(isTransientNetworkError(new TypeError("Failed to fetch")), true);
  assert.equal(isTransientNetworkError(new Error("NetworkError when attempting to fetch resource.")), true);
  assert.equal(isTransientNetworkError({ message: "Load failed" }), true);
  assert.equal(isTransientNetworkError({ code: "42501", message: "permission denied" }), false);
});

test("traduz a falha de conexão para uma orientação humana", () => {
  assert.equal(
    dashboardLoadErrorMessage(new TypeError("Failed to fetch")),
    "A conexão com o sistema foi interrompida. Verifique sua internet e clique em Atualizar para tentar novamente.",
  );
  assert.equal(dashboardLoadErrorMessage(new Error("outro erro")), "");
});
