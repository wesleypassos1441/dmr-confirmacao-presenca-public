# Captura Confiavel de Respostas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir respostas prematuras, resolver remetentes LID e recuperar falhas temporarias das Edge Functions.

**Architecture:** O bot normaliza o remetente e conserva o timestamp do WhatsApp antes de chamar a Edge Function. A funcao remota autoriza a resposta apenas quando a mensagem inicial foi registrada como enviada. O polling usa retentativa e backoff para separar indisponibilidade de rede de erros funcionais.

**Tech Stack:** TypeScript, Node.js, whatsapp-web.js, Supabase Edge Functions, Node Test Runner.

---

### Task 1: Reproduzir as falhas

**Files:**
- Modify: `tests/static-security.test.mjs`
- Create: `tests/bot-incoming.test.mjs`

- [ ] Escrever testes que exijam conversao LID, timestamp original, filtro por envio e backoff.
- [ ] Executar os testes focados e confirmar falha pelas protecoes ausentes.

### Task 2: Corrigir identidade e horario da resposta

**Files:**
- Create: `apps/whatsapp-bot/src/incoming.ts`
- Modify: `apps/whatsapp-bot/src/index.ts`
- Test: `tests/bot-incoming.test.mjs`

- [ ] Implementar resolucao LID via `client.getContactLidAndPhone` sem usar o proprio LID como telefone.
- [ ] Converter `message.timestamp` para ISO e usar o horario atual apenas quando o evento nao o fornecer.
- [ ] Executar o teste focado ate passar.

### Task 3: Bloquear respostas anteriores ao envio

**Files:**
- Modify: `supabase/functions/bot-register-incoming/index.ts`
- Test: `tests/static-security.test.mjs`

- [ ] Exigir `mensagem_enviada_em` preenchido e anterior ou igual a `recebida_em` na escala selecionada.
- [ ] Retornar uma resposta neutra, sem alterar dados, quando nao existir envio elegivel.
- [ ] Executar o teste focado ate passar.

### Task 4: Recuperar falhas temporarias de rede

**Files:**
- Create: `apps/whatsapp-bot/src/network.ts`
- Modify: `apps/whatsapp-bot/src/index.ts`
- Test: `tests/bot-incoming.test.mjs`

- [ ] Implementar timeout, classificacao de erro HTTP e retentativa progressiva.
- [ ] Suspender temporariamente o polling depois de falhas consecutivas e registrar apenas mudancas de estado.
- [ ] Repetir o registro de respostas em falhas transitorias.
- [ ] Executar o teste focado ate passar.

### Task 5: Verificacao integral

**Files:**
- Verify: all changed files

- [ ] Executar `npm test` e exigir zero falhas.
- [ ] Executar `npm run typecheck`, `npm run lint`, `npm run secrets:scan` e `npm run build`.
- [ ] Revisar o diff e confirmar que regras de horarios e quantidade de mensagens nao mudaram.
