# Equipe Fixa, Reenvio e Agenda de Disparos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir revisão da equipe fixa antes da fila diária, reenvio imediato somente para pendentes e agenda automática baseada em horários `:00` e `:30`, com alerta 1h30 antes da entrada.

**Architecture:** O Supabase será a autoridade para criação idempotente da operação diária, cálculo da agenda, elegibilidade do reenvio e auditoria. O dashboard manterá apenas o estado de seleção da revisão e chamará RPCs transacionais. O pacote core espelhará a agenda do banco para testes unitários determinísticos, enquanto as Edge Functions continuarão consumindo `fila_mensagens`.

**Tech Stack:** Next.js/React, TypeScript, Supabase Postgres/PLpgSQL, Supabase Edge Functions/Deno, Node test runner, Playwright.

**Repository note:** Este diretório não possui metadados Git. As etapas de commit são substituídas por checkpoints de teste e inspeção de arquivos.

---

## File Structure

- Modify: `packages/core/src/index.mjs` — cálculo puro da agenda fixa.
- Modify: `packages/core/src/index.d.ts` — contrato TypeScript da nova agenda.
- Modify: `tests/core.test.mjs` — testes unitários de horários e elegibilidade.
- Create: `supabase/migrations/20260622000200_add_manual_resend_queue_type.sql` — adiciona o novo tipo da fila e encerra a transação.
- Create: `supabase/migrations/20260622000300_daily_team_resend_fixed_schedule.sql` — RPCs, índices, agenda, equipe fixa e auditoria.
- Modify: `apps/dashboard/app/page.tsx` — revisão da equipe diária e ação Reenviar.
- Modify: `apps/dashboard/app/globals.css` — layout compacto da revisão e estados dos botões.
- Modify: `supabase/functions/bot-mark-sent/index.ts` — reenvio não altera os marcadores automáticos.
- Modify: `supabase/functions/bot-register-incoming/index.ts` — resposta válida cancela reenvios pendentes.
- Modify: `tests/static-security.test.mjs` — contratos estáticos da migration, dashboard e Edge Functions.
- Modify: `scripts/e2e-local.mjs` — cenário completo com equipe fixa, revisão, reenvio e resposta.
- Modify: `tests/dashboard.visual.spec.ts` — cobertura visual dos novos controles.

### Task 1: Substituir a agenda proporcional por horários fixos

**Files:**
- Modify: `tests/core.test.mjs`
- Modify: `packages/core/src/index.mjs`
- Modify: `packages/core/src/index.d.ts`

- [ ] **Step 1: Escrever os testes que expressam a nova agenda**

Substituir os testes de `calcularAgendaProporcionalEnvio` por:

```js
import {
  calcularAgendaFixaEnvio,
  // demais imports existentes
} from '../packages/core/src/index.mjs';

test('agenda fixa usa horario manual e proximas meias horas', () => {
  assert.deepEqual(calcularAgendaFixaEnvio({
    dataEscala: '2026-06-22',
    horarioInicioDisparo: '13:48',
    horarioEntrada: '16:00',
  }), {
    confirmacao_inicial: '2026-06-22T13:48:00-03:00',
    lembrete_1: '2026-06-22T14:00:00-03:00',
    lembrete_2: '2026-06-22T14:30:00-03:00',
    alerta_sem_resposta: '2026-06-22T14:35:00-03:00',
  });
});

test('agenda fixa avanca trinta minutos quando inicio ja esta na grade', () => {
  assert.deepEqual(calcularAgendaFixaEnvio({
    dataEscala: '2026-06-22',
    horarioInicioDisparo: '13:00',
    horarioEntrada: '16:00',
  }), {
    confirmacao_inicial: '2026-06-22T13:00:00-03:00',
    lembrete_1: '2026-06-22T13:30:00-03:00',
    lembrete_2: '2026-06-22T14:00:00-03:00',
    alerta_sem_resposta: '2026-06-22T14:30:00-03:00',
  });
});

test('agenda fixa suporta disparo no dia anterior para entrada meia noite', () => {
  assert.deepEqual(calcularAgendaFixaEnvio({
    dataEscala: '2026-06-22',
    horarioInicioDisparo: '21:48',
    horarioEntrada: '00:00',
  }), {
    confirmacao_inicial: '2026-06-22T21:48:00-03:00',
    lembrete_1: '2026-06-22T22:00:00-03:00',
    lembrete_2: '2026-06-22T22:30:00-03:00',
    alerta_sem_resposta: '2026-06-22T22:35:00-03:00',
  });
});

test('agenda fixa rejeita terceiro envio depois do alerta', () => {
  assert.throws(() => calcularAgendaFixaEnvio({
    dataEscala: '2026-06-22',
    horarioInicioDisparo: '14:16',
    horarioEntrada: '16:00',
  }), /tarde demais para realizar os três envios/i);
});
```

- [ ] **Step 2: Executar os testes e confirmar RED**

Run:

```powershell
node --import tsx --test tests/core.test.mjs
```

Expected: FAIL porque `calcularAgendaFixaEnvio` ainda não existe e os resultados antigos são proporcionais.

- [ ] **Step 3: Implementar o cálculo mínimo no core**

Em `packages/core/src/index.mjs`, substituir a função proporcional por:

```js
function nextHalfHourBoundary(date) {
  const next = new Date(date);
  next.setUTCSeconds(0, 0);
  const minute = next.getUTCMinutes();
  if (minute < 30) next.setUTCMinutes(30);
  else {
    next.setUTCHours(next.getUTCHours() + 1);
    next.setUTCMinutes(0);
  }
  return next;
}

function localIsoFromDate(date) {
  const localMs = date.getTime() + (-3 * 60 * 60 * 1000);
  const shifted = new Date(localMs);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}T${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}:00${SAO_PAULO_OFFSET}`;
}

export function calcularAgendaFixaEnvio(input) {
  const dates = resolveOperationDates(input.dataEscala, input.horarioInicioDisparo, input.horarioEntrada);
  const inicio = new Date(addMinutesToLocal(dates.inicioData, input.horarioInicioDisparo, 0));
  const entrada = new Date(addMinutesToLocal(dates.entradaData, input.horarioEntrada, 0));
  const lembrete1 = nextHalfHourBoundary(inicio);
  const lembrete2 = new Date(lembrete1.getTime() + 30 * 60_000);
  const alertaBase = new Date(entrada.getTime() - 90 * 60_000);

  if (entrada <= inicio || lembrete2 > alertaBase) {
    throw new Error('O horário de disparo está tarde demais para realizar os três envios.');
  }

  const alerta = lembrete2.getTime() === alertaBase.getTime()
    ? new Date(lembrete2.getTime() + 5 * 60_000)
    : alertaBase;

  return {
    confirmacao_inicial: localIsoFromDate(inicio),
    lembrete_1: localIsoFromDate(lembrete1),
    lembrete_2: localIsoFromDate(lembrete2),
    alerta_sem_resposta: localIsoFromDate(alerta),
  };
}
```

Atualizar `packages/core/src/index.d.ts` para exportar `calcularAgendaFixaEnvio` com o mesmo formato de entrada e saída da função anterior.

- [ ] **Step 4: Migrar os testes restantes para a nova função**

Trocar usos de `calcularAgendaProporcionalEnvio` por `calcularAgendaFixaEnvio` em `tests/core.test.mjs` e ajustar os horários esperados.

- [ ] **Step 5: Executar os testes e confirmar GREEN**

Run:

```powershell
node --import tsx --test tests/core.test.mjs
```

Expected: todos os testes de core passam.

### Task 2: Criar as migrations transacionais

**Files:**
- Create: `supabase/migrations/20260622000200_add_manual_resend_queue_type.sql`
- Create: `supabase/migrations/20260622000300_daily_team_resend_fixed_schedule.sql`
- Modify: `tests/static-security.test.mjs`

- [ ] **Step 1: Escrever testes estáticos da migration antes de criá-la**

Adicionar testes que exijam:

```js
test('migrations criam equipe diaria, agenda fixa e reenvio transacional', () => {
  const enumMigration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20260622000200_add_manual_resend_queue_type.sql',
  ), 'utf8');
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20260622000300_daily_team_resend_fixed_schedule.sql',
  ), 'utf8');

  assert.match(enumMigration, /alter type public\.dmr_tipo_fila add value if not exists 'reenvio_manual'/i);
  assert.match(migration, /create or replace function public\.dmr_criar_fila_diaria/i);
  assert.match(migration, /create or replace function public\.dmr_remover_colaborador_equipe/i);
  assert.match(migration, /p_colaborador_ids uuid\[\]/i);
  assert.match(migration, /create or replace function public\.dmr_reenviar_pendente/i);
  assert.match(migration, /interval '90 minutes'/i);
  assert.match(migration, /date_trunc\('hour'/i);
  assert.match(migration, /interval '30 minutes'/i);
  assert.match(migration, /interval '5 minutes'/i);
  assert.match(migration, /reenvio_manual.*status in \('pendente', 'processando'\)/is);
});
```

- [ ] **Step 2: Executar o teste estático e confirmar RED**

Run:

```powershell
node --import tsx --test tests/static-security.test.mjs
```

Expected: FAIL porque as migrations ainda não existem.

- [ ] **Step 3: Criar a migration exclusiva do enum**

O PostgreSQL não permite usar um novo valor de enum antes do commit da transação que o criou. Por isso, `20260622000200_add_manual_resend_queue_type.sql` conterá somente:

```sql
alter type public.dmr_tipo_fila
add value if not exists 'reenvio_manual';
```

- [ ] **Step 4: Criar a migration operacional com índice e agenda**

Em `20260622000300_daily_team_resend_fixed_schedule.sql`:

```sql
create unique index if not exists fila_reenvio_manual_aberto_idx
on public.fila_mensagens(escala_colaborador_id)
where tipo = 'reenvio_manual'
  and status in ('pendente', 'processando');
```

Também deverá substituir `public.gerar_fila_confirmacoes()` para calcular:

```sql
v_lembrete_1 := case
  when date_trunc('minute', v_inicio)
       = date_trunc('hour', v_inicio) + interval '30 minutes'
    or date_trunc('minute', v_inicio) = date_trunc('hour', v_inicio)
  then date_trunc('minute', v_inicio) + interval '30 minutes'
  when extract(minute from v_inicio) < 30
  then date_trunc('hour', v_inicio) + interval '30 minutes'
  else date_trunc('hour', v_inicio) + interval '1 hour'
end;
v_lembrete_2 := v_lembrete_1 + interval '30 minutes';
v_alerta_base := v_entrada - interval '90 minutes';
v_alerta := case
  when v_lembrete_2 = v_alerta_base then v_lembrete_2 + interval '5 minutes'
  else v_alerta_base
end;
```

A consulta-base deverá ignorar operações inválidas em vez de gerar mensagens depois do limite:

```sql
and v_lembrete_2 <= v_alerta_base
```

- [ ] **Step 5: Criar `dmr_criar_fila_diaria`**

Assinatura:

```sql
create or replace function public.dmr_criar_fila_diaria(
  p_turno_empresa_id uuid,
  p_data date,
  p_horario_inicio_disparo time,
  p_colaborador_ids uuid[]
) returns jsonb
```

Comportamento:

- exige `public.is_operador()`;
- bloqueia array vazio;
- carrega turno, empresa e jornada;
- calcula os três horários e rejeita quando o terceiro ultrapassar o alerta-base;
- valida que todos os IDs existem e estão ativos;
- cria/reutiliza `escalas`;
- insere somente os IDs selecionados em `escala_colaboradores`;
- usa `on conflict (escala_id, colaborador_id) do update`;
- registra `gerar_operacao_manual` com quantidade, turno e data;
- retorna `{ sucesso, escala_id, colaboradores_adicionados }`.

- [ ] **Step 6: Criar `dmr_remover_colaborador_equipe`**

Assinatura:

```sql
create or replace function public.dmr_remover_colaborador_equipe(
  p_vinculo_id uuid
) returns jsonb
```

Comportamento:

- exige `public.is_operador()`;
- busca vínculo, empresa, jornada e colaborador;
- apaga somente a linha de `empresa_colaboradores`;
- não apaga `colaboradores` nem o histórico de `escala_colaboradores`;
- registra texto humano na auditoria;
- retorna `{ sucesso, colaborador_id, empresa_horario_id }`.

- [ ] **Step 7: Criar `dmr_reenviar_pendente`**

Assinatura:

```sql
create or replace function public.dmr_reenviar_pendente(
  p_escala_colaborador_id uuid
) returns jsonb
```

Comportamento:

- bloqueia status finais e `respondido_em is not null`;
- aceita apenas `pendente`, `mensagem_agendada`, `mensagem_enviada`, `sem_resposta`, `resposta_incompreensivel`;
- verifica índice/reenvio aberto;
- monta a mesma mensagem contextual da operação;
- cria `fila_mensagens` com `tipo = 'reenvio_manual'`, `agendado_para = now()` e chave com UUID;
- registra `reenviar_mensagem`;
- em rejeições de negócio, registra auditoria e retorna `{ sucesso: false, mensagem }` sem lançar exceção, para que o registro não seja revertido;
- retorna `{ sucesso: true, fila_mensagem_id }` quando criar a mensagem.

- [ ] **Step 8: Conceder somente as permissões necessárias**

```sql
revoke all on function public.dmr_criar_fila_diaria(uuid, date, time, uuid[]) from public;
revoke all on function public.dmr_remover_colaborador_equipe(uuid) from public;
revoke all on function public.dmr_reenviar_pendente(uuid) from public;
grant execute on function public.dmr_criar_fila_diaria(uuid, date, time, uuid[]) to authenticated;
grant execute on function public.dmr_remover_colaborador_equipe(uuid) to authenticated;
grant execute on function public.dmr_reenviar_pendente(uuid) to authenticated;
```

- [ ] **Step 9: Executar testes estáticos e validação local de migrations**

Run:

```powershell
node --import tsx --test tests/static-security.test.mjs
npx supabase db reset
```

Expected: testes passam e todas as migrations aplicam no banco local.

### Task 3: Fazer as Edge Functions respeitarem o reenvio

**Files:**
- Modify: `supabase/functions/bot-mark-sent/index.ts`
- Modify: `supabase/functions/bot-register-incoming/index.ts`
- Modify: `tests/static-security.test.mjs`

- [ ] **Step 1: Escrever testes estáticos para o novo tipo**

```js
test('reenvio manual nao avanca lembretes e e cancelado por resposta valida', () => {
  const markSent = fs.readFileSync(path.join(root, 'supabase', 'functions', 'bot-mark-sent', 'index.ts'), 'utf8');
  const incoming = fs.readFileSync(path.join(root, 'supabase', 'functions', 'bot-register-incoming', 'index.ts'), 'utf8');

  assert.match(markSent, /queue\.tipo === "reenvio_manual"/);
  assert.match(incoming, /\["lembrete_1", "lembrete_2", "reenvio_manual", "alerta_sem_resposta"\]/);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run:

```powershell
node --import tsx --test tests/static-security.test.mjs
```

- [ ] **Step 3: Ajustar envio e cancelamento**

Em `bot-mark-sent`, não atualizar `escala_colaboradores` para `reenvio_manual`:

```ts
if (queue.tipo === "reenvio_manual") {
  // A fila já foi marcada como enviada. O estado operacional permanece inalterado.
} else if (!String(queue.tipo).startsWith("alerta_")) {
  assertSupabaseResult(await supabase
    .from("escala_colaboradores")
    .update(update)
    .eq("id", queue.escala_colaborador_id));
}
```

Não alterar `status_confirmacao`, `mensagem_enviada_em`, `primeiro_lembrete_enviado_em` ou `segundo_lembrete_enviado_em`.

Em ambos os ramos de resposta válida, cancelar:

```ts
.in("tipo", ["lembrete_1", "lembrete_2", "reenvio_manual", "alerta_sem_resposta"])
```

- [ ] **Step 4: Executar testes**

Run:

```powershell
node --import tsx --test tests/static-security.test.mjs tests/bot-incoming.test.mjs
```

Expected: PASS.

### Task 4: Permitir remover colaborador somente da equipe escolhida

**Files:**
- Modify: `apps/dashboard/app/page.tsx`
- Modify: `tests/static-security.test.mjs`
- Modify: `tests/dashboard.visual.spec.ts`

- [ ] **Step 1: Escrever os testes do vínculo por jornada**

Exigir:

```js
assert.match(page, /dmr_remover_colaborador_equipe/);
assert.match(page, /Remover da equipe/);
assert.match(page, /vinculo\.id/);
assert.doesNotMatch(page, /onDelete=\{deleteColaborador\}/);
```

No teste visual, cadastrar o mesmo colaborador em duas jornadas, remover de uma equipe e confirmar que a outra linha permanece.

- [ ] **Step 2: Executar e confirmar RED**

Run:

```powershell
node --import tsx --test tests/static-security.test.mjs
npx playwright test tests/dashboard.visual.spec.ts
```

- [ ] **Step 3: Criar callback de remoção do vínculo**

```ts
async function removerColaboradorEquipe(vinculoId: string) {
  const { data: result, error } = await supabase.rpc("dmr_remover_colaborador_equipe", {
    p_vinculo_id: vinculoId,
  });
  if (error) throw error;
  if (result?.sucesso === false) throw new Error(result.mensagem);
  await refreshAll();
}
```

- [ ] **Step 4: Renderizar uma linha por vínculo**

Em `Colaboradores`, construir a tabela a partir de `vinculos`, resolvendo colaborador, empresa e jornada. Cada linha terá:

```tsx
acoes: (
  <div className="actions">
    <button type="button" onClick={() => void onEdit(colaborador)}>Editar</button>
    <button
      type="button"
      className="danger"
      onClick={() => void onRemoveTeam(vinculo.id)}
    >
      Remover da equipe
    </button>
  </div>
)
```

Manter cadastro e edição global do nome/telefone, mas remover a ação de apagar globalmente desta tela.

- [ ] **Step 5: Executar verificações focadas**

Run:

```powershell
node --import tsx --test tests/static-security.test.mjs
npm run typecheck
npx playwright test tests/dashboard.visual.spec.ts
```

### Task 5: Adicionar revisão da equipe fixa no dashboard

**Files:**
- Modify: `apps/dashboard/app/page.tsx`
- Modify: `apps/dashboard/app/globals.css`
- Modify: `tests/static-security.test.mjs`
- Modify: `tests/dashboard.visual.spec.ts`

- [ ] **Step 1: Escrever testes de contrato da interface**

Exigir no teste estático:

```js
assert.match(page, /Carregar equipe fixa/);
assert.match(page, /Equipe do dia/);
assert.match(page, /colaborador_ids/);
assert.match(page, /dmr_criar_fila_diaria/);
assert.match(page, /disabled=\{!equipeCarregada/);
```

No teste visual, verificar que o painel “Equipe do dia” aparece após clicar em “Carregar equipe fixa” e que `Adicionar fila` começa desabilitado.

- [ ] **Step 2: Executar os testes e confirmar RED**

Run:

```powershell
node --import tsx --test tests/static-security.test.mjs
npx playwright test tests/dashboard.visual.spec.ts
```

- [ ] **Step 3: Alterar o contrato de `gerarOperacaoManual`**

Substituir inserts diretos por:

```ts
const colaboradorIds = form.getAll("colaborador_ids").map(String).filter(Boolean);
const { error } = await supabase.rpc("dmr_criar_fila_diaria", {
  p_turno_empresa_id: parsed.turno_empresa_id,
  p_data: parsed.data,
  p_horario_inicio_disparo: parsed.horario_inicio_disparo,
  p_colaborador_ids: colaboradorIds,
});
if (error) throw error;
```

Remover a validação antiga `hasMinimumLeadTime` e a cópia automática de todos os vínculos.

- [ ] **Step 4: Criar o estado de revisão em `Turnos`**

Adicionar:

```ts
const [equipeCarregada, setEquipeCarregada] = useState(false);
const [colaboradoresSelecionados, setColaboradoresSelecionados] = useState<string[]>([]);
```

Derivar a equipe fixa pelo turno selecionado:

```ts
const turnoSelecionado = rows.find((row) => row.id === turnoFilaAtual);
const equipeFixa = vinculos
  .filter((v) =>
    v.empresa_id === turnoSelecionado?.empresa_id &&
    v.empresa_horario_id === turnoSelecionado?.empresa_horario_id &&
    v.ativo !== false
  )
  .map((v) => colaboradores.find((c) => c.id === v.colaborador_id))
  .filter(Boolean);
```

Passar `data.colaboradores` e `data.vinculos` para `Turnos`.

- [ ] **Step 5: Implementar “Carregar equipe fixa” e revisão**

O botão carrega os IDs ativos. A seção **Equipe do dia** contém:

```tsx
{equipeFixa.map((colaborador) => (
  <label className="team-member" key={colaborador.id}>
    <input
      type="checkbox"
      name="colaborador_ids"
      value={colaborador.id}
      checked={colaboradoresSelecionados.includes(colaborador.id)}
      onChange={() => toggleColaborador(colaborador.id)}
    />
    <span>{colaborador.nome}</span>
    <small>{maskPhone(colaborador.telefone)}</small>
  </label>
))}
```

Adicionar um seletor de colaboradores ativos ainda não vinculados, com botão **Adicionar somente hoje**.

Qualquer mudança de empresa, turno, data ou horário deve marcar `equipeCarregada = false` para impedir envio com revisão obsoleta.

- [ ] **Step 6: Preservar os campos em erros**

`handleCreateFila` só deve limpar a revisão quando a RPC retornar sucesso. Empresa, jornada, data e horário permanecem inalterados em erro.

- [ ] **Step 7: Estilizar sem criar cards aninhados**

Adicionar classes para lista compacta, linha de colaborador, contador de selecionados e estados disabled. Usar borda simples dentro do painel existente.

- [ ] **Step 8: Executar verificações focadas**

Run:

```powershell
node --import tsx --test tests/static-security.test.mjs
npm run typecheck
npm run lint
npx playwright test tests/dashboard.visual.spec.ts
```

Expected: PASS sem sobreposição ou texto cortado.

### Task 6: Adicionar Reenviar ao Painel do Dia

**Files:**
- Modify: `apps/dashboard/app/page.tsx`
- Modify: `tests/static-security.test.mjs`
- Modify: `tests/dashboard.visual.spec.ts`

- [ ] **Step 1: Escrever testes do botão e estados**

Adicionar contrato para:

```js
assert.match(page, /dmr_reenviar_pendente/);
assert.match(page, /Reenviar/);
assert.match(page, /p_escala_colaborador_id/);
assert.match(page, /confirmado.*nao_comparecera.*cancelado.*tratado_manualmente/s);
```

No teste visual, confirmar botão habilitado em pendente e ausente/desabilitado em confirmado.

- [ ] **Step 2: Executar e confirmar RED**

Run:

```powershell
node --import tsx --test tests/static-security.test.mjs
npx playwright test tests/dashboard.visual.spec.ts
```

- [ ] **Step 3: Criar callback transacional**

No componente principal:

```ts
async function reenviarMensagem(id: string) {
  await mutate(
    () => supabase.rpc("dmr_reenviar_pendente", {
      p_escala_colaborador_id: id,
    }),
    "reenviar_mensagem",
    "escala_colaboradores",
    id,
  );
}
```

Evitar log duplicado no cliente se a RPC já registrar a auditoria: nesse caso usar um helper de RPC que apenas trata erro e atualiza dados.

- [ ] **Step 4: Definir elegibilidade e estado de carregamento**

```ts
const REENVIAVEIS = new Set([
  "pendente",
  "mensagem_agendada",
  "mensagem_enviada",
  "sem_resposta",
  "resposta_incompreensivel",
]);
```

O `Painel` mantém `reenviandoId` para desabilitar o botão durante a chamada.

- [ ] **Step 5: Renderizar a ação**

```tsx
{REENVIAVEIS.has(row.status_confirmacao) ? (
  <button
    type="button"
    disabled={reenviandoId === row.id}
    onClick={() => handleReenviar(row.id)}
  >
    {reenviandoId === row.id ? "Enviando..." : "Reenviar"}
  </button>
) : null}
```

- [ ] **Step 6: Executar verificações focadas**

Run:

```powershell
node --import tsx --test tests/static-security.test.mjs
npm run typecheck
npx playwright test tests/dashboard.visual.spec.ts
```

### Task 7: Atualizar o teste ponta a ponta

**Files:**
- Modify: `scripts/e2e-local.mjs`

- [ ] **Step 1: Fazer o E2E revisar a equipe**

Depois de preencher data e horário:

```js
await queuePanel.getByRole("button", { name: "Carregar equipe fixa" }).click();
await queuePanel.getByRole("heading", { name: "Equipe do dia" }).waitFor();
await queuePanel.getByLabel(yesName).check();
await queuePanel.getByLabel(noName).check();
await queuePanel.getByRole("button", { name: "Adicionar fila" }).click();
```

- [ ] **Step 2: Validar os horários persistidos**

Consultar `fila_mensagens` e confirmar que a inicial é manual, L1 está no próximo `:00/:30`, L2 trinta minutos depois e o alerta usa 1h30 ou +5 minutos em coincidência.

- [ ] **Step 3: Exercitar reenvio**

No Painel do Dia:

```js
const pendingRow = page.getByRole("row", { name: new RegExp(yesName) });
await pendingRow.getByRole("button", { name: "Reenviar" }).click();
```

Consultar a fila e confirmar um único `reenvio_manual`. Clicar novamente e confirmar que não foi criada duplicidade.

- [ ] **Step 4: Registrar resposta e verificar cancelamento**

Registrar `1`, então confirmar:

- status `confirmado`;
- reenvio pendente cancelado;
- L1/L2 pendentes cancelados;
- botão Reenviar não aparece mais;
- auditoria contém texto humano para o reenvio.

- [ ] **Step 5: Executar E2E local**

Run:

```powershell
node --env-file=.env.local scripts/e2e-local.mjs
```

Expected: JSON final com `success: true`, equipe revisada, reenvio único e status final confirmado.

### Task 8: Verificação completa e deploy readiness

**Files:**
- Verify all modified files

- [ ] **Step 1: Executar toda a suíte**

```powershell
npm test
```

Expected: zero falhas.

- [ ] **Step 2: Executar verificações estáticas**

```powershell
npm run typecheck
npm run lint
npm run secrets:scan
```

Expected: todos com exit code 0.

- [ ] **Step 3: Executar build**

```powershell
npm run build
```

Expected: core, dashboard e bot compilam.

- [ ] **Step 4: Executar verificação visual**

```powershell
npm run test:visual
```

Expected: desktop e mobile sem sobreposição, corte ou mudança de layout inesperada.

- [ ] **Step 5: Validar migrations**

```powershell
npx supabase db reset
npx supabase db push --dry-run
```

Expected: reset local concluído e apenas a migration nova listada para o remoto.

- [ ] **Step 6: Revisar segurança e concorrência**

Confirmar manualmente:

- RPCs são `security definer` com `search_path` explícito;
- permissões públicas foram revogadas;
- somente operador pode criar fila/reenvio;
- índice parcial bloqueia reenvio duplicado;
- resposta válida cancela reenvio;
- nenhum token ou senha foi adicionado aos arquivos.

- [ ] **Step 7: Registrar resultado real**

Documentar comandos executados, totais de testes e qualquer limitação ambiental. Não declarar o fluxo pronto sem evidência fresca de testes, build, migration local e E2E.
