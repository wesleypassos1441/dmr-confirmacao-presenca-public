# Melhorias Operacionais Modulares Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o DMR Confirmacao de Presenca em modulos testaveis: relatorios nominais, painel compartilhado, saude do bot, diagnostico de fila, equipes fixas e auditoria humana.

**Architecture:** Manter o dashboard estatico no Netlify usando Supabase Auth e dados em tempo real via cliente anonimo protegido por RLS. Centralizar formatadores e comparadores em bibliotecas pequenas, preservar Edge Functions para operacoes do bot e usar migrations incrementais para regras de banco.

**Tech Stack:** Next.js static export, Supabase Auth/Postgres/Edge Functions, Node.js tests, TypeScript, PowerShell scripts do bot.

---

### Backup

- [x] Criar tag local `backup-before-modular-improvements-20260708` antes de alterar codigo.
- [x] Ao final, manter commits pequenos por modulo para permitir rollback seletivo.

### Task 1: Relatorios Nominais

**Files:**
- Modify: `apps/dashboard/app/page.tsx`
- Modify/Create if useful: `apps/dashboard/src/lib/reports.ts`
- Test: `tests/dashboard-reports.test.mjs`
- Test: `tests/static-security.test.mjs`

- [x] Criar teste que gera grupos por empresa/turno e lista nominalmente confirmados, nao comparecerao, aguardando resposta e respostas incompreensiveis.
- [x] Implementar helper puro para montar o relatorio nominal do dashboard.
- [x] Trocar os cartoes numericos por blocos nominais, mantendo totais pequenos como apoio apenas se nao poluir a tela.
- [x] Rodar teste especifico, `npm test`, `npm run typecheck`.
- [x] Commitar modulo.

### Task 2: Painel Compartilhado Para Usuarios Autenticados

**Files:**
- Modify/Create: `supabase/migrations/*_shared_authenticated_dashboard.sql`
- Test: `tests/frontend-rls-flows.test.mjs` or new SQL static test

- [x] Criar teste estatico garantindo que policies de dados operacionais usem `to authenticated using (true)` ou funcao equivalente para leitura compartilhada.
- [x] Criar migration que permite usuarios autenticados verem os mesmos registros operacionais.
- [x] Preservar bloqueio para usuarios anonimos e evitar exposicao de service role no frontend.
- [x] Rodar testes de RLS/seguranca, `npm test`, `npm run typecheck`.
- [x] Commitar modulo.

### Task 3: Saude do Sistema

**Files:**
- Modify: `apps/dashboard/app/page.tsx`
- Modify if needed: `apps/dashboard/src/lib/format.ts`
- Test: `tests/static-security.test.mjs`

- [x] Criar resumo visual com status do bot, ultima verificacao, ultima mensagem enviada, ultima resposta recebida, pendentes, relatorios e ultimo erro.
- [x] Usar dados existentes de `bot_status`, `fila_mensagens`, `mensagens_recebidas` e auditoria sem adicionar dependencias novas.
- [x] Rodar testes e build do dashboard.
- [x] Commitar modulo.

### Task 4: Diagnostico de Fila e Bot

**Files:**
- Modify: `apps/whatsapp-bot/src/index.ts`
- Modify: `supabase/functions/bot-register-error/index.ts`
- Modify: `apps/dashboard/app/page.tsx`
- Test: existing bot tests or new focused tests

- [x] Melhorar mensagens de log do bot para diferenciar conversa antiga, contato fora da fila, falha de rede e falha da Edge Function.
- [x] Exibir horario real de envio e motivo de falha quando existir.
- [x] Rodar testes do bot e dashboard.
- [x] Commitar modulo.

### Task 5: Equipes Fixas e Auditoria Humana

**Files:**
- Modify: `apps/dashboard/app/page.tsx`
- Modify/Create: `apps/dashboard/src/lib/audit.ts`
- Modify/Create: `supabase/migrations/*_human_audit_messages.sql`
- Test: new or existing audit/static tests

- [x] Organizar equipes por empresa e horario com textos humanos.
- [x] Transformar logs tecnicos conhecidos em frases compreensiveis no dashboard.
- [x] Garantir que exclusoes e alteracoes importantes entrem na auditoria.
- [x] Rodar testes e build.
- [x] Commitar modulo.

### Task 6: Validacao Final e Deploy

- [x] Rodar `npm test`.
- [x] Rodar `npm run typecheck`.
- [x] Rodar `node scripts/scan-secrets.mjs`.
- [x] Rodar `npm run build -w apps/dashboard`.
- [x] Rodar `git diff --check`.
- [x] Fazer push.
- [x] Publicar no Netlify via deploy automatico do GitHub.
- [x] Validar HTTP 200 e headers da URL publica.
