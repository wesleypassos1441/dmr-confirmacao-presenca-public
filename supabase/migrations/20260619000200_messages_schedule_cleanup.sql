set check_function_bodies = off;

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
      c.nome as colaborador_nome,
      c.telefone as colaborador_telefone,
      coalesce(t.prioridade_envio, 'normal'::public.dmr_prioridade_envio) as prioridade,
      ((e.data + ec.horario_inicio_disparo) at time zone 'America/Sao_Paulo') as inicio_em,
      ((e.data + ec.horario_inicio - interval '60 minutes') at time zone 'America/Sao_Paulo') as alerta_em
    from public.escala_colaboradores ec
    join public.escalas e on e.id = ec.escala_id
    join public.empresas emp on emp.id = e.empresa_id
    join public.turnos_empresa t on t.id = ec.turno_empresa_id
    join public.colaboradores c on c.id = ec.colaborador_id
    where e.data = v_local_today
      and ec.horario_inicio_disparo is not null
      and (e.data + ec.horario_inicio_disparo) < (e.data + ec.horario_inicio - interval '60 minutes')
      and emp.ativa
      and c.ativo
      and t.ativo
      and not ec.tratado_manualmente
      and ec.status_confirmacao not in ('confirmado', 'nao_comparecera', 'cancelado', 'tratado_manualmente')
  ),
  janelas as (
    select
      b.*,
      extract(epoch from (b.alerta_em - b.inicio_em)) / 60 as janela_minutos
    from base b
  ),
  horarios as (
    select
      b.*,
      b.inicio_em as confirmacao_em,
      b.inicio_em + make_interval(mins => round(b.janela_minutos * 0.4)::integer) as lembrete_1_em,
      b.inicio_em + make_interval(mins => round(b.janela_minutos * 0.8)::integer) as lembrete_2_em
    from janelas b
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
        E'%s, %s.\n\nVocê confirma sua presença hoje na empresa %s, às %s?\n\n1 - Sim\n2 - Não',
        case
          when extract(hour from h.confirmacao_em at time zone 'America/Sao_Paulo') < 12 then 'Bom dia'
          when extract(hour from h.confirmacao_em at time zone 'America/Sao_Paulo') < 18 then 'Boa tarde'
          else 'Boa noite'
        end,
        h.colaborador_nome,
        h.empresa_nome,
        to_char(h.horario_inicio, 'HH24:MI')
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
        E'%s, %s.\n\nAinda não recebemos sua confirmação para a empresa %s, às %s.\n\n1 - Sim\n2 - Não',
        case
          when extract(hour from h.lembrete_1_em at time zone 'America/Sao_Paulo') < 12 then 'Bom dia'
          when extract(hour from h.lembrete_1_em at time zone 'America/Sao_Paulo') < 18 then 'Boa tarde'
          else 'Boa noite'
        end,
        h.colaborador_nome,
        h.empresa_nome,
        to_char(h.horario_inicio, 'HH24:MI')
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
        E'%s, %s.\n\nEste é o último lembrete para confirmar sua presença hoje na empresa %s, às %s.\n\n1 - Sim\n2 - Não',
        case
          when extract(hour from h.lembrete_2_em at time zone 'America/Sao_Paulo') < 12 then 'Bom dia'
          when extract(hour from h.lembrete_2_em at time zone 'America/Sao_Paulo') < 18 then 'Boa tarde'
          else 'Boa noite'
        end,
        h.colaborador_nome,
        h.empresa_nome,
        to_char(h.horario_inicio, 'HH24:MI')
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
    where e.data = v_local_today
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

revoke all on function public.gerar_fila_confirmacoes() from public;

delete from public.configuracoes_sistema
where chave = 'agenda_padrao';

drop table if exists public.templates_mensagem;

create or replace function public.limpar_dados_tecnicos_dmr()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_heartbeats integer := 0;
  v_logs integer := 0;
begin
  delete from public.bot_heartbeats
  where criado_em < now() - interval '30 days';
  get diagnostics v_heartbeats = row_count;

  delete from public.logs_acoes
  where criado_em < now() - interval '90 days'
    and acao in ('gerar_fila_confirmacoes_sql', 'erro_bot');
  get diagnostics v_logs = row_count;

  return jsonb_build_object(
    'heartbeats_removidos', v_heartbeats,
    'logs_tecnicos_removidos', v_logs
  );
end;
$$;

revoke all on function public.limpar_dados_tecnicos_dmr() from public;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dmr_limpar_dados_tecnicos_daily') then
    perform cron.unschedule('dmr_limpar_dados_tecnicos_daily');
  end if;

  perform cron.schedule(
    'dmr_limpar_dados_tecnicos_daily',
    '17 3 * * *',
    'select public.limpar_dados_tecnicos_dmr();'
  );
end $$;
