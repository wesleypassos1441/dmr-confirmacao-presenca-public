# Status de Comunicados no Painel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir em cada quadro do Painel do Dia quando um comunicado foi criado e o progresso real de envio aos seus destinatarios.

**Architecture:** O dashboard consultara `comunicado_destinatarios` para a data aberta, incluindo o cabecalho do comunicado e a mensagem correspondente da fila. Uma funcao pura transformara os registros do PostgREST em resumos por comunicado; um componente focado renderizara esses resumos no quadro da empresa e jornada, mantendo o bot e as RPCs atuais inalterados.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/PostgREST, CSS, Node Test Runner com `tsx`.

**Design aprovado:** `docs/superpowers/specs/2026-07-31-status-comunicados-painel-design.md`

---

## Estrutura de arquivos

- `apps/dashboard/src/lib/announcements.ts`: manter validacao e renderizacao existentes e acrescentar os tipos e a agregacao pura dos estados de envio.
- `apps/dashboard/src/components/AnnouncementStatusList.tsx`: renderizar a secao compacta `Recados`, sem conhecer consultas ou regras internas do Supabase.
- `apps/dashboard/app/page.tsx`: carregar destinatarios do comunicado para a data selecionada, preservar o painel quando essa consulta falhar, agrupar resumos por jornada e fornecer os dados ao componente.
- `apps/dashboard/app/styles.css`: estilizar a secao, estados e responsividade usando os tokens visuais existentes.
- `tests/dashboard-announcements.test.mjs`: testar a agregacao de estados, contagens e horario de conclusao.
- `tests/dashboard-announcement-panel.test.mjs`: proteger a consulta, a integracao visual e a mensagem de indisponibilidade contra regressoes.

### Task 1: Resumir o estado real de cada comunicado

**Files:**
- Modify: `apps/dashboard/src/lib/announcements.ts`
- Modify: `tests/dashboard-announcements.test.mjs`

- [ ] **Step 1: Escrever testes que falham para comunicado agendado, em envio, concluido e com falha**

Acrescentar a importacao de `buildAnnouncementSummaries` em `tests/dashboard-announcements.test.mjs` e adicionar:

```js
test("status do comunicado acompanha a fila real e o ultimo horario de envio", () => {
  const base = {
    comunicado_id: "recado-1",
    comunicados_operacionais: {
      id: "recado-1",
      empresa_horario_id: "jornada-1",
      assunto: "Aviso operacional",
      agendado_para: "2026-07-31T14:25:00.000Z",
      criado_em: "2026-07-31T14:23:00.000Z",
    },
  };

  const summaries = buildAnnouncementSummaries([
    { ...base, id: "dest-1", fila_mensagens: { status: "enviada", enviada_em: "2026-07-31T14:27:00.000Z" } },
    { ...base, id: "dest-2", fila_mensagens: { status: "enviada", enviada_em: "2026-07-31T14:28:00.000Z" } },
    { ...base, id: "dest-3", fila_mensagens: { status: "enviada", enviada_em: "2026-07-31T14:28:30.000Z" } },
    { ...base, id: "dest-4", fila_mensagens: { status: "enviada", enviada_em: "2026-07-31T14:29:00.000Z" } },
  ], new Date("2026-07-31T14:30:00.000Z"));

  assert.deepEqual(summaries, [{
    id: "recado-1",
    scheduleId: "jornada-1",
    subject: "Aviso operacional",
    scheduledAt: "2026-07-31T14:25:00.000Z",
    createdAt: "2026-07-31T14:23:00.000Z",
    completedAt: "2026-07-31T14:29:00.000Z",
    total: 4,
    sent: 4,
    pending: 0,
    processing: 0,
    failed: 0,
    cancelled: 0,
    missingQueue: 0,
    status: "enviado",
  }]);
});

test("status do comunicado distingue agendamento, progresso e falha", () => {
  const announcement = {
    id: "recado-2",
    empresa_horario_id: "jornada-2",
    assunto: "Mudanca de acesso",
    agendado_para: "2026-07-31T15:00:00.000Z",
    criado_em: "2026-07-31T14:40:00.000Z",
  };
  const row = (id, queue) => ({
    id,
    comunicado_id: "recado-2",
    comunicados_operacionais: announcement,
    fila_mensagens: queue,
  });

  assert.equal(buildAnnouncementSummaries([
    row("dest-1", { status: "pendente", enviada_em: null }),
    row("dest-2", { status: "pendente", enviada_em: null }),
  ], new Date("2026-07-31T14:45:00.000Z"))[0].status, "agendado");

  const sending = buildAnnouncementSummaries([
    row("dest-1", { status: "enviada", enviada_em: "2026-07-31T15:01:00.000Z" }),
    row("dest-2", { status: "processando", enviada_em: null }),
  ], new Date("2026-07-31T15:02:00.000Z"))[0];
  assert.equal(sending.status, "enviando");
  assert.equal(sending.sent, 1);
  assert.equal(sending.processing, 1);

  const failed = buildAnnouncementSummaries([
    row("dest-1", { status: "enviada", enviada_em: "2026-07-31T15:01:00.000Z" }),
    row("dest-2", { status: "erro", enviada_em: null }),
  ], new Date("2026-07-31T15:02:00.000Z"))[0];
  assert.equal(failed.status, "parcial");
  assert.equal(failed.sent, 1);
  assert.equal(failed.failed, 1);
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha correta**

Run:

```powershell
node --import tsx --test tests/dashboard-announcements.test.mjs
```

Expected: FAIL informando que `buildAnnouncementSummaries` nao e exportada por `announcements.ts`.

- [ ] **Step 3: Implementar tipos e agregacao minima em `announcements.ts`**

Acrescentar ao final do arquivo:

```ts
export type AnnouncementDeliveryStatus =
  | "criado"
  | "agendado"
  | "enviando"
  | "enviado"
  | "falha"
  | "parcial"
  | "cancelado"
  | "inconsistente";

type AnnouncementHeaderRecord = {
  id: string;
  empresa_horario_id: string;
  assunto: string;
  agendado_para: string;
  criado_em: string;
};

type AnnouncementQueueRecord = {
  status: string;
  enviada_em?: string | null;
};

export type AnnouncementRecipientRecord = {
  id: string;
  comunicado_id: string;
  comunicados_operacionais: AnnouncementHeaderRecord | AnnouncementHeaderRecord[] | null;
  fila_mensagens: AnnouncementQueueRecord | AnnouncementQueueRecord[] | null;
};

export type AnnouncementSummary = {
  id: string;
  scheduleId: string;
  subject: string;
  scheduledAt: string;
  createdAt: string;
  completedAt: string | null;
  total: number;
  sent: number;
  pending: number;
  processing: number;
  failed: number;
  cancelled: number;
  missingQueue: number;
  status: AnnouncementDeliveryStatus;
};

function oneRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function buildAnnouncementSummaries(
  rows: AnnouncementRecipientRecord[],
  now = new Date(),
): AnnouncementSummary[] {
  const grouped = new Map<string, AnnouncementSummary & { sentTimes: string[] }>();

  for (const row of rows) {
    const announcement = oneRelation(row.comunicados_operacionais);
    if (!announcement) continue;

    const summary = grouped.get(announcement.id) ?? {
      id: announcement.id,
      scheduleId: announcement.empresa_horario_id,
      subject: announcement.assunto,
      scheduledAt: announcement.agendado_para,
      createdAt: announcement.criado_em,
      completedAt: null,
      total: 0,
      sent: 0,
      pending: 0,
      processing: 0,
      failed: 0,
      cancelled: 0,
      missingQueue: 0,
      status: "criado" as AnnouncementDeliveryStatus,
      sentTimes: [],
    };

    summary.total += 1;
    const queue = oneRelation(row.fila_mensagens);
    if (!queue) {
      summary.missingQueue += 1;
    } else if (queue.status === "enviada") {
      summary.sent += 1;
      if (queue.enviada_em) summary.sentTimes.push(queue.enviada_em);
    } else if (queue.status === "processando") {
      summary.processing += 1;
    } else if (queue.status === "erro") {
      summary.failed += 1;
    } else if (queue.status === "cancelada") {
      summary.cancelled += 1;
    } else {
      summary.pending += 1;
    }
    grouped.set(announcement.id, summary);
  }

  return [...grouped.values()]
    .map(({ sentTimes, ...summary }) => {
      let status: AnnouncementDeliveryStatus;
      if (summary.missingQueue > 0) status = "inconsistente";
      else if (summary.total > 0 && summary.sent === summary.total) status = "enviado";
      else if (summary.cancelled === summary.total) status = "cancelado";
      else if (summary.failed > 0 && summary.pending + summary.processing === 0) {
        status = summary.sent > 0 || summary.cancelled > 0 ? "parcial" : "falha";
      } else if (summary.failed > 0) status = "falha";
      else if (summary.sent > 0 || summary.processing > 0) status = "enviando";
      else if (new Date(summary.scheduledAt).getTime() > now.getTime()) status = "agendado";
      else status = "criado";

      return {
        ...summary,
        status,
        completedAt: status === "enviado"
          ? [...sentTimes].sort((a, b) => b.localeCompare(a))[0] ?? null
          : null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
```

- [ ] **Step 4: Executar os testes unitarios**

Run:

```powershell
node --import tsx --test tests/dashboard-announcements.test.mjs
```

Expected: 4 tests PASS, incluindo os dois testes existentes e os dois novos.

- [ ] **Step 5: Commitar a agregacao pura**

```powershell
git add apps/dashboard/src/lib/announcements.ts tests/dashboard-announcements.test.mjs
git commit -m "feat: resumir status de comunicados"
```

### Task 2: Exibir a secao Recados no quadro da operacao

**Files:**
- Create: `apps/dashboard/src/components/AnnouncementStatusList.tsx`
- Create: `tests/dashboard-announcement-panel.test.mjs`
- Modify: `apps/dashboard/app/page.tsx:19-44,357-488,529,2281-2418`
- Modify: `apps/dashboard/app/styles.css:771-850,1544-1559`

- [ ] **Step 1: Escrever o teste estatico de integracao que falha**

Criar `tests/dashboard-announcement-panel.test.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("painel consulta comunicados da data e preserva falha isolada", () => {
  const page = read("apps/dashboard/app/page.tsx");

  assert.match(page, /from\("comunicado_destinatarios"\)/);
  assert.match(page, /comunicados_operacionais!inner/);
  assert.match(page, /escala_colaboradores!inner\(id,escalas!inner\(data\)\)/);
  assert.match(page, /eq\("escala_colaboradores\.escalas\.data", targetDate\)/);
  assert.match(page, /setAnnouncementLoadError/);
  assert.match(page, /buildAnnouncementSummaries/);
  assert.match(page, /AnnouncementStatusList/);
});

test("secao Recados mostra criacao, progresso, conclusao e falha com texto", () => {
  const component = read("apps/dashboard/src/components/AnnouncementStatusList.tsx");
  const styles = read("apps/dashboard/app/styles.css");

  assert.match(component, /Recados/);
  assert.match(component, /Criado às/);
  assert.match(component, /Enviado para/);
  assert.match(component, /Enviando/);
  assert.match(component, /Falha em/);
  assert.match(component, /role="status"/);
  assert.match(styles, /\.announcement-status-list/);
  assert.match(styles, /\.announcement-status-item/);
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha correta**

Run:

```powershell
node --test tests/dashboard-announcement-panel.test.mjs
```

Expected: FAIL porque `AnnouncementStatusList.tsx` ainda nao existe e `page.tsx` nao consulta `comunicado_destinatarios`.

- [ ] **Step 3: Criar o componente visual focado**

Criar `apps/dashboard/src/components/AnnouncementStatusList.tsx`:

```tsx
import { Bell } from "lucide-react";
import type { AnnouncementSummary } from "../lib/announcements";

function hour(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function plural(value: number, singular: string, pluralValue: string) {
  return value === 1 ? singular : pluralValue;
}

function statusText(item: AnnouncementSummary) {
  if (item.status === "enviado") {
    return `Enviado para ${item.sent}/${item.total} colaboradores às ${hour(item.completedAt)}`;
  }
  if (item.status === "agendado") {
    return `Agendado para ${hour(item.scheduledAt)} · ${item.sent}/${item.total} enviados`;
  }
  if (item.status === "enviando") {
    return `Enviando ${item.sent}/${item.total}`;
  }
  if (item.status === "falha" || item.status === "parcial") {
    return `Falha em ${item.failed} ${plural(item.failed, "envio", "envios")} · Enviado para ${item.sent}/${item.total}`;
  }
  if (item.status === "cancelado") {
    return `Cancelado · ${item.cancelled}/${item.total} mensagens`;
  }
  if (item.status === "inconsistente") {
    return `Dados de envio indisponíveis para ${item.missingQueue}/${item.total} destinatários`;
  }
  return `Criado · Aguardando envio ${item.sent}/${item.total}`;
}

export function AnnouncementStatusList({
  items,
  error = "",
}: {
  items: AnnouncementSummary[];
  error?: string;
}) {
  if (!items.length && !error) return null;

  return (
    <section className="announcement-status-list" aria-label="Recados da operação">
      <header>
        <Bell size={16} aria-hidden="true" />
        <strong>Recados</strong>
      </header>
      {error ? <p className="announcement-status-error" role="status">{error}</p> : null}
      {items.map((item) => (
        <article className={`announcement-status-item ${item.status}`} key={item.id}>
          <div>
            <strong>{item.subject}</strong>
            <small>Criado às {hour(item.createdAt)}</small>
          </div>
          <p role="status">{statusText(item)}</p>
        </article>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Carregar os comunicados da data sem bloquear o restante do painel**

Em `apps/dashboard/app/page.tsx`:

1. Importar o componente e a agregacao:

```ts
import { AnnouncementStatusList } from "../src/components/AnnouncementStatusList";
import {
  buildAnnouncementSummaries,
  type AnnouncementRecipientRecord,
  type AnnouncementSummary,
} from "../src/lib/announcements";
```

2. Junto dos estados de `Home`, adicionar:

```ts
const [announcementLoadError, setAnnouncementLoadError] = useState("");
```

3. Acrescentar `comunicados` ao resultado do `Promise.all` de `refreshAll`, usando esta consulta:

```ts
supabase
  .from("comunicado_destinatarios")
  .select("id,comunicado_id,comunicados_operacionais!inner(id,empresa_horario_id,assunto,agendado_para,criado_em),escala_colaboradores!inner(id,escalas!inner(data)),fila_mensagens(status,enviada_em)")
  .eq("escala_colaboradores.escalas.data", targetDate),
```

4. Antes de `setData`, atualizar somente o aviso dessa consulta:

```ts
setAnnouncementLoadError(comunicados.error
  ? "Não foi possível atualizar os recados. Tente atualizar os dados novamente."
  : "");
```

5. Dentro de `setData`, incluir:

```ts
comunicados: (comunicados.data ?? []) as unknown as DashboardRow[],
```

6. Depois de `healthSummary`, criar os resumos memorizados:

```ts
const announcementSummaries = useMemo(
  () => buildAnnouncementSummaries(
    (data.comunicados ?? []) as unknown as AnnouncementRecipientRecord[],
  ),
  [data.comunicados],
);
```

7. Fornecer ao `Painel`:

```tsx
announcements={announcementSummaries}
announcementError={announcementLoadError}
```

A consulta do Supabase retorna um objeto de erro sem rejeitar o `Promise`; portanto, o restante de `refreshAll` continua carregando e apenas `announcementLoadError` e a lista vazia de comunicados refletem a falha isolada.

- [ ] **Step 5: Integrar a secao ao quadro da jornada correta**

Na assinatura de `Painel`, acrescentar:

```ts
announcements: AnnouncementSummary[];
announcementError: string;
```

Logo depois do painel de filtros e antes do `painelGroups.map`, renderizar o erro uma unica vez:

```tsx
{announcementError ? (
  <AnnouncementStatusList items={[]} error={announcementError} />
) : null}
```

Dentro de cada `section.operation-board`, depois de `.operation-command-bar` e antes da tabela, renderizar apenas os recados da jornada:

```tsx
<AnnouncementStatusList
  items={announcements.filter((item) => (
    item.scheduleId === group.rows[0]?.turnos_empresa?.empresa_horarios?.id
  ))}
/>
```

Como a consulta ja foi filtrada pela data aberta, o `scheduleId` e suficiente para associar o comunicado ao quadro correto.

- [ ] **Step 6: Estilizar a secao e seus estados**

Acrescentar a `apps/dashboard/app/styles.css` depois de `.operation-command-actions button`:

```css
.announcement-status-list {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-top: 0;
  background: #fff;
}

.announcement-status-list > header {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text);
  font-size: 13px;
}

.announcement-status-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border-left: 3px solid #94a3b8;
  border-radius: 6px;
  background: var(--surface-2);
}

.announcement-status-item > div {
  display: grid;
  gap: 3px;
}

.announcement-status-item small,
.announcement-status-item p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.announcement-status-item.enviado { border-left-color: var(--success); }
.announcement-status-item.enviando { border-left-color: var(--primary); }
.announcement-status-item.agendado { border-left-color: #7c3aed; }
.announcement-status-item.falha,
.announcement-status-item.parcial,
.announcement-status-item.inconsistente { border-left-color: var(--danger); }

.announcement-status-error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}
```

No media query responsivo que ja ajusta `.operation-command-bar`, acrescentar:

```css
.announcement-status-item {
  align-items: flex-start;
  flex-direction: column;
  gap: 6px;
}
```

- [ ] **Step 7: Executar os testes focados**

Run:

```powershell
node --import tsx --test tests/dashboard-announcements.test.mjs tests/dashboard-announcement-panel.test.mjs
```

Expected: 6 tests PASS.

- [ ] **Step 8: Executar verificacoes do dashboard e do monorepo**

Run:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: todos os comandos terminam com exit code 0; o build do dashboard, core e bot conclui sem erros.

- [ ] **Step 9: Fazer verificacao visual local**

Abrir o Painel do Dia em desktop e em viewport estreito. Confirmar:

- a secao `Recados` aparece somente no quadro de sua jornada;
- `Criado às HH:MM` e o progresso permanecem legiveis;
- o quadro sem recados nao ganha espaco vazio;
- texto e tabela nao provocam rolagem horizontal adicional em viewport estreito;
- o estado concluido mostra `Enviado para X/X colaboradores às HH:MM`.

- [ ] **Step 10: Commitar a integracao visual**

```powershell
git add apps/dashboard/src/components/AnnouncementStatusList.tsx apps/dashboard/app/page.tsx apps/dashboard/app/styles.css tests/dashboard-announcement-panel.test.mjs
git commit -m "feat: mostrar status de recados no painel"
```
