# Banco de Dados

Este documento acompanha as migrations em `supabase/migrations`.

Tabelas planejadas:

- `usuarios_dashboard`
- `empresas`
- `turnos_empresa`
- `colaboradores`
- `empresa_colaboradores`
- `escalas`
- `escala_colaboradores`
- `fila_mensagens`
- `mensagens_recebidas`
- `contatos_alerta_dmr`
- `alertas_dmr`
- `bot_heartbeats`
- `logs_acoes`
- `configuracoes_sistema`

Migration criada:

- `supabase/migrations/20260618000100_dmr_confirmacao_presenca.sql`
- `supabase/migrations/20260618000200_supabase_automation_cron.sql`
- `supabase/migrations/20260619000200_messages_schedule_cleanup.sql`

Principais garantias:

- RLS habilitado nas tabelas sensiveis.
- Helpers `is_admin()`, `is_operador()`, `is_visualizador()` e `current_dashboard_user_role()`.
- Constraints contra duplicidade de colaborador na mesma escala.
- Constraints contra duplicidade de mensagens/alertas por `chave_unica` e por `(escala_colaborador_id, tipo, contato_alerta_dmr_id)`.
- Indices para data, empresa, colaborador, telefone, status, filas pendentes, turnos, horario e prioridade.
- Defaults de configuracao para intervalos e limites do bot.
- Funcao SQL `public.gerar_fila_confirmacoes()` para criar confirmacoes, lembretes e alertas.
- Cron `dmr_gerar_fila_confirmacoes_every_minute` agendado a cada minuto por `pg_cron`.
- Funcao SQL `public.limpar_dados_tecnicos_dmr()` para limpar heartbeats antigos e logs tecnicos antigos.
- Cron `dmr_limpar_dados_tecnicos_daily` para manutencao diaria.

Observacao operacional: `templates_mensagem` e a configuracao `agenda_padrao` foram removidas na migration de limpeza. As mensagens e horarios oficiais passam pela regra SQL proporcional baseada no horario manual de disparo e no horario de entrada do turno.

Observacao: o primeiro usuario admin pode ser vinculado pelo script `scripts/supabase-admin-create.ps1` depois que o usuario existir no Supabase Auth.
