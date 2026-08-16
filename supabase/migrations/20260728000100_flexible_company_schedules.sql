set check_function_bodies = off;

create table public.empresa_horario_regras_semanais (
  id uuid primary key default gen_random_uuid(),
  empresa_horario_id uuid not null references public.empresa_horarios(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  horario_entrada time without time zone not null,
  horario_saida time without time zone not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_por uuid references auth.users(id),
  unique (empresa_horario_id, dia_semana)
);

create table public.empresa_horario_excecoes (
  id uuid primary key default gen_random_uuid(),
  empresa_horario_id uuid not null references public.empresa_horarios(id) on delete cascade,
  data date not null,
  horario_entrada time without time zone not null,
  horario_saida time without time zone not null,
  motivo text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_por uuid references auth.users(id),
  unique (empresa_horario_id, data)
);

create trigger empresa_horario_regras_semanais_updated_at
before update on public.empresa_horario_regras_semanais
for each row execute function public.dmr_set_updated_at();

create trigger empresa_horario_excecoes_updated_at
before update on public.empresa_horario_excecoes
for each row execute function public.dmr_set_updated_at();

create or replace function public.dmr_seed_regras_semanais_empresa_horario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.empresa_horario_regras_semanais (
    empresa_horario_id,
    dia_semana,
    horario_entrada,
    horario_saida
  )
  select
    new.id,
    dia.dia_semana,
    new.horario_entrada,
    new.horario_saida
  from generate_series(1, 5) as dia(dia_semana)
  on conflict (empresa_horario_id, dia_semana) do nothing;

  return new;
end;
$$;

create trigger empresa_horarios_seed_regras_semanais
after insert on public.empresa_horarios
for each row execute function public.dmr_seed_regras_semanais_empresa_horario();

insert into public.empresa_horario_regras_semanais (
  empresa_horario_id,
  dia_semana,
  horario_entrada,
  horario_saida
)
select
  horario.id,
  dia.dia_semana,
  horario.horario_entrada,
  horario.horario_saida
from public.empresa_horarios horario
cross join generate_series(1, 5) as dia(dia_semana)
on conflict (empresa_horario_id, dia_semana) do nothing;

alter table public.empresa_horario_regras_semanais enable row level security;
alter table public.empresa_horario_excecoes enable row level security;

create policy dmr_shared_read_empresa_horario_regras_semanais
on public.empresa_horario_regras_semanais
for select to authenticated
using (true);

create policy dmr_shared_read_empresa_horario_excecoes
on public.empresa_horario_excecoes
for select to authenticated
using (true);

grant select on public.empresa_horario_regras_semanais to authenticated;
grant select on public.empresa_horario_excecoes to authenticated;
grant select, insert, update, delete on public.empresa_horario_regras_semanais to service_role;
grant select, insert, update, delete on public.empresa_horario_excecoes to service_role;

create or replace function public.dmr_resolver_jornada_efetiva(
  p_empresa_horario_id uuid,
  p_data date
)
returns table (
  horario_entrada time without time zone,
  horario_saida time without time zone,
  origem text
)
language sql
stable
security definer
set search_path = public
as $$
  with excecao as (
    select
      item.horario_entrada,
      item.horario_saida,
      'excecao'::text as origem,
      1 as prioridade
    from public.empresa_horario_excecoes item
    where item.empresa_horario_id = p_empresa_horario_id
      and item.data = p_data
      and item.ativo
  ),
  semanal as (
    select
      item.horario_entrada,
      item.horario_saida,
      'semanal'::text as origem,
      2 as prioridade
    from public.empresa_horario_regras_semanais item
    where item.empresa_horario_id = p_empresa_horario_id
      and item.dia_semana = extract(isodow from p_data)::smallint
      and item.ativo
  ),
  base as (
    select
      item.horario_entrada,
      item.horario_saida,
      'base'::text as origem,
      3 as prioridade
    from public.empresa_horarios item
    where item.id = p_empresa_horario_id
      and item.ativo
  )
  select candidato.horario_entrada, candidato.horario_saida, candidato.origem
  from (
    select * from excecao
    union all
    select * from semanal
    union all
    select * from base
  ) candidato
  order by candidato.prioridade
  limit 1;
$$;

create or replace function public.dmr_salvar_jornada_semanal(
  p_empresa_horario_id uuid,
  p_horario_entrada time without time zone,
  p_horario_saida time without time zone,
  p_regras jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_horario record;
  v_regra record;
  v_total integer := 0;
begin
  if public.is_operador() is not true then
    raise exception 'Usuario sem permissao para alterar jornadas.';
  end if;

  if p_horario_entrada is null or p_horario_saida is null then
    raise exception 'Informe os horarios de entrada e saida.';
  end if;

  if p_regras is null or jsonb_typeof(p_regras) <> 'array' then
    raise exception 'As regras semanais devem ser enviadas como uma lista.';
  end if;

  select horario.id, horario.empresa_id, empresa.nome as empresa_nome
  into v_horario
  from public.empresa_horarios horario
  join public.empresas empresa on empresa.id = horario.empresa_id
  where horario.id = p_empresa_horario_id
  for update of horario;

  if v_horario.id is null then
    raise exception 'Jornada da empresa nao encontrada.';
  end if;

  update public.empresa_horarios
  set
    horario_entrada = p_horario_entrada,
    horario_saida = p_horario_saida,
    atualizado_em = now()
  where id = p_empresa_horario_id;

  delete from public.empresa_horario_regras_semanais
  where empresa_horario_id = p_empresa_horario_id;

  for v_regra in
    select regra.*
    from jsonb_to_recordset(p_regras) as regra(
      dia_semana smallint,
      horario_entrada time without time zone,
      horario_saida time without time zone,
      ativo boolean
    )
  loop
    if v_regra.dia_semana is null
      or v_regra.dia_semana < 1
      or v_regra.dia_semana > 7 then
      raise exception 'Dia da semana invalido.';
    end if;

    if v_regra.horario_entrada is null or v_regra.horario_saida is null then
      raise exception 'Cada dia ativo precisa de entrada e saida.';
    end if;

    insert into public.empresa_horario_regras_semanais (
      empresa_horario_id,
      dia_semana,
      horario_entrada,
      horario_saida,
      ativo,
      criado_por,
      atualizado_por
    ) values (
      p_empresa_horario_id,
      v_regra.dia_semana,
      v_regra.horario_entrada,
      v_regra.horario_saida,
      coalesce(v_regra.ativo, true),
      auth.uid(),
      auth.uid()
    );

    v_total := v_total + 1;
  end loop;

  perform public.dmr_log_action(
    'editar_jornada_semanal',
    'empresa_horarios',
    p_empresa_horario_id,
    jsonb_build_object(
      'empresa', v_horario.empresa_nome,
      'entrada', to_char(p_horario_entrada, 'HH24:MI'),
      'saida', to_char(p_horario_saida, 'HH24:MI'),
      'dias_configurados', v_total,
      'origem', 'dashboard'
    )
  );

  return jsonb_build_object(
    'sucesso', true,
    'empresa_horario_id', p_empresa_horario_id,
    'dias_configurados', v_total
  );
end;
$$;

create or replace function public.dmr_salvar_excecao_jornada(
  p_empresa_horario_id uuid,
  p_data date,
  p_horario_entrada time without time zone,
  p_horario_saida time without time zone,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_horario record;
  v_excecao_id uuid;
begin
  if public.is_operador() is not true then
    raise exception 'Usuario sem permissao para alterar jornadas.';
  end if;

  if p_data is null or p_horario_entrada is null or p_horario_saida is null then
    raise exception 'Informe data, entrada e saida da excecao.';
  end if;

  if p_data < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Nao e permitido criar uma excecao retroativa.';
  end if;

  select horario.id, empresa.nome as empresa_nome
  into v_horario
  from public.empresa_horarios horario
  join public.empresas empresa on empresa.id = horario.empresa_id
  where horario.id = p_empresa_horario_id
  for update of horario;

  if v_horario.id is null then
    raise exception 'Jornada da empresa nao encontrada.';
  end if;

  insert into public.empresa_horario_excecoes (
    empresa_horario_id,
    data,
    horario_entrada,
    horario_saida,
    motivo,
    ativo,
    criado_por,
    atualizado_por
  ) values (
    p_empresa_horario_id,
    p_data,
    p_horario_entrada,
    p_horario_saida,
    nullif(btrim(coalesce(p_motivo, '')), ''),
    true,
    auth.uid(),
    auth.uid()
  )
  on conflict (empresa_horario_id, data)
  do update set
    horario_entrada = excluded.horario_entrada,
    horario_saida = excluded.horario_saida,
    motivo = excluded.motivo,
    ativo = true,
    atualizado_em = now(),
    atualizado_por = auth.uid()
  returning id into v_excecao_id;

  perform public.dmr_log_action(
    'salvar_excecao_jornada',
    'empresa_horario_excecoes',
    v_excecao_id,
    jsonb_build_object(
      'empresa', v_horario.empresa_nome,
      'data', to_char(p_data, 'DD/MM/YYYY'),
      'entrada', to_char(p_horario_entrada, 'HH24:MI'),
      'saida', to_char(p_horario_saida, 'HH24:MI'),
      'motivo', nullif(btrim(coalesce(p_motivo, '')), ''),
      'origem', 'dashboard'
    )
  );

  return jsonb_build_object(
    'sucesso', true,
    'excecao_id', v_excecao_id,
    'empresa_horario_id', p_empresa_horario_id,
    'data', p_data
  );
end;
$$;

revoke all on function public.dmr_resolver_jornada_efetiva(uuid, date) from public;
revoke all on function public.dmr_seed_regras_semanais_empresa_horario() from public;
revoke all on function public.dmr_salvar_jornada_semanal(uuid, time without time zone, time without time zone, jsonb) from public;
revoke all on function public.dmr_salvar_excecao_jornada(uuid, date, time without time zone, time without time zone, text) from public;

grant execute on function public.dmr_resolver_jornada_efetiva(uuid, date) to authenticated, service_role;
grant execute on function public.dmr_salvar_jornada_semanal(uuid, time without time zone, time without time zone, jsonb) to authenticated;
grant execute on function public.dmr_salvar_excecao_jornada(uuid, date, time without time zone, time without time zone, text) to authenticated;
grant execute on function public.dmr_salvar_jornada_semanal(uuid, time without time zone, time without time zone, jsonb) to service_role;
grant execute on function public.dmr_salvar_excecao_jornada(uuid, date, time without time zone, time without time zone, text) to service_role;
