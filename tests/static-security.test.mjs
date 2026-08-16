import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("relatorio whatsapp usa marco de ativacao e ignora confirmacoes antigas", () => {
  const migration = read("supabase/migrations/20260624000100_daily_report_activation_watermark.sql");

  assert.match(migration, /relatorio_whatsapp_ativado_em/);
  assert.match(migration, /v_relatorio_ativado_em\s+timestamptz/);
  assert.match(migration, /ec\.criado_em\s*>=\s*v_relatorio_ativado_em/);
  assert.match(migration, /min\(criado_em\)\s+as\s+operacao_criada_em/);
  assert.match(migration, /fm\.tipo\s*=\s*'relatorio_diario'/);
  assert.match(migration, /fm\.status\s+in\s+\('pendente',\s*'processando'\)/);
  assert.match(migration, /set\s+status\s*=\s*'cancelada'/);
});

test("relatorio whatsapp tambem alcanca contatos ativos antes da geracao nova", () => {
  const migration = read("supabase/migrations/20260624000300_report_generation_resilience.sql");

  assert.match(migration, /create or replace function public\.dmr_enfileirar_relatorio_diario_base/);
  assert.match(migration, /contato\.criado_em\s*<=\s*now\(\)/);
  assert.doesNotMatch(migration, /contato\.criado_em\s*<=\s*grupo\.operacao_criada_em/);
});

test("bot aciona relatorios automaticos antes de buscar mensagens pendentes", () => {
  const functionFile = read("supabase/functions/bot-next-message/index.ts");

  assert.match(functionFile, /supabase\.rpc\("gerar_fila_confirmacoes"\)/);
  assert.match(functionFile, /supabase\.rpc\("dmr_enfileirar_relatorios_automaticos"\)/);
  assert.match(functionFile, /relatorioError/);
  assert.match(functionFile, /console\.error\("Falha ao enfileirar relatorios automaticos:"/);
});

test("registro de resposta valida aciona relatorio automatico imediatamente", () => {
  const functionFile = read("supabase/functions/bot-register-incoming/index.ts");

  assert.match(functionFile, /async function enqueueAutomaticReports/);
  assert.match(functionFile, /supabase\.rpc\("dmr_enfileirar_relatorios_automaticos"\)/);
  assert.match(functionFile, /await enqueueAutomaticReports\(supabase\);/);
});

test("fila sql nao gera alerta sem resposta antes dos tres envios", () => {
  const migration = read("supabase/migrations/20260624000200_sequential_dispatch_alerts.sql");

  assert.match(migration, /create or replace function public\.gerar_fila_confirmacoes/);
  assert.match(migration, /and h\.mensagem_enviada_em is not null/);
  assert.match(migration, /and h\.primeiro_lembrete_enviado_em is not null/);
  assert.match(migration, /and h\.segundo_lembrete_enviado_em is not null/);
  assert.match(migration, /and h\.alerta_sem_resposta_enviado_em is null/);
  assert.match(migration, /status_confirmacao\s*=\s*'sem_resposta'/);
  assert.match(migration, /mensagem_enviada_em is null/);
  assert.match(migration, /set\s+status\s*=\s*'cancelada'/);
});

test("fila diaria bloqueia horario de disparo retroativo no banco", () => {
  const migration = read("supabase/migrations/20260624000400_prevent_retroactive_daily_queue.sql");

  assert.match(migration, /create or replace function public\.dmr_bloquear_fila_retroativa/);
  assert.match(migration, /create trigger escala_colaboradores_bloquear_fila_retroativa/);
  assert.match(migration, /v_now_local\s+timestamp/);
  assert.match(migration, /now\(\)\s+at time zone 'America\/Sao_Paulo'/);
  assert.match(migration, /v_inicio_local\s*:=\s*v_data\s*\+\s*new\.horario_inicio_disparo/);
  assert.match(migration, /if\s+v_inicio_local\s*<=\s*v_now_local\s+then/);
  assert.match(migration, /Horario de Disparo ja passou/);
});

test("relatorio automatico pode ser chamado pelas Edge Functions", () => {
  const migration = read("supabase/migrations/20260625000100_grant_auto_report_to_service_role.sql");

  assert.match(migration, /grant execute on function public\.dmr_enfileirar_relatorios_automaticos\(\) to service_role/);
  assert.match(migration, /grant execute on function public\.dmr_enfileirar_relatorio_diario_base\(date,\s*uuid,\s*uuid,\s*text\) to service_role/);
});

test("novos usuarios do Auth ganham perfil de dashboard automaticamente", () => {
  const migration = read("supabase/migrations/20260626000100_auto_dashboard_users.sql");

  assert.match(migration, /create or replace function public\.dmr_sync_auth_user_to_dashboard/);
  assert.match(migration, /after insert on auth\.users/);
  assert.match(migration, /insert into public\.usuarios_dashboard\(auth_user_id,\s*email,\s*nome,\s*papel,\s*ativo\)/);
  assert.match(migration, /values \(new\.id,\s*user_email,\s*user_name,\s*'admin',\s*true\)/);
  assert.match(migration, /from auth\.users u/);
  assert.match(migration, /on conflict \(email\) do update/);
});

test("script administrativo de senha usa service role apenas em ambiente local", () => {
  const script = read("scripts/supabase-user-password-set.ps1");
  const runner = read("scripts/supabase-user-password-set.mjs");

  assert.match(script, /Read-Host "Cole a SUPABASE_SERVICE_ROLE_KEY do projeto" -AsSecureString/);
  assert.match(script, /Remove-Item Env:DMR_ADMIN_SERVICE_ROLE_KEY/);
  assert.match(runner, /createClient\(supabaseUrl,\s*serviceRoleKey/);
  assert.match(runner, /supabase\.auth\.admin\.updateUserById/);
});

test("falha transitoria da sessao devolve a mensagem sem consumir tentativa", () => {
  const errorFunction = read("supabase/functions/bot-register-error/index.ts");

  assert.match(errorFunction, /falha_transitoria_sessao\?: boolean/);
  assert.match(errorFunction, /Math\.max\(0, attempts - 1\)/);
  assert.match(errorFunction, /status: "pendente"/);
  assert.match(errorFunction, /sessao_whatsapp_indisponivel/);
});

test("timeout ao abrir WhatsApp aciona reinicio supervisionado", () => {
  const bot = read("apps/whatsapp-bot/src/index.ts");

  assert.match(bot, /WHATSAPP_INITIALIZE_TIMEOUT_MS/);
  assert.match(bot, /initializeWhatsappWithTimeout/);
  assert.match(bot, /Tempo limite ao abrir o WhatsApp Web/);
  assert.match(bot, /if \(isWhatsappRuntimeUnavailable\(error\)\)/);
  assert.match(bot, /shutdownBot\("erro_inicializacao_transitorio", RESTART_EXIT_CODE, false\)/);
});


test("bot prefere Edge e mantem Chrome apenas como alternativa", () => {
  const bot = read("apps/whatsapp-bot/src/index.ts");
  const chromeIndex = bot.indexOf("Google\\\\Chrome\\\\Application\\\\chrome.exe");
  const edgeIndex = bot.indexOf("Microsoft\\\\Edge\\\\Application\\\\msedge.exe");

  assert.notEqual(chromeIndex, -1);
  assert.notEqual(edgeIndex, -1);
  assert.equal(edgeIndex < chromeIndex, true);
});
test("bot reinicia quando a pagina do WhatsApp vira erro de memoria", () => {
  const bot = read("apps/whatsapp-bot/src/index.ts");
  const runtimeHealth = read("apps/whatsapp-bot/src/runtime-health.ts");

  assert.match(runtimeHealth, /out of memory/);
  assert.match(runtimeHealth, /pagina_whatsapp_com_erro/);
  assert.match(bot, /findWhatsappRuntimeProblem/);
  assert.match(bot, /WHATSAPP_MAX_UPTIME_MINUTES/);
  assert.match(bot, /ensureWhatsappRuntimeOperational/);
  assert.match(bot, /runtime_degradado_no_heartbeat/);
  assert.match(bot, /runtime_degradado_na_verificacao/);
});

test("inicializador do bot usa supervisor oculto e identificado", () => {
  const launcher = read("Ligar Bot DMR.cmd");
  const starter = read("scripts/start-bot-background.ps1");
  const supervisor = read("scripts/bot-supervisor.ps1");
  const common = read("scripts/bot-background-common.ps1");
  const startScript = read("scripts/start-bot.ps1");

  assert.match(launcher, /start-bot-background\.ps1/);
  assert.match(launcher, /wait-and-show-bot-window\.ps1/);
  assert.match(starter, /WindowStyle\s+Hidden/i);
  assert.match(starter, /bot-supervisor\.ps1/);
  assert.match(common, /\.dmr-bot-supervisor\.json/);
  assert.match(common, /Test-BotSupervisorState/);
  assert.match(supervisor, /RESTART_EXIT_CODE|75/);
  assert.match(supervisor, /NPM_CONFIG_UPDATE_NOTIFIER/);
  assert.match(supervisor, /ErrorActionPreference\s*=\s*"Continue"/);
  assert.match(startScript, /NPM_CONFIG_UPDATE_NOTIFIER/);
});

test("status do bot diferencia online, inicializando, offline e falha", () => {
  const statusScript = read("scripts/status-bot.ps1");
  const statusLauncher = read("Status Bot DMR.cmd");

  assert.match(statusLauncher, /status-bot\.ps1/);
  assert.match(statusScript, /ONLINE/);
  assert.match(statusScript, /INICIANDO/);
  assert.match(statusScript, /AGUARDANDO LOGIN/);
  assert.match(statusScript, /OFFLINE/);
  assert.match(statusScript, /COM FALHA/);
  assert.match(statusScript, /bot_heartbeats/);
  assert.match(statusScript, /session-\$sessionId/);
  assert.match(statusScript, /AddMinutes\(-2\)/);
});

test("status do bot mostra a agenda automatica sem expor segredos", () => {
  const statusScript = read("scripts/status-bot.ps1");

  assert.match(statusScript, /DMR Bot - Iniciar/);
  assert.match(statusScript, /DMR Bot - Encerramento inteligente/);
  assert.match(statusScript, /NextRunTime/);
  assert.doesNotMatch(statusScript, /SUPABASE_DB_PASSWORD|DMR_BOT_TOKEN|sbp_[a-z0-9]+/i);
});

test("bot usa modo invisivel e preserva o login visual quando necessario", () => {
  const bot = read("apps/whatsapp-bot/src/index.ts");
  const envExample = read(".env.example");
  const windowScript = read("scripts/control-bot-window.ps1");
  const minimizeLauncher = read("Minimizar Bot DMR.cmd");
  const restoreLauncher = read("Mostrar Bot DMR.cmd");

  assert.match(envExample, /WHATSAPP_HEADLESS=true/);
  assert.match(bot, /--window-size=\$\{whatsappWindowWidth\},\$\{whatsappWindowHeight\}/);
  assert.match(bot, /--window-position=\$\{whatsappWindowX\},\$\{whatsappWindowY\}/);
  assert.match(windowScript, /ShowWindowAsync/);
  assert.match(windowScript, /SW_MINIMIZE/);
  assert.match(windowScript, /SW_RESTORE/);
  assert.match(windowScript, /WHATSAPP_SESSION_ID/);
  assert.match(windowScript, /IndexOf\(\$sessionPath/);
  assert.match(minimizeLauncher, /control-bot-window\.ps1/);
  assert.match(minimizeLauncher, /-Action minimize/);
  assert.match(restoreLauncher, /control-bot-window\.ps1/);
  assert.match(restoreLauncher, /-Action restore/);
});

test("desligamento oculto valida supervisor e nao encerra Node genericamente", () => {
  const stopScript = read("scripts/stop-bot-background.ps1");
  const stopLauncher = read("Desligar Bot DMR.cmd");

  assert.match(stopLauncher, /stop-bot-background\.ps1/);
  assert.match(stopScript, /Test-BotSupervisorState/);
  assert.match(stopScript, /ParentProcessId/);
  assert.match(stopScript, /WHATSAPP_SESSION_ID/);
  assert.match(stopScript, /IndexOf\(\$sessionPath/);
  assert.match(stopScript, /\.dmr-bot\.lock/);
  assert.match(stopScript, /node\.exe/);
  assert.match(stopScript, /dist\/index\\\.js/);
  assert.doesNotMatch(stopScript, /taskkill\s+\/IM\s+node\.exe/i);
  assert.doesNotMatch(stopScript, /Stop-Process\s+-Name\s+node/i);
});


test("bot trata sessao presa como reinicio automatico", () => {
  const startScript = read("scripts/start-bot.ps1");
  const supervisor = read("scripts/bot-supervisor.ps1");

  assert.match(startScript, /\$RESTART_EXIT_CODE\s*=\s*75/);
  assert.match(startScript, /A sessao do bot ja esta aberta em outro navegador/);
  assert.match(startScript, /Exit-BotRuntime -Code \$RESTART_EXIT_CODE/);
  assert.match(supervisor, /consecutiveRestarts/);
  assert.match(supervisor, /Math\]::Min\(60/);
  assert.match(supervisor, /Nova tentativa em \$retryDelaySeconds segundos/);
});

test("inicializacao do bot compacta apenas caches descartaveis e preserva autenticacao", () => {
  const startScript = read("scripts/start-bot.ps1");
  const maintenanceScript = read("scripts/maintain-whatsapp-profile.ps1");
  const bot = read("apps/whatsapp-bot/src/index.ts");

  assert.match(startScript, /maintain-whatsapp-profile\.ps1/);
  assert.match(startScript, /-SessionPath\s+\$sessionPath/);
  assert.match(maintenanceScript, /Default\\Cache/);
  assert.match(maintenanceScript, /Default\\Code Cache/);
  assert.match(maintenanceScript, /Crashpad\\reports/);
  assert.match(maintenanceScript, /component_crx_cache/);
  assert.match(maintenanceScript, /Test-PathWithinRoot/);
  assert.doesNotMatch(maintenanceScript, /Remove-Item[^\r\n]*(IndexedDB|Cookies|Local Storage|Session Storage)/i);
  assert.match(bot, /--disk-cache-size=\d+/);
  assert.match(bot, /--media-cache-size=\d+/);
  assert.doesNotMatch(bot, /--disable-background-timer-throttling/);
  assert.doesNotMatch(bot, /--disable-backgrounding-occluded-windows/);
  assert.doesNotMatch(bot, /--disable-renderer-backgrounding/);
});

test("login visual tambem prefere Edge e mantem Chrome como alternativa", () => {
  const loginScript = read("scripts/whatsapp-login.ps1");
  const chromeIndex = loginScript.indexOf("Google\\Chrome\\Application\\chrome.exe");
  const edgeIndex = loginScript.indexOf("Microsoft\\Edge\\Application\\msedge.exe");

  assert.notEqual(chromeIndex, -1);
  assert.notEqual(edgeIndex, -1);
  assert.equal(edgeIndex < chromeIndex, true);
});

test("status do bot prioriza tentativa ativa antes de erro transitorio antigo", () => {
  const statusScript = read("scripts/status-bot.ps1");
  const waitingIndex = statusScript.indexOf('STATUS: AGUARDANDO LOGIN');
  const errorIndex = statusScript.indexOf('STATUS: COM FALHA');

  assert.notEqual(waitingIndex, -1);
  assert.notEqual(errorIndex, -1);
  assert.equal(waitingIndex < errorIndex, true);
});
test("dashboard aplica ordenacao nominal central e permite desmarcar toda a equipe", () => {
  const dashboardPage = read("apps/dashboard/app/page.tsx");

  assert.match(dashboardPage, /import \{\s*compareCompanyScheduleNameRows,\s*compareNamesPtBr,\s*comparePanelRows,\s*sortByName\s*\} from "\.\.\/src\/lib\/sort"/);
  assert.match(dashboardPage, /empresas:\s*sortByName\(empresas/);
  assert.match(dashboardPage, /colaboradores:\s*sortByName\(colaboradores/);
  assert.match(dashboardPage, /contatos:\s*sortByName\(contatos/);
  assert.match(dashboardPage, /const equipeFixa = sortByName\(/);
  assert.match(dashboardPage, /\.sort\(compareCompanyScheduleNameRows\)/);
  assert.match(dashboardPage, /rows: \[\.\.\.group\.rows\]\.sort\(comparePanelRows\)/);
  assert.match(dashboardPage, />Desmarcar todos<\/button>/);
  assert.match(dashboardPage, /disabled=\{colaboradoresSelecionados\.length === 0\}/);
  assert.match(dashboardPage, /setColaboradoresSelecionados\(\[\]\)/);
});

test("formularios operacionais usam submit controlado no cliente", () => {
  const dashboardPage = read("apps/dashboard/app/page.tsx");

  assert.match(dashboardPage, /async function submitEmpresa\(event: FormEvent<HTMLFormElement>\)/);
  assert.match(dashboardPage, /async function submitHorario\(event: FormEvent<HTMLFormElement>\)/);
  assert.match(dashboardPage, /async function submitColaborador\(event: FormEvent<HTMLFormElement>\)/);
  assert.match(dashboardPage, /async function submitColaboradoresLote\(event: FormEvent<HTMLFormElement>\)/);
  assert.match(dashboardPage, /async function submitContato\(event: FormEvent<HTMLFormElement>\)/);
  assert.match(dashboardPage, /<form onSubmit=\{submitColaborador\} className="form-grid">/);
  assert.match(dashboardPage, /<form onSubmit=\{submitColaboradoresLote\} className="grid">/);
  assert.doesNotMatch(dashboardPage, /<form action=\{onCreate\}/);
  assert.doesNotMatch(dashboardPage, /<form action=\{onCreateBatch\}/);
});

test("dashboard hospedado usa Supabase Auth sem expor secrets privados", () => {
  const supabaseClient = read("apps/dashboard/src/lib/supabase.ts");
  const dashboardPage = read("apps/dashboard/app/page.tsx");
  const firstMigration = read("supabase/migrations/20260618000100_dmr_confirmacao_presenca.sql");
  const rlsMigration = read("supabase/migrations/20260620000400_rls_hardening.sql");
  const netlifyConfig = read("netlify.toml");
  const nextConfig = read("apps/dashboard/next.config.ts");
  const dashboardSource = `${supabaseClient}\n${dashboardPage}`;

  assert.match(supabaseClient, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(supabaseClient, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(dashboardPage, /signInWithPassword/);
  assert.match(dashboardPage, /resetPasswordForEmail/);
  assert.match(dashboardPage, /updateUser/);
  assert.match(dashboardPage, /getSession/);
  assert.match(dashboardPage, /onAuthStateChange/);
  assert.match(firstMigration, /create table if not exists public\.usuarios_dashboard/);
  assert.match(firstMigration, /auth\.uid\(\)/);
  assert.match(rlsMigration, /create policy usuarios_dashboard_select/);
  assert.match(netlifyConfig, /npm run build -w packages\/core && npm run build -w apps\/dashboard/);
  assert.match(netlifyConfig, /publish\s*=\s*"apps\/dashboard\/out"/);
  assert.match(netlifyConfig, /X-Frame-Options\s*=\s*"DENY"/);
  assert.match(netlifyConfig, /X-Content-Type-Options\s*=\s*"nosniff"/);
  assert.match(nextConfig, /output:\s*"export"/);

  assert.doesNotMatch(dashboardSource, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE|SERVICE_ROLE|DMR_BOT_TOKEN|SUPABASE_DB_PASSWORD|sbp_/);
  assert.doesNotMatch(netlifyConfig, /SUPABASE_SERVICE_ROLE_KEY|DMR_BOT_TOKEN|SUPABASE_DB_PASSWORD|sbp_/);
});

test("novos fluxos operacionais nao expõem credenciais nem usam dialogos nativos", () => {
  const frontend = [
    "apps/dashboard/app/page.tsx",
    "apps/dashboard/src/components/ScheduleEditor.tsx",
    "apps/dashboard/src/components/ScheduleExceptionDialog.tsx",
    "apps/dashboard/src/components/OperationTreatmentDialog.tsx",
    "apps/dashboard/src/components/RelocationDialog.tsx",
    "apps/dashboard/src/components/AnnouncementDialog.tsx",
  ].map(read).join("\n");

  assert.doesNotMatch(frontend, /service_role|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.doesNotMatch(frontend, /DMR_BOT_TOKEN/i);
  assert.doesNotMatch(frontend, /window\.(prompt|alert)\(/);
});
