create or replace function public.dmr_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop policy if exists "usuarios_dashboard_select_self_or_admin" on public.usuarios_dashboard;
drop policy if exists "usuarios_dashboard_admin_all" on public.usuarios_dashboard;

create policy usuarios_dashboard_select
on public.usuarios_dashboard for select to authenticated
using (auth_user_id = (select auth.uid()) or public.is_admin());

create policy usuarios_dashboard_insert
on public.usuarios_dashboard for insert to authenticated
with check (public.is_admin());

create policy usuarios_dashboard_update
on public.usuarios_dashboard for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy usuarios_dashboard_delete
on public.usuarios_dashboard for delete to authenticated
using (public.is_admin());

drop policy if exists "dmr_admin_operador_manage_empresas" on public.empresas;
drop policy if exists "dmr_visualizador_read_empresas" on public.empresas;
drop policy if exists "dmr_operador_manage_turnos" on public.turnos_empresa;
drop policy if exists "dmr_visualizador_read_turnos" on public.turnos_empresa;
drop policy if exists "dmr_operador_manage_colaboradores" on public.colaboradores;
drop policy if exists "dmr_visualizador_read_colaboradores" on public.colaboradores;
drop policy if exists "dmr_operador_manage_vinculos" on public.empresa_colaboradores;
drop policy if exists "dmr_visualizador_read_vinculos" on public.empresa_colaboradores;
drop policy if exists "dmr_operador_manage_escalas" on public.escalas;
drop policy if exists "dmr_visualizador_read_escalas" on public.escalas;
drop policy if exists "dmr_operador_manage_escala_colaboradores" on public.escala_colaboradores;
drop policy if exists "dmr_visualizador_read_escala_colaboradores" on public.escala_colaboradores;
drop policy if exists "dmr_admin_operador_manage_contatos" on public.contatos_alerta_dmr;
drop policy if exists "dmr_visualizador_read_contatos" on public.contatos_alerta_dmr;
drop policy if exists "dmr_admin_manage_config" on public.configuracoes_sistema;
drop policy if exists "dmr_visualizador_read_config" on public.configuracoes_sistema;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'empresas',
    'turnos_empresa',
    'colaboradores',
    'empresa_colaboradores',
    'escalas',
    'escala_colaboradores',
    'contatos_alerta_dmr'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_visualizador())',
      'dmr_read_' || table_name,
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_operador())',
      'dmr_insert_' || table_name,
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_operador()) with check (public.is_operador())',
      'dmr_update_' || table_name,
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_operador())',
      'dmr_delete_' || table_name,
      table_name
    );
  end loop;
end $$;

create policy dmr_read_configuracoes_sistema
on public.configuracoes_sistema for select to authenticated
using (public.is_visualizador());

create policy dmr_insert_configuracoes_sistema
on public.configuracoes_sistema for insert to authenticated
with check (public.is_admin());

create policy dmr_update_configuracoes_sistema
on public.configuracoes_sistema for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy dmr_delete_configuracoes_sistema
on public.configuracoes_sistema for delete to authenticated
using (public.is_admin());
