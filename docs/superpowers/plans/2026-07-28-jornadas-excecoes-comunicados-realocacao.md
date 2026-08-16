# Jornadas, Excecoes, Comunicados e Realocacao Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. O usuario solicitou explicitamente execucao sem subagentes. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Implementar jornadas semanais e excepcionais, fotografia imutavel da operacao, comunicados personalizados, falso positivo, substituicao e realocacao sem quebrar filas, respostas ou relatorios existentes.

**Architecture:** O Supabase permanece como fonte de verdade e recebe somente migrations aditivas e RPCs transacionais. O dashboard extrai os novos fluxos do arquivo page.tsx para bibliotecas puras e componentes focados; o bot continua consumindo a fila generica, com protecoes para que comunicados nao alterem confirmacoes.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Supabase/PostgreSQL, Edge Functions Deno, Node test runner, pgTAP e Playwright.

**Design aprovado:** docs/superpowers/specs/2026-07-28-jornadas-excecoes-comunicados-realocacao-design.md

---

## Mapa de arquivos

**Criar**

- apps/dashboard/src/lib/schedules.ts: resolucao e formatacao das jornadas.
- apps/dashboard/src/lib/operations.ts: estado exibido e payloads operacionais.
- apps/dashboard/src/lib/announcements.ts: validacao e pre-visualizacao de comunicados.
- apps/dashboard/src/components/ScheduleEditor.tsx: horario base e regras semanais.
- apps/dashboard/src/components/ScheduleExceptionDialog.tsx: excecao por data.
- apps/dashboard/src/components/OperationTreatmentDialog.tsx: falso positivo e substituto.
- apps/dashboard/src/components/RelocationDialog.tsx: realocacao permanente ou diaria.
- apps/dashboard/src/components/AnnouncementDialog.tsx: comunicado e pre-visualizacao.
- supabase/migrations/20260728000100_flexible_company_schedules.sql.
- supabase/migrations/20260728000200_operation_snapshots.sql.
- supabase/migrations/20260728000300_false_positive_relocation.sql.
- supabase/migrations/20260728000400_operational_announcements.sql.
- supabase/tests/flexible_schedules.sql.
- supabase/tests/operation_snapshot_relocation.sql.
- supabase/tests/operational_announcements.sql.
- tests/dashboard-schedules.test.mjs.
- tests/dashboard-operations.test.mjs.
- tests/dashboard-announcements.test.mjs.

**Modificar**

- apps/dashboard/app/page.tsx: carregar dados, chamar RPCs e montar componentes.
- apps/dashboard/app/styles.css: novos paineis/dialogos responsivos.
- apps/dashboard/src/lib/reports.ts e audit.ts.
- supabase/functions/bot-mark-sent/index.ts.
- supabase/functions/bot-register-incoming/index.ts.
- tests/dashboard-operational-upgrade.test.mjs.
- tests/dashboard-reports.test.mjs.
- tests/dashboard-audit.test.mjs.
- tests/presence-contract.test.mjs.
- tests/dashboard-upgrade.visual.spec.ts.
- tests/static-security.test.mjs.

---

### Task 1: Congelar a linha de base e definir contratos puros

**Files:**
- Create: tests/dashboard-schedules.test.mjs
- Create: apps/dashboard/src/lib/schedules.ts
- Create: tests/dashboard-operations.test.mjs
- Create: apps/dashboard/src/lib/operations.ts

- [ ] **Step 1: Executar a linha de base**

Run:

~~~powershell
npm test
npm run typecheck
~~~

Expected: todos os testes atuais passam. Nao atualizar snapshots para esconder regressao.

- [ ] **Step 2: Escrever testes falhos de jornada**

~~~js
import assert from "node:assert/strict";
import test from "node:test";
import { resolveEffectiveSchedule } from "../apps/dashboard/src/lib/schedules.ts";

const base = { entrada: "14:00", saida: "23:00" };

test("excecao prevalece sobre semanal e base", () => {
  const result = resolveEffectiveSchedule({
    date: "2030-07-12",
    base,
    weekly: [{ weekday: 5, entrada: "12:00", saida: "21:00" }],
    exceptions: [{ date: "2030-07-12", entrada: "10:00", saida: "19:00" }],
  });
  assert.deepEqual(result, { entrada: "10:00", saida: "19:00", source: "exception" });
});

test("sexta usa regra semanal sem excecao", () => {
  const result = resolveEffectiveSchedule({
    date: "2030-07-05",
    base,
    weekly: [{ weekday: 5, entrada: "12:00", saida: "21:00" }],
    exceptions: [],
  });
  assert.deepEqual(result, { entrada: "12:00", saida: "21:00", source: "weekly" });
});
~~~

- [ ] **Step 3: Confirmar falha**

Run: node --import tsx --test tests/dashboard-schedules.test.mjs
Expected: FAIL por modulo/export inexistente.

- [ ] **Step 4: Implementar helper minimo**

~~~ts
export type ScheduleSource = "exception" | "weekly" | "base";
export type TimeRange = { entrada: string; saida: string };
export type WeeklyRule = TimeRange & { weekday: number };
export type DateException = TimeRange & { date: string };

export function resolveEffectiveSchedule(input: {
  date: string;
  base: TimeRange;
  weekly: WeeklyRule[];
  exceptions: DateException[];
}): TimeRange & { source: ScheduleSource } {
  const exception = input.exceptions.find((item) => item.date === input.date);
  if (exception) return { entrada: exception.entrada, saida: exception.saida, source: "exception" };
  const weekday = new Date(input.date + "T12:00:00Z").getUTCDay() || 7;
  const weekly = input.weekly.find((item) => item.weekday === weekday);
  if (weekly) return { entrada: weekly.entrada, saida: weekly.saida, source: "weekly" };
  return { ...input.base, source: "base" };
}
~~~

- [ ] **Step 5: Testar estado operacional**

~~~js
import { operationalDisplayStatus } from "../apps/dashboard/src/lib/operations.ts";

assert.equal(operationalDisplayStatus({
  status_confirmacao: "confirmado",
  falso_positivo_em: "2030-01-01",
  substituto_nome: "Maria",
}), "substituido");
assert.equal(operationalDisplayStatus({
  status_confirmacao: "confirmado",
  falso_positivo_em: "2030-01-01",
  substituto_nome: null,
}), "falso_positivo");
~~~

~~~ts
export function operationalDisplayStatus(row: {
  status_confirmacao?: string | null;
  falso_positivo_em?: string | null;
  substituto_nome?: string | null;
}) {
  if (String(row.substituto_nome ?? "").trim()) return "substituido";
  if (row.falso_positivo_em) return "falso_positivo";
  return row.status_confirmacao ?? "pendente";
}
~~~

- [ ] **Step 6: Rodar e commit**

Run: node --import tsx --test tests/dashboard-schedules.test.mjs tests/dashboard-operations.test.mjs
Expected: PASS.

~~~powershell
git add apps/dashboard/src/lib/schedules.ts apps/dashboard/src/lib/operations.ts tests/dashboard-schedules.test.mjs tests/dashboard-operations.test.mjs
git commit -m "test: define flexible operation contracts"
~~~

---

### Task 2: Criar regras semanais e excecoes no banco

**Files:**
- Create: supabase/migrations/20260728000100_flexible_company_schedules.sql
- Create: supabase/tests/flexible_schedules.sql
- Modify: tests/dashboard-operational-upgrade.test.mjs

- [ ] **Step 1: Escrever contrato estatico falho**

~~~js
const migration = read("supabase/migrations/20260728000100_flexible_company_schedules.sql");
assert.match(migration, /create table public\.empresa_horario_regras_semanais/i);
assert.match(migration, /create table public\.empresa_horario_excecoes/i);
assert.match(migration, /function public\.dmr_resolver_jornada_efetiva/i);
~~~

Run: node --import tsx --test tests/dashboard-operational-upgrade.test.mjs
Expected: FAIL porque a migration nao existe.

- [ ] **Step 2: Criar tabelas normalizadas**

~~~sql
create table public.empresa_horario_regras_semanais (
  id uuid primary key default gen_random_uuid(),
  empresa_horario_id uuid not null references public.empresa_horarios(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  horario_entrada time not null,
  horario_saida time not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_por uuid references auth.users(id),
  unique (empresa_horario_id, dia_semana)
);

create table public.empresa_horario_excecoes (
  id uuid primary key default gen_random_uuid(),
  empresa_horario_id uuid not null references public.empresa_horarios(id) on delete cascade,
  data date not null,
  horario_entrada time not null,
  horario_saida time not null,
  motivo text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_por uuid references auth.users(id),
  unique (empresa_horario_id, data)
);
~~~

Popular segunda a sexta para jornadas existentes com on conflict do nothing. Nao alterar empresa_colaboradores.

- [ ] **Step 3: Implementar resolucao e escrita protegida**

Criar:

- dmr_resolver_jornada_efetiva(uuid,date), retornando entrada, saida e origem;
- dmr_salvar_jornada_semanal(uuid,time,time,jsonb);
- dmr_salvar_excecao_jornada(uuid,date,time,time,text).

Todas as RPCs de escrita comecam por:

~~~sql
if public.is_operador() is not true then
  raise exception 'Usuario sem permissao para alterar jornadas.';
end if;
~~~

Revogar public/anon, conceder authenticated e aplicar RLS de leitura compartilhada.

- [ ] **Step 4: Escrever pgTAP**

Cobrir excecao > semanal > base, unicidade por data/dia, migracao dos registros atuais e permissoes:

~~~sql
select is(
  (select origem from public.dmr_resolver_jornada_efetiva(v_horario, '2030-07-12')),
  'excecao',
  'excecao prevalece'
);
select ok(
  not has_function_privilege('anon', 'public.dmr_salvar_excecao_jornada(uuid,date,time,time,text)', 'EXECUTE'),
  'anon nao altera excecoes'
);
~~~

- [ ] **Step 5: Validar e commit**

~~~powershell
node --import tsx --test tests/dashboard-operational-upgrade.test.mjs
npx supabase db lint --local
npx supabase test db supabase/tests/flexible_schedules.sql
git add supabase/migrations/20260728000100_flexible_company_schedules.sql supabase/tests/flexible_schedules.sql tests/dashboard-operational-upgrade.test.mjs
git commit -m "feat: add weekly schedules and date exceptions"
~~~

Expected: Node, lint e pgTAP PASS quando Supabase local estiver ativo.

---

### Task 3: Fotografar a operacao e proteger o historico

**Files:**
- Create: supabase/migrations/20260728000200_operation_snapshots.sql
- Modify: supabase/tests/flexible_schedules.sql
- Modify: apps/dashboard/app/page.tsx

- [ ] **Step 1: Escrever teste SQL falho de imutabilidade**

Criar uma operacao, editar empresa/jornada e comprovar:

~~~sql
select is((select horario_entrada_snapshot::text from public.escalas where id = v_escala), '14:00:00', 'entrada historica preservada');
select is((select endereco_snapshot from public.escalas where id = v_escala), 'Rua Original, 10 - Centro, Betim', 'endereco historico preservado');
~~~

- [ ] **Step 2: Criar fotografia aditiva**

~~~sql
alter table public.escalas
  add column if not exists horario_entrada_snapshot time,
  add column if not exists horario_saida_snapshot time,
  add column if not exists origem_horario_snapshot text check (origem_horario_snapshot in ('base','semanal','excecao')),
  add column if not exists endereco_snapshot text,
  add column if not exists tipo_contratacao_snapshot text;
~~~

Preencher operacoes existentes apenas quando os snapshots estiverem nulos.

- [ ] **Step 3: Criar RPC unica de operacao**

Criar dmr_criar_operacao_com_equipe(uuid,date,time,dmr_prioridade_envio,uuid[]) que, numa transacao:

1. valida operador e horario nao retroativo;
2. resolve jornada efetiva;
3. registra empresa/endereco/tipo de contrato;
4. cria/reutiliza escala e turno compativeis;
5. grava snapshots;
6. insere somente selecionados de forma idempotente;
7. retorna escala_id, criados e ja existentes.

- [ ] **Step 4: Criar aplicacao explicita de excecao**

dmr_aplicar_excecao_operacao(uuid,uuid) bloqueia a escala, preserva envios realizados, atualiza snapshots e reagenda somente filas pendentes de confirmacao/lembrete/alerta.

- [ ] **Step 5: Trocar o dashboard para a RPC**

~~~ts
const { data, error } = await supabase.rpc("dmr_criar_operacao_com_equipe", {
  p_empresa_horario_id: values.empresa_horario_id,
  p_data: values.data,
  p_horario_disparo: values.horario_inicio_disparo,
  p_prioridade: values.prioridade_envio,
  p_colaborador_ids: selectedCollaboratorIds,
});
if (error) throw error;
~~~

- [ ] **Step 6: Validar e commit**

Run: npm test e npm run typecheck
Expected: PASS e historico imutavel.

~~~powershell
git add supabase/migrations/20260728000200_operation_snapshots.sql supabase/tests/flexible_schedules.sql apps/dashboard/app/page.tsx
git commit -m "feat: snapshot daily operations"
~~~

---

### Task 4: Construir edicao semanal e excecoes no dashboard

**Files:**
- Create: apps/dashboard/src/components/ScheduleEditor.tsx
- Create: apps/dashboard/src/components/ScheduleExceptionDialog.tsx
- Modify: apps/dashboard/app/page.tsx
- Modify: apps/dashboard/app/styles.css
- Modify: tests/dashboard-upgrade.visual.spec.ts

- [ ] **Step 1: Escrever Playwright falho**

Expandir empresa, clicar Editar jornada, alterar sexta e abrir Adicionar excecao. Verificar Segunda a quinta, Sexta, Excecao do dia, Cancelar e Salvar.

- [ ] **Step 2: Criar ScheduleEditor controlado**

~~~ts
type ScheduleEditorProps = {
  open: boolean;
  companyName: string;
  schedule: { id: string; entrada: string; saida: string };
  rules: Array<{ weekday: number; entrada: string; saida: string }>;
  futureOperations: number;
  onClose: () => void;
  onSave: (payload: {
    entrada: string;
    saida: string;
    rules: Array<{ weekday: number; entrada: string; saida: string }>;
  }) => Promise<void>;
};
~~~

Renderizar sete checkboxes de dias, inputs time, impacto futuro e Cancelar/Salvar. Bloquear duplo clique enquanto salva.

- [ ] **Step 3: Criar ScheduleExceptionDialog**

Receber data minima atual, entrada, saida, motivo e Preparar comunicado. Salvar via dmr_salvar_excecao_jornada. Se ja houver operacao, oferecer Aplicar a esta operacao.

- [ ] **Step 4: Integrar Realtime e RPCs**

Carregar e assinar empresa_horario_regras_semanais e empresa_horario_excecoes. Chamar as tres RPCs sem escrita direta nas tabelas.

- [ ] **Step 5: Estilizar e verificar**

Dialogo com largura min(720px, calc(100vw - 32px)); em 720px, empilhar campos. Sem prompt/alert nativo ou cards aninhados.

~~~powershell
npm run typecheck
npm run lint
npx playwright test tests/dashboard-upgrade.visual.spec.ts
git add apps/dashboard/src/components/ScheduleEditor.tsx apps/dashboard/src/components/ScheduleExceptionDialog.tsx apps/dashboard/app/page.tsx apps/dashboard/app/styles.css tests/dashboard-upgrade.visual.spec.ts
git commit -m "feat: add schedule and exception editors"
~~~

---

### Task 5: Registrar falso positivo e substituicao

**Files:**
- Create: supabase/migrations/20260728000300_false_positive_relocation.sql
- Create: supabase/tests/operation_snapshot_relocation.sql
- Create: apps/dashboard/src/components/OperationTreatmentDialog.tsx
- Modify: apps/dashboard/app/page.tsx
- Modify: apps/dashboard/src/lib/reports.ts
- Modify: tests/dashboard-reports.test.mjs

- [ ] **Step 1: Escrever teste falho de relatorio**

~~~js
const [group] = buildNominalReportGroups([{
  status_confirmacao: "confirmado",
  resposta_normalizada: "sim",
  falso_positivo_em: "2030-01-01T10:00:00Z",
  colaboradores: { nome: "Ana" },
  escalas: { empresas: { nome: "Empresa" } },
  turnos_empresa: { nome: "08:00 as 18:00" },
}]);
assert.deepEqual(group.falsosPositivos.map((item) => item.nome), ["Ana"]);
assert.equal(group.confirmados.length, 0);
~~~

- [ ] **Step 2: Adicionar campos e RPC**

~~~sql
alter table public.escala_colaboradores
  add column if not exists falso_positivo_em timestamptz,
  add column if not exists falso_positivo_por uuid references auth.users(id),
  add column if not exists falso_positivo_motivo text;
~~~

Criar dmr_tratar_falso_positivo(uuid,boolean,text,text). Exigir confirmado para marcar; preservar resposta_normalizada, resposta_original e respondido_em. Reverter limpa somente falso positivo e substituicao desse tratamento.

- [ ] **Step 3: Ampliar substituto atual**

Permitir substituto para nao_comparecera ou falso_positivo_em preenchido. Continuar rejeitando demais estados.

- [ ] **Step 4: Criar dialogo e relatorio**

OperationTreatmentDialog oferece Marcar/Reverter falso positivo, motivo e substituto opcional. Relatorio aplica prioridade substituido > falso_positivo > status original e evita dupla contagem.

- [ ] **Step 5: Validar e commit**

~~~powershell
node --import tsx --test tests/dashboard-reports.test.mjs tests/dashboard-operations.test.mjs
npx supabase test db supabase/tests/operation_snapshot_relocation.sql
npm run typecheck
git add supabase/migrations/20260728000300_false_positive_relocation.sql supabase/tests/operation_snapshot_relocation.sql apps/dashboard/src/components/OperationTreatmentDialog.tsx apps/dashboard/app/page.tsx apps/dashboard/src/lib/reports.ts tests/dashboard-reports.test.mjs
git commit -m "feat: track false positives and substitutes"
~~~

---

### Task 6: Realocar equipe sem recadastro

**Files:**
- Modify: supabase/migrations/20260728000300_false_positive_relocation.sql
- Modify: supabase/tests/operation_snapshot_relocation.sql
- Create: apps/dashboard/src/components/RelocationDialog.tsx
- Modify: apps/dashboard/app/page.tsx
- Modify: tests/dashboard-operations.test.mjs

- [ ] **Step 1: Escrever pgTAP falho**

Cobrir realocacao permanente sem alterar passado, realocacao somente na data, destino duplicado, lote atomico e cancelamento somente de mensagens futuras incompatíveis.

- [ ] **Step 2: Criar RPC permanente**

dmr_realocar_equipe_permanente(uuid[],uuid) bloqueia vinculos, valida destino, insere/reativa destino e desativa origem. Retorna movidos, ja existentes e ignorados.

- [ ] **Step 3: Criar RPC por data**

dmr_realocar_equipe_data(uuid[],uuid) bloqueia origem/destino, move escala/turno/horario, preserva respostas e envios, cancela apenas filas pendentes incompatíveis e retorna houve_envio.

- [ ] **Step 4: Criar RelocationDialog**

~~~ts
type RelocationDialogProps = {
  mode: "permanent" | "date";
  selectedIds: string[];
  destinations: Array<{ scheduleId: string; company: string; label: string }>;
  onConfirm: (destinationId: string) => Promise<{
    moved: number;
    alreadyThere: number;
    hadSentMessages: boolean;
  }>;
  onClose: () => void;
};
~~~

Mostrar origem, quantidade, destino e vigencia. Se houve envio, oferecer Preparar comunicado, nunca enviar automaticamente.

- [ ] **Step 5: Integrar selecao em lote**

Colaboradores: Realocar selecionados. Painel: Realocar somente nesta data dentro de cada quadro.

- [ ] **Step 6: Validar e commit**

~~~powershell
npm test
npm run typecheck
npx supabase test db supabase/tests/operation_snapshot_relocation.sql
git add supabase/migrations/20260728000300_false_positive_relocation.sql supabase/tests/operation_snapshot_relocation.sql apps/dashboard/src/components/RelocationDialog.tsx apps/dashboard/app/page.tsx tests/dashboard-operations.test.mjs
git commit -m "feat: relocate workers without recadastro"
~~~

---

### Task 7: Criar comunicados personalizados idempotentes

**Files:**
- Create: supabase/migrations/20260728000400_operational_announcements.sql
- Create: supabase/tests/operational_announcements.sql
- Create: apps/dashboard/src/lib/announcements.ts
- Create: tests/dashboard-announcements.test.mjs
- Create: apps/dashboard/src/components/AnnouncementDialog.tsx
- Modify: apps/dashboard/app/page.tsx
- Modify: supabase/functions/bot-mark-sent/index.ts
- Modify: supabase/functions/bot-register-incoming/index.ts
- Modify: tests/presence-contract.test.mjs

- [ ] **Step 1: Escrever teste falho de template**

~~~js
assert.equal(
  renderAnnouncement("Ola {nome}, horario {horario}.", {
    nome: "Ana", empresa: "DMR", data: "28/07/2026", horario: "12:00 as 21:00",
  }),
  "Ola Ana, horario 12:00 as 21:00."
);
assert.deepEqual(validateAnnouncementTemplate("{senha}"), { valid: false, unknown: ["senha"] });
~~~

- [ ] **Step 2: Implementar helper**

~~~ts
const ALLOWED = new Set(["nome", "empresa", "data", "horario"]);
export function validateAnnouncementTemplate(value: string) {
  const found = [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const unknown = [...new Set(found.filter((name) => !ALLOWED.has(name)))];
  return { valid: value.trim().length >= 2 && unknown.length === 0, unknown };
}
export function renderAnnouncement(value: string, variables: Record<string, string>) {
  return value.replace(/\{(nome|empresa|data|horario)\}/g, (_, name) => variables[name] ?? "");
}
~~~

- [ ] **Step 3: Criar modelo e RPC**

Adicionar comunicado_manual ao enum dmr_tipo_fila. Criar comunicados_operacionais e comunicado_destinatarios, com unique(comunicado_id, escala_colaborador_id).

dmr_criar_comunicado(uuid,text,text,timestamptz,uuid[]) valida operador, horario, variaveis e pertencimento; renderiza uma mensagem individual com chave:

~~~sql
format('comunicado:%s:%s', v_comunicado_id, v_escala_colaborador_id)
~~~

- [ ] **Step 4: Isolar no bot**

~~~ts
if (
  queue.tipo === "reenvio_manual" ||
  queue.tipo === "relatorio_diario" ||
  queue.tipo === "comunicado_manual"
) {
  // Mensagem pontual: nao altera confirmacao, lembretes ou alertas.
}
~~~

bot-register-incoming continua exigindo mensagem_enviada_em da confirmacao; comunicado_manual nunca serve como evidencia de pergunta operacional.

- [ ] **Step 5: Criar dialogo**

Destinatarios Todos, Somente pendentes ou Selecao manual; assunto, corpo, horario e pre-visualizacao. Antes de confirmar, mostrar empresa, jornada, quantidade e exemplo final.

- [ ] **Step 6: Validar e commit**

~~~powershell
node --import tsx --test tests/dashboard-announcements.test.mjs tests/presence-contract.test.mjs
npx supabase test db supabase/tests/operational_announcements.sql
npm run typecheck
git add supabase/migrations/20260728000400_operational_announcements.sql supabase/tests/operational_announcements.sql apps/dashboard/src/lib/announcements.ts tests/dashboard-announcements.test.mjs apps/dashboard/src/components/AnnouncementDialog.tsx apps/dashboard/app/page.tsx supabase/functions/bot-mark-sent/index.ts supabase/functions/bot-register-incoming/index.ts tests/presence-contract.test.mjs
git commit -m "feat: add operational WhatsApp announcements"
~~~

Expected: comunicado enviado sem alterar status_confirmacao.

---

### Task 8: Completar relatorios e auditoria humana

**Files:**
- Modify: apps/dashboard/src/lib/reports.ts
- Modify: apps/dashboard/src/lib/audit.ts
- Modify: apps/dashboard/app/page.tsx
- Modify: apps/dashboard/app/styles.css
- Modify: tests/dashboard-reports.test.mjs
- Modify: tests/dashboard-audit.test.mjs

- [ ] **Step 1: Escrever testes falhos**

Cobrir filtros falso_positivo/substituido, ordem alfabetica e detalhes de horario. Na auditoria:

~~~js
assert.equal(humanizeAuditAction("realocar_equipe_data"), "Equipe realocada somente nesta data");
assert.equal(humanizeAuditAction("criar_comunicado"), "Comunicado colocado na fila de envio");
~~~

- [ ] **Step 2: Atualizar agrupamento nominal**

Adicionar falsosPositivos; uma pessoa aparece numa unica categoria. Substituido prevalece. Total e numero de pessoas unicas.

- [ ] **Step 3: Atualizar relatorio e impressao**

Adicionar KPI Falsos positivos, bloco nominal e campos Confirmou em, Reverteu em e Substituto. Preservar cabecalho e CSS profissional atual.

- [ ] **Step 4: Humanizar auditoria**

Mapear jornada, regra, excecao, comunicado, falso positivo, substituto e realocacao. Usar nomes dos detalhes JSON no lugar de UUID sempre que disponiveis.

- [ ] **Step 5: Validar e commit**

~~~powershell
node --import tsx --test tests/dashboard-reports.test.mjs tests/dashboard-audit.test.mjs
npm run typecheck
git add apps/dashboard/src/lib/reports.ts apps/dashboard/src/lib/audit.ts apps/dashboard/app/page.tsx apps/dashboard/app/styles.css tests/dashboard-reports.test.mjs tests/dashboard-audit.test.mjs
git commit -m "feat: report operational changes nominally"
~~~

---

### Task 9: Validacao visual e ponta a ponta local

**Files:**
- Modify: tests/dashboard-upgrade.visual.spec.ts
- Modify: tests/dashboard.visual.spec.ts
- Modify: tests/static-security.test.mjs

- [ ] **Step 1: Criar cenario completo**

Com dados isolados: empresa/jornada semanal, excecao, fila/snapshot, falso positivo, substituto, realocacao diaria, comunicado, relatorio e auditoria.

- [ ] **Step 2: Validar desktop e celular**

Executar em 1440x900 e 390x844. Sem dialogos cortados, botoes sobrepostos ou textos fora de contêineres.

- [ ] **Step 3: Reforcar seguranca estatica**

~~~js
assert.doesNotMatch(frontend, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(frontend, /DMR_BOT_TOKEN/);
assert.doesNotMatch(frontend, /window\.(prompt|alert)\(/);
~~~

- [ ] **Step 4: Rodar suite completa**

~~~powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run secrets:scan
npx supabase db lint --local
npx supabase test db
npm run test:visual
~~~

Expected: PASS. Se Docker bloquear pgTAP, registrar bloqueio e nao declarar validacao remota concluida.

- [ ] **Step 5: Commit**

~~~powershell
git add tests/dashboard-upgrade.visual.spec.ts tests/dashboard.visual.spec.ts tests/static-security.test.mjs
git commit -m "test: cover flexible operation workflows"
~~~

---

### Task 10: Revisao, deploy e smoke test

**Files:**
- Review: as quatro migrations novas.
- Review: supabase/functions/bot-mark-sent/index.ts.
- Review: supabase/functions/bot-register-incoming/index.ts.
- Modify only if necessary: scripts/supabase-functions-deploy.ps1.

- [ ] **Step 1: Revisar diff e dry-run**

~~~powershell
git diff 4e29730 --check
git diff 4e29730 --stat
npx supabase db push --dry-run
~~~

Expected: apenas o escopo aprovado; dry-run lista quatro migrations.

- [ ] **Step 2: Criar ponto de retorno**

~~~powershell
git tag backup-before-flexible-operations-20260728
~~~

Confirmar backup do Supabase antes do db push.

- [ ] **Step 3: Aplicar migrations**

~~~powershell
powershell -ExecutionPolicy Bypass -File scripts/supabase-deploy.ps1
~~~

Expected: migrations, testes, typecheck e scan passam. Nao ignorar falha de senha/function.

- [ ] **Step 4: Publicar Edge Functions**

~~~powershell
npx supabase functions deploy bot-mark-sent --project-ref example-project-ref --no-verify-jwt --use-api
npx supabase functions deploy bot-register-incoming --project-ref example-project-ref --no-verify-jwt --use-api
~~~

Expected: ambas ACTIVE com versao incrementada.

- [ ] **Step 5: Publicar dashboard**

~~~powershell
git push origin main
netlify deploy --prod
~~~

Expected: https://dmr-confirmacao-presenca-example.netlify.app/ responde 200 no commit final.

- [ ] **Step 6: Smoke test controlado**

Usar empresa/data futura e numero de teste: jornada semanal, excecao, pre-visualizacao, um comunicado, Painel, fila, auditoria e relatorio. Limpar apenas dados de teste pelas RPCs operacionais.

- [ ] **Step 7: Conferir worktree**

~~~powershell
git status --short
~~~

Expected: apenas alteracoes locais preexistentes conscientemente preservadas; nenhum segredo ou temporario versionado.

---

## Checkpoints obrigatorios

- Apos Task 3: filas novas usam fotografia; antigas continuam visiveis e enviaveis.
- Apos Task 4: editar jornada/excecao nao modifica historico.
- Apos Task 6: falso positivo, substituicao e realocacao passam em transacao e relatorio.
- Apos Task 7: comunicado chega sem alterar confirmacao ou lembretes.
- Antes do deploy: suites locais possiveis passam e dry-run lista somente migrations novas.

## Regra de interrupcao

Se migration, pgTAP, captura de resposta ou fila falhar, interromper antes do modulo seguinte. Nao corrigir dados remotos manualmente: ajustar migration/RPC, repetir localmente e so entao continuar.
