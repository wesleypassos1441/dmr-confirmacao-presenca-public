import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRelocationDestinations,
  operationResponseSummary,
  operationalDisplayStatus,
} from "../apps/dashboard/src/lib/operations.ts";

test("substituicao prevalece sobre falso positivo", () => {
  assert.equal(
    operationalDisplayStatus({
      status_confirmacao: "confirmado",
      falso_positivo_em: "2030-01-01",
      substituto_nome: "Maria",
    }),
    "substituido",
  );
});

test("falso positivo sem substituto tem status proprio", () => {
  assert.equal(
    operationalDisplayStatus({
      status_confirmacao: "confirmado",
      falso_positivo_em: "2030-01-01",
      substituto_nome: null,
    }),
    "falso_positivo",
  );
});

test("status original permanece quando nao houve tratamento", () => {
  assert.equal(
    operationalDisplayStatus({
      status_confirmacao: "nao_comparecera",
      falso_positivo_em: null,
      substituto_nome: null,
    }),
    "nao_comparecera",
  );
});

test("destinos de realocacao excluem o horario atual e removem duplicidades", () => {
  assert.deepEqual(
    buildRelocationDestinations({
      currentScheduleId: "horario-a",
      schedules: [
        { scheduleId: "horario-b", company: "Beta", label: "12:00 as 21:00" },
        { scheduleId: "horario-a", company: "Alfa", label: "08:00 as 18:00" },
        { scheduleId: "horario-b", company: "Beta", label: "12:00 as 21:00" },
        { scheduleId: "horario-c", company: "Alfa", label: "14:00 as 23:00" },
      ],
    }),
    [
      { scheduleId: "horario-c", company: "Alfa", label: "14:00 as 23:00" },
      { scheduleId: "horario-b", company: "Beta", label: "12:00 as 21:00" },
    ],
  );
});

test("resumo operacional separa respondidos de pendencias reais", () => {
  assert.deepEqual(
    operationResponseSummary([
      { status_confirmacao: "confirmado" },
      { status_confirmacao: "nao_comparecera" },
      { status_confirmacao: "sem_resposta" },
      { status_confirmacao: "resposta_incompreensivel" },
      { status_confirmacao: "tratado_manualmente" },
      { status_confirmacao: "sem_resposta", substituto_nome: "Pessoa Exemplo K" },
      { status_confirmacao: "confirmado", falso_positivo_em: "2030-01-01" },
    ]),
    { total: 7, answered: 5, pending: 2 },
  );
});
