create or replace function public.dmr_apagar_painel_dia(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_operador() is not true then
    raise exception 'Usuário sem permissão para apagar registros operacionais.';
  end if;

  delete from public.escala_colaboradores where id = p_id;
  if not found then raise exception 'Registro do Painel do Dia não encontrado.'; end if;

  insert into public.logs_acoes(ator_id, ator_email, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), auth.jwt() ->> 'email', 'apagar_painel_dia', 'escala_colaboradores', p_id, '{"origem":"dashboard"}');
end;
$$;

create or replace function public.dmr_apagar_turno(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_operador() is not true then
    raise exception 'Usuário sem permissão para apagar turnos.';
  end if;

  delete from public.escala_colaboradores where turno_empresa_id = p_id;
  delete from public.turnos_empresa where id = p_id;
  if not found then raise exception 'Turno não encontrado.'; end if;

  insert into public.logs_acoes(ator_id, ator_email, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), auth.jwt() ->> 'email', 'apagar_turno', 'turnos_empresa', p_id, '{"origem":"dashboard"}');
end;
$$;

create or replace function public.dmr_apagar_colaborador(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_operador() is not true then
    raise exception 'Usuário sem permissão para apagar colaboradores.';
  end if;

  delete from public.empresa_colaboradores where colaborador_id = p_id;
  delete from public.escala_colaboradores where colaborador_id = p_id;
  delete from public.colaboradores where id = p_id;
  if not found then raise exception 'Colaborador não encontrado.'; end if;

  insert into public.logs_acoes(ator_id, ator_email, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), auth.jwt() ->> 'email', 'apagar_colaborador', 'colaboradores', p_id, '{"origem":"dashboard"}');
end;
$$;

create or replace function public.dmr_apagar_contato_alerta(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_operador() is not true then
    raise exception 'Usuário sem permissão para apagar contatos de alerta.';
  end if;

  delete from public.fila_mensagens where contato_alerta_dmr_id = p_id;
  delete from public.alertas_dmr where contato_alerta_dmr_id = p_id;
  delete from public.contatos_alerta_dmr where id = p_id;
  if not found then raise exception 'Contato de alerta não encontrado.'; end if;

  insert into public.logs_acoes(ator_id, ator_email, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), auth.jwt() ->> 'email', 'apagar_contato_alerta', 'contatos_alerta_dmr', p_id, '{"origem":"dashboard"}');
end;
$$;

create or replace function public.dmr_apagar_empresa(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_operador() is not true then
    raise exception 'Usuário sem permissão para apagar empresas.';
  end if;

  delete from public.empresas where id = p_id;
  if not found then raise exception 'Empresa não encontrada.'; end if;

  insert into public.logs_acoes(ator_id, ator_email, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), auth.jwt() ->> 'email', 'apagar_empresa', 'empresas', p_id, '{"origem":"dashboard"}');
end;
$$;

create or replace function public.dmr_apagar_horario_empresa(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_operador() is not true then
    raise exception 'Usuário sem permissão para apagar horários.';
  end if;

  delete from public.empresa_horarios where id = p_id;
  if not found then raise exception 'Horário da empresa não encontrado.'; end if;

  insert into public.logs_acoes(ator_id, ator_email, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), auth.jwt() ->> 'email', 'apagar_horario_empresa', 'empresa_horarios', p_id, '{"origem":"dashboard"}');
end;
$$;

revoke all on function public.dmr_apagar_painel_dia(uuid) from public;
revoke all on function public.dmr_apagar_turno(uuid) from public;
revoke all on function public.dmr_apagar_colaborador(uuid) from public;
revoke all on function public.dmr_apagar_contato_alerta(uuid) from public;
revoke all on function public.dmr_apagar_empresa(uuid) from public;
revoke all on function public.dmr_apagar_horario_empresa(uuid) from public;

grant execute on function public.dmr_apagar_painel_dia(uuid) to authenticated;
grant execute on function public.dmr_apagar_turno(uuid) to authenticated;
grant execute on function public.dmr_apagar_colaborador(uuid) to authenticated;
grant execute on function public.dmr_apagar_contato_alerta(uuid) to authenticated;
grant execute on function public.dmr_apagar_empresa(uuid) to authenticated;
grant execute on function public.dmr_apagar_horario_empresa(uuid) to authenticated;
