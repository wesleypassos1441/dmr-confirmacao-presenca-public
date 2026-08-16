set check_function_bodies = off;

create or replace function public.dmr_limpar_logs_operacionais()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if public.is_admin() is not true then
    raise exception 'Apenas administradores podem limpar auditoria.';
  end if;

  v_email := nullif(auth.jwt() ->> 'email', '');

  delete from public.logs_acoes
  where id is not null;

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

create or replace function public.dmr_log_action(
  p_acao text,
  p_entidade text,
  p_entidade_id uuid default null,
  p_detalhes jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_operador() is not true then
    raise exception 'Usuário sem permissão para registrar ações operacionais.';
  end if;

  if nullif(btrim(p_acao), '') is null or nullif(btrim(p_entidade), '') is null then
    raise exception 'Ação e entidade são obrigatórias.';
  end if;

  insert into public.logs_acoes(ator_id, ator_email, acao, entidade, entidade_id, detalhes)
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    left(btrim(p_acao), 120),
    left(btrim(p_entidade), 120),
    p_entidade_id,
    coalesce(p_detalhes, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.dmr_log_action(text, text, uuid, jsonb) from public;
grant execute on function public.dmr_log_action(text, text, uuid, jsonb) to authenticated;
