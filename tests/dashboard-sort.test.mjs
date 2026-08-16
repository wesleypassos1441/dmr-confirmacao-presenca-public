import assert from "node:assert/strict";
import test from "node:test";

import {
  compareCompanyScheduleNameRows,
  compareNamesPtBr,
  comparePanelRows,
  sortByName,
} from "../apps/dashboard/src/lib/sort.ts";

test("ordena nomes em portugues ignorando caixa e respeitando acentos", () => {
  const names = ["zuleica", "Bruno", "Álvaro", "ana"];
  assert.deepEqual([...names].sort(compareNamesPtBr), ["Álvaro", "ana", "Bruno", "zuleica"]);
});

test("ordena uma copia das entidades sem alterar a lista original", () => {
  const original = [{ nome: "Carlos" }, { nome: "Ana" }, { nome: "Bruno" }];
  const sorted = sortByName(original, (row) => row.nome);

  assert.deepEqual(sorted.map((row) => row.nome), ["Ana", "Bruno", "Carlos"]);
  assert.deepEqual(original.map((row) => row.nome), ["Carlos", "Ana", "Bruno"]);
});

test("painel mantem pendentes primeiro e ordena nomes dentro de cada estado", () => {
  const rows = [
    { status_confirmacao: "confirmado", respondido_em: "2026-07-07", colaboradores: { nome: "Ana" } },
    { status_confirmacao: "pendente", colaboradores: { nome: "Zuleica" } },
    { status_confirmacao: "confirmado", respondido_em: "2026-07-07", colaboradores: { nome: "Bruno" } },
    { status_confirmacao: "pendente", colaboradores: { nome: "Álvaro" } },
  ];

  assert.deepEqual([...rows].sort(comparePanelRows).map((row) => row.colaboradores.nome), [
    "Álvaro",
    "Zuleica",
    "Ana",
    "Bruno",
  ]);
});

test("painel mistura estados ainda pendentes em uma unica ordem alfabetica", () => {
  const rows = [
    { status_confirmacao: "pendente", colaboradores: { nome: "Zuleica" } },
    { status_confirmacao: "sem_resposta", colaboradores: { nome: "Ana" } },
    { status_confirmacao: "resposta_incompreensivel", colaboradores: { nome: "Bruno" } },
  ];

  assert.deepEqual([...rows].sort(comparePanelRows).map((row) => row.colaboradores.nome), [
    "Ana",
    "Bruno",
    "Zuleica",
  ]);
});

test("colaboradores agrupam por empresa e entrada antes de ordenar nomes", () => {
  const rows = [
    { empresa: "Empresa Exemplo Alfa", "entrada/saída": "22:00 as 06:00", nome: "Douglas" },
    { empresa: "Empresa Exemplo Alfa", "entrada/saída": "13:00 as 22:00", nome: "Fabiana" },
    { empresa: "Empresa Exemplo Alfa", "entrada/saída": "16:00 as 01:00", nome: "Eugler" },
    { empresa: "Empresa Exemplo Alfa", "entrada/saída": "13:00 as 22:00", nome: "Andresa" },
    { empresa: "Empresa Exemplo Alfa", "entrada/saída": "22:00 as 06:00", nome: "José" },
  ];

  assert.deepEqual([...rows].sort(compareCompanyScheduleNameRows).map((row) => `${row["entrada/saída"]} - ${row.nome}`), [
    "13:00 as 22:00 - Andresa",
    "13:00 as 22:00 - Fabiana",
    "16:00 as 01:00 - Eugler",
    "22:00 as 06:00 - Douglas",
    "22:00 as 06:00 - José",
  ]);
});
