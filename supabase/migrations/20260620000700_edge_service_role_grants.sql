grant usage on schema public to service_role;

grant select, insert, update, delete on table
  public.empresas,
  public.turnos_empresa,
  public.colaboradores,
  public.escalas,
  public.escala_colaboradores,
  public.contatos_alerta_dmr,
  public.fila_mensagens,
  public.mensagens_recebidas,
  public.alertas_dmr,
  public.bot_heartbeats,
  public.logs_acoes,
  public.configuracoes_sistema
to service_role;
