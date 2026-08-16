# Mensagens, Agenda e Limpeza Conservadora Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar mensagens claras, respostas conservadoras, tres tentativas proporcionais e remover caminhos comprovadamente obsoletos sem perder historico.

**Architecture:** A regra pura fica em `packages/core`, enquanto a funcao SQL do cron permanece como unico gerador de fila. A Edge Function de entrada interpreta respostas e cancela lembretes; o Dashboard apenas configura a operacao e valida a janela. Remocoes de banco entram em uma nova migration, preservando colunas antigas de prioridade nesta etapa.

**Tech Stack:** Node.js 24, TypeScript, Next.js, Supabase/PostgreSQL, Deno Edge Functions, whatsapp-web.js, Node Test Runner.

---

### Task 1: Regras centrais de mensagens, respostas e agenda

**Files:**
- Modify: `packages/core/src/index.mjs`
- Modify: `packages/core/src/index.d.ts`
- Modify: `tests/core.test.mjs`

- [ ] Escrever testes que exigem mensagens com nome, empresa, horario e linhas `1 - Sim` / `2 - Não`.
- [ ] Escrever testes para `1`, `2`, variacoes positivas, negativas, ambiguas e contraditorias.
- [ ] Escrever teste da agenda `05:21`, `06:01`, `06:40`, alerta `07:00` para entrada `08:00`.
- [ ] Executar `node --test tests/core.test.mjs` e confirmar falhas pelas regras ausentes.
- [ ] Implementar normalizacao por frases completas, negativas antes de positivas e deteccao de contradicao.
- [ ] Implementar agenda proporcional em 0%, 40% e 80%, rejeitando janela de uma hora ou menos.
- [ ] Substituir templates antigos por gerador unico com tipos `confirmacao_inicial`, `lembrete_1` e `lembrete_2`.
- [ ] Atualizar declaracoes TypeScript.
- [ ] Executar `node --test tests/core.test.mjs` e confirmar sucesso.

### Task 2: Migration do fluxo oficial e limpeza de banco

**Files:**
- Create: `supabase/migrations/20260619000200_messages_schedule_cleanup.sql`
- Modify: `tests/static-security.test.mjs`

- [ ] Escrever testes estaticos para agenda proporcional, alerta em `entrada - 1 hour`, prioridade apenas do turno e rejeicao de janela tardia.
- [ ] Escrever testes estaticos para remocao de `templates_mensagem`, `agenda_padrao` e retencao tecnica.
- [ ] Executar `node --test tests/static-security.test.mjs` e confirmar falhas.
- [ ] Criar migration que substitui `public.gerar_fila_confirmacoes()` com mensagens e agenda aprovadas.
- [ ] Manter `chave_unica`, cancelamento por estado e alerta aos contatos DMR.
- [ ] Remover `templates_mensagem` e a configuracao `agenda_padrao`.
- [ ] Criar `public.limpar_dados_tecnicos_dmr()` para heartbeats acima de 30 dias e acoes tecnicas permitidas acima de 90 dias.
- [ ] Agendar manutencao diaria com `pg_cron`.
- [ ] Executar testes estaticos e confirmar sucesso.

### Task 3: Respostas e cancelamento sem duplicidade

**Files:**
- Modify: `supabase/functions/_shared/presence.ts`
- Modify: `supabase/functions/bot-register-incoming/index.ts`
- Modify: `tests/static-security.test.mjs`

- [ ] Escrever testes estaticos para expressoes completas, cancelamento de filas pendentes e uma unica orientacao de resposta invalida.
- [ ] Executar o teste e confirmar falha.
- [ ] Alinhar `normalizarResposta` com a biblioteca central.
- [ ] Alterar a orientacao incompreensivel para o formato visual aprovado.
- [ ] Remover a duplicidade entre fila `resposta_incompreensivel` e resposta direta, mantendo somente resposta direta.
- [ ] Garantir que respostas validas cancelem `lembrete_1`, `lembrete_2` e `alerta_sem_resposta`.
- [ ] Executar testes e confirmar sucesso.

### Task 4: Dashboard e codigo morto

**Files:**
- Modify: `apps/dashboard/app/page.tsx`
- Modify: `tests/static-security.test.mjs`

- [ ] Escrever testes que proíbem componentes, schemas e manipuladores mortos.
- [ ] Escrever teste da validacao de mais de uma hora antes da entrada.
- [ ] Executar o teste e confirmar falha.
- [ ] Remover `OperacaoManual`, `Vinculos`, `Escalas` e seus manipuladores sem consumidor.
- [ ] Remover a consulta geral de `escalas` se `data.escalas` nao possuir consumidor.
- [ ] Manter `empresa_colaboradores`, pois a tela de colaboradores depende do vinculo.
- [ ] Remover `prioridade_envio_padrao` da consulta de empresas.
- [ ] Validar a janela no envio do formulario e exibir `Inicie os disparos com mais de uma hora de antecedência.`
- [ ] Remover controles da configuracao `agenda_padrao`.
- [ ] Executar testes e typecheck.

### Task 5: Remover caminhos alternativos e atualizar deploy

**Files:**
- Delete: `supabase/functions/gerar-fila-confirmacoes/index.ts`
- Delete: `supabase/functions/admin-report-daily/index.ts`
- Modify: `scripts/supabase-functions-deploy.ps1`
- Modify: `scripts/supabase-deploy.sh`
- Modify: `tests/static-security.test.mjs`

- [ ] Escrever testes que rejeitam as duas funcoes obsoletas e referencias nos scripts.
- [ ] Executar o teste e confirmar falha.
- [ ] Excluir as funcoes locais e remover seus deploys.
- [ ] Manter somente as cinco funcoes do bot: next, mark-sent, register-incoming, register-error e health.
- [ ] Executar testes e confirmar sucesso.

### Task 6: Higiene local e documentacao

**Files:**
- Modify: `.gitignore`
- Delete: `logs/bot-validation.out.log`
- Delete: `logs/bot-validation.err.log`
- Delete: `logs/bot-validation-2.out.log`
- Delete: `logs/bot-validation-2.err.log`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DATABASE_SCHEMA.md`
- Modify: `docs/EDGE_FUNCTIONS.md`
- Modify: `docs/WHATSAPP_BOT.md`
- Modify: `docs/QA_CHECKLIST.md`
- Modify: `docs/CHANGELOG.md`

- [ ] Ignorar `.dmr-bot.lock`.
- [ ] Remover apenas logs locais de validacao.
- [ ] Atualizar a arquitetura para cron SQL unico.
- [ ] Atualizar esquema, funcoes, bot, QA e changelog.
- [ ] Verificar que a documentacao nao cita telas ou funcoes removidas.

### Task 7: Verificacao e deploy

**Files:**
- Verify all modified files

- [ ] Executar `npm test`.
- [ ] Executar `npm run typecheck`.
- [ ] Executar `npm run build`.
- [ ] Executar `node scripts/scan-secrets.mjs`.
- [ ] Executar `npx supabase db push --dry-run`.
- [ ] Se autenticacao e senha estiverem disponiveis, executar `npx supabase db push`.
- [ ] Executar `powershell -ExecutionPolicy Bypass -File scripts/supabase-functions-deploy.ps1`.
- [ ] Verificar no banco que `agenda_padrao` e `templates_mensagem` foram removidos e que o cron permanece ativo.
- [ ] Se o deploy remoto estiver bloqueado por credenciais, preservar os artefatos prontos e relatar o comando exato restante.
