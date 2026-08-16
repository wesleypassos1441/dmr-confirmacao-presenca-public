# Alphabetical Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ordenar todas as entidades nominais do dashboard de forma consistente e oferecer `Desmarcar todos` na Equipe do dia.

**Architecture:** Comparadores puros ficarao em um modulo pequeno do dashboard, coberto por testes unitarios. Os componentes continuarao aplicando regras temporais e de status, usando o comparador nominal como criterio principal ou desempate conforme a especificacao.

**Tech Stack:** TypeScript, React, Next.js, Node Test Runner.

---

### Task 1: Comparadores nominais e operacionais

**Files:**
- Create: `apps/dashboard/src/lib/sort.ts`
- Create: `tests/dashboard-sort.test.mjs`

- [ ] Escrever testes para nomes com caixa e acentos, grupos empresa/turno e painel com pendentes antes de concluidos.
- [ ] Executar `node --import tsx --test tests/dashboard-sort.test.mjs` e confirmar RED por modulo ausente.
- [ ] Implementar `compareNamesPtBr`, `compareNamedRows` e `comparePanelRows` sem mutar entradas.
- [ ] Reexecutar o teste e confirmar GREEN.

### Task 2: Aplicar ordenacao em todas as listas nominais

**Files:**
- Modify: `apps/dashboard/app/page.tsx`
- Modify: `tests/static-security.test.mjs`

- [ ] Adicionar teste estatico exigindo os comparadores compartilhados nos componentes de empresas, turnos, colaboradores, painel, relatorios e contatos.
- [ ] Executar o teste e confirmar RED.
- [ ] Ordenar empresas e contatos por nome; colaboradores por nome; grupos por empresa/turno; opcoes nominais por label.
- [ ] Preservar auditoria cronologica e horarios temporais.
- [ ] Aplicar no Painel do Dia `comparePanelRows`, mantendo pendentes primeiro e nomes alfabeticos dentro de cada estado.
- [ ] Reexecutar os testes focados e confirmar GREEN.

### Task 3: Controle Desmarcar todos

**Files:**
- Modify: `apps/dashboard/app/page.tsx`
- Modify: `apps/dashboard/app/globals.css`
- Modify: `tests/static-security.test.mjs`

- [ ] Escrever teste exigindo botao `Desmarcar todos`, estado desabilitado sem selecao e `setColaboradoresSelecionados([])`.
- [ ] Executar o teste e confirmar RED.
- [ ] Adicionar botao secundario junto ao cabecalho da Equipe do dia, com alvo de toque adequado e layout responsivo.
- [ ] Reexecutar o teste e confirmar GREEN.

### Task 4: Verificacao funcional

**Files:**
- Modify: `docs/QA_CHECKLIST.md`

- [ ] Documentar verificacao de ordenacao e limpeza de selecao.
- [ ] Executar `npm test`, `npm run typecheck`, `npm run secrets:scan` e build do dashboard.
- [ ] Iniciar o dashboard e verificar visualmente desktop e mobile com dados reais, sem alterar registros.
- [ ] Confirmar que o bot oculto permanece `ONLINE`.
- [ ] Commitar e enviar ao GitHub.

