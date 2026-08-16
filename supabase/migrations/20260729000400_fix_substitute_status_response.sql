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
      else v_registro.status_confirmacao::text
    end,
    'substituto_nome', v_substituto
  );
end;
$$;

revoke all on function public.dmr_definir_substituto(uuid, text) from public;
grant execute on function public.dmr_definir_substituto(uuid, text) to authenticated, service_role;

comment on function public.dmr_definir_substituto(uuid, text) is
  'Registra substituto para ausencia, sem resposta ou falso positivo; substituido e um estado visual derivado, nao um valor do enum operacional.';
