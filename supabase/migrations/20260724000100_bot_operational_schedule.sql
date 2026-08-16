alter table public.fila_mensagens
  add column if not exists recuperacoes_automaticas integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fila_mensagens_recuperacoes_automaticas_check'
      and conrelid = 'public.fila_mensagens'::regclass
  ) then
    alter table public.fila_mensagens
      add constraint fila_mensagens_recuperacoes_automaticas_check
      check (recuperacoes_automaticas >= 0);
  end if;
end;
$$;

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
    ultimo_erro = 'Fila cancelada automaticamente: operacao antiga e encerrada.',
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
    and e.data < v_local_today
    and not (
      e.data = v_local_today - 1
      and ec.horario_inicio_disparo is not null
      and ec.horario_inicio_disparo > ec.horario_inicio
    );

  get diagnostics v_canceladas = row_count;
  return v_canceladas;
end;
$$;

revoke all on function public.dmr_cancelar_filas_expiradas_bot(timestamptz) from public;
revoke all on function public.dmr_cancelar_filas_expiradas_bot(timestamptz) from anon;
revoke all on function public.dmr_cancelar_filas_expiradas_bot(timestamptz) from authenticated;
grant execute on function public.dmr_cancelar_filas_expiradas_bot(timestamptz) to service_role;

create or replace function public.dmr_status_operacional_bot(
  p_agora timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_today date := (p_agora at time zone 'America/Sao_Paulo')::date;
  v_now_local timestamp := p_agora at time zone 'America/Sao_Paulo';
  v_canceladas integer := 0;
  v_filas_pendentes integer := 0;
  v_etapas_pendentes integer := 0;
  v_relatorios_pendentes integer := 0;
begin
  v_canceladas := public.dmr_cancelar_filas_expiradas_bot(p_agora);

  with operacoes_validas as (
    select
      ec.id as escala_colaborador_id,
      e.id as escala_id,
      e.data,
      te.id as turno_empresa_id,
      ec.horario_inicio,
      ec.horario_inicio_disparo,
      ec.status_confirmacao,
      ec.mensagem_enviada_em,
      ec.primeiro_lembrete_enviado_em,
      ec.segundo_lembrete_enviado_em,
      ec.respondido_em,
      ec.tentativas_incompreensiveis,
      ec.ultima_resposta_incompreensivel_em,
      ec.alerta_sem_resposta_enviado_em,
      ec.alerta_incompreensivel_enviado_em,
      ec.tratado_manualmente,
      ec.criado_em,
      c.nome as colaborador_nome,
      horarios.inicio_local at time zone 'America/Sao_Paulo' as confirmacao_em,
      limites.lembrete_1_local at time zone 'America/Sao_Paulo' as lembrete_1_em,
      (limites.lembrete_1_local + interval '30 minutes') at time zone 'America/Sao_Paulo'
        as lembrete_2_em,
      case
        when limites.lembrete_1_local + interval '30 minutes' = limites.alerta_base_local
          then (limites.lembrete_1_local + interval '35 minutes') at time zone 'America/Sao_Paulo'
        else limites.alerta_base_local at time zone 'America/Sao_Paulo'
      end as alerta_em
    from public.escala_colaboradores ec
    join public.escalas e on e.id = ec.escala_id
    join public.empresas emp on emp.id = e.empresa_id
    join public.colaboradores c on c.id = ec.colaborador_id
    join public.turnos_empresa te on te.id = ec.turno_empresa_id
    cross join lateral (
      select
        e.data + ec.horario_inicio_disparo as inicio_local,
        case
          when ec.horario_inicio_disparo > ec.horario_inicio
            then e.data + interval '1 day' + ec.horario_inicio
          else e.data + ec.horario_inicio
        end as entrada_local
    ) horarios
    cross join lateral (
      select
        horarios.entrada_local - interval '90 minutes' as alerta_base_local,
        case
          when horarios.inicio_local = date_trunc('hour', horarios.inicio_local)
            then horarios.inicio_local + interval '30 minutes'
          when horarios.inicio_local < date_trunc('hour', horarios.inicio_local) + interval '30 minutes'
            then date_trunc('hour', horarios.inicio_local) + interval '30 minutes'
          else date_trunc('hour', horarios.inicio_local) + interval '1 hour'
        end as lembrete_1_local
    ) limites
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
      and te.ativo
  ),
  configuracao_alertas as (
    select coalesce(
      (
        select (cs.valor ->> 'max_respostas_incompreensiveis')::integer
        from public.configuracoes_sistema cs
        where cs.chave = 'limites_bot'
      ),
      3
    ) as max_respostas_incompreensiveis
  ),
  etapas_em_aberto as (
    select ov.escala_colaborador_id, etapa.tipo
    from operacoes_validas ov
    cross join configuracao_alertas cfg_alerta
    cross join lateral (
      values
        (
          'confirmacao_inicial',
          ov.mensagem_enviada_em is null
            and ov.respondido_em is null
            and not exists (
              select 1
              from public.fila_mensagens fm_confirmacao_existente
              where fm_confirmacao_existente.escala_colaborador_id = ov.escala_colaborador_id
                and fm_confirmacao_existente.tipo = 'confirmacao_inicial'
            )
        ),
        (
          'lembrete_1',
          ov.mensagem_enviada_em is not null
            and ov.primeiro_lembrete_enviado_em is null
            and ov.respondido_em is null
            and not exists (
              select 1
              from public.fila_mensagens fm_lembrete_1_existente
              where fm_lembrete_1_existente.escala_colaborador_id = ov.escala_colaborador_id
                and fm_lembrete_1_existente.tipo = 'lembrete_1'
            )
        ),
        (
          'lembrete_2',
          ov.mensagem_enviada_em is not null
            and ov.primeiro_lembrete_enviado_em is not null
            and ov.segundo_lembrete_enviado_em is null
            and ov.respondido_em is null
            and not exists (
              select 1
              from public.fila_mensagens fm_lembrete_2_existente
              where fm_lembrete_2_existente.escala_colaborador_id = ov.escala_colaborador_id
                and fm_lembrete_2_existente.tipo = 'lembrete_2'
            )
        ),
        (
          'alerta',
          ov.respondido_em is null
            and (
              (
                ov.mensagem_enviada_em is not null
                and ov.primeiro_lembrete_enviado_em is not null
                and ov.segundo_lembrete_enviado_em is not null
                and ov.alerta_sem_resposta_enviado_em is null
                and exists (
                  select 1
                  from public.contatos_alerta_dmr contato_sem_resposta
                  where contato_sem_resposta.ativo
                    and contato_sem_resposta.criado_em <= ov.alerta_em
                    and not exists (
                      select 1
                      from public.fila_mensagens fm_alerta_existente
                      where fm_alerta_existente.escala_colaborador_id = ov.escala_colaborador_id
                        and fm_alerta_existente.contato_alerta_dmr_id = contato_sem_resposta.id
                        and fm_alerta_existente.tipo = 'alerta_sem_resposta'
                    )
                )
              )
              or (
                ov.status_confirmacao = 'resposta_incompreensivel'
                and ov.alerta_incompreensivel_enviado_em is null
                and exists (
                  select 1
                  from public.contatos_alerta_dmr contato_incompreensivel
                  where contato_incompreensivel.ativo
                    and contato_incompreensivel.criado_em <= ov.ultima_resposta_incompreensivel_em
                    and not exists (
                      select 1
                      from public.fila_mensagens fm_alerta_existente
                      where fm_alerta_existente.escala_colaborador_id = ov.escala_colaborador_id
                        and fm_alerta_existente.contato_alerta_dmr_id = contato_incompreensivel.id
                        and fm_alerta_existente.tipo = case
                          when ov.tentativas_incompreensiveis
                            >= cfg_alerta.max_respostas_incompreensiveis
                            then 'alerta_resposta_incompreensivel'::public.dmr_tipo_fila
                          else 'alerta_resposta_incompreensivel_expirada'::public.dmr_tipo_fila
                        end
                    )
                )
              )
            )
        )
    ) as etapa(tipo, pendente)
    where ov.status_confirmacao not in (
        'confirmado',
        'nao_comparecera',
        'cancelado',
        'tratado_manualmente'
      )
      and not ov.tratado_manualmente
      and etapa.pendente
  ),
  configuracao_relatorio as (
    select coalesce(
      (
        select nullif(cs.valor ->> 'ativado_em', '')::timestamptz
        from public.configuracoes_sistema cs
        where cs.chave = 'relatorio_whatsapp_ativado_em'
      ),
      p_agora
    ) as v_relatorio_ativado_em
  ),
  grupos_operacionais_validos as (
    select distinct
      ov.escala_id,
      ov.turno_empresa_id
    from operacoes_validas ov
  ),
  relatorio_grupos as (
    select
      e.id as escala_id,
      e.data,
      te.id as turno_empresa_id,
      min(
        case
          when ec.horario_inicio_disparo > ec.horario_inicio
            then e.data + interval '1 day' + ec.horario_inicio
          else e.data + ec.horario_inicio
        end
      ) as entrada_local,
      (array_agg(ec.id order by c.nome))[1] as escala_colaborador_id,
      count(*) as total_colaboradores,
      count(*) filter (
        where ec.status_confirmacao in (
          'confirmado',
          'nao_comparecera',
          'resposta_incompreensivel',
          'tratado_manualmente'
        )
      ) as respondidos
    from public.escala_colaboradores ec
    join public.escalas e on e.id = ec.escala_id
    join public.turnos_empresa te on te.id = ec.turno_empresa_id
    join grupos_operacionais_validos grupo_valido
      on grupo_valido.escala_id = e.id
      and grupo_valido.turno_empresa_id = te.id
    join public.colaboradores c on c.id = ec.colaborador_id
    cross join configuracao_relatorio cfg
    where ec.status_confirmacao <> 'cancelado'
      and ec.criado_em >= v_relatorio_ativado_em
    group by
      e.id,
      e.data,
      te.id
  ),
  relatorios_devidos as (
    select
      grupo.escala_id,
      grupo.turno_empresa_id,
      grupo.escala_colaborador_id,
      contato.id as contato_alerta_dmr_id
    from relatorio_grupos grupo
    cross join public.contatos_alerta_dmr contato
    cross join configuracao_relatorio cfg
    where (
        v_now_local >= grupo.entrada_local - interval '90 minutes'
        or grupo.respondidos = grupo.total_colaboradores
      )
      and contato.ativo
      and contato.criado_em <= p_agora
      and not exists (
        select 1
        from public.fila_mensagens fm_relatorio_enviado
        join public.escala_colaboradores ec_relatorio_enviado
          on ec_relatorio_enviado.id = fm_relatorio_enviado.escala_colaborador_id
        where ec_relatorio_enviado.escala_id = grupo.escala_id
          and ec_relatorio_enviado.turno_empresa_id = grupo.turno_empresa_id
          and fm_relatorio_enviado.contato_alerta_dmr_id = contato.id
          and fm_relatorio_enviado.tipo = 'relatorio_diario'
          and fm_relatorio_enviado.status = 'enviada'
          and fm_relatorio_enviado.enviada_em is not null
          and ec_relatorio_enviado.criado_em >= cfg.v_relatorio_ativado_em
      )
  ),
  filas_relatorio_em_aberto as (
    select
      fm_relatorio_aberto.id,
      relatorio_devido.escala_id,
      relatorio_devido.turno_empresa_id,
      relatorio_devido.contato_alerta_dmr_id
    from relatorios_devidos relatorio_devido
    cross join configuracao_relatorio cfg
    join public.escala_colaboradores ec_relatorio_aberto
      on ec_relatorio_aberto.escala_id = relatorio_devido.escala_id
      and ec_relatorio_aberto.turno_empresa_id = relatorio_devido.turno_empresa_id
    join public.fila_mensagens fm_relatorio_aberto
      on fm_relatorio_aberto.escala_colaborador_id = ec_relatorio_aberto.id
      and fm_relatorio_aberto.contato_alerta_dmr_id = relatorio_devido.contato_alerta_dmr_id
    where fm_relatorio_aberto.tipo = 'relatorio_diario'
      and fm_relatorio_aberto.status in ('pendente', 'processando')
      and ec_relatorio_aberto.criado_em >= cfg.v_relatorio_ativado_em
  ),
  relatorios_para_recuperar as (
    select
      relatorio_devido.escala_id,
      relatorio_devido.turno_empresa_id,
      relatorio_devido.contato_alerta_dmr_id,
      fila_terminal.id as fila_mensagem_id
    from relatorios_devidos relatorio_devido
    cross join configuracao_relatorio cfg
    cross join lateral (
      select fm_relatorio_terminal.id
      from public.fila_mensagens fm_relatorio_terminal
      join public.escala_colaboradores ec_relatorio_terminal
        on ec_relatorio_terminal.id = fm_relatorio_terminal.escala_colaborador_id
      where ec_relatorio_terminal.escala_id = relatorio_devido.escala_id
        and ec_relatorio_terminal.turno_empresa_id = relatorio_devido.turno_empresa_id
        and fm_relatorio_terminal.contato_alerta_dmr_id = relatorio_devido.contato_alerta_dmr_id
        and fm_relatorio_terminal.tipo = 'relatorio_diario'
        and fm_relatorio_terminal.recuperacoes_automaticas < 1
        and (
          fm_relatorio_terminal.status in ('erro', 'cancelada')
          or (
            fm_relatorio_terminal.status = 'enviada'
            and fm_relatorio_terminal.enviada_em is null
          )
        )
        and ec_relatorio_terminal.criado_em >= cfg.v_relatorio_ativado_em
      order by fm_relatorio_terminal.atualizado_em desc, fm_relatorio_terminal.id
      limit 1
    ) fila_terminal
    where not exists (
      select 1
      from filas_relatorio_em_aberto fila_relatorio_aberta
      where fila_relatorio_aberta.escala_id = relatorio_devido.escala_id
        and fila_relatorio_aberta.turno_empresa_id = relatorio_devido.turno_empresa_id
        and fila_relatorio_aberta.contato_alerta_dmr_id = relatorio_devido.contato_alerta_dmr_id
    )
      and not exists (
        select 1
        from public.fila_mensagens fm_relatorio_recuperacao_consumida
        join public.escala_colaboradores ec_relatorio_recuperacao_consumida
          on ec_relatorio_recuperacao_consumida.id =
            fm_relatorio_recuperacao_consumida.escala_colaborador_id
        where ec_relatorio_recuperacao_consumida.escala_id = relatorio_devido.escala_id
          and ec_relatorio_recuperacao_consumida.turno_empresa_id =
            relatorio_devido.turno_empresa_id
          and fm_relatorio_recuperacao_consumida.contato_alerta_dmr_id =
            relatorio_devido.contato_alerta_dmr_id
          and fm_relatorio_recuperacao_consumida.tipo = 'relatorio_diario'
          and fm_relatorio_recuperacao_consumida.recuperacoes_automaticas >= 1
          and ec_relatorio_recuperacao_consumida.criado_em >= cfg.v_relatorio_ativado_em
      )
  ),
  relatorios_recuperados as (
    update public.fila_mensagens fm_relatorio_recuperado
    set
      status = 'pendente',
      tentativas = 0,
      recuperacoes_automaticas = fm_relatorio_recuperado.recuperacoes_automaticas + 1,
      processando_em = null,
      enviada_em = null,
      agendado_para = p_agora,
      ultimo_erro = 'Relatorio diario reaberto automaticamente para nova tentativa.',
      atualizado_em = p_agora
    from relatorios_para_recuperar recuperar
    where fm_relatorio_recuperado.id = recuperar.fila_mensagem_id
      and fm_relatorio_recuperado.recuperacoes_automaticas < 1
      and (
        fm_relatorio_recuperado.status in ('erro', 'cancelada')
        or (
          fm_relatorio_recuperado.status = 'enviada'
          and fm_relatorio_recuperado.enviada_em is null
        )
      )
    returning fm_relatorio_recuperado.id
  ),
  relatorios_em_aberto as (
    select
      relatorio_devido.escala_colaborador_id,
      relatorio_devido.contato_alerta_dmr_id
    from relatorios_devidos relatorio_devido
    cross join configuracao_relatorio cfg
    where not exists (
      select 1
      from public.fila_mensagens fm_relatorio_existente
      join public.escala_colaboradores ec_relatorio_existente
        on ec_relatorio_existente.id = fm_relatorio_existente.escala_colaborador_id
      where ec_relatorio_existente.escala_id = relatorio_devido.escala_id
        and ec_relatorio_existente.turno_empresa_id = relatorio_devido.turno_empresa_id
        and fm_relatorio_existente.contato_alerta_dmr_id = relatorio_devido.contato_alerta_dmr_id
        and fm_relatorio_existente.tipo = 'relatorio_diario'
        and ec_relatorio_existente.criado_em >= cfg.v_relatorio_ativado_em
      )
  ),
  filas_em_aberto as (
    select fm.id
    from public.fila_mensagens fm
    join operacoes_validas ov on ov.escala_colaborador_id = fm.escala_colaborador_id
    where fm.status in ('pendente', 'processando')
    union
    select fm.id
    from public.fila_mensagens fm
    where fm.status = 'processando'
      and fm.processando_em >= p_agora - interval '5 minutes'
    union
    select relatorio_recuperado.id
    from relatorios_recuperados relatorio_recuperado
    union
    select fila_relatorio_aberta.id
    from filas_relatorio_em_aberto fila_relatorio_aberta
  )
  select
    (select count(*) from filas_em_aberto),
    (select count(*) from etapas_em_aberto),
    (select count(*) from relatorios_em_aberto)
  into
    v_filas_pendentes,
    v_etapas_pendentes,
    v_relatorios_pendentes;

  return jsonb_build_object(
    'tem_trabalho',
      v_filas_pendentes > 0
      or v_etapas_pendentes > 0
      or v_relatorios_pendentes > 0,
    'filas_pendentes', v_filas_pendentes,
    'etapas_pendentes', v_etapas_pendentes,
    'relatorios_pendentes', v_relatorios_pendentes,
    'filas_expiradas_canceladas', v_canceladas,
    'data_local', v_local_today
  );
end;
$$;

revoke all on function public.dmr_status_operacional_bot(timestamptz) from public;
revoke all on function public.dmr_status_operacional_bot(timestamptz) from anon;
revoke all on function public.dmr_status_operacional_bot(timestamptz) from authenticated;
grant execute on function public.dmr_status_operacional_bot(timestamptz) to service_role;
