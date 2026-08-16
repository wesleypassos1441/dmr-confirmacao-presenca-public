import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260730000100_operational_message_recovery.sql",
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8").replace(/\r\n?/g, "\n")
  : "";
const lateGuardMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260730000200_prevent_late_operational_recovery.sql",
);
const lateGuardMigration = existsSync(lateGuardMigrationPath)
  ? readFileSync(lateGuardMigrationPath, "utf8").replace(/\r\n?/g, "\n")
  : "";
const nextMessage = readFileSync(
  join(process.cwd(), "supabase/functions/bot-next-message/index.ts"),
  "utf8",
);
const operationalStatus = readFileSync(
  join(process.cwd(), "supabase/functions/bot-operational-status/index.ts"),
  "utf8",
);

test("fila operacional com erro e reaberta uma unica vez", () => {
  assert.equal(existsSync(migrationPath), true, "migration de recuperacao ausente");
  assert.match(
    migration,
    /create\s+or\s+replace\s+function\s+public\.dmr_recuperar_filas_operacionais_bot\s*\(/i,
  );
  assert.match(migration, /fm\.status\s*=\s*'erro'/i);
  assert.doesNotMatch(
    migration,
    /where\s+fm\.status\s+in\s*\(\s*'erro'\s*,\s*'cancelada'\s*\)/i,
    "cancelamentos por realocacao ou expiracao nao podem ser reabertos",
  );
  assert.match(migration, /fm\.recuperacoes_automaticas\s*<\s*1/i);
  assert.match(migration, /status\s*=\s*'pendente'/i);
  assert.match(migration, /tentativas\s*=\s*0/i);
  assert.match(
    migration,
    /recuperacoes_automaticas\s*=\s*fm\.recuperacoes_automaticas\s*\+\s*1/i,
  );
  assert.match(migration, /agendado_para\s*=\s*p_agora/i);
});

test("recuperacao respeita estado da operacao e nao duplica reenvio manual", () => {
  assert.match(
    migration,
    /ec\.status_confirmacao\s+not\s+in\s*\(\s*'confirmado'\s*,\s*'nao_comparecera'\s*,\s*'cancelado'\s*,\s*'tratado_manualmente'\s*\)/i,
  );
  assert.match(migration, /not\s+ec\.tratado_manualmente/i);
  assert.match(
    migration,
    /fm_enviada\.tipo\s+in\s*\(\s*'confirmacao_inicial'\s*,\s*'reenvio_manual'\s*\)/i,
  );
  assert.match(migration, /fm_enviada\.status\s*=\s*'enviada'/i);
  assert.match(migration, /fm_enviada\.enviada_em\s+is\s+not\s+null/i);
  assert.match(migration, /fm_enviada\.criado_em\s*>\s*fm\.atualizado_em/i);
});

test("bot recupera filas antes de gerar e consultar mensagens", () => {
  const recoveryCall = 'supabase.rpc("dmr_recuperar_filas_operacionais_bot")';
  const recoveryIndex = nextMessage.indexOf(recoveryCall);
  const generatorIndex = nextMessage.indexOf('supabase.rpc("gerar_fila_confirmacoes")');
  const queueIndex = nextMessage.indexOf('.from("fila_mensagens")');

  assert.notEqual(recoveryIndex, -1, "chamada de recuperacao ausente no bot-next-message");
  assert.equal(recoveryIndex < generatorIndex, true, "recuperacao deve preceder a geracao");
  assert.equal(recoveryIndex < queueIndex, true, "recuperacao deve preceder a consulta");
  assert.match(
    operationalStatus,
    /supabase\.rpc\(["']dmr_recuperar_filas_operacionais_bot["']\)[\s\S]*?supabase\.rpc\(["']dmr_status_operacional_bot["']\)/i,
  );
});

test("recuperacao automatica termina no horario de entrada da operacao", () => {
  assert.equal(
    existsSync(lateGuardMigrationPath),
    true,
    "migration corretiva contra disparos atrasados ausente",
  );
  assert.match(
    lateGuardMigration,
    /p_agora\s*<\s*\(\s*\(\s*e\.data\s*\+\s*coalesce\(\s*e\.horario_entrada_snapshot\s*,\s*ec\.horario_inicio\s*\)\s*\)\s*at\s+time\s+zone\s+'America\/Sao_Paulo'\s*\)/i,
    "fila com erro nao pode ser reaberta depois do inicio da jornada",
  );
  assert.match(
    lateGuardMigration,
    /fm\.tipo\s+in\s*\(\s*'confirmacao_inicial'\s*,\s*'lembrete_1'\s*,\s*'lembrete_2'\s*\)[\s\S]*?p_agora\s*>=\s*\(\s*\(\s*e\.data\s*\+\s*coalesce\(\s*e\.horario_entrada_snapshot\s*,\s*ec\.horario_inicio\s*\)\s*\)\s*at\s+time\s+zone\s+'America\/Sao_Paulo'\s*\)/i,
    "confirmacoes e lembretes abertos devem ser cancelados ao iniciar a jornada",
  );
});

test("bot limpa novamente as filas depois de gerar mensagens", () => {
  const cleanupCall = 'supabase.rpc("dmr_cancelar_filas_expiradas_bot")';
  const firstCleanupIndex = nextMessage.indexOf(cleanupCall);
  const generatorIndex = nextMessage.indexOf('supabase.rpc("gerar_fila_confirmacoes")');
  const secondCleanupIndex = nextMessage.indexOf(cleanupCall, firstCleanupIndex + cleanupCall.length);
  const queueIndex = nextMessage.indexOf('.from("fila_mensagens")');

  assert.notEqual(firstCleanupIndex, -1, "limpeza inicial ausente");
  assert.notEqual(secondCleanupIndex, -1, "limpeza posterior a geracao ausente");
  assert.equal(generatorIndex < secondCleanupIndex, true, "geracao deve preceder a segunda limpeza");
  assert.equal(secondCleanupIndex < queueIndex, true, "segunda limpeza deve preceder a consulta");
});
