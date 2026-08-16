import assert from "node:assert/strict";
import test from "node:test";

import {
  announcementRecipients,
  renderAnnouncement,
  validateAnnouncementTemplate,
} from "../apps/dashboard/src/lib/announcements.ts";

test("comunicado renderiza apenas variaveis operacionais conhecidas", () => {
  assert.equal(
    renderAnnouncement("Ola {nome}, horario {horario}.", {
      nome: "Ana",
      empresa: "DMR",
      data: "28/07/2026",
      horario: "12:00 as 21:00",
    }),
    "Ola Ana, horario 12:00 as 21:00.",
  );
  assert.deepEqual(validateAnnouncementTemplate("{senha}"), { valid: false, unknown: ["senha"] });
  assert.deepEqual(validateAnnouncementTemplate("Aviso para {nome}"), { valid: true, unknown: [] });
});

test("publicos do comunicado respeitam pendentes e selecao manual", () => {
  const rows = [
    { id: "1", status: "pendente" },
    { id: "2", status: "confirmado" },
    { id: "3", status: "sem_resposta" },
  ];

  assert.deepEqual(announcementRecipients(rows, "todos", []), ["1", "2", "3"]);
  assert.deepEqual(announcementRecipients(rows, "pendentes", []), ["1", "3"]);
  assert.deepEqual(announcementRecipients(rows, "manual", ["3", "3", "2"]), ["2", "3"]);
});
