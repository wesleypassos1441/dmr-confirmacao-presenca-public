insert into public.configuracoes_sistema(chave, valor, descricao)
values (
  'relatorio_whatsapp_ativado_em',
  jsonb_build_object('ativado_em', now()),
  'Marco de ativacao dos relatorios WhatsApp. Operacoes criadas antes deste horario nao geram relatorio.'
)
on conflict (chave) do update
set
  valor = case
    when public.configuracoes_sistema.valor ? 'ativado_em' then public.configuracoes_sistema.valor
    else excluded.valor
  end,
  descricao = excluded.descricao,
  atualizado_em = now();

update public.fila_mensagens fm
set
  status = 'cancelada',
  ultimo_erro = 'Relatorio anterior ao marco de ativacao cancelado automaticamente.'
from public.escala_colaboradores ec,
  lateral (
    select coalesce(
      nullif(cs.valor ->> 'ativado_em', '')::timestamptz,
      now()
    ) as ativado_em
    from public.configuracoes_sistema cs
    where cs.chave = 'relatorio_whatsapp_ativado_em'
  ) cfg
where fm.escala_colaborador_id = ec.id
  and fm.tipo = 'relatorio_diario'
  and fm.status in ('pendente', 'processando')
  and ec.criado_em < cfg.ativado_em;

create or replace function public.dmr_enfileirar_relatorio_diario_base(
  p_data date,
  p_escala_id uuid default null,
  p_turno_empresa_id uuid default null,
  p_origem text default 'manual'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_relatorio_ativado_em timestamptz;
begin
  select nullif(valor ->> 'ativado_em', '')::timestamptz
  into v_relatorio_ativado_em
  from public.configuracoes_sistema
  where chave = 'relatorio_whatsapp_ativado_em';

  v_relatorio_ativado_em := coalesce(v_relatorio_ativado_em, now());

  with base as (
    select
      ec.id as escala_colaborador_id,
      e.id as escala_id,
      emp.nome as empresa_nome,
      te.id as turno_id,
      coalesce(nullif(te.nome, ''), to_char(ec.horario_inicio, 'HH24:MI')) as turno_nome,
      c.nome as colaborador_nome,
      ec.status_confirmacao,
      ec.resposta_original,
      ec.criado_em
    from public.escala_colaboradores ec
    join public.escalas e on e.id = ec.escala_id
    join public.empresas emp on emp.id = e.empresa_id
    join public.turnos_empresa te on te.id = ec.turno_empresa_id
    join public.colaboradores c on c.id = ec.colaborador_id
    where e.data = p_data
      and (p_escala_id is null or e.id = p_escala_id)
      and (p_turno_empresa_id is null or te.id = p_turno_empresa_id)
      and ec.status_confirmacao <> 'cancelado'
      and ec.criado_em >= v_relatorio_ativado_em
  ),
  grupos as (
    select
      escala_id,
      turno_id,
      empresa_nome,
      turno_nome,
      min(criado_em) as operacao_criada_em,
      (array_agg(escala_colaborador_id order by colaborador_nome))[1] as escala_colaborador_id,
      string_agg('• ' || colaborador_nome, E'\n' order by colaborador_nome) filter (where status_confirmacao = 'confirmado') as confirmados,
      string_agg('• ' || colaborador_nome, E'\n' order by colaborador_nome) filter (where status_confirmacao = 'nao_comparecera') as ausentes,
      string_agg('• ' || colaborador_nome, E'\n' order by colaborador_nome) filter (
        where status_confirmacao in ('pendente', 'mensagem_agendada', 'mensagem_enviada', 'sem_resposta', 'erro_envio')
      ) as aguardando,
      string_agg(
        '• ' || colaborador_nome || coalesce(' - ' || nullif(resposta_original, ''), ''),
        E'\n'
        order by colaborador_nome
      ) filter (where status_confirmacao = 'resposta_incompreensivel') as incompreensiveis
    from base
    group by escala_id, turno_id, empresa_nome, turno_nome
  ),
  mensagens as (
    select
      grupo.escala_colaborador_id,
      contato.id as contato_alerta_dmr_id,
      contato.telefone as telefone_destino,
      concat_ws(
        E'\n\n',
        format('*Empresa: %s: %s - %s*', grupo.empresa_nome, to_char(p_data, 'DD/MM/YYYY'), grupo.turno_nome),
        case when grupo.confirmados is not null then '*Confirmados:*' || E'\n' || grupo.confirmados end,
        case when grupo.ausentes is not null then '*Não poderão comparecer:*' || E'\n' || grupo.ausentes end,
        case when grupo.aguardando is not null then '*Aguardado respostas:*' || E'\n' || grupo.aguardando end,
        case when grupo.incompreensiveis is not null then '*Resposta incompreensível:*' || E'\n' || grupo.incompreensiveis end
      ) as mensagem
    from grupos grupo
    cross join public.contatos_alerta_dmr contato
    where contato.ativo
      and contato.criado_em <= grupo.operacao_criada_em
  ),
  inserted as (
    insert into public.fila_mensagens(
      escala_colaborador_id,
      contato_alerta_dmr_id,
      tipo,
      status,
      prioridade,
      telefone_destino,
      mensagem,
      agendado_para,
      chave_unica
    )
    select
      escala_colaborador_id,
      contato_alerta_dmr_id,
      'relatorio_diario'::public.dmr_tipo_fila,
      'pendente',
      'alta',
      telefone_destino,
      mensagem,
      now(),
      escala_colaborador_id::text || ':relatorio_diario:' || contato_alerta_dmr_id::text
    from mensagens
    on conflict do nothing
    returning 1
  )
  select count(*) into v_total from inserted;

  if v_total > 0 then
    perform public.dmr_log_action(
      'enviar_relatorio_whatsapp',
      'fila_mensagens',
      null,
      jsonb_build_object(
        'data', p_data,
        'origem', p_origem,
        'mensagens_criadas', v_total,
        'relatorio_ativado_em', v_relatorio_ativado_em
      )
    );
  end if;

  return v_total;
end;
$$;

revoke all on function public.dmr_enfileirar_relatorio_diario_base(date, uuid, uuid, text) from public;

create or replace function public.dmr_enfileirar_relatorio_diario(p_data date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
begin
  if not public.is_operador() then
    raise exception 'Acesso negado.';
  end if;

  v_total := public.dmr_enfileirar_relatorio_diario_base(p_data, null, null, 'manual');
  return jsonb_build_object('sucesso', true, 'mensagens_criadas', v_total);
end;
$$;

revoke all on function public.dmr_enfileirar_relatorio_diario(date) from public;
grant execute on function public.dmr_enfileirar_relatorio_diario(date) to authenticated;

create or replace function public.dmr_enfileirar_relatorios_automaticos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now_local timestamp := now() at time zone 'America/Sao_Paulo';
  v_total integer := 0;
  v_created integer := 0;
  v_item record;
  v_relatorio_ativado_em timestamptz;
begin
  select nullif(valor ->> 'ativado_em', '')::timestamptz
  into v_relatorio_ativado_em
  from public.configuracoes_sistema
  where chave = 'relatorio_whatsapp_ativado_em';

  v_relatorio_ativado_em := coalesce(v_relatorio_ativado_em, now());

  for v_item in
    with grupos as (
      select
        e.id as escala_id,
        e.data,
        te.id as turno_empresa_id,
        case
          when ec.horario_inicio_disparo > ec.horario_inicio
            then e.data + interval '1 day' + ec.horario_inicio
          else e.data + ec.horario_inicio
        end as entrada_local,
        count(*) as total_colaboradores,
        count(*) filter (
          where ec.status_confirmacao in ('confirmado', 'nao_comparecera', 'resposta_incompreensivel', 'tratado_manualmente')
        ) as respondidos
      from public.escala_colaboradores ec
      join public.escalas e on e.id = ec.escala_id
      join public.turnos_empresa te on te.id = ec.turno_empresa_id
      where e.data between (v_now_local::date - 1) and (v_now_local::date + 1)
        and ec.status_confirmacao <> 'cancelado'
        and ec.criado_em >= v_relatorio_ativado_em
      group by e.id, e.data, te.id, entrada_local
    )
    select *
    from grupos
    where (
        v_now_local >= entrada_local - interval '90 minutes'
        or respondidos = total_colaboradores
      )
  loop
    v_created := public.dmr_enfileirar_relatorio_diario_base(
      v_item.data,
      v_item.escala_id,
      v_item.turno_empresa_id,
      'automatico'
    );
    v_total := v_total + v_created;
  end loop;

  return jsonb_build_object('sucesso', true, 'mensagens_criadas', v_total);
end;
$$;

revoke all on function public.dmr_enfileirar_relatorios_automaticos() from public;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dmr_enfileirar_relatorios_every_minute') then
    perform cron.unschedule('dmr_enfileirar_relatorios_every_minute');
  end if;

  perform cron.schedule(
    'dmr_enfileirar_relatorios_every_minute',
    '* * * * *',
    'select public.dmr_enfileirar_relatorios_automaticos();'
  );
end $$;
