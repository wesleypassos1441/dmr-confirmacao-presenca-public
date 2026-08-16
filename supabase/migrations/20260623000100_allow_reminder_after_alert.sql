set check_function_bodies = off;

-- O alerta de 90 minutos e independente dos lembretes. Assim, uma operacao
-- iniciada mais tarde continua com os tres envios e com o alerta previsto.
create or replace function public.gerar_fila_confirmacoes()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_limites jsonb;
  v_now timestamptz := now();
  v_local_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inserted integer := 0;
  v_total integer := 0;
  v_max_incompreensiveis integer := 3;
  v_expirada_minutos integer := 30;
begin
  select valor into v_limites
  from public.configuracoes_sistema
  where chave = 'limites_bot';

  v_limites := coalesce(v_limites, '{"max_tentativas_envio":3,"max_respostas_incompreensiveis":3}'::jsonb);
  v_max_incompreensiveis := coalesce((v_limites ->> 'max_respostas_incompreensiveis')::integer, 3);

  with base as (
    select
      ec.id as escala_colaborador_id,
      ec.horario_inicio,
      ec.horario_inicio_disparo,
      ec.status_confirmacao,
      ec.mensagem_enviada_em,
      ec.primeiro_lembrete_enviado_em,
      ec.segundo_lembrete_enviado_em,
      ec.respondido_em,
      ec.alerta_sem_resposta_enviado_em,
      e.data,
      emp.nome as empresa_nome,
      concat_ws(', ', concat_ws(' ', nullif(emp.endereco, ''), nullif(emp.numero, '')), concat_ws(' - ', nullif(emp.bairro, ''), nullif(emp.cidade, ''))) as empresa_endereco,
      coalesce(eh.horario_saida, (ec.horario_inicio + interval '10 hours')::time) as horario_saida,
      c.nome as colaborador_nome,
      c.telefone as colaborador_telefone,
      coalesce(t.prioridade_envio, 'normal'::public.dmr_prioridade_envio) as prioridade,
      e.data + ec.horario_inicio_disparo as inicio_local,
      case
        when ec.horario_inicio_disparo > ec.horario_inicio
          then e.data + interval '1 day' + ec.horario_inicio
        else e.data + ec.horario_inicio
      end as entrada_local
    from public.escala_colaboradores ec
    join public.escalas e on e.id = ec.escala_id
    join public.empresas emp on emp.id = e.empresa_id
    join public.turnos_empresa t on t.id = ec.turno_empresa_id
    left join public.empresa_horarios eh on eh.id = t.empresa_horario_id
    join public.colaboradores c on c.id = ec.colaborador_id
    where (
        e.data = v_local_today
        or (
          e.data = v_local_today - 1
          and ec.horario_inicio_disparo > ec.horario_inicio
        )
      )
      and ec.horario_inicio_disparo is not null
      and emp.ativa
      and c.ativo
      and t.ativo
      and not ec.tratado_manualmente
      and ec.status_confirmacao not in ('confirmado', 'nao_comparecera', 'cancelado', 'tratado_manualmente')
  ),
  limites as (
    select
      b.*,
      b.entrada_local - interval '90 minutes' as alerta_base_local,
      case
        when b.inicio_local = date_trunc('hour', b.inicio_local) then b.inicio_local + interval '30 minutes'
        when b.inicio_local < date_trunc('hour', b.inicio_local) + interval '30 minutes' then date_trunc('hour', b.inicio_local) + interval '30 minutes'
        else date_trunc('hour', b.inicio_local) + interval '1 hour'
      end as lembrete_1_local
    from base b
  ),
  horarios as (
    select
      l.*,
      l.inicio_local at time zone 'America/Sao_Paulo' as confirmacao_em,
      l.lembrete_1_local at time zone 'America/Sao_Paulo' as lembrete_1_em,
      (l.lembrete_1_local + interval '30 minutes') at time zone 'America/Sao_Paulo' as lembrete_2_em,
      case
        when l.lembrete_1_local + interval '30 minutes' = l.alerta_base_local
          then (l.lembrete_1_local + interval '30 minutes' + interval '5 minutes') at time zone 'America/Sao_Paulo'
        else l.alerta_base_local at time zone 'America/Sao_Paulo'
      end as alerta_em
    from limites l
  ),
  inserir_confirmacao as (
    insert into public.fila_mensagens(
      escala_colaborador_id, tipo, status, prioridade, telefone_destino, mensagem, agendado_para, chave_unica
    )
    select
      h.escala_colaborador_id,
      'confirmacao_inicial'::public.dmr_tipo_fila,
      'pendente'::public.dmr_status_fila,
      h.prioridade,
      h.colaborador_telefone,
      format(
        E'%s *%s*. Você poderá comparecer na empresa *%s* hoje?\n\nEndereço: *%s*\n\nHorário: *%s as %s*\n\n1 - SIM\n2 - NÃO',
        case
          when extract(hour from h.confirmacao_em at time zone 'America/Sao_Paulo') < 12 then 'Bom dia'
          when extract(hour from h.confirmacao_em at time zone 'America/Sao_Paulo') < 18 then 'Boa tarde'
          else 'Boa noite'
        end,
        h.colaborador_nome,
        upper(h.empresa_nome),
        h.empresa_endereco,
        to_char(h.horario_inicio, 'HH24:MI'),
        to_char(h.horario_saida, 'HH24:MI')
      ),
      h.confirmacao_em,
      h.escala_colaborador_id::text || ':confirmacao_inicial'
    from horarios h
    where v_now >= h.confirmacao_em
      and h.mensagem_enviada_em is null
      and h.respondido_em is null
    on conflict (chave_unica) do nothing
    returning 1
  ),
  inserir_lembrete_1 as (
    insert into public.fila_mensagens(
      escala_colaborador_id, tipo, status, prioridade, telefone_destino, mensagem, agendado_para, chave_unica
    )
    select
      h.escala_colaborador_id,
      'lembrete_1'::public.dmr_tipo_fila,
      'pendente'::public.dmr_status_fila,
      h.prioridade,
      h.colaborador_telefone,
      format(
        E'%s *%s*. Ainda precisamos da sua resposta. Você poderá comparecer na empresa *%s* hoje?\n\nEndereço: *%s*\n\nHorário: *%s as %s*\n\n1 - SIM\n2 - NÃO',
        case
          when extract(hour from h.lembrete_1_em at time zone 'America/Sao_Paulo') < 12 then 'Bom dia'
          when extract(hour from h.lembrete_1_em at time zone 'America/Sao_Paulo') < 18 then 'Boa tarde'
          else 'Boa noite'
        end,
        h.colaborador_nome,
        upper(h.empresa_nome),
        h.empresa_endereco,
        to_char(h.horario_inicio, 'HH24:MI'),
        to_char(h.horario_saida, 'HH24:MI')
      ),
      h.lembrete_1_em,
      h.escala_colaborador_id::text || ':lembrete_1'
    from horarios h
    where v_now >= h.lembrete_1_em
      and h.mensagem_enviada_em is not null
      and h.primeiro_lembrete_enviado_em is null
      and h.respondido_em is null
    on conflict (chave_unica) do nothing
    returning 1
  ),
  inserir_lembrete_2 as (
    insert into public.fila_mensagens(
      escala_colaborador_id, tipo, status, prioridade, telefone_destino, mensagem, agendado_para, chave_unica
    )
    select
      h.escala_colaborador_id,
      'lembrete_2'::public.dmr_tipo_fila,
      'pendente'::public.dmr_status_fila,
      h.prioridade,
      h.colaborador_telefone,
      format(
        E'%s *%s*. Último lembrete: ainda precisamos da sua resposta. Você poderá comparecer na empresa *%s* hoje?\n\nEndereço: *%s*\n\nHorário: *%s as %s*\n\n1 - SIM\n2 - NÃO',
        case
          when extract(hour from h.lembrete_2_em at time zone 'America/Sao_Paulo') < 12 then 'Bom dia'
          when extract(hour from h.lembrete_2_em at time zone 'America/Sao_Paulo') < 18 then 'Boa tarde'
          else 'Boa noite'
        end,
        h.colaborador_nome,
        upper(h.empresa_nome),
        h.empresa_endereco,
        to_char(h.horario_inicio, 'HH24:MI'),
        to_char(h.horario_saida, 'HH24:MI')
      ),
      h.lembrete_2_em,
      h.escala_colaborador_id::text || ':lembrete_2'
    from horarios h
    where v_now >= h.lembrete_2_em
      and h.primeiro_lembrete_enviado_em is not null
      and h.segundo_lembrete_enviado_em is null
      and h.respondido_em is null
    on conflict (chave_unica) do nothing
    returning 1
  ),
  alertas as (
    insert into public.alertas_dmr(escala_colaborador_id, contato_alerta_dmr_id, motivo, mensagem)
    select
      h.escala_colaborador_id,
      d.id,
      'sem_resposta',
      format(
        'Sem resposta: %s ainda não confirmou presença na empresa %s para %s.',
        h.colaborador_nome,
        h.empresa_nome,
        to_char(h.horario_inicio, 'HH24:MI')
      )
    from horarios h
    cross join public.contatos_alerta_dmr d
    where d.ativo
      and d.criado_em <= h.alerta_em
      and v_now >= h.alerta_em
      and h.respondido_em is null
      and h.alerta_sem_resposta_enviado_em is null
    on conflict (escala_colaborador_id, motivo, contato_alerta_dmr_id) do nothing
    returning escala_colaborador_id, contato_alerta_dmr_id, mensagem
  ),
  filas_alerta as (
    insert into public.fila_mensagens(
      escala_colaborador_id, contato_alerta_dmr_id, tipo, status, prioridade,
      telefone_destino, mensagem, agendado_para, chave_unica
    )
    select
      a.escala_colaborador_id,
      a.contato_alerta_dmr_id,
      'alerta_sem_resposta'::public.dmr_tipo_fila,
      'pendente'::public.dmr_status_fila,
      'alta'::public.dmr_prioridade_envio,
      d.telefone,
      a.mensagem,
      v_now,
      a.escala_colaborador_id::text || ':alerta_sem_resposta:' || a.contato_alerta_dmr_id::text
    from alertas a
    join public.contatos_alerta_dmr d on d.id = a.contato_alerta_dmr_id
    on conflict (chave_unica) do nothing
    returning escala_colaborador_id
  )
  select
    (select count(*) from inserir_confirmacao)
    + (select count(*) from inserir_lembrete_1)
    + (select count(*) from inserir_lembrete_2)
    + (select count(*) from filas_alerta)
  into v_inserted;
  v_total := v_total + v_inserted;

  update public.escala_colaboradores ec
  set status_confirmacao = 'sem_resposta'
  where ec.id in (
    select fm.escala_colaborador_id
    from public.fila_mensagens fm
    where fm.tipo = 'alerta_sem_resposta'
      and fm.criado_em >= v_now - interval '2 seconds'
  )
    and ec.status_confirmacao not in ('confirmado', 'nao_comparecera', 'cancelado', 'tratado_manualmente');

  with candidatos as (
    select
      ec.id,
      ec.horario_inicio,
      ec.tentativas_incompreensiveis,
      ec.ultima_resposta_incompreensivel_em,
      e.data,
      emp.nome as empresa_nome,
      c.nome as colaborador_nome,
      ec.resposta_original
    from public.escala_colaboradores ec
    join public.escalas e on e.id = ec.escala_id
    join public.empresas emp on emp.id = e.empresa_id
    join public.colaboradores c on c.id = ec.colaborador_id
    where (
        e.data = v_local_today
        or (
          e.data = v_local_today - 1
          and ec.horario_inicio_disparo > ec.horario_inicio
        )
      )
      and ec.respondido_em is null
      and ec.status_confirmacao = 'resposta_incompreensivel'
      and ec.alerta_incompreensivel_enviado_em is null
      and (
        ec.tentativas_incompreensiveis >= v_max_incompreensiveis
        or (
          ec.ultima_resposta_incompreensivel_em is not null
          and ec.ultima_resposta_incompreensivel_em + make_interval(mins => v_expirada_minutos) <= v_now
        )
      )
  ),
  alertas_incompreensiveis as (
    insert into public.alertas_dmr(escala_colaborador_id, contato_alerta_dmr_id, motivo, mensagem)
    select
      c.id,
      d.id,
      case
        when c.tentativas_incompreensiveis >= v_max_incompreensiveis
          then 'resposta_incompreensivel'::public.dmr_motivo_alerta
        else 'resposta_incompreensivel_expirada'::public.dmr_motivo_alerta
      end,
      format(
        'Resposta incompreensível: %s na empresa %s para %s. Última resposta: %s',
        c.colaborador_nome,
        c.empresa_nome,
        to_char(c.horario_inicio, 'HH24:MI'),
        coalesce(c.resposta_original, 'não informada')
      )
    from candidatos c
    cross join public.contatos_alerta_dmr d
    where d.ativo
      and d.criado_em <= c.ultima_resposta_incompreensivel_em
    on conflict (escala_colaborador_id, motivo, contato_alerta_dmr_id) do nothing
    returning escala_colaborador_id, contato_alerta_dmr_id, motivo, mensagem
  ),
  filas_incompreensiveis as (
    insert into public.fila_mensagens(
      escala_colaborador_id, contato_alerta_dmr_id, tipo, status, prioridade,
      telefone_destino, mensagem, agendado_para, chave_unica
    )
    select
      a.escala_colaborador_id,
      a.contato_alerta_dmr_id,
      case
        when a.motivo = 'resposta_incompreensivel'
          then 'alerta_resposta_incompreensivel'::public.dmr_tipo_fila
        else 'alerta_resposta_incompreensivel_expirada'::public.dmr_tipo_fila
      end,
      'pendente'::public.dmr_status_fila,
      'alta'::public.dmr_prioridade_envio,
      d.telefone,
      a.mensagem,
      v_now,
      a.escala_colaborador_id::text || ':' ||
        case
          when a.motivo = 'resposta_incompreensivel'
            then 'alerta_resposta_incompreensivel'
          else 'alerta_resposta_incompreensivel_expirada'
        end || ':' || a.contato_alerta_dmr_id::text
    from alertas_incompreensiveis a
    join public.contatos_alerta_dmr d on d.id = a.contato_alerta_dmr_id
    on conflict (chave_unica) do nothing
    returning 1
  )
  select count(*) into v_inserted from filas_incompreensiveis;
  v_total := v_total + v_inserted;

  if v_total > 0 then
    insert into public.logs_acoes(acao, entidade, detalhes)
    values (
      'gerar_fila_confirmacoes_sql',
      'fila_mensagens',
      jsonb_build_object('mensagens_criadas', v_total, 'data_local', v_local_today)
    );
  end if;

  return jsonb_build_object('sucesso', true, 'mensagens_criadas', v_total, 'data_local', v_local_today);
end;
$$;

create or replace function public.dmr_criar_fila_diaria(
  p_turno_empresa_id uuid,
  p_data date,
  p_horario_inicio_disparo time,
  p_colaborador_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_turno record;
  v_colaborador_ids uuid[];
  v_colaboradores_esperados integer;
  v_colaboradores_validos integer;
  v_escala_id uuid;
  v_colaboradores_adicionados integer := 0;
  v_inicio_local timestamp;
  v_entrada_local timestamp;
  v_lembrete_1_local timestamp;
  v_lembrete_2_local timestamp;
  v_alerta_base_local timestamp;
begin
  if public.is_operador() is not true then
    raise exception 'Usuario sem permissao para gerar operacao manual.';
  end if;

  select array_agg(id order by id::text)
  into v_colaborador_ids
  from (
    select distinct id
    from unnest(p_colaborador_ids) as item(id)
    where id is not null
  ) selecionados;

  if coalesce(cardinality(v_colaborador_ids), 0) = 0 then
    raise exception 'Informe pelo menos um colaborador.';
  end if;

  select
    t.id as turno_empresa_id,
    t.empresa_id,
    t.nome as turno_nome,
    t.horario_inicio,
    coalesce(t.prioridade_envio, 'normal'::public.dmr_prioridade_envio) as prioridade,
    t.empresa_horario_id,
    emp.nome as empresa_nome,
    emp.ativa as empresa_ativa,
    eh.horario_entrada,
    eh.horario_saida,
    eh.ativo as horario_ativo
  into v_turno
  from public.turnos_empresa t
  join public.empresas emp on emp.id = t.empresa_id
  join public.empresa_horarios eh on eh.id = t.empresa_horario_id
  where t.id = p_turno_empresa_id
    and t.ativo;

  if v_turno.turno_empresa_id is null or v_turno.empresa_ativa is not true or v_turno.horario_ativo is not true then
    raise exception 'Turno, empresa ou jornada invalida.';
  end if;

  v_inicio_local := p_data + p_horario_inicio_disparo;
  v_entrada_local := case
    when p_horario_inicio_disparo > v_turno.horario_inicio
      then p_data + interval '1 day' + v_turno.horario_inicio
    else p_data + v_turno.horario_inicio
  end;
  v_alerta_base_local := v_entrada_local - interval '90 minutes';
  v_lembrete_1_local := case
    when v_inicio_local = date_trunc('hour', v_inicio_local) then v_inicio_local + interval '30 minutes'
    when v_inicio_local < date_trunc('hour', v_inicio_local) + interval '30 minutes' then date_trunc('hour', v_inicio_local) + interval '30 minutes'
    else date_trunc('hour', v_inicio_local) + interval '1 hour'
  end;
  v_lembrete_2_local := v_lembrete_1_local + interval '30 minutes';

  v_colaboradores_esperados := cardinality(v_colaborador_ids);

  select count(*)
  into v_colaboradores_validos
  from public.empresa_colaboradores vinculo
  join public.colaboradores c on c.id = vinculo.colaborador_id
  where vinculo.colaborador_id = any(v_colaborador_ids)
    and vinculo.empresa_id = v_turno.empresa_id
    and vinculo.empresa_horario_id = v_turno.empresa_horario_id
    and vinculo.ativo
    and c.ativo;

  if v_colaboradores_validos <> v_colaboradores_esperados then
    raise exception 'Todos os colaboradores precisam estar ativos e vinculados a empresa e jornada do turno.';
  end if;

  insert into public.escalas(empresa_id, empresa_horario_id, data, status, observacoes, criado_por, atualizado_por)
  values (
    v_turno.empresa_id,
    v_turno.empresa_horario_id,
    p_data,
    'pendente',
    format('Operacao manual com disparos a partir de %s', to_char(p_horario_inicio_disparo, 'HH24:MI')),
    auth.uid(),
    auth.uid()
  )
  on conflict (empresa_id, data, empresa_horario_id) do update
  set
    status = 'pendente',
    observacoes = excluded.observacoes,
    atualizado_em = now(),
    atualizado_por = auth.uid()
  returning id into v_escala_id;

  with upserted as (
    insert into public.escala_colaboradores(
      escala_id,
      colaborador_id,
      turno_empresa_id,
      horario_inicio,
      horario_inicio_disparo,
      status_confirmacao,
      resposta_normalizada,
      resposta_original,
      mensagem_enviada_em,
      primeiro_lembrete_enviado_em,
      segundo_lembrete_enviado_em,
      respondido_em,
      tentativas_incompreensiveis,
      ultima_resposta_incompreensivel_em,
      alerta_sem_resposta_enviado_em,
      alerta_incompreensivel_enviado_em,
      tratado_manualmente,
      tratado_por,
      tratado_em,
      criado_por,
      atualizado_por
    )
    select
      v_escala_id,
      c.id,
      v_turno.turno_empresa_id,
      v_turno.horario_inicio,
      p_horario_inicio_disparo,
      'pendente'::public.dmr_status_confirmacao,
      null,
      null,
      null,
      null,
      null,
      null,
      0,
      null,
      null,
      null,
      false,
      null,
      null,
      auth.uid(),
      auth.uid()
    from public.colaboradores c
    where c.id = any(v_colaborador_ids)
    on conflict (escala_id, colaborador_id) do update
    set
      turno_empresa_id = excluded.turno_empresa_id,
      horario_inicio = excluded.horario_inicio,
      horario_inicio_disparo = excluded.horario_inicio_disparo,
      status_confirmacao = 'pendente'::public.dmr_status_confirmacao,
      resposta_normalizada = null,
      resposta_original = null,
      mensagem_enviada_em = null,
      primeiro_lembrete_enviado_em = null,
      segundo_lembrete_enviado_em = null,
      respondido_em = null,
      tentativas_incompreensiveis = 0,
      ultima_resposta_incompreensivel_em = null,
      alerta_sem_resposta_enviado_em = null,
      alerta_incompreensivel_enviado_em = null,
      tratado_manualmente = false,
      tratado_por = null,
      tratado_em = null,
      atualizado_em = now(),
      atualizado_por = auth.uid()
    returning id
  )
  select count(*) into v_colaboradores_adicionados from upserted;

  insert into public.logs_acoes(ator_id, ator_email, acao, entidade, entidade_id, detalhes)
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    'gerar_operacao_manual',
    'escala_colaboradores',
    v_escala_id,
    jsonb_build_object(
      'origem', 'dashboard',
      'turno_empresa_id', p_turno_empresa_id,
      'empresa_id', v_turno.empresa_id,
      'empresa_horario_id', v_turno.empresa_horario_id,
      'data', p_data,
      'horario_inicio_disparo', p_horario_inicio_disparo,
      'colaborador_ids', v_colaborador_ids,
      'colaboradores_adicionados', v_colaboradores_adicionados
    )
  );

  return jsonb_build_object(
    'sucesso', true,
    'escala_id', v_escala_id,
    'colaboradores_adicionados', v_colaboradores_adicionados
  );
end;
$$;

revoke all on function public.gerar_fila_confirmacoes() from public;
revoke all on function public.dmr_criar_fila_diaria(uuid,date,time,uuid[]) from public;
grant execute on function public.dmr_criar_fila_diaria(uuid,date,time,uuid[]) to authenticated;

