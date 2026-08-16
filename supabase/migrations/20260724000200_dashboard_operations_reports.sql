alter table public.escala_colaboradores
  add column if not exists substituto_nome text,
  add column if not exists substituido_em timestamptz,
  add column if not exists substituido_por uuid;

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
    c.nome as colaborador_nome,
    emp.nome as empresa_nome
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

  if v_registro.status_confirmacao <> 'nao_comparecera' then
    raise exception 'O substituto so pode ser informado para quem marcou que nao comparecera.';
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
      'origem', 'dashboard'
    )
  );

  return jsonb_build_object(
    'sucesso', true,
    'status', case when v_substituto is null then 'nao_comparecera' else 'substituido' end,
    'substituto_nome', v_substituto
  );
end;
$$;

revoke all on function public.dmr_definir_substituto(uuid, text) from public;
grant execute on function public.dmr_definir_substituto(uuid, text) to authenticated;

create or replace function public.dmr_editar_horario_disparo(
  p_escala_id uuid,
  p_turno_empresa_id uuid,
  p_horario_inicio_disparo time without time zone
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_operacao record;
  v_inicio_local timestamp;
  v_afetados integer := 0;
begin
  if public.is_operador() is not true then
    raise exception 'Usuario sem permissao para editar o horario de disparo.';
  end if;

  if p_horario_inicio_disparo is null then
    raise exception 'Informe o novo horario de disparo.';
  end if;

  select
    e.id as escala_id,
    e.data,
    emp.nome as empresa_nome,
    coalesce(nullif(te.nome, ''), to_char(te.horario_inicio, 'HH24:MI')) as turno_nome
  into v_operacao
  from public.escalas e
  join public.empresas emp on emp.id = e.empresa_id
  join public.turnos_empresa te on te.empresa_id = e.empresa_id
  where e.id = p_escala_id
    and te.id = p_turno_empresa_id
  limit 1;

  if v_operacao.escala_id is null then
    raise exception 'Operacao nao encontrada para a empresa e o turno selecionados.';
  end if;

  v_inicio_local := v_operacao.data + p_horario_inicio_disparo;
  if v_inicio_local <= (now() at time zone 'America/Sao_Paulo') then
    raise exception 'Escolha um horario posterior ao momento atual.';
  end if;

  if exists (
    select 1
    from public.escala_colaboradores ec
    where ec.escala_id = p_escala_id
      and ec.turno_empresa_id = p_turno_empresa_id
      and ec.mensagem_enviada_em is not null
  ) then
    raise exception 'O horario nao pode ser alterado porque o primeiro disparo ja foi enviado.';
  end if;

  if exists (
    select 1
    from public.fila_mensagens fm
    join public.escala_colaboradores ec on ec.id = fm.escala_colaborador_id
    where ec.escala_id = p_escala_id
      and ec.turno_empresa_id = p_turno_empresa_id
      and fm.status = 'processando'
  ) then
    raise exception 'Aguarde o processamento atual terminar antes de editar o horario.';
  end if;

  delete from public.fila_mensagens fm
  using public.escala_colaboradores ec
  where fm.escala_colaborador_id = ec.id
    and ec.escala_id = p_escala_id
    and ec.turno_empresa_id = p_turno_empresa_id
    and fm.status <> 'enviada';

  update public.escala_colaboradores
  set
    horario_inicio_disparo = p_horario_inicio_disparo,
    status_confirmacao = case
      when status_confirmacao in ('mensagem_agendada', 'erro_envio') then 'pendente'
      else status_confirmacao
    end,
    atualizado_em = now()
  where escala_id = p_escala_id
    and turno_empresa_id = p_turno_empresa_id
    and mensagem_enviada_em is null;

  get diagnostics v_afetados = row_count;
  if v_afetados = 0 then
    raise exception 'Nenhum colaborador elegivel foi encontrado nesta operacao.';
  end if;

  perform public.gerar_fila_confirmacoes();

  perform public.dmr_log_action(
    'editar_horario_disparo',
    'escalas',
    p_escala_id,
    jsonb_build_object(
      'empresa', v_operacao.empresa_nome,
      'turno', v_operacao.turno_nome,
      'data', v_operacao.data,
      'horario_disparo', to_char(p_horario_inicio_disparo, 'HH24:MI'),
      'colaboradores_atualizados', v_afetados,
      'origem', 'dashboard'
    )
  );

  return jsonb_build_object(
    'sucesso', true,
    'horario_disparo', to_char(p_horario_inicio_disparo, 'HH24:MI'),
    'colaboradores_atualizados', v_afetados
  );
end;
$$;

revoke all on function public.dmr_editar_horario_disparo(uuid, uuid, time without time zone) from public;
grant execute on function public.dmr_editar_horario_disparo(uuid, uuid, time without time zone) to authenticated;

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
      nullif(btrim(ec.substituto_nome), '') as substituto_nome,
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
      (array_agg(escala_colaborador_id order by colaborador_nome))[1] as escala_colaborador_id,
      string_agg('• ' || colaborador_nome, E'\n' order by colaborador_nome)
        filter (where status_confirmacao = 'confirmado') as confirmados,
      string_agg('• ' || colaborador_nome, E'\n' order by colaborador_nome)
        filter (where status_confirmacao = 'nao_comparecera' and substituto_nome is null) as ausentes,
      string_agg('• ' || colaborador_nome || ' → ' || substituto_nome, E'\n' order by colaborador_nome)
        filter (where status_confirmacao = 'nao_comparecera' and substituto_nome is not null) as substituidos,
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
        case when grupo.substituidos is not null then '*Substituídos:*' || E'\n' || grupo.substituidos end,
        case when grupo.aguardando is not null then '*Aguardando respostas:*' || E'\n' || grupo.aguardando end,
        case when grupo.incompreensiveis is not null then '*Resposta incompreensível:*' || E'\n' || grupo.incompreensiveis end
      ) as mensagem
    from grupos grupo
    cross join public.contatos_alerta_dmr contato
    where contato.ativo
      and contato.criado_em <= now()
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
