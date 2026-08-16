import assert from "node:assert/strict";
import test from "node:test";

import { buildNominalReportGroups, filterNominalReportGroups } from "../apps/dashboard/src/lib/reports.ts";

test("relatorio nominal separa colaboradores por resposta dentro de empresa e turno", () => {
  const rows = [
    {
      status_confirmacao: "confirmado",
      resposta_normalizada: "sim",
      escalas: { empresas: { nome: "Empresa Exemplo Alfa" } },
      turnos_empresa: { nome: "08:00 as 18:00" },
      colaboradores: { nome: "Pessoa Exemplo A" },
    },
    {
      status_confirmacao: "nao_comparecera",
      resposta_normalizada: "nao",
      substituto_nome: "Carlos Substituto",
      escalas: { empresas: { nome: "Empresa Exemplo Alfa" } },
      turnos_empresa: { nome: "08:00 as 18:00" },
      colaboradores: { nome: "Pessoa Exemplo M" },
    },
    {
      status_confirmacao: "mensagem_enviada",
      escalas: { empresas: { nome: "Empresa Exemplo Alfa" } },
      turnos_empresa: { nome: "08:00 as 18:00" },
      colaboradores: { nome: "Pessoa Exemplo C" },
    },
    {
      status_confirmacao: "resposta_incompreensivel",
      resposta_original: "3",
      escalas: { empresas: { nome: "Empresa Exemplo Alfa" } },
      turnos_empresa: { nome: "08:00 as 18:00" },
      colaboradores: { nome: "Pessoa Exemplo G" },
    },
  ];

  const [group] = buildNominalReportGroups(rows);

  assert.equal(group.empresa, "Empresa Exemplo Alfa");
  assert.equal(group.turno, "08:00 as 18:00");
  assert.deepEqual(group.confirmados.map((item) => item.nome), ["Pessoa Exemplo A"]);
  assert.deepEqual(group.naoComparecera.map((item) => item.nome), []);
  assert.deepEqual(group.substituidos.map((item) => `${item.nome} -> ${item.substituto}`), ["Pessoa Exemplo M -> Carlos Substituto"]);
  assert.deepEqual(group.aguardando.map((item) => item.nome), ["Pessoa Exemplo C"]);
  assert.deepEqual(group.incompreensiveis.map((item) => `${item.nome}: ${item.resposta}`), ["Pessoa Exemplo G: 3"]);
});

test("relatorio mantem ausencia quando nenhum substituto foi informado", () => {
  const [group] = buildNominalReportGroups([{
    status_confirmacao: "nao_comparecera",
    substituto_nome: "  ",
    escalas: { empresas: { nome: "Sete Lagoas" } },
    turnos_empresa: { nome: "12:00 as 21:00" },
    colaboradores: { nome: "Pessoa Ausente" },
  }]);

  assert.deepEqual(group.naoComparecera.map((item) => item.nome), ["Pessoa Ausente"]);
  assert.equal(group.substituidos.length, 0);
});

test("relatorio separa falso positivo sem contar novamente como confirmado", () => {
  const [group] = buildNominalReportGroups([{
    status_confirmacao: "confirmado",
    resposta_normalizada: "sim",
    resposta_original: "1",
    falso_positivo_em: "2030-01-01T10:00:00Z",
    falso_positivo_motivo: "Informou indisponibilidade após confirmar",
    escalas: { empresas: { nome: "Empresa" } },
    turnos_empresa: { nome: "08:00 as 18:00" },
    colaboradores: { nome: "Ana" },
  }]);

  assert.deepEqual(group.falsosPositivos.map((item) => item.nome), ["Ana"]);
  assert.equal(group.confirmados.length, 0);
  assert.equal(group.total, 1);
});

test("substituto prevalece sobre falso positivo no relatorio", () => {
  const [group] = buildNominalReportGroups([{
    status_confirmacao: "confirmado",
    respondido_em: "2030-01-01T09:00:00Z",
    falso_positivo_em: "2030-01-01T10:00:00Z",
    substituto_nome: "Maria Substituta",
    substituido_em: "2030-01-01T10:15:00Z",
    escalas: { empresas: { nome: "Empresa" } },
    turnos_empresa: { nome: "08:00 as 18:00" },
    colaboradores: { nome: "Ana" },
  }]);

  assert.deepEqual(group.substituidos.map((item) => `${item.nome} -> ${item.substituto}`), ["Ana -> Maria Substituta"]);
  assert.equal(group.substituidos[0].confirmadoEm, "2030-01-01T09:00:00Z");
  assert.equal(group.substituidos[0].revertidoEm, "2030-01-01T10:00:00Z");
  assert.equal(group.substituidos[0].substituidoEm, "2030-01-01T10:15:00Z");
  assert.equal(group.falsosPositivos.length, 0);
  assert.equal(group.confirmados.length, 0);
});

test("confirmados e falsos positivos preservam os horarios operacionais", () => {
  const [group] = buildNominalReportGroups([
    {
      status_confirmacao: "confirmado",
      respondido_em: "2030-01-01T08:35:00Z",
      escalas: { empresas: { nome: "Empresa" } },
      turnos_empresa: { nome: "08:00 as 18:00" },
      colaboradores: { nome: "Bruno" },
    },
    {
      status_confirmacao: "confirmado",
      respondido_em: "2030-01-01T08:40:00Z",
      falso_positivo_em: "2030-01-01T09:10:00Z",
      falso_positivo_motivo: "Desistiu depois de confirmar",
      escalas: { empresas: { nome: "Empresa" } },
      turnos_empresa: { nome: "08:00 as 18:00" },
      colaboradores: { nome: "Ana" },
    },
  ]);

  assert.equal(group.confirmados[0].confirmadoEm, "2030-01-01T08:35:00Z");
  assert.equal(group.falsosPositivos[0].confirmadoEm, "2030-01-01T08:40:00Z");
  assert.equal(group.falsosPositivos[0].revertidoEm, "2030-01-01T09:10:00Z");
});

test("relatorio nominal ordena nomes e grupos por empresa e turno", () => {
  const rows = [
    {
      status_confirmacao: "confirmado",
      escalas: { empresas: { nome: "Empresa Exemplo Beta" } },
      turnos_empresa: { nome: "13:00 as 22:00" },
      colaboradores: { nome: "Zuleica" },
    },
    {
      status_confirmacao: "confirmado",
      escalas: { empresas: { nome: "Empresa Exemplo Alfa" } },
      turnos_empresa: { nome: "12:00 as 22:00" },
      colaboradores: { nome: "Bruno" },
    },
    {
      status_confirmacao: "confirmado",
      escalas: { empresas: { nome: "Empresa Exemplo Alfa" } },
      turnos_empresa: { nome: "08:00 as 18:00" },
      colaboradores: { nome: "Carlos" },
    },
    {
      status_confirmacao: "confirmado",
      escalas: { empresas: { nome: "Empresa Exemplo Alfa" } },
      turnos_empresa: { nome: "08:00 as 18:00" },
      colaboradores: { nome: "Ana" },
    },
  ];

  const groups = buildNominalReportGroups(rows);

  assert.deepEqual(groups.map((group) => `${group.empresa} - ${group.turno}`), [
    "Empresa Exemplo Alfa - 08:00 as 18:00",
    "Empresa Exemplo Alfa - 12:00 as 22:00",
    "Empresa Exemplo Beta - 13:00 as 22:00",
  ]);
  assert.deepEqual(groups[0].confirmados.map((item) => item.nome), ["Ana", "Carlos"]);
});

test("indicadores filtram nominalmente e removem empresas sem registros na categoria", () => {
  const groups = buildNominalReportGroups([
    {
      status_confirmacao: "confirmado",
      escalas: { empresas: { nome: "Empresa Exemplo Alfa" } },
      turnos_empresa: { nome: "08:00 as 18:00" },
      colaboradores: { nome: "Ana Confirmada" },
    },
    {
      status_confirmacao: "nao_comparecera",
      escalas: { empresas: { nome: "Empresa Exemplo Alfa" } },
      turnos_empresa: { nome: "08:00 as 18:00" },
      colaboradores: { nome: "Bruno Ausente" },
    },
    {
      status_confirmacao: "confirmado",
      escalas: { empresas: { nome: "Empresa Exemplo Beta" } },
      turnos_empresa: { nome: "13:00 as 22:00" },
      colaboradores: { nome: "Carlos Confirmado" },
    },
  ]);

  const absent = filterNominalReportGroups(groups, "nao_comparecera");

  assert.equal(absent.length, 1);
  assert.equal(absent[0].empresa, "Empresa Exemplo Alfa");
  assert.deepEqual(absent[0].naoComparecera.map((item) => item.nome), ["Bruno Ausente"]);
  assert.equal(absent[0].confirmados.length, 0);
  assert.equal(absent[0].total, 1);
});

test("filtro aguardando inclui pendentes e respostas incompreensiveis", () => {
  const groups = buildNominalReportGroups([
    {
      status_confirmacao: "mensagem_enviada",
      escalas: { empresas: { nome: "Sete Lagoas" } },
      turnos_empresa: { nome: "12:00 as 21:00" },
      colaboradores: { nome: "Ana Pendente" },
    },
    {
      status_confirmacao: "resposta_incompreensivel",
      resposta_original: "3",
      escalas: { empresas: { nome: "Sete Lagoas" } },
      turnos_empresa: { nome: "12:00 as 21:00" },
      colaboradores: { nome: "Bruno Resposta" },
    },
  ]);

  const [waiting] = filterNominalReportGroups(groups, "aguardando");

  assert.deepEqual(waiting.aguardando.map((item) => item.nome), ["Ana Pendente"]);
  assert.deepEqual(waiting.incompreensiveis.map((item) => item.nome), ["Bruno Resposta"]);
  assert.equal(waiting.total, 2);
});
