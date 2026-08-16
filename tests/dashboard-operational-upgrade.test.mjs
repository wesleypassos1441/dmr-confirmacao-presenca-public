import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("migration registra substituto e permite remarcar operacao antes do primeiro envio", () => {
  const migration = read("supabase/migrations/20260724000200_dashboard_operations_reports.sql");

  assert.match(migration, /add column if not exists substituto_nome text/i);
  assert.match(migration, /create or replace function public\.dmr_definir_substituto/i);
  assert.match(migration, /create or replace function public\.dmr_editar_horario_disparo/i);
  assert.match(migration, /mensagem_enviada_em is not null/i);
  assert.match(migration, /hor[aá]rio posterior ao momento atual/i);
  assert.match(migration, /delete from public\.fila_mensagens/i);
  assert.match(migration, /grant execute on function public\.dmr_definir_substituto/i);
  assert.match(migration, /grant execute on function public\.dmr_editar_horario_disparo/i);
});

test("dashboard oferece cadastro no turno, edicao do disparo e substituicao", () => {
  const page = read("apps/dashboard/app/page.tsx");

  assert.match(page, /Adicionar colaboradores nesta equipe/);
  assert.match(page, /Editar hor[aá]rio de disparo/);
  assert.match(page, /Informar substituto/);
  assert.match(page, /Substitu[ií]dos/i);
  assert.match(page, /dmr_editar_horario_disparo/);
  assert.match(page, /dmr_definir_substituto/);
  assert.doesNotMatch(page, /mensagens_recebidas"\)\.select\("[^"]*resposta_original/);
  assert.match(page, /mensagens_recebidas"\)\.select\("[^"]*mensagem_original/);
});

test("impressao gera documento de relatorio sem navegacao do dashboard", () => {
  const css = read("apps/dashboard/app/styles.css");
  const page = read("apps/dashboard/app/page.tsx");

  assert.match(css, /@media print/);
  assert.match(css, /\.sidebar[^}]*display:\s*none/is);
  assert.match(css, /\.report-document/);
  assert.match(page, /Relatorio operacional de presenca/);
  assert.match(page, /report-document/);
});

test("dashboard permite historico brasileiro, filtros e tipo de contratacao", () => {
  const page = read("apps/dashboard/app/page.tsx");
  const migration = read("supabase/migrations/20260725000100_company_contract_report_filters.sql");

  assert.match(page, /Data \(DD\/MM\/AAAA\)/);
  assert.match(page, /parseDateBrazil/);
  assert.match(page, /tipo_contratacao/);
  assert.match(page, /filterNominalReportGroups/);
  assert.match(page, /report-kpi-button/);
  assert.match(migration, /add column if not exists tipo_contratacao text/i);
  assert.match(migration, /dmr_mensagem_com_tipo_contrato/i);
  assert.match(migration, /Freelancer: SEM VÍNCULO EMPREGATÍCIO/i);
  assert.match(migration, /Contrato Intermitente: Conforme diárias trabalhadas/i);
});

test("migration cria jornadas semanais e excecoes protegidas", () => {
  const migration = read("supabase/migrations/20260728000100_flexible_company_schedules.sql");

  assert.match(migration, /create table public\.empresa_horario_regras_semanais/i);
  assert.match(migration, /create table public\.empresa_horario_excecoes/i);
  assert.match(migration, /function public\.dmr_resolver_jornada_efetiva/i);
  assert.match(migration, /function public\.dmr_salvar_jornada_semanal/i);
  assert.match(migration, /function public\.dmr_salvar_excecao_jornada/i);
  assert.match(migration, /public\.is_operador\(\) is not true/i);
  assert.match(migration, /grant execute on function public\.dmr_salvar_jornada_semanal/i);
  assert.match(migration, /grant execute on function public\.dmr_salvar_excecao_jornada/i);
  assert.match(migration, /revoke all on function public\.dmr_salvar_jornada_semanal/i);
  assert.match(migration, /revoke all on function public\.dmr_salvar_excecao_jornada/i);
});

test("operacao diaria grava snapshots e usa RPC transacional", () => {
  const migration = read("supabase/migrations/20260728000200_operation_snapshots.sql");
  const page = read("apps/dashboard/app/page.tsx");

  assert.match(migration, /add column if not exists horario_entrada_snapshot time/i);
  assert.match(migration, /add column if not exists horario_saida_snapshot time/i);
  assert.match(migration, /add column if not exists endereco_snapshot text/i);
  assert.match(migration, /add column if not exists tipo_contratacao_snapshot text/i);
  assert.match(migration, /function public\.dmr_criar_operacao_com_equipe/i);
  assert.match(migration, /function public\.dmr_aplicar_excecao_operacao/i);
  assert.match(migration, /public\.dmr_resolver_jornada_efetiva/i);
  assert.match(migration, /public\.is_operador\(\) is not true/i);
  assert.match(page, /dmr_criar_operacao_com_equipe/);
  assert.doesNotMatch(page, /rpc\("dmr_criar_fila_diaria"/);
});

test("dashboard edita jornada semanal e excecao por data sem escrita direta", () => {
  const page = read("apps/dashboard/app/page.tsx");
  const editor = read("apps/dashboard/src/components/ScheduleEditor.tsx");
  const exceptionDialog = read("apps/dashboard/src/components/ScheduleExceptionDialog.tsx");

  assert.match(page, /rpc\("dmr_salvar_jornada_semanal"/);
  assert.match(page, /rpc\("dmr_salvar_excecao_jornada"/);
  assert.match(page, /empresa_horario_regras_semanais/);
  assert.match(page, /empresa_horario_excecoes/);
  assert.match(editor, /Segunda-feira/);
  assert.match(editor, /Domingo/);
  assert.match(editor, /Salvar jornada/);
  assert.match(exceptionDialog, /Exceção de horário/);
  assert.match(exceptionDialog, /Preparar comunicado/);
  assert.doesNotMatch(page, /from\("empresa_horario_regras_semanais"\)\.insert/);
  assert.doesNotMatch(page, /from\("empresa_horario_excecoes"\)\.insert/);
});

test("falso positivo preserva resposta e aceita substituto por RPC protegida", () => {
  const migration = read("supabase/migrations/20260728000300_false_positive_relocation.sql");
  const page = read("apps/dashboard/app/page.tsx");
  const dialog = read("apps/dashboard/src/components/OperationTreatmentDialog.tsx");

  assert.match(migration, /add column if not exists falso_positivo_em timestamptz/i);
  assert.match(migration, /function public\.dmr_tratar_falso_positivo/i);
  assert.match(migration, /status_confirmacao\s*<>\s*'confirmado'/i);
  assert.doesNotMatch(migration, /set[\s\S]{0,240}resposta_normalizada\s*=/i);
  assert.match(page, /rpc\("dmr_tratar_falso_positivo"/);
  assert.match(dialog, /Falso positivo/);
  assert.match(dialog, /Colaborador substituto/);
});

test("realocacao permanente e diaria usam RPCs atomicas", () => {
  const migration = read("supabase/migrations/20260728000300_false_positive_relocation.sql");
  const page = read("apps/dashboard/app/page.tsx");
  const dialog = read("apps/dashboard/src/components/RelocationDialog.tsx");

  assert.match(migration, /function public\.dmr_realocar_equipe_permanente\(uuid\[\], uuid\)/i);
  assert.match(migration, /function public\.dmr_realocar_equipe_data\(uuid\[\], uuid\)/i);
  assert.match(migration, /status\s*=\s*'cancelada'/i);
  assert.match(migration, /status\s*=\s*'pendente'/i);
  assert.match(page, /rpc\("dmr_realocar_equipe_permanente"/);
  assert.match(page, /rpc\("dmr_realocar_equipe_data"/);
  assert.match(dialog, /Realocar/);
  assert.match(dialog, /Preparar comunicado/);
});

test("modal de realocacao sincroniza o destino e mostra falhas ao usuario", () => {
  const dialog = read("apps/dashboard/src/components/RelocationDialog.tsx");
  const page = read("apps/dashboard/app/page.tsx");

  assert.match(dialog, /effectiveDestinationId/);
  assert.match(dialog, /destinations\.some\(\(item\) => item\.scheduleId === destinationId\)/);
  assert.match(dialog, /destinations\[0\]\?\.scheduleId \?\? ""/);
  assert.match(dialog, /onConfirm\(effectiveDestinationId\)/);
  assert.match(dialog, /catch \(error\)/);
  assert.match(dialog, /Não foi possível realocar os colaboradores\./);
  assert.match(dialog, /role="alert"/);
  assert.match(page, /selectedRows\[0\]\?\.empresa/);
  assert.match(page, /selectedRows\[0\]\?\.\["entrada\/saída"\]/);
});

test("RPCs de realocacao expõem parametros nomeados ao PostgREST", () => {
  const migration = read("supabase/migrations/20260729000100_fix_relocation_rpc.sql");

  assert.match(migration, /function public\.dmr_realocar_equipe_permanente\(\s*p_vinculo_ids uuid\[\],\s*p_destino_empresa_horario_id uuid\s*\)/i);
  assert.match(migration, /function public\.dmr_realocar_equipe_data\(\s*p_escala_colaborador_ids uuid\[\],\s*p_destino_empresa_horario_id uuid\s*\)/i);
  assert.match(migration, /grant execute on function public\.dmr_realocar_equipe_permanente\(uuid\[\], uuid\) to authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.dmr_realocar_equipe_data\(uuid\[\], uuid\) to authenticated, service_role/i);
});
