import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260708000100_shared_authenticated_dashboard.sql";

function readMigration() {
  return fs.readFileSync(migrationPath, "utf8");
}

test("painel operacional fica compartilhado para qualquer usuario autenticado", () => {
  const migration = readMigration();
  const sharedTables = [
    "empresas",
    "empresa_horarios",
    "turnos_empresa",
    "colaboradores",
    "empresa_colaboradores",
    "escalas",
    "escala_colaboradores",
    "contatos_alerta_dmr",
    "fila_mensagens",
    "mensagens_recebidas",
    "alertas_dmr",
    "bot_heartbeats",
    "logs_acoes",
    "configuracoes_sistema",
  ];

  for (const table of sharedTables) {
    assert.match(migration, new RegExp(`create policy dmr_shared_read_${table}\\s+on public\\.${table}\\s+for select to authenticated\\s+using \\(true\\);`, "i"));
  }
});

test("painel compartilhado nao concede escrita geral para authenticated", () => {
  const migration = readMigration();

  assert.doesNotMatch(migration, /for\s+(insert|update|delete|all)\s+to authenticated\s+(using|with check)\s+\(true\)/i);
  assert.doesNotMatch(migration, /grant\s+.*insert.*to authenticated/i);
});
