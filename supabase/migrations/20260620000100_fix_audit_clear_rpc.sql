set check_function_bodies = off;

create or replace function public.dmr_limpar_logs_operacionais()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem limpar auditoria.';
  end if;

  v_email := nullif(auth.jwt() ->> 'email', '');

  delete from public.logs_acoes;

  insert into public.logs_acoes(ator_id, ator_email, acao, entidade, detalhes)
  values (
    auth.uid(),
    coalesce(v_email, 'Usuário do dashboard'),
    'limpar_logs_operacionais',
    'logs_acoes',
    jsonb_build_object('origem', 'dashboard')
  );
end;
$$;

revoke all on function public.dmr_limpar_logs_operacionais() from public;
grant execute on function public.dmr_limpar_logs_operacionais() to authenticated;

drop index if exists public.idx_empresas_ativa_prioridade;

alter table public.empresas
drop column if exists prioridade_envio_padrao;

alter table public.escalas
drop column if exists prioridade_envio;

alter table public.escala_colaboradores
drop column if exists prioridade_envio,
drop column if exists intervalo_1_minutos,
drop column if exists intervalo_2_minutos;
