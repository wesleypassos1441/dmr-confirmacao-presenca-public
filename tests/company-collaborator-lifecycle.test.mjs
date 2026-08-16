import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("migration preserva empresas e registra historico temporal dos colaboradores", () => {
  const migration = read("supabase/migrations/20260729000200_company_collaborator_lifecycle.sql");

  assert.match(migration, /add column if not exists contrato_encerrado_em timestamptz/i);
  assert.match(migration, /create table if not exists public\.colaborador_movimentacoes/i);
  assert.match(migration, /usuario_id uuid references auth\.users\(id\) on delete set null/i);
  assert.match(migration, /empresa_nome_snapshot text not null/i);
  assert.match(migration, /jornada_snapshot text/i);
  assert.match(migration, /create or replace function public\.dmr_alterar_status_empresa/i);
  assert.match(migration, /create or replace function public\.dmr_remover_colaborador_equipe/i);
  assert.match(migration, /create or replace function public\.dmr_vincular_colaborador_existente/i);
  assert.match(migration, /create or replace function public\.dmr_realocar_equipe_permanente/i);
  assert.match(migration, /public\.is_operador\(\) is not true/i);
  assert.match(migration, /observacao/i);
  assert.doesNotMatch(migration, /delete from public\.empresas/i);
  assert.doesNotMatch(migration, /delete from public\.colaboradores/i);
});

test("propagacao do horario padrao atualiza todos os dias sem alterar os demais campos", async () => {
  const { propagateScheduleDefault } = await import("../apps/dashboard/src/lib/schedule-rules.ts");
  const rules = [
    { weekday: 1, entrada: "08:30", saida: "17:30", active: true },
    { weekday: 2, entrada: "09:00", saida: "18:00", active: false },
  ];

  const entradas = propagateScheduleDefault(rules, "entrada", "07:45");
  assert.deepEqual(entradas, [
    { weekday: 1, entrada: "07:45", saida: "17:30", active: true },
    { weekday: 2, entrada: "07:45", saida: "18:00", active: false },
  ]);
  assert.deepEqual(rules, [
    { weekday: 1, entrada: "08:30", saida: "17:30", active: true },
    { weekday: 2, entrada: "09:00", saida: "18:00", active: false },
  ]);

  const saidas = propagateScheduleDefault(entradas, "saida", "16:20");
  assert.equal(saidas.every((rule) => rule.saida === "16:20"), true);
});

test("busca do banco de colaboradores aceita nome sem acento e trechos do telefone", async () => {
  const { filterCollaborators } = await import("../apps/dashboard/src/lib/collaborators.ts");
  const rows = [
    { id: "1", nome: "João Álvares", telefone: "551090000-0012" },
    { id: "2", nome: "Pessoa Exemplo K", telefone: "5510900000013" },
  ];

  assert.deepEqual(filterCollaborators(rows, "joao").map((row) => row.id), ["1"]);
  assert.deepEqual(filterCollaborators(rows, "9667 1334").map((row) => row.id), ["1"]);
  assert.deepEqual(filterCollaborators(rows, "23647").map((row) => row.id), ["2"]);
  assert.deepEqual(filterCollaborators(rows, "").map((row) => row.id), ["1", "2"]);
});

test("dashboard separa banco permanente de equipes e usa operacoes auditadas", () => {
  const page = read("apps/dashboard/app/page.tsx");

  assert.match(page, /Banco de colaboradores/);
  assert.match(page, /Equipes por empresa/);
  assert.match(page, /Pesquisar por nome ou telefone/);
  assert.match(page, /Ver histórico/);
  assert.match(page, /Remover da empresa/);
  assert.match(page, /Encerrar contrato/);
  assert.match(page, /dmr_alterar_status_empresa/);
  assert.match(page, /dmr_remover_colaborador_equipe/);
  assert.match(page, /dmr_vincular_colaborador_existente/);
  assert.doesNotMatch(page, /from\("colaboradores"\)\.delete/);
});

test("modais explicam operacoes destrutivas e aceitam observacao opcional", () => {
  const companyDialog = read("apps/dashboard/src/components/CompanyLifecycleDialog.tsx");
  const removalDialog = read("apps/dashboard/src/components/TeamRemovalDialog.tsx");
  const historyDialog = read("apps/dashboard/src/components/CollaboratorHistoryDialog.tsx");

  assert.match(companyDialog, /Encerrar contrato/);
  assert.match(companyDialog, /histórico/i);
  assert.match(removalDialog, /Observação \(opcional\)/);
  assert.match(removalDialog, /não apaga o contato/i);
  assert.match(historyDialog, /Histórico profissional/);
  assert.match(historyDialog, /toLocaleString\("pt-BR"/);
});
