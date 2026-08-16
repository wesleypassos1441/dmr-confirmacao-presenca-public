import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260724000100_bot_operational_schedule.sql",
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8").replace(/\r\n?/g, "\n")
  : "";
const behavioralTestPath = join(process.cwd(), "supabase/tests/bot_operational_schedule.sql");
const behavioralTest = existsSync(behavioralTestPath)
  ? readFileSync(behavioralTestPath, "utf8")
  : "";
const operationalStatusFunctionPath = join(
  process.cwd(),
  "supabase/functions/bot-operational-status/index.ts",
);
const operationalStatusFunction = existsSync(operationalStatusFunctionPath)
  ? readFileSync(operationalStatusFunctionPath, "utf8")
  : "";
const nextMessageFunctionPath = join(
  process.cwd(),
  "supabase/functions/bot-next-message/index.ts",
);
const nextMessageFunction = readFileSync(nextMessageFunctionPath, "utf8");
const functionsDeployPath = join(process.cwd(), "scripts/supabase-functions-deploy.ps1");
const functionsDeploy = readFileSync(functionsDeployPath, "utf8");

test("endpoint operacional aceita somente POST e exige token antes do banco", () => {
  assert.equal(
    existsSync(operationalStatusFunctionPath),
    true,
    "Edge Function bot-operational-status ausente",
  );
  assert.match(
    operationalStatusFunction,
    /import\s*\{[^}]*handleOptions[^}]*jsonResponse[^}]*requireBotToken[^}]*safeError[^}]*\}\s*from\s*["']\.\.\/_shared\/http\.ts["']/i,
  );
  assert.match(
    operationalStatusFunction,
    /import\s*\{[^}]*serviceClient[^}]*\}\s*from\s*["']\.\.\/_shared\/supabase\.ts["']/i,
  );

  const methodIndex = operationalStatusFunction.indexOf('req.method !== "POST"');
  const tokenIndex = operationalStatusFunction.indexOf("requireBotToken(req)");
  const clientIndex = operationalStatusFunction.indexOf("serviceClient()");
  assert.notEqual(methodIndex, -1, "validacao de metodo POST ausente");
  assert.notEqual(tokenIndex, -1, "validacao do token do bot ausente");
  assert.notEqual(clientIndex, -1, "cliente service role ausente");
  assert.equal(methodIndex < tokenIndex, true, "metodo deve ser validado antes do token");
  assert.equal(tokenIndex < clientIndex, true, "token deve ser validado antes de acessar o banco");
  assert.match(
    operationalStatusFunction,
    /req\.method\s*!==\s*["']POST["'][\s\S]*?jsonResponse\(405,\s*\{\s*error:/i,
  );
  assert.match(
    operationalStatusFunction,
    /!requireBotToken\(req\)[\s\S]*?jsonResponse\(401,\s*\{\s*error:/i,
  );
  assert.match(
    operationalStatusFunction,
    /try\s*\{\s*const\s+supabase\s*=\s*serviceClient\(\)/i,
    "configuracao do cliente deve ficar dentro do tratamento sanitizado",
  );
});

test("endpoint operacional devolve o status da RPC e sanitiza falhas", () => {
  assert.match(
    operationalStatusFunction,
    /supabase\.rpc\(["']dmr_status_operacional_bot["']\)/i,
  );
  assert.match(
    operationalStatusFunction,
    /if\s*\(error\)\s*throw\s+error/i,
  );
  assert.match(
    operationalStatusFunction,
    /return\s+jsonResponse\(200,\s*\{\s*sucesso\s*:\s*true\s*,\s*operacional\s*:\s*data\s*\?\?\s*\{\s*\}\s*\}\s*\)/i,
  );
  assert.doesNotMatch(
    operationalStatusFunction,
    /return\s+jsonResponse\(200,\s*data\s*\?\?\s*\{\s*\}\s*\)/i,
  );
  assert.match(
    operationalStatusFunction,
    /catch\s*\(error\)[\s\S]*?jsonResponse\(500,\s*safeError\(error\)\)/i,
  );
  assert.doesNotMatch(
    operationalStatusFunction,
    /jsonResponse\(500,\s*\{[^}]*error\s*:\s*(?:error|error\.message)/i,
  );
});

test("bot-next-message limpa filas expiradas antes de gerar e consultar a fila", () => {
  const cleanupIndex = nextMessageFunction.indexOf(
    'supabase.rpc("dmr_cancelar_filas_expiradas_bot")',
  );
  const generatorIndex = nextMessageFunction.indexOf(
    'supabase.rpc("gerar_fila_confirmacoes")',
  );
  const queueIndex = nextMessageFunction.indexOf('.from("fila_mensagens")');

  assert.notEqual(cleanupIndex, -1, "RPC de limpeza ausente");
  assert.notEqual(generatorIndex, -1, "RPC geradora ausente");
  assert.notEqual(queueIndex, -1, "consulta da fila ausente");
  assert.equal(cleanupIndex < generatorIndex, true, "limpeza deve preceder a geracao");
  assert.equal(cleanupIndex < queueIndex, true, "limpeza deve preceder a consulta da fila");
  assert.match(
    nextMessageFunction,
    /const\s*\{\s*error\s*:\s*cleanupError\s*\}\s*=\s*await\s+supabase\.rpc\(["']dmr_cancelar_filas_expiradas_bot["']\)\s*;\s*if\s*\(cleanupError\)\s*throw\s+cleanupError/i,
  );
});

test("deploy inclui bot-operational-status entre as funcoes sem JWT", () => {
  const botFunctionsMatch = functionsDeploy.match(/\$botFunctions\s*=\s*@\(([\s\S]*?)\)/i);
  assert.notEqual(botFunctionsMatch, null, "lista botFunctions ausente");
  assert.match(botFunctionsMatch[1], /["']bot-operational-status["']/i);
  assert.match(
    functionsDeploy,
    /foreach\s*\(\$fn\s+in\s+\$botFunctions\)[\s\S]*?Deploy-Function\s+\$fn\s+\$true/i,
  );
});

test("deploy de Edge Functions usa a API e nao depende do Docker local", () => {
  const deployFunctionMatch = functionsDeploy.match(
    /function\s+Deploy-Function[\s\S]*?\n\}/i,
  );
  assert.notEqual(deployFunctionMatch, null, "funcao Deploy-Function ausente");

  const deployFunction = deployFunctionMatch[0];
  const deployCalls = deployFunction.match(/npx\s+supabase\s+functions\s+deploy[^\r\n]*/gi) ?? [];

  assert.equal(deployCalls.length, 1, "o deploy deve executar uma unica chamada por Function");
  assert.match(deployCalls[0], /--use-api/i);
});

test("migration define as funcoes privadas do agendamento operacional", () => {
  assert.equal(existsSync(migrationPath), true, "migration de agendamento operacional ausente");
  assert.match(
    migration,
    /create\s+or\s+replace\s+function\s+public\.dmr_cancelar_filas_expiradas_bot\(\s*p_agora\s+timestamptz\s+default\s+now\(\)\s*\)\s*returns\s+integer/i,
  );
  assert.match(
    migration,
    /create\s+or\s+replace\s+function\s+public\.dmr_status_operacional_bot\(\s*p_agora\s+timestamptz\s+default\s+now\(\)\s*\)\s*returns\s+jsonb/i,
  );
  assert.equal((migration.match(/security\s+definer/gi) ?? []).length, 2);
  assert.equal((migration.match(/set\s+search_path\s*=\s*public/gi) ?? []).length, 2);
});

test("limpeza cancela somente filas antigas encerradas e preserva futuro e madrugada", () => {
  assert.match(migration, /\(p_agora\s+at\s+time\s+zone\s+'America\/Sao_Paulo'\)::date/i);
  assert.match(migration, /update\s+public\.fila_mensagens\s+fm/i);
  assert.match(migration, /fm\.status\s+in\s*\(\s*'pendente'\s*,\s*'processando'\s*\)/i);
  assert.match(migration, /e\.data\s*<\s*v_local_today/i);
  assert.doesNotMatch(migration, /e\.data\s*<=\s*v_local_today/i);
  assert.match(
    migration,
    /not\s*\(\s*e\.data\s*=\s*v_local_today\s*-\s*1[\s\S]*?ec\.horario_inicio_disparo\s*>\s*ec\.horario_inicio\s*\)/i,
  );
  assert.match(migration, /status\s*=\s*'cancelada'/i);
  assert.match(migration, /processando_em\s*=\s*null/i);
  assert.match(migration, /ultimo_erro\s*=\s*'[^']*(?:operacao|fila)[^']*'/i);
  assert.match(migration, /atualizado_em\s*=\s*p_agora/i);
  assert.match(migration, /get\s+diagnostics\s+v_canceladas\s*=\s*row_count/i);
});

test("limpeza respeita lease de cinco minutos e status preserva envio recente", () => {
  const cleanupMatch = migration.match(
    /create\s+or\s+replace\s+function\s+public\.dmr_cancelar_filas_expiradas_bot[\s\S]*?as\s+\$\$([\s\S]*?)\$\$;/i,
  );
  assert.notEqual(cleanupMatch, null, "funcao de limpeza ausente");

  const cleanup = cleanupMatch[1];
  assert.match(cleanup, /fm\.status\s*=\s*'pendente'/i);
  assert.match(
    cleanup,
    /fm\.status\s*=\s*'processando'[\s\S]*?fm\.processando_em\s+is\s+null[\s\S]*?or\s+fm\.processando_em\s*<\s*p_agora\s*-\s*interval\s+'5 minutes'/i,
  );
  assert.doesNotMatch(cleanup, /fm\.status\s+in\s*\(\s*'pendente'\s*,\s*'processando'\s*\)/i);
  assert.match(cleanup, /atualizado_em\s*=\s*p_agora/i);

  assert.match(
    migration,
    /union\s+select\s+fm\.id\s+from\s+public\.fila_mensagens\s+fm\s+where\s+fm\.status\s*=\s*'processando'\s+and\s+fm\.processando_em\s*>=\s*p_agora\s*-\s*interval\s+'5 minutes'/i,
  );
});

test("status limita trabalho a operacoes locais validas e entidades ativas", () => {
  assert.match(
    migration,
    /e\.data\s*=\s*v_local_today\s+or\s*\(\s*e\.data\s*=\s*v_local_today\s*-\s*1\s+and\s+ec\.horario_inicio_disparo\s*>\s*ec\.horario_inicio\s*\)/i,
  );
  assert.match(migration, /ec\.horario_inicio_disparo\s+is\s+not\s+null/i);
  assert.match(migration, /emp\.ativa/i);
  assert.match(migration, /c\.ativo/i);
  assert.match(migration, /te\.ativo/i);
  assert.match(migration, /fm\.status\s+in\s*\(\s*'pendente'\s*,\s*'processando'\s*\)/i);
  assert.match(
    migration,
    /ov\.status_confirmacao\s+not\s+in\s*\(\s*'confirmado'\s*,\s*'nao_comparecera'\s*,\s*'cancelado'\s*,\s*'tratado_manualmente'\s*\)/i,
  );

  for (const field of [
    "mensagem_enviada_em",
    "primeiro_lembrete_enviado_em",
    "segundo_lembrete_enviado_em",
    "respondido_em",
    "alerta_sem_resposta_enviado_em",
    "alerta_incompreensivel_enviado_em",
  ]) {
    assert.match(migration, new RegExp(`ec\\.${field}`, "i"));
  }
});

test("cada etapa normal futura exige predecessora enviada e nenhuma fila existente", () => {
  const match = migration.match(
    /etapas_em_aberto\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*configuracao_relatorio\s+as/i,
  );
  assert.notEqual(match, null, "CTE etapas_em_aberto ausente");

  const etapas = match[1];
  assert.match(
    etapas,
    /\(\s*'confirmacao_inicial'\s*,[\s\S]*?ov\.mensagem_enviada_em\s+is\s+null[\s\S]*?fm_confirmacao_existente\.tipo\s*=\s*'confirmacao_inicial'/i,
  );
  assert.match(
    etapas,
    /\(\s*'lembrete_1'\s*,[\s\S]*?ov\.mensagem_enviada_em\s+is\s+not\s+null[\s\S]*?ov\.primeiro_lembrete_enviado_em\s+is\s+null[\s\S]*?fm_lembrete_1_existente\.tipo\s*=\s*'lembrete_1'/i,
  );
  assert.match(
    etapas,
    /\(\s*'lembrete_2'\s*,[\s\S]*?ov\.mensagem_enviada_em\s+is\s+not\s+null[\s\S]*?ov\.primeiro_lembrete_enviado_em\s+is\s+not\s+null[\s\S]*?ov\.segundo_lembrete_enviado_em\s+is\s+null[\s\S]*?fm_lembrete_2_existente\.tipo\s*=\s*'lembrete_2'/i,
  );
  assert.doesNotMatch(
    etapas,
    /p_agora\s*>=\s*ov\.(?:confirmacao_em|lembrete_1_em|lembrete_2_em|alerta_em)/i,
  );

  for (const alias of [
    "fm_confirmacao_existente",
    "fm_lembrete_1_existente",
    "fm_lembrete_2_existente",
  ]) {
    assert.doesNotMatch(etapas, new RegExp(`${alias}\\.status`, "i"));
  }
});

test("alertas contam proxima etapa sem aguardar prazo do gerador", () => {
  const match = migration.match(
    /etapas_em_aberto\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*configuracao_relatorio\s+as/i,
  );
  assert.notEqual(match, null, "CTE etapas_em_aberto ausente");

  const etapas = match[1];
  assert.match(
    etapas,
    /ov\.mensagem_enviada_em\s+is\s+not\s+null[\s\S]*?ov\.primeiro_lembrete_enviado_em\s+is\s+not\s+null[\s\S]*?ov\.segundo_lembrete_enviado_em\s+is\s+not\s+null/i,
  );
  assert.match(
    etapas,
    /ov\.status_confirmacao\s*=\s*'resposta_incompreensivel'[\s\S]*?ov\.alerta_incompreensivel_enviado_em\s+is\s+null[\s\S]*?contato_incompreensivel\.criado_em\s*<=\s*ov\.ultima_resposta_incompreensivel_em/i,
  );
  assert.doesNotMatch(
    etapas,
    /ov\.ultima_resposta_incompreensivel_em\s*\+\s*interval\s+'30 minutes'\s*<=\s*p_agora/i,
  );
  assert.match(
    etapas,
    /from\s+public\.fila_mensagens\s+fm_alerta_existente[\s\S]*?fm_alerta_existente\.contato_alerta_dmr_id\s*=\s*contato_sem_resposta\.id[\s\S]*?fm_alerta_existente\.tipo\s*=\s*'alerta_sem_resposta'/i,
  );
  assert.match(
    etapas,
    /fm_alerta_existente\.tipo\s*=\s*case\s+when\s+ov\.tentativas_incompreensiveis\s*>=\s*cfg_alerta\.max_respostas_incompreensiveis[\s\S]*?'alerta_resposta_incompreensivel'[\s\S]*?'alerta_resposta_incompreensivel_expirada'[\s\S]*?end/i,
  );
  assert.doesNotMatch(etapas, /fm_alerta_existente\.status/i);
});

test("alertas pendentes exigem contato ativo e elegivel para o evento", () => {
  assert.match(
    migration,
    /exists\s*\(\s*select\s+1\s+from\s+public\.contatos_alerta_dmr\s+contato_sem_resposta[\s\S]*?contato_sem_resposta\.ativo[\s\S]*?contato_sem_resposta\.criado_em\s*<=\s*ov\.alerta_em/i,
  );
  assert.match(
    migration,
    /exists\s*\(\s*select\s+1\s+from\s+public\.contatos_alerta_dmr\s+contato_incompreensivel[\s\S]*?contato_incompreensivel\.ativo[\s\S]*?contato_incompreensivel\.criado_em\s*<=\s*ov\.ultima_resposta_incompreensivel_em/i,
  );
});

test("cada colaborador contabiliza no maximo uma etapa de alerta", () => {
  const match = migration.match(
    /etapas_em_aberto\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*configuracao_relatorio\s+as/i,
  );
  assert.notEqual(match, null, "CTE etapas_em_aberto ausente");

  const etapasEmAberto = match[1];
  const linhasDeAlerta = etapasEmAberto.match(
    /\(\s*'alerta(?:_[^']*)?'\s*,\s*ov\.respondido_em/gi,
  ) ?? [];
  assert.equal(linhasDeAlerta.length, 1);
  assert.match(
    etapasEmAberto,
    /\(\s*'alerta'\s*,[\s\S]*?ov\.segundo_lembrete_enviado_em\s+is\s+not\s+null[\s\S]*?\bor\b[\s\S]*?ov\.status_confirmacao\s*=\s*'resposta_incompreensivel'/i,
  );
  assert.doesNotMatch(
    etapasEmAberto,
    /ov\.status_confirmacao\s*<>\s*'resposta_incompreensivel'/i,
  );
});

test("etapas reutilizam operacoes_validas sem reler escala_colaboradores", () => {
  const match = migration.match(
    /etapas_em_aberto\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*configuracao_relatorio\s+as/i,
  );
  assert.notEqual(match, null, "CTE etapas_em_aberto ausente");

  const etapasEmAberto = match[1];
  assert.match(etapasEmAberto, /from\s+operacoes_validas\s+ov/i);
  assert.doesNotMatch(etapasEmAberto, /from\s+public\.escala_colaboradores/i);
});

test("relatorios pendentes seguem grupo representante e contatos elegiveis", () => {
  assert.match(migration, /relatorio_whatsapp_ativado_em/i);
  assert.match(migration, /ec\.criado_em\s*>=\s*v_relatorio_ativado_em/i);
  assert.match(
    migration,
    /grupos_operacionais_validos\s+as\s*\(\s*select\s+distinct\s+ov\.escala_id\s*,\s*ov\.turno_empresa_id\s+from\s+operacoes_validas\s+ov\s*\)/i,
  );
  assert.match(migration, /group\s+by\s+e\.id\s*,\s*e\.data\s*,\s*te\.id/i);
  assert.match(
    migration,
    /\(array_agg\(ec\.id\s+order\s+by\s+c\.nome\)\)\[1\]\s+as\s+escala_colaborador_id/i,
  );
  assert.match(migration, /cross\s+join\s+public\.contatos_alerta_dmr\s+contato/i);
  assert.match(migration, /contato\.ativo/i);
  assert.match(migration, /contato\.criado_em\s*<=\s*p_agora/i);
  assert.match(migration, /fm_relatorio_existente\.tipo\s*=\s*'relatorio_diario'/i);
  assert.match(
    migration,
    /fm_relatorio_existente\.contato_alerta_dmr_id\s*=\s*relatorio_devido\.contato_alerta_dmr_id/i,
  );
});

test("relatorio forma um unico grupo por escala e turno", () => {
  const match = migration.match(
    /relatorio_grupos\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*relatorios_devidos\s+as/i,
  );
  assert.notEqual(match, null, "CTE relatorio_grupos ausente");

  const relatorioGrupos = match[1];
  assert.match(
    relatorioGrupos,
    /join\s+grupos_operacionais_validos\s+grupo_valido\s+on\s+grupo_valido\.escala_id\s*=\s*e\.id\s+and\s+grupo_valido\.turno_empresa_id\s*=\s*te\.id/i,
  );
  assert.doesNotMatch(
    relatorioGrupos,
    /join\s+operacoes_validas\s+ov\s+on\s+ov\.escala_colaborador_id\s*=\s*ec\.id/i,
  );
  assert.match(
    relatorioGrupos,
    /min\s*\(\s*case[\s\S]*?end\s*\)\s+as\s+entrada_local/i,
  );
  assert.match(relatorioGrupos, /group\s+by\s+e\.id\s*,\s*e\.data\s*,\s*te\.id\s*$/i);
  assert.doesNotMatch(relatorioGrupos, /group\s+by[\s\S]*?\bcase\b/i);
});

test("grupo totalmente respondido usa os estados do relatorio automatico", () => {
  const groupsMatch = migration.match(
    /relatorio_grupos\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*relatorios_devidos\s+as/i,
  );
  assert.notEqual(groupsMatch, null, "CTE relatorio_grupos ausente");
  assert.match(
    groupsMatch[1],
    /count\s*\(\s*\*\s*\)\s+filter\s*\(\s*where\s+ec\.status_confirmacao\s+in\s*\(\s*'confirmado'\s*,\s*'nao_comparecera'\s*,\s*'resposta_incompreensivel'\s*,\s*'tratado_manualmente'\s*\)\s*\)\s+as\s+respondidos/i,
  );
  assert.match(
    migration,
    /v_now_local\s*>=\s*grupo\.entrada_local\s*-\s*interval\s+'90 minutes'\s+or\s+grupo\.respondidos\s*=\s*grupo\.total_colaboradores/i,
  );
});

test("somente relatorio enviado satisfaz contato por qualquer membro da escala e turno", () => {
  const match = migration.match(
    /relatorios_devidos\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*filas_relatorio_em_aberto\s+as/i,
  );
  assert.notEqual(match, null, "CTE relatorios_devidos ausente");

  const relatoriosDevidos = match[1];
  assert.match(
    relatoriosDevidos,
    /from\s+public\.fila_mensagens\s+fm_relatorio_enviado\s+join\s+public\.escala_colaboradores\s+ec_relatorio_enviado\s+on\s+ec_relatorio_enviado\.id\s*=\s*fm_relatorio_enviado\.escala_colaborador_id/i,
  );
  assert.match(relatoriosDevidos, /ec_relatorio_enviado\.escala_id\s*=\s*grupo\.escala_id/i);
  assert.match(
    relatoriosDevidos,
    /ec_relatorio_enviado\.turno_empresa_id\s*=\s*grupo\.turno_empresa_id/i,
  );
  assert.match(relatoriosDevidos, /fm_relatorio_enviado\.contato_alerta_dmr_id\s*=\s*contato\.id/i);
  assert.match(relatoriosDevidos, /fm_relatorio_enviado\.tipo\s*=\s*'relatorio_diario'/i);
  assert.match(relatoriosDevidos, /fm_relatorio_enviado\.status\s*=\s*'enviada'/i);
  assert.match(relatoriosDevidos, /fm_relatorio_enviado\.enviada_em\s+is\s+not\s+null/i);
  assert.doesNotMatch(
    relatoriosDevidos,
    /fm_relatorio_enviado\.escala_colaborador_id\s*=\s*grupo\.escala_colaborador_id/i,
  );
});

test("todos os checks de relatorio por membro respeitam o watermark atual", () => {
  const sections = [
    {
      name: "enviada",
      match: migration.match(
        /relatorios_devidos\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*filas_relatorio_em_aberto\s+as/i,
      ),
      expected: /ec_relatorio_enviado\.criado_em\s*>=\s*cfg\.v_relatorio_ativado_em/i,
    },
    {
      name: "aberta",
      match: migration.match(
        /filas_relatorio_em_aberto\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*relatorios_para_recuperar\s+as/i,
      ),
      expected: /ec_relatorio_aberto\.criado_em\s*>=\s*cfg\.v_relatorio_ativado_em/i,
    },
    {
      name: "recuperavel",
      match: migration.match(
        /relatorios_para_recuperar\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*relatorios_recuperados\s+as/i,
      ),
      expected: /ec_relatorio_terminal\.criado_em\s*>=\s*cfg\.v_relatorio_ativado_em/i,
    },
    {
      name: "existente",
      match: migration.match(
        /relatorios_em_aberto\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*filas_em_aberto\s+as/i,
      ),
      expected: /ec_relatorio_existente\.criado_em\s*>=\s*cfg\.v_relatorio_ativado_em/i,
    },
  ];

  for (const section of sections) {
    assert.notEqual(section.match, null, `CTE de relatorio ${section.name} ausente`);
    assert.match(section.match[1], /cross\s+join\s+configuracao_relatorio\s+cfg/i);
    assert.match(section.match[1], section.expected);
  }
});

test("fila de relatorio aberta e contada pelo grupo mesmo fora de operacoes_validas", () => {
  const match = migration.match(
    /filas_relatorio_em_aberto\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*relatorios_para_recuperar\s+as/i,
  );
  assert.notEqual(match, null, "CTE filas_relatorio_em_aberto ausente");

  const filasRelatorio = match[1];
  assert.match(filasRelatorio, /from\s+relatorios_devidos\s+relatorio_devido/i);
  assert.match(
    filasRelatorio,
    /join\s+public\.escala_colaboradores\s+ec_relatorio_aberto[\s\S]*?ec_relatorio_aberto\.escala_id\s*=\s*relatorio_devido\.escala_id[\s\S]*?ec_relatorio_aberto\.turno_empresa_id\s*=\s*relatorio_devido\.turno_empresa_id/i,
  );
  assert.match(
    filasRelatorio,
    /fm_relatorio_aberto\.contato_alerta_dmr_id\s*=\s*relatorio_devido\.contato_alerta_dmr_id/i,
  );
  assert.match(filasRelatorio, /fm_relatorio_aberto\.tipo\s*=\s*'relatorio_diario'/i);
  assert.match(
    filasRelatorio,
    /fm_relatorio_aberto\.status\s+in\s*\(\s*'pendente'\s*,\s*'processando'\s*\)/i,
  );
  assert.doesNotMatch(filasRelatorio, /operacoes_validas/i);
  assert.match(
    migration,
    /filas_em_aberto\s+as\s*\([\s\S]*?union\s+select\s+fila_relatorio_aberta\.id\s+from\s+filas_relatorio_em_aberto\s+fila_relatorio_aberta/i,
  );
});

test("relatorio terminal devido e recuperado uma vez por contato e grupo", () => {
  assert.match(
    migration,
    /alter\s+table\s+public\.fila_mensagens\s+add\s+column\s+if\s+not\s+exists\s+recuperacoes_automaticas\s+integer\s+not\s+null\s+default\s+0/i,
  );
  assert.match(
    migration,
    /check\s*\(\s*recuperacoes_automaticas\s*>=\s*0\s*\)/i,
  );

  const candidatesMatch = migration.match(
    /relatorios_para_recuperar\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*relatorios_recuperados\s+as/i,
  );
  assert.notEqual(candidatesMatch, null, "CTE relatorios_para_recuperar ausente");

  const candidates = candidatesMatch[1];
  assert.match(candidates, /from\s+relatorios_devidos\s+relatorio_devido/i);
  assert.match(
    candidates,
    /ec_relatorio_terminal\.escala_id\s*=\s*relatorio_devido\.escala_id/i,
  );
  assert.match(
    candidates,
    /ec_relatorio_terminal\.turno_empresa_id\s*=\s*relatorio_devido\.turno_empresa_id/i,
  );
  assert.match(
    candidates,
    /fm_relatorio_terminal\.contato_alerta_dmr_id\s*=\s*relatorio_devido\.contato_alerta_dmr_id/i,
  );
  assert.match(candidates, /fm_relatorio_terminal\.tipo\s*=\s*'relatorio_diario'/i);
  assert.match(candidates, /fm_relatorio_terminal\.recuperacoes_automaticas\s*<\s*1/i);
  assert.match(
    candidates,
    /not\s+exists\s*\(\s*select\s+1\s+from\s+public\.fila_mensagens\s+fm_relatorio_recuperacao_consumida\s+join\s+public\.escala_colaboradores\s+ec_relatorio_recuperacao_consumida[\s\S]*?ec_relatorio_recuperacao_consumida\.escala_id\s*=\s*relatorio_devido\.escala_id[\s\S]*?ec_relatorio_recuperacao_consumida\.turno_empresa_id\s*=\s*relatorio_devido\.turno_empresa_id[\s\S]*?fm_relatorio_recuperacao_consumida\.contato_alerta_dmr_id\s*=\s*relatorio_devido\.contato_alerta_dmr_id[\s\S]*?fm_relatorio_recuperacao_consumida\.tipo\s*=\s*'relatorio_diario'[\s\S]*?fm_relatorio_recuperacao_consumida\.recuperacoes_automaticas\s*>=\s*1[\s\S]*?ec_relatorio_recuperacao_consumida\.criado_em\s*>=\s*cfg\.v_relatorio_ativado_em\s*\)/i,
  );
  assert.match(
    candidates,
    /fm_relatorio_terminal\.status\s+in\s*\(\s*'erro'\s*,\s*'cancelada'\s*\)/i,
  );
  assert.match(candidates, /cross\s+join\s+configuracao_relatorio\s+cfg/i);
  assert.match(
    candidates,
    /ec_relatorio_terminal\.criado_em\s*>=\s*cfg\.v_relatorio_ativado_em/i,
  );
  assert.match(candidates, /limit\s+1/i);

  const recoveredMatch = migration.match(
    /relatorios_recuperados\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*relatorios_em_aberto\s+as/i,
  );
  assert.notEqual(recoveredMatch, null, "CTE relatorios_recuperados ausente");

  const recovered = recoveredMatch[1];
  assert.match(recovered, /update\s+public\.fila_mensagens\s+fm_relatorio_recuperado/i);
  assert.match(recovered, /status\s*=\s*'pendente'/i);
  assert.match(recovered, /tentativas\s*=\s*0/i);
  assert.match(
    recovered,
    /recuperacoes_automaticas\s*=\s*fm_relatorio_recuperado\.recuperacoes_automaticas\s*\+\s*1/i,
  );
  assert.doesNotMatch(recovered, /recuperacoes_automaticas\s*=\s*0/i);
  assert.match(recovered, /processando_em\s*=\s*null/i);
  assert.match(recovered, /agendado_para\s*=\s*p_agora/i);
  assert.match(recovered, /atualizado_em\s*=\s*p_agora/i);
  assert.match(
    recovered,
    /fm_relatorio_recuperado\.status\s+in\s*\(\s*'erro'\s*,\s*'cancelada'\s*\)/i,
  );
  assert.doesNotMatch(
    recovered,
    /fm_relatorio_recuperado\.status\s*=\s*'enviada'\s+and\s+fm_relatorio_recuperado\.enviada_em\s+is\s+not\s+null/i,
  );
  assert.match(
    migration,
    /filas_em_aberto\s+as\s*\([\s\S]*?union\s+select\s+relatorio_recuperado\.id\s+from\s+relatorios_recuperados\s+relatorio_recuperado/i,
  );

  const pendingMatch = migration.match(
    /relatorios_em_aberto\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*filas_em_aberto\s+as/i,
  );
  assert.notEqual(pendingMatch, null, "CTE relatorios_em_aberto ausente");
  assert.match(
    pendingMatch[1],
    /fm_relatorio_existente\.contato_alerta_dmr_id\s*=\s*relatorio_devido\.contato_alerta_dmr_id/i,
  );
  assert.doesNotMatch(pendingMatch[1], /fm_relatorio_existente\.status/i);
});

test("enviada sem timestamp e recuperada mas enviada valida nao e reaberta", () => {
  const candidatesMatch = migration.match(
    /relatorios_para_recuperar\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*relatorios_recuperados\s+as/i,
  );
  assert.notEqual(candidatesMatch, null, "CTE relatorios_para_recuperar ausente");

  const candidates = candidatesMatch[1];
  assert.match(
    candidates,
    /fm_relatorio_terminal\.status\s+in\s*\(\s*'erro'\s*,\s*'cancelada'\s*\)\s+or\s*\(\s*fm_relatorio_terminal\.status\s*=\s*'enviada'\s+and\s+fm_relatorio_terminal\.enviada_em\s+is\s+null\s*\)/i,
  );
  assert.doesNotMatch(
    candidates,
    /fm_relatorio_terminal\.status\s*=\s*'enviada'\s+and\s+fm_relatorio_terminal\.enviada_em\s+is\s+not\s+null/i,
  );

  const recoveredMatch = migration.match(
    /relatorios_recuperados\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*relatorios_em_aberto\s+as/i,
  );
  assert.notEqual(recoveredMatch, null, "CTE relatorios_recuperados ausente");
  assert.match(
    recoveredMatch[1],
    /fm_relatorio_recuperado\.status\s+in\s*\(\s*'erro'\s*,\s*'cancelada'\s*\)\s+or\s*\(\s*fm_relatorio_recuperado\.status\s*=\s*'enviada'\s+and\s+fm_relatorio_recuperado\.enviada_em\s+is\s+null\s*\)/i,
  );
  assert.match(
    migration,
    /filas_em_aberto\s+as\s*\([\s\S]*?union\s+select\s+relatorio_recuperado\.id\s+from\s+relatorios_recuperados\s+relatorio_recuperado/i,
  );
});

test("recuperacao nao reabre relatorio futuro historico enviado ou ja em aberto", () => {
  const dueMatch = migration.match(
    /relatorios_devidos\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*filas_relatorio_em_aberto\s+as/i,
  );
  assert.notEqual(dueMatch, null, "CTE relatorios_devidos ausente");

  const due = dueMatch[1];
  assert.match(due, /from\s+relatorio_grupos\s+grupo/i);
  assert.match(
    due,
    /v_now_local\s*>=\s*grupo\.entrada_local\s*-\s*interval\s+'90 minutes'\s+or\s+grupo\.respondidos\s*=\s*grupo\.total_colaboradores/i,
  );
  assert.match(due, /contato\.ativo/i);
  assert.match(due, /contato\.criado_em\s*<=\s*p_agora/i);

  const candidatesMatch = migration.match(
    /relatorios_para_recuperar\s+as\s*\(([\s\S]*?)\n\s*\),\n\s*relatorios_recuperados\s+as/i,
  );
  assert.notEqual(candidatesMatch, null, "CTE relatorios_para_recuperar ausente");
  assert.match(
    candidatesMatch[1],
    /from\s+filas_relatorio_em_aberto\s+fila_relatorio_aberta[\s\S]*?fila_relatorio_aberta\.escala_id\s*=\s*relatorio_devido\.escala_id[\s\S]*?fila_relatorio_aberta\.turno_empresa_id\s*=\s*relatorio_devido\.turno_empresa_id[\s\S]*?fila_relatorio_aberta\.contato_alerta_dmr_id\s*=\s*relatorio_devido\.contato_alerta_dmr_id/i,
  );
});

test("status limpa primeiro e retorna o contrato json completo", () => {
  const cleanupIndex = migration.indexOf("v_canceladas := public.dmr_cancelar_filas_expiradas_bot(p_agora)");
  const statusQueryIndex = migration.indexOf("with operacoes_validas as");
  assert.notEqual(cleanupIndex, -1);
  assert.notEqual(statusQueryIndex, -1);
  assert.equal(cleanupIndex < statusQueryIndex, true);

  for (const key of [
    "tem_trabalho",
    "filas_pendentes",
    "etapas_pendentes",
    "relatorios_pendentes",
    "filas_expiradas_canceladas",
    "data_local",
  ]) {
    assert.match(migration, new RegExp(`'${key}'`, "i"));
  }
  assert.match(
    migration,
    /v_filas_pendentes\s*>\s*0\s+or\s+v_etapas_pendentes\s*>\s*0\s+or\s+v_relatorios_pendentes\s*>\s*0/i,
  );
});

test("somente service_role recebe execute nas funcoes operacionais", () => {
  for (const signature of [
    "dmr_cancelar_filas_expiradas_bot\\(timestamptz\\)",
    "dmr_status_operacional_bot\\(timestamptz\\)",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature} from public`, "i"));
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature} from anon`, "i"));
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature} from authenticated`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature} to service_role`, "i"));
    assert.doesNotMatch(
      migration,
      new RegExp(`grant execute on function public\\.${signature} to (?:public|anon|authenticated)`, "i"),
    );
  }
});

test("pgTAP versionado cobre cadeia lease recuperacao watermark e permissoes", () => {
  assert.equal(existsSync(behavioralTestPath), true, "teste pgTAP operacional ausente");
  assert.match(behavioralTest, /begin\s*;/i);
  assert.match(behavioralTest, /select\s+plan\s*\(/i);
  assert.match(behavioralTest, /rollback\s*;/i);

  for (const scenario of [
    "confirmacao terminal bloqueia sucessores",
    "operacao noturna futura mantem trabalho",
    "predecessor terminal futuro nao mantem trabalho",
    "resposta incompreensivel antes de trinta minutos mantem trabalho",
    "alerta incompreensivel terminal nao mantem trabalho",
    "grupo tratado manualmente antecipa relatorio",
    "orcamento logico recupera somente uma fila representante",
    "lease recente mantem trabalho",
    "processamento expirado e cancelado",
    "relatorio recupera somente uma vez",
    "relatorio enviado valido satisfaz",
    "relatorio historico nao satisfaz nem reabre",
    "anon sem execute",
    "authenticated sem execute",
    "service_role com execute",
  ]) {
    assert.match(behavioralTest, new RegExp(scenario, "i"));
  }
});
