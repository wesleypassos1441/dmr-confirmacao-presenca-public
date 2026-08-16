import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

test("bot recicla o Edge preventivamente somente quando nao esta enviando", () => {
  const bot = read("apps/whatsapp-bot/src/index.ts");
  const env = read(".env.example");

  assert.match(bot, /numberEnv\("WHATSAPP_MAX_UPTIME_MINUTES",\s*30\)/);
  assert.match(bot, /shouldRecycleWhatsappRuntime/);
  assert.match(bot, /busy:\s*isPolling/);
  assert.match(env, /WHATSAPP_MAX_UPTIME_MINUTES=30/);
});

test("contatos de alerta possuem jornada brasileira inclusive durante a madrugada", () => {
  const migration = read("supabase/migrations/20260729000300_alert_schedules_team_reuse_substitutes.sql");

  assert.match(migration, /add column if not exists notificar_de time/i);
  assert.match(migration, /add column if not exists notificar_ate time/i);
  assert.match(migration, /function public\.dmr_alerta_sem_resposta_na_jornada/i);
  assert.match(migration, /America\/Sao_Paulo/i);
  assert.match(migration, /v_inicio\s*<=\s*v_fim/i);
  assert.match(migration, /v_hora\s*>=\s*v_inicio\s+or\s+v_hora\s*<=\s*v_fim/i);
});

test("edge cancela alertas sem resposta fora da jornada sem bloquear ausencias", () => {
  const edge = read("supabase/functions/bot-next-message/index.ts");

  assert.match(edge, /contato_alerta_dmr_id/);
  assert.match(edge, /agendado_para/);
  assert.match(edge, /next\.tipo\s*===\s*"alerta_sem_resposta"/);
  assert.match(edge, /dmr_alerta_sem_resposta_na_jornada/);
  assert.match(edge, /fora_da_jornada_do_contato/);
  assert.doesNotMatch(edge, /next\.tipo\s*===\s*"alerta_ausencia"[\s\S]{0,160}dmr_alerta_sem_resposta_na_jornada/);
});

test("turnos podem reaproveitar somente a ultima equipe ainda vinculada", () => {
  const migration = read("supabase/migrations/20260729000300_alert_schedules_team_reuse_substitutes.sql");
  const page = read("apps/dashboard/app/page.tsx");

  assert.match(migration, /function public\.dmr_obter_ultima_equipe_operacao/i);
  assert.match(migration, /ec\.data\s*<\s*p_antes_de/i);
  assert.match(migration, /empresa_colaboradores/i);
  assert.match(migration, /vinculo\.ativo\s+is\s+true/i);
  assert.match(migration, /colaborador\.ativo\s+is\s+true/i);
  assert.match(page, /dmr_obter_ultima_equipe_operacao/);
  assert.match(page, /Reaproveitar ultima lista|Reaproveitar última lista/);
});

test("sem resposta aceita substituto e o painel usa a barra operacional C", () => {
  const migration = read("supabase/migrations/20260729000300_alert_schedules_team_reuse_substitutes.sql");
  const page = read("apps/dashboard/app/page.tsx");
  const css = read("apps/dashboard/app/styles.css");

  assert.match(migration, /status_confirmacao\s+not in\s*\(\s*'nao_comparecera'\s*,\s*'sem_resposta'\s*\)/i);
  assert.match(page, /\["nao_comparecera",\s*"sem_resposta"\]\.includes\(row\.status_confirmacao\)/);
  assert.match(page, /operationResponseSummary/);
  assert.match(page, /operation-command-bar/);
  assert.match(page, /Respondidos/);
  assert.match(css, /\.operation-command-bar/);
});

test("substituto preserva o enum operacional em ausencia, sem resposta e falso positivo", () => {
  const migration = read("supabase/migrations/20260729000400_fix_substitute_status_response.sql");

  assert.match(migration, /status_confirmacao\s+not in\s*\(\s*'nao_comparecera'\s*,\s*'sem_resposta'\s*\)/i);
  assert.match(migration, /falso_positivo_em\s+is\s+null/i);
  assert.match(migration, /else\s+v_registro\.status_confirmacao::text/i);
  assert.doesNotMatch(migration, /status_confirmacao\s*=\s*'substituido'/i);
});

test("modal de substituto apresenta o erro real devolvido pelo banco", () => {
  const page = read("apps/dashboard/app/page.tsx");

  assert.match(page, /onSave:\s*\(values:[^)]*\)\s*=>\s*Promise<boolean\s*\|\s*string\s*\|\s*void>/);
  assert.match(page, /if\s*\(typeof result === "string"\)\s*\{\s*setDialogError\(result\)/);
  assert.match(page, /async function editSubstituto[\s\S]{0,1400}const message = toMessage\(err\);[\s\S]{0,120}return message;/);
});

test("dashboard permite cadastrar e editar a jornada dos contatos", () => {
  const page = read("apps/dashboard/app/page.tsx");

  assert.match(page, /notificar_de/);
  assert.match(page, /notificar_ate/);
  assert.match(page, /Inicio dos alertas|Início dos alertas/);
  assert.match(page, /Fim dos alertas/);
});
