import assert from "node:assert/strict";
import test from "node:test";

import { resolveEffectiveSchedule } from "../apps/dashboard/src/lib/schedules.ts";

const base = { entrada: "14:00", saida: "23:00" };

test("excecao prevalece sobre semanal e base", () => {
  const result = resolveEffectiveSchedule({
    date: "2030-07-12",
    base,
    weekly: [{ weekday: 5, entrada: "12:00", saida: "21:00" }],
    exceptions: [{ date: "2030-07-12", entrada: "10:00", saida: "19:00" }],
  });

  assert.deepEqual(result, {
    entrada: "10:00",
    saida: "19:00",
    source: "exception",
  });
});

test("sexta usa regra semanal sem excecao", () => {
  const result = resolveEffectiveSchedule({
    date: "2030-07-05",
    base,
    weekly: [{ weekday: 5, entrada: "12:00", saida: "21:00" }],
    exceptions: [],
  });

  assert.deepEqual(result, {
    entrada: "12:00",
    saida: "21:00",
    source: "weekly",
  });
});

test("jornada base e usada quando nao existe regra especifica", () => {
  const result = resolveEffectiveSchedule({
    date: "2030-07-06",
    base,
    weekly: [{ weekday: 5, entrada: "12:00", saida: "21:00" }],
    exceptions: [],
  });

  assert.deepEqual(result, {
    entrada: "14:00",
    saida: "23:00",
    source: "base",
  });
});
