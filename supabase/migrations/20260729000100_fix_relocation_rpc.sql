drop function if exists public.dmr_realocar_equipe_permanente(uuid[], uuid);

create function public.dmr_realocar_equipe_permanente(
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
  v_movidos integer := 0;
  v_ja_existentes integer := 0;
  v_ignorados integer := 0;
begin
  if public.is_operador() is not true then
    raise exception 'Usuario sem permissao para realocar equipes.';
  end if;

  select horario.id, horario.empresa_id, empresa.nome as empresa_nome
  into v_destino
  from public.empresa_horarios horario
  join public.empresas empresa on empresa.id = horario.empresa_id
  where horario.id = p_destino_empresa_horario_id
    and horario.ativo
    and empresa.ativa
  for update of horario;

  if v_destino.id is null then
    raise exception 'Jornada de destino indisponivel.';
  end if;

  perform 1
  from public.empresa_colaboradores vinculo
  where vinculo.id = any(coalesce(p_vinculo_ids, array[]::uuid[]))
  order by vinculo.id
  for update;

  for v_origem in
    select distinct on (vinculo.colaborador_id)
      vinculo.id,
      vinculo.colaborador_id,
      vinculo.empresa_horario_id
    from public.empresa_colaboradores vinculo
    where vinculo.id = any(coalesce(p_vinculo_ids, array[]::uuid[]))
      and vinculo.ativo
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
    do update set ativo = true, atualizado_em = now(), atualizado_por = auth.uid();

    update public.empresa_colaboradores
    set ativo = false, atualizado_em = now(), atualizado_por = auth.uid()
    where id = v_origem.id;

    v_movidos := v_movidos + 1;
  end loop;

  v_ignorados := greatest(
    coalesce(cardinality(p_vinculo_ids), 0) - v_movidos - v_ja_existentes,
    0
  );

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

drop function if exists public.dmr_realocar_equipe_data(uuid[], uuid);

create function public.dmr_realocar_equipe_data(
  p_escala_colaborador_ids uuid[],
  p_destino_empresa_horario_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destino record;
  v_jornada record;
  v_origem record;
  v_turno_id uuid;
  v_escala_destino_id uuid;
  v_endereco text;
  v_movidos integer := 0;
  v_ja_existentes integer := 0;
  v_ignorados integer := 0;
  v_houve_envio boolean := false;
begin
  if public.is_operador() is not true then
    raise exception 'Usuario sem permissao para realocar a operacao.';
  end if;

  select horario.id, horario.empresa_id, empresa.nome as empresa_nome,
    empresa.endereco, empresa.numero, empresa.bairro, empresa.cidade,
    empresa.tipo_contratacao
  into v_destino
  from public.empresa_horarios horario
  join public.empresas empresa on empresa.id = horario.empresa_id
  where horario.id = p_destino_empresa_horario_id
    and horario.ativo
    and empresa.ativa
  for update of horario;

  if v_destino.id is null then
    raise exception 'Jornada de destino indisponivel.';
  end if;

  perform 1
  from public.escala_colaboradores item
  where item.id = any(coalesce(p_escala_colaborador_ids, array[]::uuid[]))
  order by item.id
  for update;

  for v_origem in
    select item.*, escala.data, escala.empresa_horario_id as horario_origem_id
    from public.escala_colaboradores item
    join public.escalas escala on escala.id = item.escala_id
    where item.id = any(coalesce(p_escala_colaborador_ids, array[]::uuid[]))
    order by item.id
  loop
    if v_origem.horario_origem_id = v_destino.id then
      v_ja_existentes := v_ja_existentes + 1;
      continue;
    end if;

    if exists (
      select 1
      from public.escala_colaboradores existente
      join public.escalas escala_existente on escala_existente.id = existente.escala_id
      where existente.colaborador_id = v_origem.colaborador_id
        and escala_existente.data = v_origem.data
        and escala_existente.empresa_horario_id = v_destino.id
    ) then
      v_ja_existentes := v_ja_existentes + 1;
      continue;
    end if;

    select * into v_jornada
    from public.dmr_resolver_jornada_efetiva(v_destino.id, v_origem.data);

    if v_jornada.horario_entrada is null then
      raise exception 'Nao foi possivel resolver a jornada de destino.';
    end if;

    select turno.id into v_turno_id
    from public.turnos_empresa turno
    where turno.empresa_horario_id = v_destino.id and turno.ativo
    order by turno.criado_em, turno.id
    limit 1
    for update;

    if v_turno_id is null then
      insert into public.turnos_empresa (
        empresa_id, empresa_horario_id, nome, horario_inicio,
        prioridade_envio, ativo, criado_por, atualizado_por
      ) values (
        v_destino.empresa_id,
        v_destino.id,
        format('%s as %s', to_char(v_jornada.horario_entrada, 'HH24:MI'), to_char(v_jornada.horario_saida, 'HH24:MI')),
        v_jornada.horario_entrada,
        'normal',
        true,
        auth.uid(),
        auth.uid()
      ) returning id into v_turno_id;
    end if;

    v_endereco := concat_ws(
      ', ',
      concat_ws(' ', nullif(btrim(v_destino.endereco), ''), nullif(btrim(v_destino.numero), '')),
      concat_ws(' - ', nullif(btrim(v_destino.bairro), ''), nullif(btrim(v_destino.cidade), ''))
    );

    insert into public.escalas (
      empresa_id, empresa_horario_id, data, status,
      horario_entrada_snapshot, horario_saida_snapshot, origem_horario_snapshot,
      empresa_nome_snapshot, endereco_snapshot, tipo_contratacao_snapshot,
      prioridade_envio_snapshot, criado_por, atualizado_por
    ) values (
      v_destino.empresa_id, v_destino.id, v_origem.data, 'pendente',
      v_jornada.horario_entrada, v_jornada.horario_saida, v_jornada.origem,
      v_destino.empresa_nome, v_endereco, v_destino.tipo_contratacao,
      'normal', auth.uid(), auth.uid()
    )
    on conflict on constraint escalas_empresa_data_horario_key
    do update set atualizado_em = now(), atualizado_por = auth.uid()
    returning id into v_escala_destino_id;

    if v_origem.mensagem_enviada_em is not null
      or v_origem.primeiro_lembrete_enviado_em is not null
      or v_origem.segundo_lembrete_enviado_em is not null
      or exists (
        select 1 from public.fila_mensagens enviada
        where enviada.escala_colaborador_id = v_origem.id and enviada.status = 'enviada'
      ) then
      v_houve_envio := true;
    end if;

    update public.fila_mensagens fila
    set
      status = 'cancelada',
      chave_unica = fila.chave_unica || ':realocada:' || gen_random_uuid()::text,
      ultimo_erro = 'Cancelada por realocacao da operacao antes do envio.',
      atualizado_em = now()
    where fila.escala_colaborador_id = v_origem.id
      and fila.status = 'pendente'
      and fila.agendado_para > now()
      and fila.tipo::text in (
        'confirmacao_inicial', 'lembrete_1', 'lembrete_2', 'reenvio_manual',
        'alerta_sem_resposta', 'alerta_resposta_incompreensivel',
        'alerta_resposta_incompreensivel_expirada'
      );

    update public.escala_colaboradores
    set
      escala_id = v_escala_destino_id,
      turno_empresa_id = v_turno_id,
      horario_inicio = v_jornada.horario_entrada,
      atualizado_em = now(),
      atualizado_por = auth.uid()
    where id = v_origem.id;

    v_movidos := v_movidos + 1;
  end loop;

  v_ignorados := greatest(
    coalesce(cardinality(p_escala_colaborador_ids), 0) - v_movidos - v_ja_existentes,
    0
  );

  if v_movidos > 0 then
    perform public.gerar_fila_confirmacoes();
  end if;

  perform public.dmr_log_action(
    'realocar_equipe_data',
    'escala_colaboradores',
    v_destino.id,
    jsonb_build_object(
      'destino', v_destino.empresa_nome,
      'empresa_horario_id', v_destino.id,
      'movidos', v_movidos,
      'ja_existentes', v_ja_existentes,
      'ignorados', v_ignorados,
      'houve_envio', v_houve_envio,
      'origem', 'dashboard'
    )
  );

  return jsonb_build_object(
    'sucesso', true,
    'movidos', v_movidos,
    'ja_existentes', v_ja_existentes,
    'ignorados', v_ignorados,
    'houve_envio', v_houve_envio
  );
end;
$$;

revoke all on function public.dmr_realocar_equipe_permanente(uuid[], uuid) from public;
revoke all on function public.dmr_realocar_equipe_data(uuid[], uuid) from public;
grant execute on function public.dmr_realocar_equipe_permanente(uuid[], uuid) to authenticated, service_role;
grant execute on function public.dmr_realocar_equipe_data(uuid[], uuid) to authenticated, service_role;
