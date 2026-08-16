alter table public.contatos_alerta_dmr
  add column if not exists notificar_de time not null default '00:00:00',
  add column if not exists notificar_ate time not null default '23:59:59';

create or replace function public.dmr_alerta_sem_resposta_na_jornada(
  p_contato_id uuid,
  p_agendado_para timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inicio time;
  v_fim time;
  v_hora time;
  v_agora time;
  v_evento_na_jornada boolean;
  v_agora_na_jornada boolean;
begin
  select contato.notificar_de, contato.notificar_ate
  into v_inicio, v_fim
  from public.contatos_alerta_dmr contato
  where contato.id = p_contato_id
    and contato.ativo is true;

  if not found then
    return false;
  end if;

  v_hora := (coalesce(p_agendado_para, now()) at time zone 'America/Sao_Paulo')::time;
  v_agora := (now() at time zone 'America/Sao_Paulo')::time;

  if v_inicio <= v_fim then
    v_evento_na_jornada := v_hora >= v_inicio and v_hora <= v_fim;
    v_agora_na_jornada := v_agora >= v_inicio and v_agora <= v_fim;
  else
    v_evento_na_jornada := v_hora >= v_inicio or v_hora <= v_fim;
    v_agora_na_jornada := v_agora >= v_inicio or v_agora <= v_fim;
  end if;

  return v_evento_na_jornada and v_agora_na_jornada;
end;
$$;

revoke all on function public.dmr_alerta_sem_resposta_na_jornada(uuid, timestamptz) from public;
grant execute on function public.dmr_alerta_sem_resposta_na_jornada(uuid, timestamptz) to service_role;

create or replace function public.dmr_obter_ultima_equipe_operacao(
  p_empresa_horario_id uuid,
  p_antes_de date
)
returns table(colaborador_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_operador() is not true then
    raise exception 'Usuario sem permissao para consultar equipes anteriores.';
  end if;

  return query
  with ultima_operacao as (
    select ec.id
    from public.escalas ec
    where ec.empresa_horario_id = p_empresa_horario_id
      and ec.data < p_antes_de
    order by ec.data desc, ec.criado_em desc
    limit 1
  )
  select distinct item.colaborador_id
  from ultima_operacao operacao
  join public.escala_colaboradores item on item.escala_id = operacao.id
  join public.colaboradores colaborador on colaborador.id = item.colaborador_id
  join public.empresa_colaboradores vinculo
    on vinculo.colaborador_id = item.colaborador_id
   and vinculo.empresa_horario_id = p_empresa_horario_id
   and vinculo.ativo is true
  where colaborador.ativo is true
  order by item.colaborador_id;
end;
$$;

revoke all on function public.dmr_obter_ultima_equipe_operacao(uuid, date) from public;
grant execute on function public.dmr_obter_ultima_equipe_operacao(uuid, date) to authenticated, service_role;

create or replace function public.dmr_definir_substituto(
  p_escala_colaborador_id uuid,
  p_substituto_nome text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registro record;
  v_substituto text := nullif(btrim(coalesce(p_substituto_nome, '')), '');
begin
  if public.is_operador() is not true then
    raise exception 'Usuario sem permissao para informar substitutos.';
  end if;

  select
    ec.id,
    ec.status_confirmacao,
    ec.falso_positivo_em,
    c.nome as colaborador_nome,
    coalesce(e.empresa_nome_snapshot, emp.nome) as empresa_nome
  into v_registro
  from public.escala_colaboradores ec
  join public.colaboradores c on c.id = ec.colaborador_id
  join public.escalas e on e.id = ec.escala_id
  join public.empresas emp on emp.id = e.empresa_id
  where ec.id = p_escala_colaborador_id
  for update of ec;

  if v_registro.id is null then
    raise exception 'Registro do colaborador nao encontrado no Painel do Dia.';
  end if;

  if v_registro.status_confirmacao not in ('nao_comparecera', 'sem_resposta')
    and v_registro.falso_positivo_em is null then
    raise exception 'O substituto exige uma ausencia, falta de resposta ou falso positivo registrado.';
  end if;

  if v_substituto is not null and char_length(v_substituto) < 2 then
    raise exception 'Informe o nome completo ou deixe o campo vazio.';
  end if;

  update public.escala_colaboradores
  set
    substituto_nome = left(v_substituto, 180),
    substituido_em = case when v_substituto is null then null else now() end,
    substituido_por = case when v_substituto is null then null else auth.uid() end,
    atualizado_em = now()
  where id = p_escala_colaborador_id;

  perform public.dmr_log_action(
    case when v_substituto is null then 'remover_substituto' else 'definir_substituto' end,
    'escala_colaboradores',
    p_escala_colaborador_id,
    jsonb_build_object(
      'colaborador', v_registro.colaborador_nome,
      'substituto', v_substituto,
      'empresa', v_registro.empresa_nome,
      'falso_positivo', v_registro.falso_positivo_em is not null,
      'status_anterior', v_registro.status_confirmacao,
      'origem', 'dashboard'
    )
  );

  return jsonb_build_object(
    'sucesso', true,
    'status', case
      when v_substituto is not null then 'substituido'
      when v_registro.falso_positivo_em is not null then 'falso_positivo'
      else v_registro.status_confirmacao
    end,
    'substituto_nome', v_substituto
  );
end;
$$;

revoke all on function public.dmr_definir_substituto(uuid, text) from public;
grant execute on function public.dmr_definir_substituto(uuid, text) to authenticated, service_role;

comment on column public.contatos_alerta_dmr.notificar_de is
  'Inicio da jornada para alertas de colaboradores sem resposta, em America/Sao_Paulo.';
comment on column public.contatos_alerta_dmr.notificar_ate is
  'Fim da jornada para alertas de colaboradores sem resposta, em America/Sao_Paulo.';
