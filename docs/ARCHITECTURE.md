# Arquitetura

O projeto e dividido em quatro partes:

1. `packages/core`: regras puras de negocio, como horarios de envio, normalizacao de resposta, mascaramento e mensagens.
2. `supabase`: migrations, RLS, funcoes SQL, cron e Edge Functions.
3. `apps/dashboard`: Dashboard administrativo autenticado para empresas, turnos, colaboradores, painel diario, relatorios, contatos, logs e configuracoes.
4. `apps/whatsapp-bot`: robo local que usa WhatsApp Web, busca mensagens pendentes nas Edge Functions, envia mensagens, registra respostas e heartbeat.

Fluxo resumido:

1. Dashboard cria empresas, turnos, colaboradores e filas manuais de disparo.
2. Cron chama `public.gerar_fila_confirmacoes()` a cada minuto.
3. A funcao SQL cria mensagens vencidas sem duplicidade.
4. Bot local chama `bot-next-message`, envia no WhatsApp e chama `bot-mark-sent`.
5. Respostas recebidas sao enviadas para `bot-register-incoming`.
6. O banco atualiza `escala_colaboradores`, `mensagens_recebidas`, `fila_mensagens` e `alertas_dmr`.
7. Dashboard acompanha os registros e gera relatorios.
