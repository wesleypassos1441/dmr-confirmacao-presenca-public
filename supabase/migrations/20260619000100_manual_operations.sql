set check_function_bodies = off;

alter table public.escala_colaboradores
  add column if not exists horario_inicio_disparo time,
  add column if not exists intervalo_1_minutos integer not null default 7,
  add column if not exists intervalo_2_minutos integer not null default 7;

do $$
begin
  alter table public.escala_colaboradores
    add constraint escala_colaboradores_intervalo_1_manual_check
    check (intervalo_1_minutos between 7 and 10);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.escala_colaboradores
    add constraint escala_colaboradores_intervalo_2_manual_check
    check (intervalo_2_minutos between 7 and 10);
exception when duplicate_object then null;
end $$;

create or replace function public.gerar_fila_confirmacoes()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_agenda jsonb;
  v_limites jsonb;
  v_now timestamptz := now();
  v_local_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inserted integer := 0;
  v_total integer := 0;
  v_max_incompreensiveis integer := 3;
  v_expirada_minutos integer := 30;
begin
  select valor into v_agenda
  from public.configuracoes_sistema
  where chave = 'agenda_padrao';

  select valor into v_limites
  from public.configuracoes_sistema
  where chave = 'limites_bot';

  v_agenda := coalesce(v_agenda, '{
    "entrada_08": {"confirmacao_minutos": -60, "lembrete_1_minutos": -50, "lembrete_2_minutos": -40, "alerta_minutos": -35},
    "entrada_apos_08": {"confirmacao_minutos": -120, "lembrete_1_minutos": -90, "lembrete_2_minutos": -60, "alerta_minutos": -40},
    "alerta_incompreensivel_expirada_minutos": 30
  }'::jsonb);
  v_limites := coalesce(v_limites, '{"max_tentativas_envio": 3, "max_respostas_incompreensiveis": 3}'::jsonb);
  v_max_incompreensiveis := coalesce((v_limites ->> 'max_respostas_incompreensiveis')::integer, 3);
  v_expirada_minutos := coalesce((v_agenda ->> 'alerta_incompreensivel_expirada_minutos')::integer, 30);

  with base as (
    select
      ec.id as escala_colaborador_id,
      ec.horario_inicio,
      ec.horario_inicio_disparo,
      ec.intervalo_1_minutos,
      ec.intervalo_2_minutos,
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
      case
        when ec.horario_inicio = time '08:00' then v_agenda -> 'entrada_08'
        else v_agenda -> 'entrada_apos_08'
      end as regra
    from public.escala_colaboradores ec
    join public.escalas e on e.id = ec.escala_id
    join public.empresas emp on emp.id = e.empresa_id
    join public.turnos_empresa t on t.id = ec.turno_empresa_id
    join public.colaboradores c on c.id = ec.colaborador_id
    where e.data = v_local_today
      and emp.ativa
      and c.ativo
      and t.ativo
      and not ec.tratado_manualmente
      and ec.status_confirmacao not in ('confirmado', 'nao_comparecera', 'cancelado', 'tratado_manualmente')
  ),
  horarios as (
    select
      b.*,
      case
        when b.horario_inicio_disparo is not null then ((b.data + b.horario_inicio_disparo) at time zone 'America/Sao_Paulo')
        else ((b.data + b.horario_inicio + (((b.regra ->> 'confirmacao_minutos')::integer || ' minutes')::interval)) at time zone 'America/Sao_Paulo')
      end as confirmacao_em,
      case
        when b.horario_inicio_disparo is not null then ((b.data + b.horario_inicio_disparo + make_interval(mins => b.intervalo_1_minutos)) at time zone 'America/Sao_Paulo')
        else ((b.data + b.horario_inicio + (((b.regra ->> 'lembrete_1_minutos')::integer || ' minutes')::interval)) at time zone 'America/Sao_Paulo')
      end as lembrete_1_em,
      case
        when b.horario_inicio_disparo is not null then ((b.data + b.horario_inicio_disparo + make_interval(mins => b.intervalo_1_minutos + b.intervalo_2_minutos)) at time zone 'America/Sao_Paulo')
        else ((b.data + b.horario_inicio + (((b.regra ->> 'lembrete_2_minutos')::integer || ' minutes')::interval)) at time zone 'America/Sao_Paulo')
      end as lembrete_2_em,
      case
        when b.horario_inicio_disparo is not null
          and ((b.data + b.horario_inicio) - (b.data + b.horario_inicio_disparo)) <= interval '60 minutes'
          then ((b.data + b.horario_inicio - interval '30 minutes') at time zone 'America/Sao_Paulo')
        when b.horario_inicio_disparo is not null
          then ((b.data + b.horario_inicio - interval '60 minutes') at time zone 'America/Sao_Paulo')
        else ((b.data + b.horario_inicio + (((b.regra ->> 'alerta_minutos')::integer || ' minutes')::interval)) at time zone 'America/Sao_Paulo')
      end as alerta_em
    from base b
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
      format('%s %s. Você confirma presença na empresa %s hoje? Responda 1 para Sim ou 2 para Não.',
        case when extract(hour from h.confirmacao_em at time zone 'America/Sao_Paulo') < 12 then 'Bom dia' else 'Boa tarde' end,
        h.colaborador_nome,
        h.empresa_nome
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
    insert into public.fila_mensagens(escala_colaborador_id, tipo, status, prioridade, telefone_destino, mensagem, agendado_para, chave_unica)
    select h.escala_colaborador_id, 'lembrete_1', 'pendente', h.prioridade, h.colaborador_telefone,
      format('%s, ainda precisamos da sua confirmação para a empresa %s hoje. Responda 1 para Sim ou 2 para Não.', h.colaborador_nome, h.empresa_nome),
      h.lembrete_1_em, h.escala_colaborador_id::text || ':lembrete_1'
    from horarios h
    where v_now >= h.lembrete_1_em
      and h.mensagem_enviada_em is not null
      and h.primeiro_lembrete_enviado_em is null
      and h.respondido_em is null
    on conflict (chave_unica) do nothing
    returning 1
  ),
  inserir_lembrete_2 as (
    insert into public.fila_mensagens(escala_colaborador_id, tipo, status, prioridade, telefone_destino, mensagem, agendado_para, chave_unica)
    select h.escala_colaborador_id, 'lembrete_2', 'pendente', h.prioridade, h.colaborador_telefone,
      format('%s, último lembrete: você comparece na empresa %s hoje? Responda 1 para Sim ou 2 para Não.', h.colaborador_nome, h.empresa_nome),
      h.lembrete_2_em, h.escala_colaborador_id::text || ':lembrete_2'
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
    select h.escala_colaborador_id, d.id, 'sem_resposta',
      format('Sem resposta: %s ainda não confirmou presença na empresa %s para %s.', h.colaborador_nome, h.empresa_nome, to_char(h.horario_inicio, 'HH24:MI'))
    from horarios h
    cross join public.contatos_alerta_dmr d
    where d.ativo
      and v_now >= h.alerta_em
      and h.segundo_lembrete_enviado_em is not null
      and h.respondido_em is null
      and h.alerta_sem_resposta_enviado_em is null
    on conflict (escala_colaborador_id, motivo, contato_alerta_dmr_id) do nothing
    returning escala_colaborador_id, contato_alerta_dmr_id, mensagem
  ),
  filas_alerta as (
    insert into public.fila_mensagens(escala_colaborador_id, contato_alerta_dmr_id, tipo, status, prioridade, telefone_destino, mensagem, agendado_para, chave_unica)
    select a.escala_colaborador_id, a.contato_alerta_dmr_id, 'alerta_sem_resposta', 'pendente', 'alta',
      d.telefone, a.mensagem, v_now,
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
    select ec.id, ec.horario_inicio, ec.tentativas_incompreensiveis, ec.ultima_resposta_incompreensivel_em,
      e.data, emp.nome empresa_nome, c.nome colaborador_nome, ec.resposta_original
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
        or (ec.ultima_resposta_incompreensivel_em is not null and ec.ultima_resposta_incompreensivel_em + make_interval(mins => v_expirada_minutos) <= v_now)
      )
  ),
  alertas_incompreensiveis as (
    insert into public.alertas_dmr(escala_colaborador_id, contato_alerta_dmr_id, motivo, mensagem)
    select c.id, d.id,
      case when c.tentativas_incompreensiveis >= v_max_incompreensiveis then 'resposta_incompreensivel'::public.dmr_motivo_alerta else 'resposta_incompreensivel_expirada'::public.dmr_motivo_alerta end,
      format('Resposta incompreensível: %s na empresa %s para %s. Última resposta: %s',
        c.colaborador_nome, c.empresa_nome, to_char(c.horario_inicio, 'HH24:MI'), coalesce(c.resposta_original, 'não informada'))
    from candidatos c
    cross join public.contatos_alerta_dmr d
    where d.ativo
    on conflict (escala_colaborador_id, motivo, contato_alerta_dmr_id) do nothing
    returning escala_colaborador_id, contato_alerta_dmr_id, motivo, mensagem
  ),
  filas_incompreensiveis as (
    insert into public.fila_mensagens(escala_colaborador_id, contato_alerta_dmr_id, tipo, status, prioridade, telefone_destino, mensagem, agendado_para, chave_unica)
    select a.escala_colaborador_id, a.contato_alerta_dmr_id,
      case when a.motivo = 'resposta_incompreensivel' then 'alerta_resposta_incompreensivel'::public.dmr_tipo_fila else 'alerta_resposta_incompreensivel_expirada'::public.dmr_tipo_fila end,
      'pendente', 'alta', d.telefone, a.mensagem, v_now,
      a.escala_colaborador_id::text || ':' ||
      case when a.motivo = 'resposta_incompreensivel' then 'alerta_resposta_incompreensivel' else 'alerta_resposta_incompreensivel_expirada' end ||
      ':' || a.contato_alerta_dmr_id::text
    from alertas_incompreensiveis a
    join public.contatos_alerta_dmr d on d.id = a.contato_alerta_dmr_id
    on conflict (chave_unica) do nothing
    returning 1
  )
  select count(*) into v_inserted from filas_incompreensiveis;
  v_total := v_total + v_inserted;

  insert into public.logs_acoes(acao, entidade, detalhes)
  values ('gerar_fila_confirmacoes_sql', 'fila_mensagens', jsonb_build_object('mensagens_criadas', v_total, 'data_local', v_local_today));

  return jsonb_build_object('sucesso', true, 'mensagens_criadas', v_total, 'data_local', v_local_today);
end;
$$;

revoke all on function public.gerar_fila_confirmacoes() from public;
