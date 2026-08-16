import test from "node:test";
import assert from "node:assert/strict";

import { formatAuditMessage, auditActorLabel, humanizeAuditAction } from "../apps/dashboard/src/lib/audit.ts";

test("auditoria descreve remocao de equipe com empresa, colaborador e horario", () => {
  const message = formatAuditMessage({
    ator_email: "admin@example.com",
    acao: "remover_colaborador_equipe",
    entidade_id: "abc",
    detalhes: {
      empresa: "Empresa Exemplo Alfa",
      colaborador: "Pessoa Exemplo C",
      horario_entrada: "08:00:00",
      horario_saida: "18:00:00",
    },
  });

  assert.equal(message, "admin@example.com removeu Pessoa Exemplo C da equipe Empresa Exemplo Alfa - 08:00 as 18:00.");
});

test("auditoria descreve fila de disparos em linguagem humana", () => {
  const message = formatAuditMessage({
    ator_email: "",
    acao: "gerar_fila_confirmacoes_sql",
    entidade_id: "abc",
    detalhes: { colaboradores_adicionados: 7 },
  });

  assert.equal(message, "Mensagens colocadas em fila de disparo para 7 colaboradores.");
});

test("auditoria identifica usuario de forma humana", () => {
  assert.equal(auditActorLabel({ detalhes: { usuario_nome: "Pessoa Exemplo A" } }), "Pessoa Exemplo A");
  assert.equal(auditActorLabel({ ator_email: "operacao@dmr.com" }), "operacao@dmr.com");
  assert.equal(auditActorLabel({}), "Usuario do dashboard");
});

test("auditoria humaniza novas operacoes", () => {
  assert.equal(humanizeAuditAction("realocar_equipe_data"), "Equipe realocada somente nesta data");
  assert.equal(humanizeAuditAction("criar_comunicado"), "Comunicado colocado na fila de envio");
  assert.equal(humanizeAuditAction("editar_jornada_semanal"), "Jornada semanal atualizada");
  assert.equal(humanizeAuditAction("salvar_excecao_jornada"), "Horário excepcional salvo");
});

test("auditoria descreve ciclo da empresa e novos vinculos em linguagem humana", () => {
  assert.equal(formatAuditMessage({
    ator_email: "admin@example.com",
    acao: "alterar_status_empresa",
    detalhes: { empresa: "Empresa Exemplo Alfa", acao: "encerrar_contrato" },
  }), "admin@example.com encerrou o contrato de Empresa Exemplo Alfa.");

  assert.equal(formatAuditMessage({
    ator_email: "admin@example.com",
    acao: "adicionar_colaborador_equipe",
    detalhes: { empresa: "Empresa Exemplo Beta", colaborador: "Pessoa C" },
  }), "admin@example.com adicionou Pessoa C à equipe Empresa Exemplo Beta.");
});

test("auditoria descreve comunicado e realocacao usando nomes e quantidades", () => {
  assert.equal(formatAuditMessage({
    ator_email: "operador@dmr.com",
    acao: "criar_comunicado",
    detalhes: { assunto: "Mudança de entrada", destinatarios: 8 },
  }), "operador@dmr.com colocou o comunicado \"Mudança de entrada\" na fila para 8 colaboradores.");

  assert.equal(formatAuditMessage({
    ator_email: "operador@dmr.com",
    acao: "realocar_equipe_data",
    detalhes: { destino: "Empresa Exemplo Alfa", movidos: 3 },
  }), "operador@dmr.com realocou 3 colaboradores para Empresa Exemplo Alfa somente nesta data.");
});
