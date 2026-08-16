set check_function_bodies = off;

alter table public.escalas
  add column if not exists horario_entrada_snapshot time without time zone,
  add column if not exists horario_saida_snapshot time without time zone,
  add column if not exists origem_horario_snapshot text,
  add column if not exists empresa_nome_snapshot text,
  add column if not exists endereco_snapshot text,
  add column if not exists tipo_contratacao_snapshot text,
  add column if not exists prioridade_envio_snapshot public.dmr_prioridade_envio;

do $$
begin
  alter table public.escalas
    add constraint escalas_origem_horario_snapshot_check
    check (
      origem_horario_snapshot in ('base', 'semanal', 'excecao')
      or origem_horario_snapshot is null
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.escalas
    add constraint escalas_tipo_contratacao_snapshot_check
    check (
      tipo_contratacao_snapshot in ('intermitente', 'freelancer')
      or tipo_contratacao_snapshot is null
    );
exception when duplicate_object then null;
end $$;

with dados_snapshot as (
  select
    escala.id as escala_id,
    horario.horario_entrada,
    horario.horario_saida,
    empresa.nome as empresa_nome,
    concat_ws(
      ', ',
      concat_ws(' ', nullif(btrim(empresa.endereco), ''), nullif(btrim(empresa.numero), '')),
      concat_ws(' - ', nullif(btrim(empresa.bairro), ''), nullif(btrim(empresa.cidade), ''))
    ) as endereco_completo,
    empresa.tipo_contratacao,
    turno.prioridade_envio as prioridade_turno
  from public.escalas escala
  join public.empresas empresa on empresa.id = escala.empresa_id
  left join public.empresa_horarios horario on horario.id = escala.empresa_horario_id
  left join lateral (
    select item.prioridade_envio
    from public.escala_colaboradores membro
    join public.turnos_empresa item on item.id = membro.turno_empresa_id
    where membro.escala_id = escala.id
    order by membro.criado_em, membro.id
    limit 1
  ) turno on true
)
update public.escalas escala
set
  horario_entrada_snapshot = coalesce(escala.horario_entrada_snapshot, dados_snapshot.horario_entrada),
  horario_saida_snapshot = coalesce(escala.horario_saida_snapshot, dados_snapshot.horario_saida),
  origem_horario_snapshot = coalesce(escala.origem_horario_snapshot, 'base'),
  empresa_nome_snapshot = coalesce(escala.empresa_nome_snapshot, dados_snapshot.empresa_nome),
  endereco_snapshot = coalesce(escala.endereco_snapshot, dados_snapshot.endereco_completo),
  tipo_contratacao_snapshot = coalesce(escala.tipo_contratacao_snapshot, dados_snapshot.tipo_contratacao),
  prioridade_envio_snapshot = coalesce(
    escala.prioridade_envio_snapshot,
    dados_snapshot.prioridade_turno,
    'normal'::public.dmr_prioridade_envio
  )
from dados_snapshot
where dados_snapshot.escala_id = escala.id;

create or replace function public.dmr_criar_operacao_com_equipe(
  p_empresa_horario_id uuid,
  p_data date,
  p_horario_inicio_disparo time without time zone,
  p_prioridade public.dmr_prioridade_envio,
  p_colaborador_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_jornada record;
  v_turno_id uuid;
  v_escala_id uuid;
  v_colaborador_ids uuid[];
  v_esperados integer;
  v_validos integer;
  v_ja_existentes integer := 0;
  v_adicionados integer := 0;
  v_inicio_local timestamp without time zone;
  v_endereco text;
begin
  if public.is_operador() is not true then
    raise exception 'Usuario sem permissao para criar a operacao.';
  end if;

  if p_data is null or p_horario_inicio_disparo is null then
    raise exception 'Informe a data e o horario de disparo.';
  end if;

  v_inicio_local := p_data + p_horario_inicio_disparo;
  if (v_inicio_local at time zone 'America/Sao_Paulo') <= now() then
    raise exception 'O horario de disparo precisa estar no futuro.';
  end if;

  select array_agg(item.id order by item.id::text)
  into v_colaborador_ids
  from (
    select distinct id
    from unnest(coalesce(p_colaborador_ids, array[]::uuid[])) as selecionado(id)
    where id is not null
  ) item;

  if coalesce(cardinality(v_colaborador_ids), 0) = 0 then
    raise exception 'Selecione pelo menos um colaborador.';
  end if;

  select
    horario.id as empresa_horario_id,
    horario.empresa_id,
    empresa.nome as empresa_nome,
    empresa.endereco,
    empresa.numero,
    empresa.bairro,
    empresa.cidade,
    empresa.tipo_contratacao,
    empresa.ativa as empresa_ativa,
    horario.ativo as horario_ativo,
    jornada.horario_entrada,
    jornada.horario_saida,
    jornada.origem
  into v_jornada
  from public.empresa_horarios horario
  join public.empresas empresa on empresa.id = horario.empresa_id
  cross join lateral public.dmr_resolver_jornada_efetiva(horario.id, p_data) jornada
  where horario.id = p_empresa_horario_id
  for update of horario;

  if v_jornada.empresa_horario_id is null
    or v_jornada.empresa_ativa is not true
    or v_jornada.horario_ativo is not true then
    raise exception 'Empresa ou jornada indisponivel para esta operacao.';
  end if;

  v_endereco := concat_ws(
    ', ',
    concat_ws(' ', nullif(btrim(v_jornada.endereco), ''), nullif(btrim(v_jornada.numero), '')),
    concat_ws(' - ', nullif(btrim(v_jornada.bairro), ''), nullif(btrim(v_jornada.cidade), ''))
  );

  v_esperados := cardinality(v_colaborador_ids);

  select count(*)::integer
  into v_validos
  from public.empresa_colaboradores vinculo
  join public.colaboradores colaborador on colaborador.id = vinculo.colaborador_id
  where vinculo.colaborador_id = any(v_colaborador_ids)
    and vinculo.empresa_id = v_jornada.empresa_id
    and vinculo.empresa_horario_id = p_empresa_horario_id
    and vinculo.ativo
    and colaborador.ativo;

  if v_validos <> v_esperados then
    raise exception 'Todos os colaboradores devem estar ativos e vinculados a empresa e jornada escolhidas.';
  end if;

  select turno.id
  into v_turno_id
  from public.turnos_empresa turno
  where turno.empresa_horario_id = p_empresa_horario_id
    and turno.empresa_id = v_jornada.empresa_id
    and turno.ativo
  order by turno.criado_em, turno.id
  limit 1
  for update;

  if v_turno_id is null then
    insert into public.turnos_empresa (
      empresa_id,
      empresa_horario_id,
      nome,
      horario_inicio,
      prioridade_envio,
      ativo,
      criado_por,
      atualizado_por
    ) values (
      v_jornada.empresa_id,
      p_empresa_horario_id,
      format(
        '%s as %s',
        to_char(v_jornada.horario_entrada, 'HH24:MI'),
        to_char(v_jornada.horario_saida, 'HH24:MI')
      ),
      v_jornada.horario_entrada,
      coalesce(p_prioridade, 'normal'::public.dmr_prioridade_envio),
      true,
      auth.uid(),
      auth.uid()
    )
    returning id into v_turno_id;
  end if;

  insert into public.escalas (
    empresa_id,
    empresa_horario_id,
    data,
    status,
    observacoes,
    horario_entrada_snapshot,
    horario_saida_snapshot,
    origem_horario_snapshot,
    empresa_nome_snapshot,
    endereco_snapshot,
    tipo_contratacao_snapshot,
    prioridade_envio_snapshot,
    criado_por,
    atualizado_por
  ) values (
    v_jornada.empresa_id,
    p_empresa_horario_id,
    p_data,
    'pendente',
    format('Operacao com disparos a partir de %s', to_char(p_horario_inicio_disparo, 'HH24:MI')),
    v_jornada.horario_entrada,
    v_jornada.horario_saida,
    v_jornada.origem,
    v_jornada.empresa_nome,
    v_endereco,
    v_jornada.tipo_contratacao,
    coalesce(p_prioridade, 'normal'::public.dmr_prioridade_envio),
    auth.uid(),
    auth.uid()
  )
  on conflict (empresa_id, data, empresa_horario_id) do update
  set
    horario_entrada_snapshot = coalesce(escalas.horario_entrada_snapshot, excluded.horario_entrada_snapshot),
    horario_saida_snapshot = coalesce(escalas.horario_saida_snapshot, excluded.horario_saida_snapshot),
    origem_horario_snapshot = coalesce(escalas.origem_horario_snapshot, excluded.origem_horario_snapshot),
    empresa_nome_snapshot = coalesce(escalas.empresa_nome_snapshot, excluded.empresa_nome_snapshot),
    endereco_snapshot = coalesce(escalas.endereco_snapshot, excluded.endereco_snapshot),
    tipo_contratacao_snapshot = coalesce(escalas.tipo_contratacao_snapshot, excluded.tipo_contratacao_snapshot),
    prioridade_envio_snapshot = coalesce(escalas.prioridade_envio_snapshot, excluded.prioridade_envio_snapshot),
    atualizado_em = now(),
    atualizado_por = auth.uid()
  returning id into v_escala_id;

  select count(*)::integer
  into v_ja_existentes
  from public.escala_colaboradores membro
  where membro.escala_id = v_escala_id
    and membro.colaborador_id = any(v_colaborador_ids);

  with adicionados as (
    insert into public.escala_colaboradores (
      escala_id,
      colaborador_id,
      turno_empresa_id,
      horario_inicio,
      horario_inicio_disparo,
      status_confirmacao,
      criado_por,
      atualizado_por
    )
    select
      v_escala_id,
      colaborador.id,
      v_turno_id,
      v_jornada.horario_entrada,
      p_horario_inicio_disparo,
      'pendente'::public.dmr_status_confirmacao,
      auth.uid(),
      auth.uid()
    from public.colaboradores colaborador
    where colaborador.id = any(v_colaborador_ids)
    on conflict (escala_id, colaborador_id) do nothing
    returning id
  )
  select count(*)::integer into v_adicionados from adicionados;

  perform public.dmr_log_action(
    'criar_operacao_com_equipe',
    'escalas',
    v_escala_id,
    jsonb_build_object(
      'empresa', v_jornada.empresa_nome,
      'empresa_horario_id', p_empresa_horario_id,
      'data', to_char(p_data, 'DD/MM/YYYY'),
      'entrada', to_char(v_jornada.horario_entrada, 'HH24:MI'),
      'saida', to_char(v_jornada.horario_saida, 'HH24:MI'),
      'origem_horario', v_jornada.origem,
      'horario_disparo', to_char(p_horario_inicio_disparo, 'HH24:MI'),
      'colaboradores_adicionados', v_adicionados,
      'colaboradores_ja_existentes', v_ja_existentes,
      'origem', 'dashboard'
    )
  );

  perform public.gerar_fila_confirmacoes();

  return jsonb_build_object(
    'sucesso', true,
    'escala_id', v_escala_id,
    'colaboradores_adicionados', v_adicionados,
    'colaboradores_ja_existentes', v_ja_existentes
  );
end;
$$;

create or replace function public.dmr_aplicar_excecao_operacao(
  p_escala_id uuid,
  p_excecao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_operacao record;
  v_excecao record;
  v_mensagens_reagendadas integer := 0;
begin
  if public.is_operador() is not true then
    raise exception 'Usuario sem permissao para alterar a operacao.';
  end if;

  select escala.id, escala.empresa_horario_id, escala.data, escala.empresa_nome_snapshot
  into v_operacao
  from public.escalas escala
  where escala.id = p_escala_id
  for update;

  if v_operacao.id is null then
    raise exception 'Operacao nao encontrada.';
  end if;

  select excecao.id, excecao.empresa_horario_id, excecao.data,
         excecao.horario_entrada, excecao.horario_saida, excecao.motivo
  into v_excecao
  from public.empresa_horario_excecoes excecao
  where excecao.id = p_excecao_id
    and excecao.ativo
  for update;

  if v_excecao.id is null
    or v_excecao.empresa_horario_id <> v_operacao.empresa_horario_id
    or v_excecao.data <> v_operacao.data then
    raise exception 'A excecao nao pertence a jornada e data desta operacao.';
  end if;

  delete from public.fila_mensagens fila
  using public.escala_colaboradores membro
  where membro.id = fila.escala_colaborador_id
    and membro.escala_id = p_escala_id
    and fila.status = 'pendente'
    and fila.tipo in (
      'confirmacao_inicial',
      'lembrete_1',
      'lembrete_2',
      'alerta_sem_resposta',
      'alerta_resposta_incompreensivel',
      'alerta_resposta_incompreensivel_expirada'
    );

  get diagnostics v_mensagens_reagendadas = row_count;

  update public.escalas
  set
    horario_entrada_snapshot = v_excecao.horario_entrada,
    horario_saida_snapshot = v_excecao.horario_saida,
    origem_horario_snapshot = 'excecao',
    atualizado_em = now(),
    atualizado_por = auth.uid()
  where id = p_escala_id;

  update public.escala_colaboradores
  set
    horario_inicio = v_excecao.horario_entrada,
    atualizado_em = now(),
    atualizado_por = auth.uid()
  where escala_id = p_escala_id
    and respondido_em is null
    and not tratado_manualmente;

  perform public.dmr_log_action(
    'aplicar_excecao_operacao',
    'escalas',
    p_escala_id,
    jsonb_build_object(
      'empresa', v_operacao.empresa_nome_snapshot,
      'data', to_char(v_operacao.data, 'DD/MM/YYYY'),
      'entrada', to_char(v_excecao.horario_entrada, 'HH24:MI'),
      'saida', to_char(v_excecao.horario_saida, 'HH24:MI'),
      'motivo', v_excecao.motivo,
      'mensagens_pendentes_recriadas', v_mensagens_reagendadas,
      'origem', 'dashboard'
    )
  );

  perform public.gerar_fila_confirmacoes();

  return jsonb_build_object(
    'sucesso', true,
    'escala_id', p_escala_id,
    'mensagens_pendentes_recriadas', v_mensagens_reagendadas
  );
end;
$$;

revoke all on function public.dmr_criar_operacao_com_equipe(uuid, date, time without time zone, public.dmr_prioridade_envio, uuid[]) from public;
revoke all on function public.dmr_aplicar_excecao_operacao(uuid, uuid) from public;

grant execute on function public.dmr_criar_operacao_com_equipe(uuid, date, time without time zone, public.dmr_prioridade_envio, uuid[]) to authenticated, service_role;
grant execute on function public.dmr_aplicar_excecao_operacao(uuid, uuid) to authenticated, service_role;
