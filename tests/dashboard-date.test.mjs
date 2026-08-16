import assert from "node:assert/strict";
import test from "node:test";

import { formatDateBrazil, parseDateBrazil } from "../apps/dashboard/src/lib/format.ts";

test("data brasileira converte para o formato ISO usado pelo banco", () => {
  assert.equal(parseDateBrazil("24/07/2026"), "2026-07-24");
  assert.equal(formatDateBrazil("2026-07-24"), "24/07/2026");
});

test("data brasileira rejeita datas inexistentes e formatos ambiguos", () => {
  assert.equal(parseDateBrazil("31/02/2026"), null);
  assert.equal(parseDateBrazil("2026-07-24"), null);
  assert.equal(parseDateBrazil("24/7/2026"), null);
});
