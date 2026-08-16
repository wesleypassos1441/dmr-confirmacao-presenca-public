import assert from "node:assert/strict";
import test from "node:test";

import * as dashboardFormat from "../apps/dashboard/src/lib/format.ts";
import * as core from "../packages/core/src/index.mjs";
import { absenceAlert, unclearAlert } from "../supabase/functions/_shared/presence.ts";

const absenceInput = {
  colaboradorNome: "Pessoa Exemplo A",
  empresaNome: "Empresa Exemplo Alfa",
  data: "2026-06-21",
  horarioInicio: "13:00",
  respondidoEm: "2026-06-21T07:11:00.000Z",
};

test("formatadores exibem data SQL e horario UTC no padrao de Sao Paulo", () => {
  assert.equal(typeof dashboardFormat.formatDateBrazil, "function");
  assert.equal(typeof dashboardFormat.formatTimeBrazil, "function");
  assert.equal(dashboardFormat.formatDateBrazil?.("2026-06-21"), "21/06/2026");
  assert.equal(dashboardFormat.formatTimeBrazil?.("2026-06-21T07:11:00.000Z"), "04:11");
});

test("formatador respeita virada de dia no fuso de Sao Paulo", () => {
  assert.equal(typeof dashboardFormat.formatDateTimeBrazil, "function");
  assert.equal(
    dashboardFormat.formatDateTimeBrazil?.("2026-06-21T02:30:00.000Z"),
    "20/06/2026, 23:30",
  );
});

test("alerta de ausencia da Edge Function formata data e hora brasileiras", () => {
  const message = absenceAlert(absenceInput);
  assert.match(message, /Data: 21\/06\/2026/);
  assert.match(message, /Resposta recebida às: 04:11/);
  assert.doesNotMatch(message, /2026-06-21|07:11/);
});

test("alerta incompreensivel da Edge Function formata a data brasileira", () => {
  const message = unclearAlert({
    colaboradorNome: "Pessoa Exemplo A",
    empresaNome: "Empresa Exemplo Alfa",
    data: "2026-06-21",
    horarioInicio: "13:00",
    ultimaResposta: "3",
  });
  assert.match(message, /Data: 21\/06\/2026/);
  assert.doesNotMatch(message, /Data: 2026-06-21/);
});

test("construtores do pacote core aplicam a mesma formatacao", () => {
  const absence = core.buildAbsenceAlert(absenceInput);
  const unclear = core.buildUnclearAlert({
    colaboradorNome: "Pessoa Exemplo A",
    empresaNome: "Empresa Exemplo Alfa",
    data: "2026-06-21",
    horarioInicio: "13:00",
    ultimaRespostaOriginal: "3",
  });
  assert.match(absence, /Data: 21\/06\/2026[\s\S]*Resposta recebida às: 04:11/);
  assert.match(unclear, /Data: 21\/06\/2026/);
});
