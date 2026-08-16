# Seguranca e Privacidade

## Regras

- Supabase Auth obrigatorio para o Dashboard.
- RLS habilitado em todas as tabelas sensiveis.
- Frontend usa apenas anon/publishable key.
- Service role somente em Edge Functions ou ambiente local seguro.
- `DMR_BOT_TOKEN` obrigatorio nas funcoes usadas pelo bot.
- Nao registrar secrets, tokens, QR Code, session data ou service role.
- Telefones devem ser mascarados em logs e UI de lista.
- Funcoes do bot e a funcao de geracao de fila exigem `x-dmr-bot-token`.
- QR Code do WhatsApp aparece somente no terminal local do bot.
- Acoes administrativas feitas pelo Dashboard registram auditoria via RPC `dmr_log_action`.
- Scripts de deploy remoto usam `db push`; nao ha `db reset --linked`, `db reset --db-url`, `truncate` remoto ou delete massivo remoto.
- Secrets de Edge Functions sao pedidos pelo script `scripts/supabase-secrets-set.ps1` e nao sao gravados em arquivo versionado.

## Privacidade / LGPD

Finalidade: confirmacao operacional de presenca.

Dados tratados: nome, telefone, empresa, turno, escala, status de resposta, logs operacionais e contatos DMR de alerta.

Quem acessa: usuarios autorizados da DMR conforme perfil `admin`, `operador` ou `visualizador`.

Retencao sugerida: manter registros pelo prazo operacional/contratual definido pela DMR e revisar periodicamente logs antigos.

Exclusao/inativacao: colaboradores devem ser inativados, desligados ou desvinculados pela DMR no Dashboard. Nao ha auto-remocao pelo colaborador.

Medidas: Auth, RLS, token de bot, logs sem secrets, mascaramento de telefone e migrations versionadas.

## Verificacoes Executadas

Em 2026-06-18:

- `node scripts/scan-secrets.mjs`: passou.
- `tests/static-security.test.mjs`: confirmou ausencia de service role, `dangerouslySetInnerHTML` e QR Code publico no frontend.
- `tests/static-security.test.mjs`: confirmou a estrategia de unicidade parcial da fila de mensagens.
- `tests/static-security.test.mjs`: confirmou scripts Supabase obrigatorios e ausencia de comandos destrutivos remotos.
- `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- `.gitignore`: inclui `.env`, `.env.local`, `.wwebjs_auth`, `.wwebjs_cache` e logs.

Bloqueios encontrados:

- `npx supabase projects list` retornou `Unauthorized`; ainda falta login valido no Supabase CLI.
- `npx supabase db push --dry-run` nao executou porque o projeto ainda nao esta linkado.
- `npx supabase functions list` falhou neste ambiente com `runtime: cannot allocate memory` antes de chegar ao remoto.
- O teste local com Docker nao concluiu porque o Docker Desktop falhou ao puxar imagens com `meta.db: read-only file system`. Reiniciar o Docker Desktop deve ser a primeira tentativa.
- `npm outdated` falhou com `ENOSPC`, indicando falta de espaco em disco/cache npm insuficiente.
