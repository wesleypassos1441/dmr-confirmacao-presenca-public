import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const componentPath = new URL(
  "../apps/dashboard/src/components/ShiftListImportPanel.tsx",
  import.meta.url,
);
const pagePath = new URL("../apps/dashboard/app/page.tsx", import.meta.url);

test("painel oferece ajuda, revisao e confirmacao separada da fila", () => {
  const source = fs.readFileSync(componentPath, "utf8");

  assert.match(source, /Ver modelo de preenchimento/);
  assert.match(source, /Copiar modelo/);
  assert.match(source, /Interpretar lista/);
  assert.match(source, /Aplicar à equipe do dia/);
  assert.match(source, /Cancelar importação/);
  assert.doesNotMatch(source, /onCreateQueue/);
});

test("painel permite decidir encontrados no banco, novos e homonimos", () => {
  const source = fs.readFileSync(componentPath, "utf8");

  assert.match(source, /Usar contato e vincular/);
  assert.match(source, /Editar contato e vincular/);
  assert.match(source, /Não incluir/);
  assert.match(source, /Novo colaborador/);
  assert.match(source, /Selecione o cadastro correto/);
});

test("painel informa todos os estados por texto e protege telefones na revisao", () => {
  const source = fs.readFileSync(componentPath, "utf8");

  assert.match(source, /Já está nesta equipe/);
  assert.match(source, /Correspondência provável na equipe/);
  assert.match(source, /Cadastrado como:/);
  assert.match(source, /Encontrado no banco/);
  assert.match(source, /Novo colaborador/);
  assert.match(source, /Nome duplicado no banco/);
  assert.match(source, /maskImportedPhone/);
});

test("painel informa que marcadores e parenteses sao ignorados", () => {
  const source = fs.readFileSync(componentPath, "utf8");

  assert.match(source, /Marcadores -, \*, • e ✅/);
  assert.match(source, /observações entre\s+parênteses serão ignorados/);
});

test("campos editaveis capturam o valor antes da atualizacao de estado", () => {
  const source = fs.readFileSync(componentPath, "utf8");

  assert.match(source, /updateEditingRow\(key,\s*"phone",\s*event\.currentTarget\.value\)/);
  assert.match(source, /updateEditingRow\(key,\s*"name",\s*event\.currentTarget\.value\)/);
  assert.doesNotMatch(
    source,
    /\[key\]:\s*\{\s*\.\.\.edit,\s*(?:name|phone):\s*event\.currentTarget\.value/,
  );
});

test("aplicar equipe salva e vincula novos colaboradores preenchidos", () => {
  const source = fs.readFileSync(componentPath, "utf8");

  assert.match(source, /async function applyToTeam\(\)/);
  assert.match(
    source,
    /await persistEditedRow\(\s*row,\s*activeReview\.operation\.scheduleId,\s*\)/,
  );
  assert.match(source, /onCreateAndLink/);
  assert.match(source, /onUpdateAndLink/);
  assert.match(source, /allowMissingShift:\s*true/);
  assert.match(source, /await onEnsureShift\(/);
  assert.doesNotMatch(source, /if\s*\(!review\s*\|\|\s*unresolvedCount\s*>\s*0\)\s*return/);
});

test("Turnos integra o importador sem remover os fluxos existentes", () => {
  const page = fs.readFileSync(pagePath, "utf8");

  assert.match(page, /ShiftListImportPanel/);
  assert.match(page, /Carregar equipe fixa/);
  assert.match(page, /Reaproveitar última lista/);
  assert.match(page, /Adicionar somente hoje/);
  assert.match(page, /Adicionar fila/);
  assert.match(page, /dmr_criar_operacao_com_equipe/);
  assert.match(page, /preferredScheduleId=\{horarioTurnoAtual\}/);
  assert.match(page, /preferredShiftId=\{turnoFilaAtual\}/);
  assert.match(page, /onEnsureImportedShift=\{ensureImportedTurno\}/);
  assert.match(page, /origem:\s*"importacao_lista"/);
});

test("edicao importada bloqueia telefone pertencente a outro cadastro", () => {
  const page = fs.readFileSync(pagePath, "utf8");

  assert.match(page, /Este telefone já pertence a outro colaborador/);
  assert.match(page, /dmr_vincular_colaborador_existente/);
});
