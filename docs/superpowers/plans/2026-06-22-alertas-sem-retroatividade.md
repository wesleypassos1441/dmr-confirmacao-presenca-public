# Alertas sem retroatividade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar alertas novos a todos os contatos ativos, em poucos segundos, sem reproduzir alertas anteriores ao cadastro do destinatário.

**Architecture:** A Edge Function distribui alertas imediatos para todos os contatos ativos. A função SQL de geração da fila aplica elegibilidade temporal usando `contatos_alerta_dmr.criado_em`, e o bot usa intervalo curto para mensagens urgentes.

**Tech Stack:** Supabase PostgreSQL, Supabase Edge Functions em Deno/TypeScript, Node.js/TypeScript e `node:test`.

---

### Task 1: Testes de regressão

**Files:**
- Modify: `tests/static-security.test.mjs`

- [ ] Adicionar teste que rejeita `.limit(2)` na consulta de contatos ativos.
- [ ] Adicionar teste que exige filtros por `d.criado_em` na migration mais recente.
- [ ] Adicionar teste que exige intervalo curto para tipos `alerta_*`.
- [ ] Executar `node --import tsx --test tests/static-security.test.mjs` e confirmar falha pelas regras ausentes.

### Task 2: Distribuição imediata e intervalo curto

**Files:**
- Modify: `supabase/functions/bot-register-incoming/index.ts`
- Modify: `apps/whatsapp-bot/src/index.ts`

- [ ] Remover `.limit(2)` da consulta de contatos ativos.
- [ ] Fazer `resolveInterval` usar `initialBatchIntervals` quando `tipo` começa com `alerta_`.
- [ ] Executar o teste estático e confirmar que essas duas regras passam.

### Task 3: Elegibilidade temporal dos alertas agendados

**Files:**
- Create: `supabase/migrations/20260622000400_alert_contacts_since_creation.sql`

- [ ] Copiar a definição vigente de `gerar_fila_confirmacoes()` da migration `20260622000300_daily_team_resend_fixed_schedule.sql`.
- [ ] Exigir `d.criado_em <= h.alerta_em` para alertas sem resposta.
- [ ] Exigir `d.criado_em <= c.ultima_resposta_incompreensivel_em` para alertas de resposta incompreensível.
- [ ] Executar o teste estático e confirmar aprovação.

### Task 4: Verificação completa

**Files:**
- Verify only.

- [ ] Executar `npm test`.
- [ ] Executar `npm run typecheck`.
- [ ] Executar `npm run build`.
- [ ] Executar `npm run secrets:scan`.
- [ ] Revisar o diff para confirmar que não houve alteração fora do escopo.
