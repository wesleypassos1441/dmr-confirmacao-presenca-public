# Agendamento Inteligente do Bot DMR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar o bot automaticamente às 05:50 de segunda a sexta, recuperar com segurança os colaboradores programados e liberar a memória do WhatsApp Web após 16:00 somente quando o trabalho operacional estiver concluído.

**Architecture:** O Supabase continuará sendo a fonte de verdade e ganhará duas funções internas: limpeza de filas expiradas e resumo do trabalho operacional atual. Uma Edge Function protegida por `DMR_BOT_TOKEN` exporá somente esse resumo ao computador local. Duas tarefas do Agendador do Windows iniciarão o bot e executarão um guardião leve que mantém ou encerra o navegador conforme o trabalho real do dia.

**Tech Stack:** PostgreSQL/Supabase migrations, Supabase Edge Functions com Deno/TypeScript, Node.js tests, PowerShell 5.1, Agendador de Tarefas do Windows, whatsapp-web.js.

---

## Estrutura de arquivos

- `supabase/migrations/20260724000100_bot_operational_schedule.sql`: classifica operações válidas, cancela filas antigas e resume trabalho pendente.
- `supabase/functions/bot-operational-status/index.ts`: endpoint interno usado pelo guardião local.
- `supabase/functions/bot-next-message/index.ts`: limpa filas expiradas antes de selecionar a próxima mensagem.
- `scripts/bot-schedule-common.ps1`: leitura segura do `.env`, consulta operacional e cálculos de horário.
- `scripts/bot-smart-guardian.ps1`: mantém o bot ligado enquanto houver trabalho e o desliga quando estiver ocioso após 16:00.
- `scripts/install-bot-schedule.ps1`: instala ou atualiza as duas tarefas do Windows.
- `scripts/status-bot-schedule.ps1`: mostra próxima execução e resultado das tarefas.
- `scripts/remove-bot-schedule.ps1`: remove somente as tarefas DMR.
- `Instalar Agenda Bot DMR.cmd`, `Status Agenda Bot DMR.cmd`, `Remover Agenda Bot DMR.cmd`: atalhos de uso leigo.
- `tests/bot-operational-schedule.test.mjs`: contrato estático da migration e da Edge Function.
- `tests/bot-windows-schedule.test.mjs`: contrato e funções puras dos scripts PowerShell.
- `docs/WHATSAPP_BOT.md`: procedimento operacional e limitações externas.

### Task 1: Validar e registrar o checkpoint atual

**Files:**
- Include: `.env.example`
- Include: `Ligar Bot DMR.cmd`
- Include: `Minimizar Bot DMR.cmd`
- Include: `Mostrar Bot DMR.cmd`
- Include: `apps/whatsapp-bot/src/index.ts`
- Include: `apps/whatsapp-bot/src/runtime-health.ts`
- Include: `scripts/bot-supervisor.ps1`
- Include: `scripts/control-bot-window.ps1`
- Include: `scripts/start-bot.ps1`
- Include: `scripts/status-bot.ps1`
- Include: `scripts/stop-bot-background.ps1`
- Include: `scripts/wait-and-show-bot-window.ps1`
- Include: `scripts/whatsapp-login.ps1`
- Include: `tests/bot-runtime-health.test.mjs`
- Include: `tests/static-security.test.mjs`
- Include: `tests/whatsapp-login-flow.test.mjs`
- Include: `docs/superpowers/specs/2026-07-24-agendamento-inteligente-bot-design.md`
- Include: `docs/superpowers/plans/2026-07-24-agendamento-inteligente-bot.md`

- [ ] **Step 1: Inspecionar somente as alterações atuais**

Run: `git status --short` and `git diff --check`

Expected: apenas os arquivos conhecidos acima; nenhuma chave, `.env`, sessão do WhatsApp ou log rastreado.

- [ ] **Step 2: Executar a validação de base**

Run: `npm test`

Expected: todos os testes existentes passam.

Run: `npm run typecheck`

Expected: saída sem erros TypeScript.

Run: `npm run build -w apps/whatsapp-bot`

Expected: build concluído.

Run: `npm run secrets:scan`

Expected: `secret scan passed`.

- [ ] **Step 3: Criar o checkpoint sem incluir dados locais**

```powershell
git add .env.example "Ligar Bot DMR.cmd" "Minimizar Bot DMR.cmd" "Mostrar Bot DMR.cmd"
git add apps/whatsapp-bot/src/index.ts apps/whatsapp-bot/src/runtime-health.ts
git add scripts/bot-supervisor.ps1 scripts/control-bot-window.ps1 scripts/start-bot.ps1 scripts/status-bot.ps1
git add scripts/stop-bot-background.ps1 scripts/wait-and-show-bot-window.ps1 scripts/whatsapp-login.ps1
git add tests/bot-runtime-health.test.mjs tests/static-security.test.mjs tests/whatsapp-login-flow.test.mjs
git add docs/superpowers/specs/2026-07-24-agendamento-inteligente-bot-design.md
git add docs/superpowers/plans/2026-07-24-agendamento-inteligente-bot.md
git commit -m "chore: checkpoint bot runtime before scheduling"
```

Expected: commit criado; `.env`, `.wwebjs_auth`, logs e tokens permanecem fora do Git.

### Task 2: Proteger a retomada da fila no banco

**Files:**
- Create: `tests/bot-operational-schedule.test.mjs`
- Create: `supabase/migrations/20260724000100_bot_operational_schedule.sql`

- [ ] **Step 1: Escrever o teste de contrato que inicialmente falha**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260724000100_bot_operational_schedule.sql", import.meta.url);

test("migration protege a retomada e o desligamento inteligente", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create or replace function public\.dmr_cancelar_filas_expiradas_bot/i);
  assert.match(sql, /create or replace function public\.dmr_status_operacional_bot/i);
  assert.match(sql, /e\.data = v_local_today - 1[\s\S]+horario_inicio_disparo > ec\.horario_inicio/i);
  assert.match(sql, /e\.data < v_local_today/i);
  assert.match(sql, /status in \('pendente', 'processando'\)/i);
  assert.match(sql, /relatorio_diario/i);
  assert.match(sql, /grant execute on function public\.dmr_status_operacional_bot/i);
});
```

- [ ] **Step 2: Confirmar a falha pelo arquivo ausente**

Run: `node --test tests/bot-operational-schedule.test.mjs`

Expected: FAIL com `ENOENT` para a migration nova.

- [ ] **Step 3: Criar a migration com funções internas determinísticas**

Implementar `dmr_cancelar_filas_expiradas_bot(p_agora timestamptz default now())` com esta regra central:

```sql
with expiradas as (
  select fm.id
  from public.fila_mensagens fm
  join public.escala_colaboradores ec on ec.id = fm.escala_colaborador_id
  join public.escalas e on e.id = ec.escala_id
  where fm.status in ('pendente', 'processando')
    and e.data < v_local_today
    and not (
      e.data = v_local_today - 1
      and ec.horario_inicio_disparo > ec.horario_inicio
    )
), atualizadas as (
  update public.fila_mensagens fm
  set status = 'cancelada',
      processando_em = null,
      ultimo_erro = 'Fila expirada: a operação pertence a uma data encerrada.',
      atualizado_em = p_agora
  where fm.id in (select id from expiradas)
  returning 1
)
select count(*) into v_canceladas from atualizadas;
```

A função preserva programações futuras porque a atualização alcança exclusivamente `e.data < v_local_today`. Nenhum `UPDATE` ou `DELETE` pode usar somente `agendado_para <= p_agora` como critério de expiração.

Implementar `dmr_status_operacional_bot(p_agora timestamptz default now())` retornando o contrato:

```sql
return jsonb_build_object(
  'tem_trabalho', (v_filas + v_etapas + v_relatorios) > 0,
  'filas_pendentes', v_filas,
  'etapas_pendentes', v_etapas,
  'relatorios_pendentes', v_relatorios,
  'filas_expiradas_canceladas', v_canceladas,
  'data_local', v_local_today
);
```

O conjunto de operações válidas deve ser idêntico ao gerador atual:

```sql
where (
    e.data = v_local_today
    or (
      e.data = v_local_today - 1
      and ec.horario_inicio_disparo > ec.horario_inicio
    )
  )
  and ec.horario_inicio_disparo is not null
  and emp.ativa
  and c.ativo
  and t.ativo
```

Contar como etapa pendente somente trabalho ainda executável:

```sql
and ec.status_confirmacao not in ('confirmado', 'nao_comparecera', 'cancelado', 'tratado_manualmente')
and (
  ec.mensagem_enviada_em is null
  or (ec.respondido_em is null and ec.segundo_lembrete_enviado_em is null)
  or (
    v_contatos_ativos > 0
    and ec.status_confirmacao <> 'resposta_incompreensivel'
    and ec.respondido_em is null
    and ec.alerta_sem_resposta_enviado_em is null
  )
  or (
    v_contatos_ativos > 0
    and ec.status_confirmacao = 'resposta_incompreensivel'
    and ec.alerta_incompreensivel_enviado_em is null
  )
)
```

Para relatórios, agrupar por escala e turno, escolher o mesmo representante usado pelo relatório atual e exigir uma mensagem `enviada` para cada contato de alerta ativo. Filas `pendente` e `processando` devem manter `tem_trabalho = true`.

Finalizar permissões sem expor as funções ao frontend:

```sql
revoke all on function public.dmr_cancelar_filas_expiradas_bot(timestamptz) from public;
revoke all on function public.dmr_status_operacional_bot(timestamptz) from public;
grant execute on function public.dmr_cancelar_filas_expiradas_bot(timestamptz) to service_role;
grant execute on function public.dmr_status_operacional_bot(timestamptz) to service_role;
```

- [ ] **Step 4: Rodar o teste de contrato**

Run: `node --test tests/bot-operational-schedule.test.mjs`

Expected: PASS.

- [ ] **Step 5: Validar SQL localmente quando o Docker permitir**

Run: `npx supabase db reset`

Expected: todas as migrations aplicadas sem erro.

Run: `npx supabase db lint`

Expected: nenhum erro SQL. Se o Docker não estiver disponível, registrar o impedimento e exigir `npx supabase db push --dry-run` antes do deploy remoto.

- [ ] **Step 6: Commit da camada de banco**

```powershell
git add tests/bot-operational-schedule.test.mjs supabase/migrations/20260724000100_bot_operational_schedule.sql
git commit -m "feat: add bot operational queue status"
```

### Task 3: Expor o estado operacional somente ao bot

**Files:**
- Create: `supabase/functions/bot-operational-status/index.ts`
- Modify: `supabase/functions/bot-next-message/index.ts`
- Modify: `scripts/supabase-functions-deploy.ps1`
- Modify: `tests/bot-operational-schedule.test.mjs`

- [ ] **Step 1: Ampliar o teste para exigir endpoint, token e limpeza anterior à seleção**

```js
const statusFunction = await readFile(new URL("../supabase/functions/bot-operational-status/index.ts", import.meta.url), "utf8");
const nextFunction = await readFile(new URL("../supabase/functions/bot-next-message/index.ts", import.meta.url), "utf8");
const deployScript = await readFile(new URL("../scripts/supabase-functions-deploy.ps1", import.meta.url), "utf8");

assert.match(statusFunction, /requireBotToken\(req\)/);
assert.match(statusFunction, /rpc\("dmr_status_operacional_bot"\)/);
assert.match(nextFunction, /rpc\("dmr_cancelar_filas_expiradas_bot"\)/);
assert.ok(nextFunction.indexOf("dmr_cancelar_filas_expiradas_bot") < nextFunction.indexOf('.from("fila_mensagens")'));
assert.match(deployScript, /bot-operational-status/);
```

- [ ] **Step 2: Confirmar que o teste falha**

Run: `node --test tests/bot-operational-schedule.test.mjs`

Expected: FAIL porque a Edge Function ainda não existe.

- [ ] **Step 3: Criar a Edge Function protegida**

```ts
import { handleOptions, jsonResponse, requireBotToken, safeError } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse(405, { error: "Metodo nao permitido." });
  if (!requireBotToken(req)) return jsonResponse(401, { error: "Token obrigatorio." });

  try {
    const { data, error } = await serviceClient().rpc("dmr_status_operacional_bot");
    if (error) throw error;
    return jsonResponse(200, { sucesso: true, operacional: data });
  } catch (error) {
    return jsonResponse(500, safeError(error));
  }
});
```

- [ ] **Step 4: Limpar filas antigas antes de buscar mensagens**

Adicionar em `bot-next-message`, imediatamente antes de `gerar_fila_confirmacoes`:

```ts
const { error: cleanupError } = await supabase.rpc("dmr_cancelar_filas_expiradas_bot");
if (cleanupError) throw cleanupError;
```

Adicionar `bot-operational-status` ao array `$botFunctions` do deploy.

- [ ] **Step 5: Rodar testes e typecheck**

Run: `node --test tests/bot-operational-schedule.test.mjs tests/static-security.test.mjs`

Expected: PASS.

Run: `npm run typecheck`

Expected: sem erros.

- [ ] **Step 6: Commit da API interna**

```powershell
git add supabase/functions/bot-operational-status/index.ts supabase/functions/bot-next-message/index.ts
git add scripts/supabase-functions-deploy.ps1 tests/bot-operational-schedule.test.mjs
git commit -m "feat: expose protected bot operational status"
```

### Task 4: Criar o guardião leve após 16:00

**Files:**
- Create: `scripts/bot-schedule-common.ps1`
- Create: `scripts/bot-smart-guardian.ps1`
- Create: `tests/bot-windows-schedule.test.mjs`

- [ ] **Step 1: Escrever testes para o contrato dos scripts**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const common = await readFile(new URL("../scripts/bot-schedule-common.ps1", import.meta.url), "utf8");
const guardian = await readFile(new URL("../scripts/bot-smart-guardian.ps1", import.meta.url), "utf8");

test("guardiao consulta o banco sem expor segredo na linha de comando", () => {
  assert.match(common, /EDGE_FUNCTIONS_BASE_URL/);
  assert.match(common, /DMR_BOT_TOKEN/);
  assert.match(common, /x-dmr-bot-token/);
  assert.match(common, /bot-operational-status/);
  assert.doesNotMatch(guardian, /sbp_[a-z0-9]+/i);
  assert.doesNotMatch(guardian, /SUPABASE_DB_PASSWORD/);
});

test("guardiao mantém o bot para trabalho e o encerra quando ocioso", () => {
  assert.match(guardian, /tem_trabalho/);
  assert.match(guardian, /start-bot-background\.ps1/);
  assert.match(guardian, /stop-bot-background\.ps1/);
  assert.match(guardian, /Start-Sleep/);
  assert.match(common, /AddHours\(5\)[\s\S]+AddMinutes\(45\)/);
});
```

- [ ] **Step 2: Confirmar a falha inicial**

Run: `node --test tests/bot-windows-schedule.test.mjs`

Expected: FAIL com arquivo ausente.

- [ ] **Step 3: Implementar utilitários sem efeitos colaterais ao importar**

`bot-schedule-common.ps1` deve oferecer:

```powershell
function Import-BotScheduleEnvironment {
  $envPath = Join-Path $script:BotRoot ".env"
  if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Arquivo .env do bot nao encontrado."
  }
  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^\s*([^#][^=]*)=(.*)$') {
      [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim('"'), "Process")
    }
  }
}

function Get-BotOperationalStatus {
  Import-BotScheduleEnvironment
  if (-not $env:EDGE_FUNCTIONS_BASE_URL -or -not $env:DMR_BOT_TOKEN) {
    throw "EDGE_FUNCTIONS_BASE_URL e DMR_BOT_TOKEN sao obrigatorios no .env."
  }
  $uri = "$($env:EDGE_FUNCTIONS_BASE_URL.TrimEnd('/'))/bot-operational-status"
  $headers = @{ "x-dmr-bot-token" = $env:DMR_BOT_TOKEN }
  $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -ContentType "application/json" -Body "{}" -TimeoutSec 20
  return $response.operacional
}

function Get-BotGuardianDeadline([datetime]$Now = (Get-Date)) {
  return $Now.Date.AddDays(1).AddHours(5).AddMinutes(45)
}
```

- [ ] **Step 4: Implementar o guardião com falha segura**

O script deve aceitar `-SinglePass` e `-PollSeconds` para teste, encerrar apenas o bot identificado e nunca desligar o computador:

```powershell
param(
  [int]$PollSeconds = 300,
  [switch]$SinglePass
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "bot-background-common.ps1")
. (Join-Path $PSScriptRoot "bot-schedule-common.ps1")

$deadline = Get-BotGuardianDeadline
do {
  try {
    $operational = Get-BotOperationalStatus
    if ([bool]$operational.tem_trabalho) {
      & (Join-Path $PSScriptRoot "start-bot-background.ps1")
      Write-BotBackgroundLog "Guardiao manteve o bot ativo: trabalho operacional pendente."
    } else {
      & (Join-Path $PSScriptRoot "stop-bot-background.ps1")
      Write-BotBackgroundLog "Guardiao liberou o navegador: nenhum trabalho operacional pendente."
    }
  } catch {
    Write-BotBackgroundLog "Guardiao nao alterou o bot porque a verificacao falhou: $($_.Exception.Message)"
  }

  if ($SinglePass) { break }
  Start-Sleep -Seconds $PollSeconds
} while ((Get-Date) -lt $deadline)
```

- [ ] **Step 5: Rodar os testes**

Run: `node --test tests/bot-windows-schedule.test.mjs`

Expected: PASS.

Validar sintaxe:

```powershell
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path "scripts/bot-schedule-common.ps1"), [ref]$null, [ref]$errors) | Out-Null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path "scripts/bot-smart-guardian.ps1"), [ref]$null, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { throw ($errors | Out-String) }
```

Expected: nenhuma exceção.

- [ ] **Step 6: Commit do guardião**

```powershell
git add scripts/bot-schedule-common.ps1 scripts/bot-smart-guardian.ps1 tests/bot-windows-schedule.test.mjs
git commit -m "feat: add smart bot shutdown guardian"
```

### Task 5: Instalar e administrar as tarefas do Windows

**Files:**
- Create: `scripts/install-bot-schedule.ps1`
- Create: `scripts/status-bot-schedule.ps1`
- Create: `scripts/remove-bot-schedule.ps1`
- Create: `Instalar Agenda Bot DMR.cmd`
- Create: `Status Agenda Bot DMR.cmd`
- Create: `Remover Agenda Bot DMR.cmd`
- Modify: `tests/bot-windows-schedule.test.mjs`

- [ ] **Step 1: Exigir agenda semanal e configuração segura nos testes**

Adicionar ao teste:

```js
const installer = await readFile(new URL("../scripts/install-bot-schedule.ps1", import.meta.url), "utf8");
const remover = await readFile(new URL("../scripts/remove-bot-schedule.ps1", import.meta.url), "utf8");

assert.match(installer, /Monday.*Tuesday.*Wednesday.*Thursday.*Friday/s);
assert.match(installer, /05:50/);
assert.match(installer, /16:00/);
assert.match(installer, /StartWhenAvailable/i);
assert.match(installer, /WakeToRun/i);
assert.match(installer, /MultipleInstances\s+IgnoreNew/i);
assert.match(installer, /LogonType\s+Interactive/i);
assert.match(remover, /Unregister-ScheduledTask/);
assert.doesNotMatch(installer, /DMR_BOT_TOKEN\s*=/i);
```

- [ ] **Step 2: Confirmar a falha inicial**

Run: `node --test tests/bot-windows-schedule.test.mjs`

Expected: FAIL porque os scripts ainda não existem.

- [ ] **Step 3: Implementar instalação idempotente**

O instalador deve usar os nomes fixos abaixo:

```powershell
$startTaskName = "DMR Bot - Iniciar"
$guardianTaskName = "DMR Bot - Encerramento inteligente"
$weekdays = @("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
$powershellExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$startAction = New-ScheduledTaskAction -Execute $powershellExe -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\start-bot-background.ps1`""
$startTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $weekdays -At "05:50"
$startSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $startTaskName -Action $startAction -Trigger $startTrigger -Settings $startSettings -Principal $principal -Force | Out-Null
```

Registrar a segunda tarefa às 16:00, chamando `bot-smart-guardian.ps1`, com limite de execução de 14 horas e `MultipleInstances IgnoreNew`.

- [ ] **Step 4: Implementar status e remoção restrita**

O status deve consultar somente os dois nomes fixos:

```powershell
foreach ($taskName in @("DMR Bot - Iniciar", "DMR Bot - Encerramento inteligente")) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Host "$taskName: NAO INSTALADA" -ForegroundColor Yellow
    continue
  }
  $info = Get-ScheduledTaskInfo -TaskName $taskName
  Write-Host "$taskName: $($task.State)"
  Write-Host "Proxima execucao: $($info.NextRunTime.ToString('dd/MM/yyyy HH:mm'))"
  Write-Host "Ultimo resultado: $($info.LastTaskResult)"
}
```

A remoção deve executar `Unregister-ScheduledTask -TaskName $taskName -Confirm:$false` somente para esses dois nomes.

- [ ] **Step 5: Criar atalhos CMD**

Cada atalho deve resolver `%~dp0`, chamar seu script com `powershell -NoProfile -ExecutionPolicy Bypass -File` e finalizar com `pause` para mostrar o resultado ao usuário.

- [ ] **Step 6: Rodar teste e parser PowerShell**

Run: `node --test tests/bot-windows-schedule.test.mjs`

Expected: PASS.

Run: parser PowerShell nos três scripts novos.

Expected: nenhum erro sintático.

- [ ] **Step 7: Commit da agenda**

```powershell
git add scripts/install-bot-schedule.ps1 scripts/status-bot-schedule.ps1 scripts/remove-bot-schedule.ps1
git add "Instalar Agenda Bot DMR.cmd" "Status Agenda Bot DMR.cmd" "Remover Agenda Bot DMR.cmd"
git add tests/bot-windows-schedule.test.mjs
git commit -m "feat: automate bot weekday schedule"
```

### Task 6: Integrar status e documentação operacional

**Files:**
- Modify: `scripts/status-bot.ps1`
- Modify: `docs/WHATSAPP_BOT.md`
- Modify: `.env.example`
- Modify: `tests/static-security.test.mjs`

- [ ] **Step 1: Escrever teste para informações da agenda**

Adicionar em `tests/static-security.test.mjs`:

```js
test("status do bot mostra a agenda automatica sem expor segredos", () => {
  const statusScript = read("scripts/status-bot.ps1");
  assert.match(statusScript, /DMR Bot - Iniciar/);
  assert.match(statusScript, /NextRunTime/);
  assert.doesNotMatch(statusScript, /SUPABASE_DB_PASSWORD/);
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `node --test tests/static-security.test.mjs`

Expected: FAIL porque o status ainda não mostra a agenda.

- [ ] **Step 3: Reusar a leitura do `.env` e acrescentar resumo da agenda**

Mover a leitura duplicada do `.env` para `bot-background-common.ps1` ou chamar `Import-BotScheduleEnvironment`. Depois do status online/offline, mostrar tarefa instalada, próxima execução e última execução sem imprimir valores do ambiente.

- [ ] **Step 4: Documentar uso leigo e limites**

Registrar em `docs/WHATSAPP_BOT.md`:

- computador ligado ou suspenso, não completamente desligado;
- usuário conectado ao Windows, podendo deixar a tela bloqueada;
- segunda a sexta, início às 05:50;
- verificação inteligente após 16:00;
- programações e respostas continuam salvas no Supabase;
- como instalar, consultar e remover a agenda;
- como reconhecer `ONLINE`, `AGUARDANDO LOGIN`, `OFFLINE` e falha de rede.

Acrescentar ao `.env.example` apenas parâmetros não secretos configuráveis:

```dotenv
BOT_SCHEDULE_START=05:50
BOT_SCHEDULE_GUARDIAN_START=16:00
BOT_SCHEDULE_GUARDIAN_END=05:45
BOT_SCHEDULE_POLL_SECONDS=300
```

- [ ] **Step 5: Rodar testes e scan de segredos**

Run: `node --test tests/static-security.test.mjs tests/bot-windows-schedule.test.mjs`

Expected: PASS.

Run: `npm run secrets:scan`

Expected: `secret scan passed`.

- [ ] **Step 6: Commit de status e documentação**

```powershell
git add scripts/status-bot.ps1 scripts/bot-background-common.ps1 docs/WHATSAPP_BOT.md .env.example tests/static-security.test.mjs
git commit -m "docs: expose smart bot schedule status"
```

### Task 7: Verificação completa antes do deploy

**Files:**
- Verify only: entire repository

- [ ] **Step 1: Rodar todos os testes**

Run: `npm test`

Expected: todos os testes passam, inclusive os novos contratos de banco e Windows.

- [ ] **Step 2: Validar tipos, builds e segredos**

Run: `npm run typecheck`

Expected: sem erros.

Run: `npm run build`

Expected: core, dashboard e bot compilados.

Run: `npm run secrets:scan`

Expected: `secret scan passed`.

- [ ] **Step 3: Validar formatação e PowerShell**

Run: `git diff --check`

Expected: nenhuma falha de whitespace.

Executar o parser PowerShell em todos os arquivos de `scripts/*.ps1`.

Expected: zero erros sintáticos.

- [ ] **Step 4: Validar migrations**

Run: `npx supabase db lint`

Expected: nenhum erro quando o Docker estiver disponível.

Run: `npx supabase db push --dry-run`

Expected: somente `20260724000100_bot_operational_schedule.sql` pendente.

### Task 8: Deploy controlado e instalação da agenda

**Files:**
- Deploy: `supabase/migrations/20260724000100_bot_operational_schedule.sql`
- Deploy: `supabase/functions/bot-operational-status/index.ts`
- Deploy: `supabase/functions/bot-next-message/index.ts`
- Install locally: Windows Scheduled Tasks

- [ ] **Step 1: Autenticar sem registrar tokens no histórico**

Usar `Read-Host -AsSecureString`, converter somente durante a chamada do CLI e limpar a variável logo depois. Não colocar token `sbp_` no texto do comando, em arquivos ou no plano.

- [ ] **Step 2: Aplicar a migration**

Run: `powershell -ExecutionPolicy Bypass -File scripts/supabase-deploy.ps1`

Expected: migration aplicada; nenhuma migration inesperada.

- [ ] **Step 3: Publicar as Edge Functions**

Run: `powershell -ExecutionPolicy Bypass -File scripts/supabase-functions-deploy.ps1`

Expected: `bot-operational-status` e `bot-next-message` com status `ACTIVE`.

- [ ] **Step 4: Consultar o novo endpoint com o `.env` local**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bot-smart-guardian.ps1 -SinglePass`

Expected: consulta concluída; o bot é mantido ou encerrado conforme o resumo remoto; nenhum segredo aparece.

- [ ] **Step 5: Instalar as tarefas**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-bot-schedule.ps1`

Expected: duas tarefas instaladas para segunda a sexta, 05:50 e 16:00.

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/status-bot-schedule.ps1`

Expected: próxima execução e último resultado das duas tarefas.

- [ ] **Step 6: Validar uma operação controlada**

Criar pelo dashboard uma operação futura de teste com dois colaboradores autorizados, horário de disparo alguns minutos à frente e data do dia. Iniciar o bot, confirmar que ambos entram na fila, reiniciar o bot antes do envio e verificar que ambos são retomados uma única vez. Responder por um contato e confirmar que os lembretes dele são cancelados sem afetar o segundo contato.

- [ ] **Step 7: Confirmar liberação de memória**

Sem trabalho operacional após 16:00, executar o guardião em modo normal e verificar:

- supervisor removido;
- processos do perfil WhatsApp encerrados;
- estado `OFFLINE` no status local;
- tarefas continuam instaladas para o próximo dia útil;
- programações futuras permanecem no dashboard.

- [ ] **Step 8: Commit final de eventuais ajustes de validação**

```powershell
git status --short
git add docs/WHATSAPP_BOT.md tests
git commit -m "test: verify scheduled bot recovery flow"
```

Somente criar esse commit se a validação realmente gerar ajustes versionáveis; não criar commit vazio.
