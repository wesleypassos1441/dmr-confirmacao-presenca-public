alter table public.empresa_colaboradores
add column if not exists empresa_horario_id uuid;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'empresa_colaboradores'
      and constraint_name = 'empresa_colaboradores_empresa_horario_id_fkey'
  ) then
    alter table public.empresa_colaboradores
    add constraint empresa_colaboradores_empresa_horario_id_fkey
    foreign key (empresa_horario_id) references public.empresa_horarios(id) on delete cascade;
  end if;
end $$;

with horarios_ativos as (
  select
    empresa_id,
    id as empresa_horario_id,
    count(*) over (partition by empresa_id) as total_horarios
  from public.empresa_horarios
  where ativo
),
empresas_com_horario_unico as (
  select empresa_id, empresa_horario_id
  from horarios_ativos
  where total_horarios = 1
)
update public.empresa_colaboradores ec
set empresa_horario_id = h.empresa_horario_id
from empresas_com_horario_unico h
where h.empresa_id = ec.empresa_id
  and ec.empresa_horario_id is null;

alter table public.empresa_colaboradores
drop constraint if exists empresa_colaboradores_empresa_id_colaborador_id_key;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'empresa_colaboradores'
      and constraint_name = 'empresa_colaboradores_empresa_horario_colaborador_key'
  ) then
    alter table public.empresa_colaboradores
    add constraint empresa_colaboradores_empresa_horario_colaborador_key
    unique (empresa_id, empresa_horario_id, colaborador_id);
  end if;
end $$;

create index if not exists idx_empresa_colaboradores_horario
on public.empresa_colaboradores(empresa_id, empresa_horario_id, ativo);

create or replace function public.dmr_apagar_horario_empresa(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_operador() is not true then
    raise exception 'Usuario sem permissao para apagar horarios.';
  end if;

  delete from public.empresa_colaboradores where empresa_horario_id = p_id;
  delete from public.escala_colaboradores
  where turno_empresa_id in (
    select id from public.turnos_empresa where empresa_horario_id = p_id
  );
  delete from public.turnos_empresa where empresa_horario_id = p_id;
  delete from public.empresa_horarios where id = p_id;
  if not found then raise exception 'Horario da empresa nao encontrado.'; end if;

  insert into public.logs_acoes(ator_id, ator_email, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), auth.jwt() ->> 'email', 'apagar_horario_empresa', 'empresa_horarios', p_id, '{"origem":"dashboard"}');
end;
$$;

revoke all on function public.dmr_apagar_horario_empresa(uuid) from public;
grant execute on function public.dmr_apagar_horario_empresa(uuid) to authenticated;
