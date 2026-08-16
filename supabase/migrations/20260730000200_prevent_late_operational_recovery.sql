create or replace function public.dmr_cancelar_filas_expiradas_bot(
  p_agora timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_today date := (p_agora at time zone 'America/Sao_Paulo')::date;
  v_canceladas integer := 0;
begin
  update public.fila_mensagens fm
  set
    status = 'cancelada',
    processando_em = null,
    ultimo_erro = case
      when fm.tipo in ('confirmacao_inicial', 'lembrete_1', 'lembrete_2')
        and p_agora >= (
          (
            e.data
            + coalesce(e.horario_entrada_snapshot, ec.horario_inicio)
          ) at time zone 'America/Sao_Paulo'
        )
        then 'Fila cancelada automaticamente: horario de entrada da operacao ja iniciado.'
      else 'Fila cancelada automaticamente: operacao antiga e encerrada.'
    end,
    atualizado_em = p_agora
  from public.escala_colaboradores ec
  join public.escalas e on e.id = ec.escala_id
  where fm.escala_colaborador_id = ec.id
    and (
      fm.status = 'pendente'
      or (
        fm.status = 'processando'
        and (
          fm.processando_em is null
          or fm.processando_em < p_agora - interval '5 minutes'
        )
      )
    )
    and (
      (
        e.data < v_local_today
        and not (
          e.data = v_local_today - 1
          and ec.horario_inicio_disparo is not null
          and ec.horario_inicio_disparo > ec.horario_inicio
        )
      )
      or (
        fm.tipo in ('confirmacao_inicial', 'lembrete_1', 'lembrete_2')
        and p_agora >= (
          (
            e.data
            + coalesce(e.horario_entrada_snapshot, ec.horario_inicio)
          ) at time zone 'America/Sao_Paulo'
        )
      )
    );

  get diagnostics v_canceladas = row_count;
  return v_canceladas;
end;
$$;

revoke all on function public.dmr_cancelar_filas_expiradas_bot(timestamptz)
from public, anon, authenticated;

grant execute on function public.dmr_cancelar_filas_expiradas_bot(timestamptz)
to service_role;

create or replace function public.dmr_recuperar_filas_operacionais_bot(
  p_agora timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje_brasilia date := (p_agora at time zone 'America/Sao_Paulo')::date;
  v_recuperadas integer := 0;
begin
  with candidatas as (
    select fm.id
    from public.fila_mensagens fm
    join public.escala_colaboradores ec
      on ec.id = fm.escala_colaborador_id
    join public.escalas e
      on e.id = ec.escala_id
    join public.empresas emp
      on emp.id = e.empresa_id
    join public.colaboradores col
      on col.id = ec.colaborador_id
    join public.turnos_empresa te
      on te.id = ec.turno_empresa_id
    where fm.status = 'erro'
      and fm.tipo in ('confirmacao_inicial', 'lembrete_1', 'lembrete_2')
      and fm.recuperacoes_automaticas < 1
      and (
        e.data = v_hoje_brasilia
        or (
          e.data = v_hoje_brasilia - 1
          and ec.horario_inicio_disparo > ec.horario_inicio
        )
      )
      and emp.ativa
      and col.ativo
      and te.ativo
      and p_agora < (
        (
          e.data
          + coalesce(e.horario_entrada_snapshot, ec.horario_inicio)
        ) at time zone 'America/Sao_Paulo'
      )
      and not ec.tratado_manualmente
      and ec.status_confirmacao not in (
        'confirmado',
        'nao_comparecera',
        'cancelado',
        'tratado_manualmente'
      )
      and (
        (
          fm.tipo = 'confirmacao_inicial'
          and ec.mensagem_enviada_em is null
        )
        or (
          fm.tipo = 'lembrete_1'
          and ec.mensagem_enviada_em is not null
          and ec.primeiro_lembrete_enviado_em is null
        )
        or (
          fm.tipo = 'lembrete_2'
          and ec.primeiro_lembrete_enviado_em is not null
          and ec.segundo_lembrete_enviado_em is null
        )
      )
      and not exists (
        select 1
        from public.fila_mensagens fm_aberta
        where fm_aberta.escala_colaborador_id = fm.escala_colaborador_id
          and fm_aberta.id <> fm.id
          and fm_aberta.tipo = fm.tipo
          and fm_aberta.status in ('pendente', 'processando')
      )
      and not exists (
        select 1
        from public.fila_mensagens fm_enviada
        where fm_enviada.escala_colaborador_id = fm.escala_colaborador_id
          and fm_enviada.id <> fm.id
          and fm_enviada.tipo in ('confirmacao_inicial', 'reenvio_manual')
          and fm_enviada.status = 'enviada'
          and fm_enviada.enviada_em is not null
          and fm_enviada.criado_em > fm.atualizado_em
      )
    order by fm.atualizado_em, fm.id
    for update of fm skip locked
  ),
  recuperadas as (
    update public.fila_mensagens fm
    set
      status = 'pendente',
      tentativas = 0,
      recuperacoes_automaticas = fm.recuperacoes_automaticas + 1,
      processando_em = null,
      enviada_em = null,
      agendado_para = p_agora,
      ultimo_erro = 'Mensagem reaberta automaticamente apos falha temporaria do WhatsApp.',
      atualizado_em = p_agora
    from candidatas candidata
    where fm.id = candidata.id
      and fm.status = 'erro'
      and fm.recuperacoes_automaticas < 1
    returning fm.id
  )
  select count(*)::integer
  into v_recuperadas
  from recuperadas;

  return v_recuperadas;
end;
$$;

revoke all on function public.dmr_recuperar_filas_operacionais_bot(timestamptz)
from public, anon, authenticated;

grant execute on function public.dmr_recuperar_filas_operacionais_bot(timestamptz)
to service_role;
