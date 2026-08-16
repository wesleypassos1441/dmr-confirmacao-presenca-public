set check_function_bodies = off;

alter table public.empresas
  add column if not exists contrato_encerrado_em timestamptz,
  add column if not exists contrato_encerrado_por uuid references auth.users(id) on delete set null,
  add column if not exists motivo_encerramento text;

create table if not exists public.colaborador_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete restrict,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  empresa_horario_id uuid references public.empresa_horarios(id) on delete set null,
  vinculo_id uuid references public.empresa_colaboradores(id) on delete set null,
  tipo text not null check (tipo in (
    'adicionado', 'removido', 'realocado_saida', 'realocado_entrada', 'contrato_encerrado'
  )),
  ocorrido_em timestamptz not null default now(),
  observacao text,
  usuario_id uuid references auth.users(id) on delete set null,
  empresa_nome_snapshot text not null,
  jornada_snapshot text,
  origem text,
  origem_id text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_colaborador_movimentacoes_pessoa_data
  on public.colaborador_movimentacoes(colaborador_id, ocorrido_em desc);
create index if not exists idx_colaborador_movimentacoes_empresa_data
  on public.colaborador_movimentacoes(empresa_id, ocorrido_em desc);
create unique index if not exists colaborador_movimentacoes_origem_key
  on public.colaborador_movimentacoes(origem, origem_id);

alter table public.colaborador_movimentacoes enable row level security;
drop policy if exists dmr_shared_read_colaborador_movimentacoes on public.colaborador_movimentacoes;
create policy dmr_shared_read_colaborador_movimentacoes
on public.colaborador_movimentacoes
for select to authenticated
using (true);

grant select on public.colaborador_movimentacoes to authenticated;
grant all on public.colaborador_movimentacoes to service_role;

insert into public.colaborador_movimentacoes (
  colaborador_id,
  empresa_id,
  empresa_horario_id,
  vinculo_id,
  tipo,
  ocorrido_em,
  usuario_id,
  empresa_nome_snapshot,
  jornada_snapshot,
  origem,
  origem_id
)
select
  vinculo.colaborador_id,
  vinculo.empresa_id,
  vinculo.empresa_horario_id,
  vinculo.id,
  case when vinculo.ativo then 'adicionado' else 'removido' end,
  case when vinculo.ativo then vinculo.criado_em else coalesce(vinculo.atualizado_em, vinculo.criado_em) end,
  coalesce(vinculo.atualizado_por, vinculo.criado_por),
  empresa.nome,
  case
    when horario.id is null then null
    else format('%s as %s', to_char(horario.horario_entrada, 'HH24:MI'), to_char(horario.horario_saida, 'HH24:MI'))
  end,
  'migracao_vinculo',
  vinculo.id::text
from public.empresa_colaboradores vinculo
join public.empresas empresa on empresa.id = vinculo.empresa_id
left join public.empresa_horarios horario on horario.id = vinculo.empresa_horario_id
on conflict (origem, origem_id) do nothing;

create or replace function public.dmr_registrar_movimentacao_colaborador(
  p_colaborador_id uuid,
  p_empresa_id uuid,
  p_empresa_horario_id uuid,
  p_vinculo_id uuid,
  p_tipo text,
  p_observacao text,
  p_origem text default null,
  p_origem_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_nome text;
  v_jornada text;
  v_id uuid;
begin
  select empresa.nome into v_empresa_nome
  from public.empresas empresa
  where empresa.id = p_empresa_id;

  if v_empresa_nome is null then
    raise exception 'Empresa não encontrada para registrar o histórico.';
  end if;

  select format('%s as %s', to_char(horario.horario_entrada, 'HH24:MI'), to_char(horario.horario_saida, 'HH24:MI'))
  into v_jornada
  from public.empresa_horarios horario
  where horario.id = p_empresa_horario_id;

  insert into public.colaborador_movimentacoes (
    colaborador_id, empresa_id, empresa_horario_id, vinculo_id, tipo,
    observacao, usuario_id, empresa_nome_snapshot, jornada_snapshot,
    origem, origem_id
  ) values (
    p_colaborador_id, p_empresa_id, p_empresa_horario_id, p_vinculo_id, p_tipo,
    nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid(), v_empresa_nome, v_jornada,
    p_origem, p_origem_id
  )
  on conflict (origem, origem_id) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.dmr_registrar_movimentacao_colaborador(uuid, uuid, uuid, uuid, text, text, text, text) from public;
revoke all on function public.dmr_registrar_movimentacao_colaborador(uuid, uuid, uuid, uuid, text, text, text, text) from authenticated;

create or replace function public.dmr_alterar_status_empresa(
  p_empresa_id uuid,
  p_acao text,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa public.empresas%rowtype;
  v_vinculo record;
  v_afetados integer := 0;
begin
  if public.is_operador() is not true then
    raise exception 'Usuário sem permissão para alterar a situação da empresa.';
  end if;

  select * into v_empresa
  from public.empresas
  where id = p_empresa_id
  for update;

  if v_empresa.id is null then
    raise exception 'Empresa não encontrada.';
  end if;

  if p_acao = 'desativar' then
    if v_empresa.contrato_encerrado_em is not null then
      raise exception 'O contrato desta empresa já foi encerrado.';
    end if;
    update public.empresas
    set ativa = false, atualizado_em = now(), atualizado_por = auth.uid()
    where id = p_empresa_id;
  elsif p_acao = 'reativar' then
    if v_empresa.contrato_encerrado_em is not null then
      raise exception 'Empresa com contrato encerrado não pode ser reativada.';
    end if;
    update public.empresas
    set ativa = true, atualizado_em = now(), atualizado_por = auth.uid()
    where id = p_empresa_id;
  elsif p_acao = 'encerrar_contrato' then
    if v_empresa.contrato_encerrado_em is null then
      for v_vinculo in
        select vinculo.*
        from public.empresa_colaboradores vinculo
        where vinculo.empresa_id = p_empresa_id and vinculo.ativo
        order by vinculo.id
        for update
      loop
        perform public.dmr_registrar_movimentacao_colaborador(
          v_vinculo.colaborador_id,
          v_vinculo.empresa_id,
          v_vinculo.empresa_horario_id,
          v_vinculo.id,
          'contrato_encerrado',
          p_observacao,
          'encerramento_contrato',
          v_vinculo.id::text || ':' || now()::text
        );
        v_afetados := v_afetados + 1;
      end loop;

      update public.empresa_colaboradores
      set ativo = false, atualizado_em = now(), atualizado_por = auth.uid()
      where empresa_id = p_empresa_id and ativo;

      update public.empresas
      set
        ativa = false,
        contrato_encerrado_em = now(),
        contrato_encerrado_por = auth.uid(),
        motivo_encerramento = nullif(btrim(coalesce(p_observacao, '')), ''),
        atualizado_em = now(),
        atualizado_por = auth.uid()
      where id = p_empresa_id;
    end if;
  else
    raise exception 'Ação de empresa inválida.';
  end if;

  perform public.dmr_log_action(
    'alterar_status_empresa',
    'empresas',
    p_empresa_id,
    jsonb_build_object(
      'empresa', v_empresa.nome,
      'acao', p_acao,
      'observacao', nullif(btrim(coalesce(p_observacao, '')), ''),
      'vinculos_encerrados', v_afetados,
      'origem', 'dashboard'
    )
  );

  return jsonb_build_object('sucesso', true, 'acao', p_acao, 'vinculos_encerrados', v_afetados);
end;
$$;

drop function if exists public.dmr_remover_colaborador_equipe(uuid);
drop function if exists public.dmr_remover_colaborador_equipe(uuid, text);
create or replace function public.dmr_remover_colaborador_equipe(
  p_vinculo_id uuid,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vinculo record;
begin
  if public.is_operador() is not true then
    raise exception 'Usuário sem permissão para remover colaboradores da empresa.';
  end if;

  select vinculo.*, empresa.nome as empresa_nome, colaborador.nome as colaborador_nome
  into v_vinculo
  from public.empresa_colaboradores vinculo
  join public.empresas empresa on empresa.id = vinculo.empresa_id
  join public.colaboradores colaborador on colaborador.id = vinculo.colaborador_id
  where vinculo.id = p_vinculo_id
  for update of vinculo;

  if v_vinculo.id is null then
    return jsonb_build_object('sucesso', false, 'mensagem', 'Vínculo do colaborador não encontrado.');
  end if;

  if v_vinculo.ativo is not true then
    return jsonb_build_object('sucesso', true, 'ja_removido', true);
  end if;

  update public.empresa_colaboradores
  set ativo = false, atualizado_em = now(), atualizado_por = auth.uid()
  where id = p_vinculo_id;

  perform public.dmr_registrar_movimentacao_colaborador(
    v_vinculo.colaborador_id,
    v_vinculo.empresa_id,
    v_vinculo.empresa_horario_id,
    v_vinculo.id,
    'removido',
    p_observacao,
    'remocao_vinculo',
    v_vinculo.id::text || ':' || now()::text
  );

  perform public.dmr_log_action(
    'remover_colaborador_equipe',
    'empresa_colaboradores',
    p_vinculo_id,
    jsonb_build_object(
      'empresa', v_vinculo.empresa_nome,
      'colaborador', v_vinculo.colaborador_nome,
      'observacao', nullif(btrim(coalesce(p_observacao, '')), ''),
      'origem', 'dashboard'
    )
  );

  return jsonb_build_object('sucesso', true, 'colaborador_id', v_vinculo.colaborador_id);
end;
$$;

create or replace function public.dmr_vincular_colaborador_existente(
  p_colaborador_id uuid,
  p_destino_empresa_horario_id uuid,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destino record;
  v_colaborador record;
  v_vinculo record;
  v_vinculo_id uuid;
begin
  if public.is_operador() is not true then
    raise exception 'Usuário sem permissão para adicionar colaboradores à empresa.';
  end if;

  select horario.id, horario.empresa_id, empresa.nome as empresa_nome
  into v_destino
  from public.empresa_horarios horario
  join public.empresas empresa on empresa.id = horario.empresa_id
  where horario.id = p_destino_empresa_horario_id
    and horario.ativo
    and empresa.ativa
    and empresa.contrato_encerrado_em is null
  for update of horario;

  if v_destino.id is null then
    raise exception 'Jornada de destino indisponível.';
  end if;

  select id, nome into v_colaborador
  from public.colaboradores
  where id = p_colaborador_id
  for update;

  if v_colaborador.id is null then
    raise exception 'Colaborador não encontrado.';
  end if;

  select id, ativo into v_vinculo
  from public.empresa_colaboradores
  where empresa_id = v_destino.empresa_id
    and empresa_horario_id = v_destino.id
    and colaborador_id = p_colaborador_id
  for update;

  if v_vinculo.id is not null and v_vinculo.ativo then
    return jsonb_build_object('sucesso', true, 'vinculo_id', v_vinculo.id, 'ja_vinculado', true);
  end if;

  update public.colaboradores
  set ativo = true, atualizado_em = now(), atualizado_por = auth.uid()
  where id = p_colaborador_id;

  insert into public.empresa_colaboradores (
    empresa_id, empresa_horario_id, colaborador_id, ativo, criado_por, atualizado_por
  ) values (
    v_destino.empresa_id, v_destino.id, p_colaborador_id, true, auth.uid(), auth.uid()
  )
  on conflict on constraint empresa_colaboradores_empresa_horario_colaborador_key
  do update set ativo = true, atualizado_em = now(), atualizado_por = auth.uid()
  returning id into v_vinculo_id;

  perform public.dmr_registrar_movimentacao_colaborador(
    p_colaborador_id,
    v_destino.empresa_id,
    v_destino.id,
    v_vinculo_id,
    'adicionado',
    p_observacao,
    'vinculo_dashboard',
    v_vinculo_id::text || ':' || now()::text
  );

  perform public.dmr_log_action(
    'adicionar_colaborador_equipe',
    'empresa_colaboradores',
    v_vinculo_id,
    jsonb_build_object(
      'empresa', v_destino.empresa_nome,
      'colaborador', v_colaborador.nome,
      'observacao', nullif(btrim(coalesce(p_observacao, '')), ''),
      'origem', 'dashboard'
    )
  );

  return jsonb_build_object('sucesso', true, 'vinculo_id', v_vinculo_id, 'ja_vinculado', false);
end;
$$;

drop function if exists public.dmr_realocar_equipe_permanente(uuid[], uuid);
create or replace function public.dmr_realocar_equipe_permanente(
  p_vinculo_ids uuid[],
  p_destino_empresa_horario_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destino record;
  v_origem record;
  v_destino_vinculo_id uuid;
  v_movidos integer := 0;
  v_ja_existentes integer := 0;
  v_ignorados integer := 0;
begin
  if public.is_operador() is not true then
    raise exception 'Usuário sem permissão para realocar equipes.';
  end if;

  select horario.id, horario.empresa_id, empresa.nome as empresa_nome
  into v_destino
  from public.empresa_horarios horario
  join public.empresas empresa on empresa.id = horario.empresa_id
  where horario.id = p_destino_empresa_horario_id
    and horario.ativo
    and empresa.ativa
    and empresa.contrato_encerrado_em is null
  for update of horario;

  if v_destino.id is null then
    raise exception 'Jornada de destino indisponível.';
  end if;

  perform 1
  from public.empresa_colaboradores vinculo
  where vinculo.id = any(coalesce(p_vinculo_ids, array[]::uuid[]))
  order by vinculo.id
  for update;

  for v_origem in
    select distinct on (vinculo.colaborador_id)
      vinculo.id, vinculo.colaborador_id, vinculo.empresa_id, vinculo.empresa_horario_id
    from public.empresa_colaboradores vinculo
    where vinculo.id = any(coalesce(p_vinculo_ids, array[]::uuid[])) and vinculo.ativo
    order by vinculo.colaborador_id, vinculo.id
  loop
    if v_origem.empresa_horario_id = v_destino.id then
      v_ja_existentes := v_ja_existentes + 1;
      continue;
    end if;

    insert into public.empresa_colaboradores (
      empresa_id, empresa_horario_id, colaborador_id, ativo, criado_por, atualizado_por
    ) values (
      v_destino.empresa_id, v_destino.id, v_origem.colaborador_id, true, auth.uid(), auth.uid()
    )
    on conflict on constraint empresa_colaboradores_empresa_horario_colaborador_key
    do update set ativo = true, atualizado_em = now(), atualizado_por = auth.uid()
    returning id into v_destino_vinculo_id;

    update public.empresa_colaboradores
    set ativo = false, atualizado_em = now(), atualizado_por = auth.uid()
    where id = v_origem.id;

    perform public.dmr_registrar_movimentacao_colaborador(
      v_origem.colaborador_id, v_origem.empresa_id, v_origem.empresa_horario_id,
      v_origem.id, 'realocado_saida', 'Realocado para ' || v_destino.empresa_nome,
      'realocacao_saida', v_origem.id::text || ':' || now()::text
    );
    perform public.dmr_registrar_movimentacao_colaborador(
      v_origem.colaborador_id, v_destino.empresa_id, v_destino.id,
      v_destino_vinculo_id, 'realocado_entrada', null,
      'realocacao_entrada', v_destino_vinculo_id::text || ':' || now()::text
    );

    v_movidos := v_movidos + 1;
  end loop;

  v_ignorados := greatest(coalesce(cardinality(p_vinculo_ids), 0) - v_movidos - v_ja_existentes, 0);

  perform public.dmr_log_action(
    'realocar_equipe_permanente',
    'empresa_colaboradores',
    v_destino.id,
    jsonb_build_object(
      'destino', v_destino.empresa_nome,
      'empresa_horario_id', v_destino.id,
      'movidos', v_movidos,
      'ja_existentes', v_ja_existentes,
      'ignorados', v_ignorados,
      'origem', 'dashboard'
    )
  );

  return jsonb_build_object(
    'sucesso', true,
    'movidos', v_movidos,
    'ja_existentes', v_ja_existentes,
    'ignorados', v_ignorados,
    'houve_envio', false
  );
end;
$$;

revoke all on function public.dmr_alterar_status_empresa(uuid, text, text) from public;
revoke all on function public.dmr_remover_colaborador_equipe(uuid, text) from public;
revoke all on function public.dmr_vincular_colaborador_existente(uuid, uuid, text) from public;
revoke all on function public.dmr_realocar_equipe_permanente(uuid[], uuid) from public;
grant execute on function public.dmr_alterar_status_empresa(uuid, text, text) to authenticated, service_role;
grant execute on function public.dmr_remover_colaborador_equipe(uuid, text) to authenticated, service_role;
grant execute on function public.dmr_vincular_colaborador_existente(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.dmr_realocar_equipe_permanente(uuid[], uuid) to authenticated, service_role;
