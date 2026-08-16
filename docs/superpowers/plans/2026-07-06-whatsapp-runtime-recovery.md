# WhatsApp Runtime Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recuperar automaticamente o navegador do bot sem perder mensagens ou anunciar uma conexao falsa.

**Architecture:** Um modulo puro classifica a saude e os erros do runtime. O bot usa essa classificacao para devolver claims transitorios e sair com codigo reiniciavel; a Edge Function preserva tentativas e o launcher supervisiona a reinicializacao.

**Tech Stack:** TypeScript, Node.js, whatsapp-web.js, PowerShell/CMD, Supabase Edge Functions.

---

### Task 1: Classificacao de saude

**Files:**
- Create: `apps/whatsapp-bot/src/runtime-health.ts`
- Create: `tests/bot-runtime-health.test.mjs`

- [ ] Escrever testes que reproduzem `detached Frame`, pagina fechada e browser desconectado.
- [ ] Executar o teste e confirmar falha pela ausencia do modulo.
- [ ] Implementar classificadores puros e codigo de reinicio 75.
- [ ] Executar o teste e confirmar sucesso.

### Task 2: Ciclo operacional

**Files:**
- Modify: `apps/whatsapp-bot/src/index.ts`
- Modify: `.env.example`
- Modify: `.env`

- [ ] Fazer heartbeat depender da saude real.
- [ ] Marcar falha de sessao como transitoria e encerrar com codigo 75.
- [ ] Usar navegador headless no ambiente operacional local.
- [ ] Compilar o bot.

### Task 3: Preservacao da fila

**Files:**
- Modify: `supabase/functions/bot-register-error/index.ts`
- Modify: `tests/static-security.test.mjs`

- [ ] Criar regressao estatica para o payload transitorio.
- [ ] Confirmar que o teste falha.
- [ ] Recuar uma tentativa e reagendar quando a sessao estiver indisponivel.
- [ ] Confirmar que o teste passa.

### Task 4: Supervisor local

**Files:**
- Modify: `Ligar Bot DMR.cmd`
- Modify: `tests/whatsapp-login-flow.test.mjs`

- [ ] Exigir reinicio automatico apenas para exit code 75.
- [ ] Confirmar falha do teste antes da mudanca.
- [ ] Implementar espera curta e reinicio.
- [ ] Confirmar sucesso do teste.

### Task 5: Verificacao e recuperacao

**Files:**
- No source file changes.

- [ ] Executar `npm run test`.
- [ ] Executar `npm run typecheck`.
- [ ] Executar build do bot e scan de segredos.
- [ ] Implantar `bot-register-error`.
- [ ] Reiniciar o bot atualizado e confirmar heartbeat saudavel.
- [ ] Reabrir somente as cinco mensagens afetadas e confirmar saida de `erro`.
