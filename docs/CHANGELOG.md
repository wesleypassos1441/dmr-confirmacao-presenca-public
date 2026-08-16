# Changelog

## 0.2.0 - 2026-06-19

- Mensagens de confirmacao reorganizadas em formato visual com saudacao, empresa, horario e opcoes `1 - Sim` / `2 - Não`.
- Normalizacao de respostas reforcada para aceitar variacoes claras de sim/nao e rejeitar mensagens ambiguas.
- Agenda de disparos passou a ser proporcional ao horario manual de inicio, com alerta uma hora antes da entrada.
- Dashboard bloqueia criacao de fila com uma hora ou menos de antecedencia.
- A prioridade operacional passou a vir do turno.
- Edge Functions alternativas de geracao de fila e relatorio diario foram removidas do deploy local.
- `templates_mensagem` e `agenda_padrao` foram substituidos pela regra oficial SQL.
- Criada manutencao de dados tecnicos para heartbeats e logs antigos.
- Documentacao atualizada para refletir o fluxo oficial.

## 0.1.0 - 2026-06-18

- Projeto novo criado em pasta isolada.
- Documentacao base criada.
- Pacote de regras criado em `packages/core`.
- Migration Supabase criada com tabelas, enums, indices, constraints e RLS.
- Edge Functions criadas para fila, bot, respostas, erros, heartbeat e relatorio diario.
- Bot WhatsApp local criado em `apps/whatsapp-bot`.
- Dashboard Next.js criado em `apps/dashboard`.
- Painel do dia recebeu filtros por empresa, turno, prioridade e status.
- Acoes do Dashboard registram auditoria via RPC `dmr_log_action`.
- Testes de regras e seguranca estatica adicionados.
- Teste visual Playwright adicionado para desktop e mobile.
- Indice unico da fila ajustado para permitir orientacoes repetidas de resposta incompreensivel sem duplicar mensagens operacionais.
- Scan de secrets e lockfile auditado sem vulnerabilidades moderadas ou superiores.
- Supabase CLI adicionada como dependencia local.
- Scripts PowerShell criados para check, link, secrets, deploy, deploy de functions, reset local, tipos e criacao de admin.
- Scripts `.sh` basicos criados para check e deploy.
- Cron de confirmacoes movido para migration com `pg_cron` e funcao SQL `public.gerar_fila_confirmacoes()`.
