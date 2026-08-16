drop policy if exists dmr_shared_read_empresas on public.empresas;
create policy dmr_shared_read_empresas
on public.empresas
for select to authenticated
using (true);

drop policy if exists dmr_shared_read_empresa_horarios on public.empresa_horarios;
create policy dmr_shared_read_empresa_horarios
on public.empresa_horarios
for select to authenticated
using (true);

drop policy if exists dmr_shared_read_turnos_empresa on public.turnos_empresa;
create policy dmr_shared_read_turnos_empresa
on public.turnos_empresa
for select to authenticated
using (true);

drop policy if exists dmr_shared_read_colaboradores on public.colaboradores;
create policy dmr_shared_read_colaboradores
on public.colaboradores
for select to authenticated
using (true);

drop policy if exists dmr_shared_read_empresa_colaboradores on public.empresa_colaboradores;
create policy dmr_shared_read_empresa_colaboradores
on public.empresa_colaboradores
for select to authenticated
using (true);

drop policy if exists dmr_shared_read_escalas on public.escalas;
create policy dmr_shared_read_escalas
on public.escalas
for select to authenticated
using (true);

drop policy if exists dmr_shared_read_escala_colaboradores on public.escala_colaboradores;
create policy dmr_shared_read_escala_colaboradores
on public.escala_colaboradores
for select to authenticated
using (true);

drop policy if exists dmr_shared_read_contatos_alerta_dmr on public.contatos_alerta_dmr;
create policy dmr_shared_read_contatos_alerta_dmr
on public.contatos_alerta_dmr
for select to authenticated
using (true);

drop policy if exists dmr_shared_read_fila_mensagens on public.fila_mensagens;
create policy dmr_shared_read_fila_mensagens
on public.fila_mensagens
for select to authenticated
using (true);

drop policy if exists dmr_shared_read_mensagens_recebidas on public.mensagens_recebidas;
create policy dmr_shared_read_mensagens_recebidas
on public.mensagens_recebidas
for select to authenticated
using (true);

drop policy if exists dmr_shared_read_alertas_dmr on public.alertas_dmr;
create policy dmr_shared_read_alertas_dmr
on public.alertas_dmr
for select to authenticated
using (true);

drop policy if exists dmr_shared_read_bot_heartbeats on public.bot_heartbeats;
create policy dmr_shared_read_bot_heartbeats
on public.bot_heartbeats
for select to authenticated
using (true);

drop policy if exists dmr_shared_read_logs_acoes on public.logs_acoes;
create policy dmr_shared_read_logs_acoes
on public.logs_acoes
for select to authenticated
using (true);

drop policy if exists dmr_shared_read_configuracoes_sistema on public.configuracoes_sistema;
create policy dmr_shared_read_configuracoes_sistema
on public.configuracoes_sistema
for select to authenticated
using (true);

grant select on
  public.empresas,
  public.empresa_horarios,
  public.turnos_empresa,
  public.colaboradores,
  public.empresa_colaboradores,
  public.escalas,
  public.escala_colaboradores,
  public.contatos_alerta_dmr,
  public.fila_mensagens,
  public.mensagens_recebidas,
  public.alertas_dmr,
  public.bot_heartbeats,
  public.logs_acoes,
  public.configuracoes_sistema
to authenticated;
