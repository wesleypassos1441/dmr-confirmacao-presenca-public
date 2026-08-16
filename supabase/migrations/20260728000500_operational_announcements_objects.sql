drop index if exists public.fila_mensagens_unica_operacional_idx;
create unique index fila_mensagens_unica_operacional_idx
on public.fila_mensagens(
  escala_colaborador_id,
  tipo,
  coalesce(contato_alerta_dmr_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
where tipo not in ('resposta_incompreensivel', 'reenvio_manual', 'comunicado_manual')
  and status <> 'cancelada';

create table if not exists public.comunicados_operacionais (
  id uuid primary key default gen_random_uuid(),
  empresa_horario_id uuid not null references public.empresa_horarios(id) on delete restrict,
  assunto text not null check (char_length(btrim(assunto)) between 2 and 120),
  corpo_template text not null check (char_length(btrim(corpo_template)) between 2 and 2000),
  agendado_para timestamptz not null,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id)
);

create table if not exists public.comunicado_destinatarios (
  id uuid primary key default gen_random_uuid(),
  comunicado_id uuid not null references public.comunicados_operacionais(id) on delete cascade,
  escala_colaborador_id uuid not null references public.escala_colaboradores(id) on delete restrict,
  fila_mensagem_id uuid references public.fila_mensagens(id) on delete set null,
  mensagem_renderizada text not null,
  criado_em timestamptz not null default now(),
  unique (comunicado_id, escala_colaborador_id)
);

create index if not exists comunicados_operacionais_horario_idx
on public.comunicados_operacionais(empresa_horario_id, agendado_para desc);

alter table public.comunicados_operacionais enable row level security;
alter table public.comunicado_destinatarios enable row level security;

drop policy if exists dmr_shared_read_comunicados_operacionais on public.comunicados_operacionais;
create policy dmr_shared_read_comunicados_operacionais
on public.comunicados_operacionais for select to authenticated
using (public.is_visualizador());

drop policy if exists dmr_shared_read_comunicado_destinatarios on public.comunicado_destinatarios;
create policy dmr_shared_read_comunicado_destinatarios
on public.comunicado_destinatarios for select to authenticated
using (public.is_visualizador());

grant select on public.comunicados_operacionais, public.comunicado_destinatarios to authenticated;
grant select, insert, update, delete on public.comunicados_operacionais, public.comunicado_destinatarios to service_role;

create or replace function public.dmr_criar_comunicado(
  p_empresa_horario_id uuid,
  p_assunto text,
  p_corpo text,
  p_agendado_para timestamptz,
  p_escala_colaborador_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comunicado_id uuid;
  v_destinatario record;
  v_fila_id uuid;
  v_mensagem text;
  v_data_formatada text;
  v_horario text;
  v_variavel text;
  v_total_solicitado integer := coalesce(cardinality(p_escala_colaborador_ids), 0);
  v_total_criado integer := 0;
begin
  if public.is_operador() is not true then
    raise exception 'Usuario sem permissao para criar comunicados.';
  end if;

  if char_length(btrim(coalesce(p_assunto, ''))) not between 2 and 120 then
    raise exception 'Informe um assunto entre 2 e 120 caracteres.';
  end if;
  if char_length(btrim(coalesce(p_corpo, ''))) not between 2 and 2000 then
    raise exception 'Informe uma mensagem entre 2 e 2000 caracteres.';
  end if;
  if p_agendado_para is null or p_agendado_para < now() - interval '1 minute' then
    raise exception 'O horario do comunicado nao pode estar no passado.';
  end if;
  if v_total_solicitado = 0 then
    raise exception 'Selecione pelo menos um destinatario.';
  end if;

  for v_variavel in
    select distinct match[1]
    from regexp_matches(p_corpo, '\{([^}]+)\}', 'g') as match
  loop
    if v_variavel not in ('nome', 'empresa', 'data', 'horario') then
      raise exception 'Variavel desconhecida no comunicado: {%}.', v_variavel;
    end if;
  end loop;

  if (
    select count(distinct item.id)
    from public.escala_colaboradores item
    join public.escalas escala on escala.id = item.escala_id
    where item.id = any(p_escala_colaborador_ids)
      and escala.empresa_horario_id = p_empresa_horario_id
  ) <> v_total_solicitado then
    raise exception 'Um ou mais destinatarios nao pertencem a empresa e jornada selecionadas.';
  end if;

  insert into public.comunicados_operacionais (
    empresa_horario_id, assunto, corpo_template, agendado_para, criado_por
  ) values (
    p_empresa_horario_id, btrim(p_assunto), btrim(p_corpo), p_agendado_para, auth.uid()
  ) returning id into v_comunicado_id;

  for v_destinatario in
    select distinct on (item.id)
      item.id as escala_colaborador_id,
      colaborador.nome,
      escala.data,
      coalesce(escala.empresa_nome_snapshot, empresa.nome) as empresa_nome,
      coalesce(escala.horario_entrada_snapshot, item.horario_inicio) as horario_entrada,
      coalesce(escala.horario_saida_snapshot, horario.horario_saida) as horario_saida,
      colaborador.telefone
    from public.escala_colaboradores item
    join public.escalas escala on escala.id = item.escala_id
    join public.colaboradores colaborador on colaborador.id = item.colaborador_id
    join public.empresas empresa on empresa.id = escala.empresa_id
    join public.empresa_horarios horario on horario.id = escala.empresa_horario_id
    where item.id = any(p_escala_colaborador_ids)
      and escala.empresa_horario_id = p_empresa_horario_id
    order by item.id
  loop
    v_data_formatada := to_char(v_destinatario.data, 'DD/MM/YYYY');
    v_horario := format(
      '%s as %s',
      to_char(v_destinatario.horario_entrada, 'HH24:MI'),
      to_char(v_destinatario.horario_saida, 'HH24:MI')
    );
    v_mensagem := replace(p_corpo, '{nome}', v_destinatario.nome);
    v_mensagem := replace(v_mensagem, '{empresa}', v_destinatario.empresa_nome);
    v_mensagem := replace(v_mensagem, '{data}', v_data_formatada);
    v_mensagem := replace(v_mensagem, '{horario}', v_horario);
    v_mensagem := format('*%s*%s%s', btrim(p_assunto), E'\n\n', btrim(v_mensagem));

    insert into public.comunicado_destinatarios (
      comunicado_id, escala_colaborador_id, mensagem_renderizada
    ) values (
      v_comunicado_id, v_destinatario.escala_colaborador_id, v_mensagem
    ) on conflict (comunicado_id, escala_colaborador_id) do nothing;

    insert into public.fila_mensagens (
      escala_colaborador_id, tipo, status, prioridade, telefone_destino,
      mensagem, agendado_para, chave_unica
    ) values (
      v_destinatario.escala_colaborador_id,
      'comunicado_manual',
      'pendente',
      'normal',
      v_destinatario.telefone,
      v_mensagem,
      p_agendado_para,
      format('comunicado:%s:%s', v_comunicado_id, v_destinatario.escala_colaborador_id)
    ) on conflict (chave_unica) do nothing
    returning id into v_fila_id;

    update public.comunicado_destinatarios
    set fila_mensagem_id = v_fila_id
    where comunicado_id = v_comunicado_id
      and escala_colaborador_id = v_destinatario.escala_colaborador_id;

    v_total_criado := v_total_criado + 1;
  end loop;

  perform public.dmr_log_action(
    'criar_comunicado',
    'comunicados_operacionais',
    v_comunicado_id,
    jsonb_build_object(
      'assunto', btrim(p_assunto),
      'destinatarios', v_total_criado,
      'empresa_horario_id', p_empresa_horario_id,
      'agendado_para', p_agendado_para,
      'origem', 'dashboard'
    )
  );

  return jsonb_build_object(
    'sucesso', true,
    'comunicado_id', v_comunicado_id,
    'destinatarios', v_total_criado
  );
end;
$$;

revoke all on function public.dmr_criar_comunicado(uuid, text, text, timestamptz, uuid[]) from public;
grant execute on function public.dmr_criar_comunicado(uuid, text, text, timestamptz, uuid[]) to authenticated, service_role;
