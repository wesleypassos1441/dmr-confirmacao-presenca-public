# Formatacao Brasileira Global Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar exibicao de datas ISO e horarios UTC em mensagens e telas destinadas ao usuario.

**Architecture:** Cada runtime possui um utilitario central com a mesma semantica. Templates recebem valores crus e aplicam a formatacao no ponto de exibicao, enquanto o banco continua armazenando ISO/UTC.

**Tech Stack:** TypeScript, JavaScript ESM, Deno Edge Functions, Intl.DateTimeFormat, Node Test Runner.

---

### Task 1: Testes de regressao

**Files:**
- Create: `tests/date-time-format.test.mjs`
- Modify: `tests/static-security.test.mjs`

- [ ] Exigir `21/06/2026` para data SQL `2026-06-21`.
- [ ] Exigir `04:11` para `2026-06-21T07:11:00Z`.
- [ ] Exigir dia anterior em Sao Paulo para instante UTC depois da meia-noite.
- [ ] Executar testes e confirmar falha pela ausencia dos formatadores.

### Task 2: Formatadores centrais

**Files:**
- Create: `supabase/functions/_shared/date-time.ts`
- Modify: `packages/core/src/index.mjs`
- Modify: `packages/core/src/index.d.ts`
- Modify: `apps/dashboard/src/lib/format.ts`

- [ ] Implementar formatacao de data, hora e data/hora com fuso explicito.
- [ ] Executar testes focados ate passarem.

### Task 3: Templates protegidos

**Files:**
- Modify: `supabase/functions/_shared/presence.ts`
- Modify: `supabase/functions/bot-register-incoming/index.ts`
- Modify: `apps/dashboard/app/page.tsx`

- [ ] Formatar data e hora dentro dos templates de alerta.
- [ ] Passar `receivedAt` cru para o template de ausencia.
- [ ] Substituir o formatador local do dashboard pelo utilitario central.

### Task 4: Verificacao

**Files:**
- Verify: all changed files

- [ ] Executar suite completa, typecheck, lint, secrets scan e build.
- [ ] Repetir a busca por `toLocale*` e confirmar fuso explicito nos pontos de apresentacao.
