# Importacao Assistida de Listas em Turnos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o usuario cole uma lista padronizada, revise correspondencias e novos cadastros e aplique os colaboradores validados a equipe do dia sem substituir o fluxo atual.

**Architecture:** O parser e o classificador serao funcoes puras em uma biblioteca dedicada do dashboard. Um componente cliente isolado controlara o rascunho e a revisao, enquanto `page.tsx` fornecera os dados e adaptadores Supabase e continuara responsavel pela selecao final e pela RPC de criacao da fila.

**Tech Stack:** Next.js 16, React, TypeScript, Supabase JS, Zod, Node Test Runner, Playwright e CSS existente do dashboard.

---

## Estrutura de arquivos

- Criar `apps/dashboard/src/lib/shift-list-import.ts`: parser, normalizacao, resolucao da operacao e classificacao dos nomes.
- Criar `apps/dashboard/src/components/ShiftListImportPanel.tsx`: colagem, ajuda, resumo, revisao e aplicacao.
- Modificar `apps/dashboard/app/page.tsx`: adaptadores Supabase seguros e integracao com o estado de `Turnos`.
- Modificar `apps/dashboard/app/styles.css`: estados e layout responsivo do painel.
- Criar `tests/dashboard-shift-list-import.test.mjs`: testes unitarios do parser e classificador.
- Criar `tests/dashboard-shift-list-import-contract.test.mjs`: contrato de integracao, seguranca e preservacao do fluxo atual.
- Modificar `tests/dashboard-upgrade.visual.spec.ts`: verificacao visual e responsiva.

### Task 1: Parser e normalizacao da lista

**Files:**
- Create: `apps/dashboard/src/lib/shift-list-import.ts`
- Create: `tests/dashboard-shift-list-import.test.mjs`

- [ ] **Step 1: Escrever testes que falham para o parser**

Criar testes cobrindo o formato aprovado:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeImportedName,
  parseShiftListImport,
} from "../apps/dashboard/src/lib/shift-list-import.ts";

const validList = `Empresa: Sete Lagos ; Entrada: 12:00 ; Data: 31/07/2026 ; Disparo: 09:00

Hugo Octávio Souza de Oliveira
Gabriel Silva da Cruz
Rafael Christian de Oliveira Souza
Warley Thiago da Silva`;

test("interpreta cabecalho e nomes no formato aprovado", () => {
  assert.deepEqual(parseShiftListImport(validList), {
    company: "Sete Lagos",
    entryTime: "12:00",
    operationDate: "2026-07-31",
    dispatchTime: "09:00",
    names: [
      "Hugo Octávio Souza de Oliveira",
      "Gabriel Silva da Cruz",
      "Rafael Christian de Oliveira Souza",
      "Warley Thiago da Silva",
    ],
    duplicateNames: [],
  });
});

test("normaliza somente para comparacao sem alterar o original", () => {
  assert.equal(normalizeImportedName("  PESSOA EXEMPLO I "), "hugo octavio souza");
});

test("remove nomes repetidos e informa as repeticoes", () => {
  const result = parseShiftListImport(`${validList}\nHugo Octavio Souza de Oliveira`);
  assert.equal(result.names.length, 4);
  assert.deepEqual(result.duplicateNames, ["Hugo Octavio Souza de Oliveira"]);
});

test("rejeita cabecalho incompleto ou fora de ordem", () => {
  assert.throws(
    () => parseShiftListImport("Empresa: Sete Lagos ; Data: 31/07/2026 ; Entrada: 12:00 ; Disparo: 09:00\nHugo"),
    /Empresa, Entrada, Data e Disparo/,
  );
});

test("rejeita data brasileira inexistente", () => {
  assert.throws(
    () => parseShiftListImport("Empresa: Sete Lagos ; Entrada: 12:00 ; Data: 31/02/2026 ; Disparo: 09:00\nHugo"),
    /data valida/,
  );
});

test("rejeita horarios invalidos e lista vazia", () => {
  assert.throws(
    () => parseShiftListImport("Empresa: Sete Lagos ; Entrada: 25:00 ; Data: 31/07/2026 ; Disparo: 09:00\nHugo"),
    /HH:MM/,
  );
  assert.throws(
    () => parseShiftListImport("Empresa: Sete Lagos ; Entrada: 12:00 ; Data: 31/07/2026 ; Disparo: 09:00"),
    /pelo menos um colaborador/,
  );
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run:

```powershell
node --import tsx --test tests/dashboard-shift-list-import.test.mjs
```

Expected: `FAIL` porque `shift-list-import.ts` ainda nao existe.

- [ ] **Step 3: Implementar o parser minimo**

Criar os tipos e funcoes:

```ts
export type ParsedShiftListImport = {
  company: string;
  entryTime: string;
  operationDate: string;
  dispatchTime: string;
  names: string[];
  duplicateNames: string[];
};

export function normalizeImportedName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBrazilDate(value: string): string {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) throw new Error("Informe uma data válida no formato DD/MM/AAAA.");
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Informe uma data válida no formato DD/MM/AAAA.");
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseTime(value: string): string {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error("Os horários devem usar o formato HH:MM.");
  }
  return value;
}

export function parseShiftListImport(value: string): ParsedShiftListImport {
  const lines = String(value ?? "").split(/\r?\n/);
  const header = lines.shift()?.trim() ?? "";
  const match = header.match(
    /^Empresa:\s*(.+?)\s*;\s*Entrada:\s*(\d{2}:\d{2})\s*;\s*Data:\s*(\d{2}\/\d{2}\/\d{4})\s*;\s*Disparo:\s*(\d{2}:\d{2})\s*$/i,
  );
  if (!match) throw new Error("Mantenha no cabeçalho Empresa, Entrada, Data e Disparo, nesta ordem.");

  const unique = new Map<string, string>();
  const duplicateNames: string[] = [];
  for (const rawName of lines) {
    const name = rawName.trim();
    if (!name) continue;
    const key = normalizeImportedName(name);
    if (!key) continue;
    if (unique.has(key)) duplicateNames.push(name);
    else unique.set(key, name);
  }
  if (!unique.size) throw new Error("Informe pelo menos um colaborador.");

  return {
    company: match[1].trim(),
    entryTime: parseTime(match[2]),
    operationDate: parseBrazilDate(match[3]),
    dispatchTime: parseTime(match[4]),
    names: [...unique.values()],
    duplicateNames,
  };
}
```

- [ ] **Step 4: Rodar os testes unitarios**

Run:

```powershell
node --import tsx --test tests/dashboard-shift-list-import.test.mjs
```

Expected: todos os testes do arquivo em `PASS`.

- [ ] **Step 5: Commit do parser**

```powershell
git add apps/dashboard/src/lib/shift-list-import.ts tests/dashboard-shift-list-import.test.mjs
git commit -m "feat: interpretar listas padronizadas de turnos"
```

### Task 2: Resolucao da operacao e classificacao segura

**Files:**
- Modify: `apps/dashboard/src/lib/shift-list-import.ts`
- Modify: `tests/dashboard-shift-list-import.test.mjs`

- [ ] **Step 1: Escrever testes que falham para resolucao e classificacao**

Adicionar:

```js
import {
  classifyImportedCollaborators,
  resolveImportedOperation,
} from "../apps/dashboard/src/lib/shift-list-import.ts";

const companies = [{ id: "company-1", nome: "Sete Lagos", ativa: true }];
const schedules = [{
  id: "schedule-1",
  empresa_id: "company-1",
  horario_entrada: "12:00:00",
  horario_saida: "21:00:00",
  ativo: true,
}];
const shifts = [{
  id: "shift-1",
  empresa_id: "company-1",
  empresa_horario_id: "schedule-1",
  ativo: true,
}];

test("resolve empresa, jornada e turno ignorando acentos e caixa", () => {
  assert.deepEqual(
    resolveImportedOperation({
      companyName: "sete lagos",
      entryTime: "12:00",
      companies,
      schedules,
      shifts,
    }),
    {
      companyId: "company-1",
      scheduleId: "schedule-1",
      shiftId: "shift-1",
      scheduleLabel: "12:00 as 21:00",
    },
  );
});

test("classifica equipe, banco, novo e homonimo sem fuzzy matching", () => {
  const result = classifyImportedCollaborators({
    names: ["Pessoa Exemplo F", "Pessoa Exemplo E", "Pessoa Exemplo J", "Pessoa Exemplo D"],
    companyId: "company-1",
    scheduleId: "schedule-1",
    collaborators: [
      { id: "ana", nome: "PESSOA EXEMPLO F", telefone: "5510900000001", ativo: true },
      { id: "bruno", nome: "Pessoa Exemplo E", telefone: "5510900000002", ativo: true },
      { id: "daniel-1", nome: "Pessoa Exemplo D", telefone: "5510900000003", ativo: true },
      { id: "daniel-2", nome: "Pessoa Exemplo D", telefone: "5510900000004", ativo: true },
    ],
    links: [
      { colaborador_id: "ana", empresa_id: "company-1", empresa_horario_id: "schedule-1", ativo: true },
    ],
  });
  assert.equal(result[0].status, "team");
  assert.equal(result[1].status, "bank");
  assert.equal(result[2].status, "new");
  assert.equal(result[3].status, "ambiguous");
  assert.equal(result[3].candidates.length, 2);
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run:

```powershell
node --import tsx --test tests/dashboard-shift-list-import.test.mjs
```

Expected: `FAIL` porque as novas funcoes ainda nao existem.

- [ ] **Step 3: Implementar tipos e funcoes puras**

Adicionar interfaces estruturais para empresa, jornada, turno, colaborador e vinculo. Implementar:

```ts
export function resolveImportedOperation(input: ResolveImportedOperationInput): ResolvedImportedOperation {
  const companyMatches = input.companies.filter(
    (item) => item.ativa !== false && normalizeImportedName(item.nome) === normalizeImportedName(input.companyName),
  );
  if (companyMatches.length !== 1) throw new Error(`A empresa "${input.companyName}" não foi encontrada.`);
  const company = companyMatches[0];
  const schedule = input.schedules.find((item) =>
    item.ativo !== false &&
    item.empresa_id === company.id &&
    String(item.horario_entrada ?? "").slice(0, 5) === input.entryTime
  );
  if (!schedule) throw new Error(`Não existe uma entrada às ${input.entryTime} cadastrada para ${company.nome}.`);
  const shift = input.shifts.find((item) =>
    item.ativo !== false &&
    item.empresa_id === company.id &&
    item.empresa_horario_id === schedule.id
  );
  if (!shift) throw new Error("Não existe um turno ativo para essa empresa e entrada.");
  return {
    companyId: company.id,
    scheduleId: schedule.id,
    shiftId: shift.id,
    scheduleLabel: `${String(schedule.horario_entrada).slice(0, 5)} as ${String(schedule.horario_saida).slice(0, 5)}`,
  };
}
```

`classifyImportedCollaborators` deve agrupar todos os colaboradores ativos por nome normalizado. Um unico candidato vinculado vira `team`; um unico candidato sem vinculo vira `bank`; nenhum vira `new`; mais de um vira `ambiguous`. Nao selecionar automaticamente um homonimo mesmo que um dos candidatos tenha vinculo.

- [ ] **Step 4: Rodar os testes**

Run:

```powershell
node --import tsx --test tests/dashboard-shift-list-import.test.mjs
```

Expected: todos em `PASS`.

- [ ] **Step 5: Commit da classificacao**

```powershell
git add apps/dashboard/src/lib/shift-list-import.ts tests/dashboard-shift-list-import.test.mjs
git commit -m "feat: classificar colaboradores importados com seguranca"
```

### Task 3: Painel de importacao e revisao

**Files:**
- Create: `apps/dashboard/src/components/ShiftListImportPanel.tsx`
- Create: `tests/dashboard-shift-list-import-contract.test.mjs`

- [ ] **Step 1: Escrever o teste de contrato que falha**

Criar:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const componentPath = new URL("../apps/dashboard/src/components/ShiftListImportPanel.tsx", import.meta.url);

test("painel oferece ajuda, revisao e confirmacao separada da fila", () => {
  const source = fs.readFileSync(componentPath, "utf8");
  assert.match(source, /Ver modelo de preenchimento/);
  assert.match(source, /Copiar modelo/);
  assert.match(source, /Interpretar lista/);
  assert.match(source, /Aplicar à equipe do dia/);
  assert.match(source, /Cancelar importação/);
  assert.doesNotMatch(source, /onCreateQueue/);
});

test("painel permite decidir encontrados no banco, novos e homonimos", () => {
  const source = fs.readFileSync(componentPath, "utf8");
  assert.match(source, /Usar contato e vincular/);
  assert.match(source, /Editar contato e vincular/);
  assert.match(source, /Não incluir/);
  assert.match(source, /Novo colaborador/);
  assert.match(source, /Selecione o cadastro correto/);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run:

```powershell
node --import tsx --test tests/dashboard-shift-list-import-contract.test.mjs
```

Expected: `FAIL` porque o componente nao existe.

- [ ] **Step 3: Criar o componente isolado**

Definir propriedades explicitas:

```ts
export type ShiftListImportPanelProps = {
  companies: ImportCompany[];
  schedules: ImportSchedule[];
  shifts: ImportShift[];
  collaborators: ImportCollaborator[];
  links: ImportLink[];
  selectedCollaboratorIds: string[];
  onLinkExisting: (collaboratorId: string, scheduleId: string) => Promise<void>;
  onUpdateAndLink: (input: {
    collaboratorId: string;
    name: string;
    phone: string;
    scheduleId: string;
  }) => Promise<void>;
  onCreateAndLink: (input: {
    name: string;
    phone: string;
    scheduleId: string;
  }) => Promise<string>;
  onApply: (input: {
    companyId: string;
    scheduleId: string;
    shiftId: string;
    operationDate: string;
    dispatchTime: string;
    collaboratorIds: string[];
  }) => void;
};

export type AppliedShiftListImport = {
  companyId: string;
  scheduleId: string;
  shiftId: string;
  operationDate: string;
  dispatchTime: string;
  collaboratorIds: string[];
};
```

O componente deve manter:

- texto original;
- selecao anterior recebida no momento da abertura;
- resultado interpretado;
- decisoes por nome;
- campos de telefone editaveis;
- estado de salvamento por item;
- erro humano por item e erro geral.

O bloco `Ver modelo de preenchimento` deve usar `<details>`, exibir o exemplo aprovado e copiar com `navigator.clipboard.writeText`, sem alterar o `textarea`.

`Interpretar lista` chama parser, resolucao, validacao de horario futuro e classificador. `Aplicar a equipe do dia` fica desabilitado enquanto existir `new`, `bank` ou `ambiguous` sem decisao. O componente nunca chama a RPC de criacao da fila.

- [ ] **Step 4: Rodar contrato e typecheck**

Run:

```powershell
node --import tsx --test tests/dashboard-shift-list-import-contract.test.mjs
npm run typecheck
```

Expected: contrato e typecheck em `PASS`.

- [ ] **Step 5: Commit do painel**

```powershell
git add apps/dashboard/src/components/ShiftListImportPanel.tsx tests/dashboard-shift-list-import-contract.test.mjs
git commit -m "feat: adicionar revisao assistida de listas"
```

### Task 4: Adaptadores Supabase e integracao com Turnos

**Files:**
- Modify: `apps/dashboard/app/page.tsx`
- Modify: `tests/dashboard-shift-list-import-contract.test.mjs`

- [ ] **Step 1: Ampliar o teste de contrato antes da integracao**

Adicionar assercoes:

```js
const pagePath = new URL("../apps/dashboard/app/page.tsx", import.meta.url);

test("Turnos integra o importador sem remover os fluxos existentes", () => {
  const page = fs.readFileSync(pagePath, "utf8");
  assert.match(page, /ShiftListImportPanel/);
  assert.match(page, /Carregar equipe fixa/);
  assert.match(page, /Reaproveitar última lista/);
  assert.match(page, /Adicionar somente hoje/);
  assert.match(page, /Adicionar fila/);
  assert.match(page, /dmr_criar_operacao_com_equipe/);
});

test("edicao importada bloqueia telefone pertencente a outro cadastro", () => {
  const page = fs.readFileSync(pagePath, "utf8");
  assert.match(page, /Este telefone já pertence a outro colaborador/);
  assert.match(page, /dmr_vincular_colaborador_existente/);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run:

```powershell
node --import tsx --test tests/dashboard-shift-list-import-contract.test.mjs
```

Expected: `FAIL` porque `page.tsx` ainda nao integra o painel.

- [ ] **Step 3: Criar adaptadores seguros no componente principal**

Adicionar:

```ts
async function findCollaboratorByEquivalentPhone(phone: string) {
  const normalized = normalizarTelefoneBrasil(phone);
  const { data: existing, error } = await supabase
    .from("colaboradores")
    .select("id,nome,telefone")
    .in("telefone_normalizado", telefonesEquivalentesBrasil(normalized))
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return { normalized, existing };
}
```

Implementar tres adaptadores:

- `linkImportedCollaborator`: chama `dmr_vincular_colaborador_existente`.
- `updateAndLinkImportedCollaborator`: verifica conflito de telefone com `id` diferente, atualiza o cadastro escolhido e cria o vinculo.
- `createAndLinkImportedCollaborator`: verifica conflito; se nao houver, insere e vincula. Nunca renomeia silenciosamente um cadastro encontrado pelo telefone.

Todas as operacoes devem passar por `mutate` ou atualizar `refreshAll` depois do sucesso e converter erros tecnicos em mensagens operacionais.

- [ ] **Step 4: Integrar ao estado atual de Turnos**

Importar o componente e fornecer todos os dados e callbacks. Em `Turnos`, implementar `applyImportedTeam`:

```ts
function applyImportedTeam(input: AppliedShiftListImport) {
  setSelectedEmpresa(empresaGrupoKeyPorId(empresas, input.companyId));
  setSelectedTurno(input.shiftId);
  setOperationDate(input.operationDate);
  setHorarioDisparo(input.dispatchTime);
  setColaboradoresSelecionados([...new Set(input.collaboratorIds)]);
  setEquipeCarregada(true);
  setFilaAviso("");
}
```

O painel deve ficar antes da equipe do dia. A aplicacao deve preencher os campos existentes, mas nao submeter `handleCreateFila`.

- [ ] **Step 5: Rodar testes focados, typecheck e testes atuais de operacao**

Run:

```powershell
node --import tsx --test tests/dashboard-shift-list-import.test.mjs tests/dashboard-shift-list-import-contract.test.mjs tests/dashboard-operations.test.mjs tests/core.test.mjs
npm run typecheck
```

Expected: todos em `PASS`.

- [ ] **Step 6: Commit da integracao**

```powershell
git add apps/dashboard/app/page.tsx tests/dashboard-shift-list-import-contract.test.mjs
git commit -m "feat: integrar listas importadas a equipe do dia"
```

### Task 5: Layout responsivo e verificacao visual

**Files:**
- Modify: `apps/dashboard/app/styles.css`
- Modify: `tests/dashboard-upgrade.visual.spec.ts`

- [ ] **Step 1: Adicionar o cenario visual antes dos estilos**

Criar um teste Playwright que:

- abre Turnos autenticado;
- abre `Importar lista`;
- verifica que textarea, ajuda e botoes nao se sobrepoem em `1440x900`;
- repete em `390x844`;
- cola uma lista contendo um encontrado, um novo e um homonimo;
- verifica que os estados sao distinguiveis por texto, nao apenas por cor;
- confirma que o telefone nao aparece completo fora do modo de edicao.

- [ ] **Step 2: Rodar o teste e registrar a falha visual**

Run:

```powershell
npx playwright test tests/dashboard-upgrade.visual.spec.ts --grep "importacao assistida"
```

Expected: `FAIL` ate que os seletores e estilos sejam implementados.

- [ ] **Step 3: Implementar estilos**

Adicionar classes focadas:

```css
.shift-list-import {
  display: grid;
  gap: 16px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.shift-list-import-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.import-review-list {
  display: grid;
  gap: 8px;
}

.import-review-item {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(140px, auto) minmax(240px, auto);
  gap: 12px;
  align-items: center;
  border: 1px solid var(--border);
  border-left: 4px solid var(--muted);
  padding: 12px;
  border-radius: 6px;
}

.import-review-item[data-status="team"] { border-left-color: var(--success); }
.import-review-item[data-status="bank"] { border-left-color: var(--info); }
.import-review-item[data-status="new"] { border-left-color: var(--warning); }
.import-review-item[data-status="ambiguous"] { border-left-color: var(--danger); }

@media (max-width: 760px) {
  .shift-list-import-summary,
  .import-review-item {
    grid-template-columns: 1fr;
  }
}
```

Usar as variaveis de cor existentes; se algum token nao existir, mapear para as cores sem introduzir uma nova paleta dominante.

- [ ] **Step 4: Rodar verificacao visual e build**

Run:

```powershell
npx playwright test tests/dashboard-upgrade.visual.spec.ts --grep "importacao assistida"
npm run build
```

Expected: teste visual e build em `PASS`.

- [ ] **Step 5: Commit visual**

```powershell
git add apps/dashboard/app/styles.css tests/dashboard-upgrade.visual.spec.ts
git commit -m "style: organizar importacao assistida de listas"
```

### Task 6: Regressao completa e seguranca

**Files:**
- Verify only

- [ ] **Step 1: Rodar toda a suite**

```powershell
npm test
```

Expected: zero testes com falha.

- [ ] **Step 2: Rodar verificacoes estaticas**

```powershell
npm run typecheck
npm run lint
npm run secrets:scan
npm run build
```

Expected: todos os comandos concluidos com codigo `0`.

- [ ] **Step 3: Conferir escopo do diff**

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: somente os arquivos da funcionalidade e alteracoes preexistentes conhecidas; nenhum segredo, artefato de build ou arquivo de sessao WhatsApp.

- [ ] **Step 4: Teste operacional manual sem enviar WhatsApp**

No dashboard local:

1. Abrir Turnos.
2. Confirmar que o fluxo manual continua disponivel.
3. Colar o modelo aprovado.
4. Interpretar.
5. Conferir empresa, jornada, data e disparo.
6. Resolver um contato do banco.
7. Criar um contato novo com telefone de teste permitido.
8. Cancelar e confirmar restauracao da selecao anterior.
9. Repetir e aplicar a equipe.
10. Conferir o `FormData` ou banco de teste sem iniciar disparos reais.

- [ ] **Step 5: Commit de ajustes finais, somente se necessario**

```powershell
git add apps/dashboard/src/lib/shift-list-import.ts apps/dashboard/src/components/ShiftListImportPanel.tsx apps/dashboard/app/page.tsx apps/dashboard/app/styles.css tests/dashboard-shift-list-import.test.mjs tests/dashboard-shift-list-import-contract.test.mjs tests/dashboard-upgrade.visual.spec.ts
git commit -m "test: validar importacao assistida ponta a ponta"
```
