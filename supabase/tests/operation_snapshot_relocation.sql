begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

select has_column('public', 'escala_colaboradores', 'falso_positivo_em', 'data do falso positivo existe');
select has_column('public', 'escala_colaboradores', 'falso_positivo_por', 'operador do falso positivo existe');
select has_column('public', 'escala_colaboradores', 'falso_positivo_motivo', 'motivo do falso positivo existe');

select has_function(
  'public',
  'dmr_tratar_falso_positivo',
  array['uuid', 'boolean', 'text', 'text'],
  'tratamento de falso positivo existe'
);

select has_function(
  'public',
  'dmr_definir_substituto',
  array['uuid', 'text'],
  'substituicao rastreavel existe'
);

select ok(
  not has_function_privilege('anon', 'public.dmr_tratar_falso_positivo(uuid,boolean,text,text)', 'EXECUTE'),
  'anon nao trata falso positivo'
);

select ok(
  has_function_privilege('authenticated', 'public.dmr_tratar_falso_positivo(uuid,boolean,text,text)', 'EXECUTE'),
  'operador autenticado pode chamar tratamento'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'operador-falso-positivo@dmr.test',
  'teste',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

update public.usuarios_dashboard
set nome = 'Operador Teste', papel = 'operador', ativo = true
where auth_user_id = '40000000-0000-0000-0000-000000000001';

insert into public.empresas (id, nome, tipo_contratacao, endereco, numero, bairro, cidade)
values (
  '41000000-0000-0000-0000-000000000001',
  'Empresa Falso Positivo',
  'freelancer',
  'Rua Teste',
  '10',
  'Centro',
  'Contagem'
);

insert into public.empresa_horarios (id, empresa_id, horario_entrada, horario_saida)
values (
  '42000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '09:00',
  '18:00'
);

insert into public.turnos_empresa (id, empresa_id, empresa_horario_id, nome, horario_inicio, prioridade_envio)
values (
  '43000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  '09:00 as 18:00',
  '09:00',
  'normal'
);

insert into public.colaboradores (id, nome, telefone)
values (
  '44000000-0000-0000-0000-000000000001',
  'Ana Confirmada',
  '5510900000001'
);

insert into public.escalas (id, empresa_id, empresa_horario_id, data)
values (
  '45000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  '2030-08-01'
);

insert into public.escala_colaboradores (
  id,
  escala_id,
  colaborador_id,
  turno_empresa_id,
  horario_inicio,
  status_confirmacao,
  resposta_normalizada,
  resposta_original,
  respondido_em
) values (
  '46000000-0000-0000-0000-000000000001',
  '45000000-0000-0000-0000-000000000001',
  '44000000-0000-0000-0000-000000000001',
  '43000000-0000-0000-0000-000000000001',
  '09:00',
  'confirmado',
  'sim',
  '1',
  '2030-08-01 10:00:00+00'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.dmr_tratar_falso_positivo(
    '46000000-0000-0000-0000-000000000001',
    true,
    'Desistiu depois de confirmar',
    null
  )$$,
  'confirmacao pode virar falso positivo'
);

reset role;

select is(
  (
    select format('%s|%s|%s|%s', status_confirmacao, resposta_normalizada, resposta_original, falso_positivo_motivo)
    from public.escala_colaboradores
    where id = '46000000-0000-0000-0000-000000000001'
  ),
  'confirmado|sim|1|Desistiu depois de confirmar',
  'resposta original e confirmacao sao preservadas'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.dmr_definir_substituto(
    '46000000-0000-0000-0000-000000000001',
    'Maria Substituta'
  )$$,
  'falso positivo aceita substituto'
);

reset role;

select is(
  (
    select substituto_nome
    from public.escala_colaboradores
    where id = '46000000-0000-0000-0000-000000000001'
  ),
  'Maria Substituta',
  'substituto fica registrado'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.dmr_tratar_falso_positivo(
    '46000000-0000-0000-0000-000000000001',
    false,
    null,
    null
  )$$,
  'falso positivo pode ser revertido'
);

reset role;

select is(
  (
    select format('%s|%s|%s|%s', status_confirmacao, resposta_normalizada, falso_positivo_em, substituto_nome)
    from public.escala_colaboradores
    where id = '46000000-0000-0000-0000-000000000001'
  ),
  'confirmado|sim||',
  'reversao limpa somente o tratamento e preserva a resposta'
);

select has_function(
  'public',
  'dmr_realocar_equipe_permanente',
  array['uuid[]', 'uuid'],
  'realocacao permanente existe'
);

select has_function(
  'public',
  'dmr_realocar_equipe_data',
  array['uuid[]', 'uuid'],
  'realocacao por data existe'
);

select ok(
  not has_function_privilege('anon', 'public.dmr_realocar_equipe_data(uuid[],uuid)', 'EXECUTE'),
  'anon nao realoca a operacao'
);

select ok(
  has_function_privilege('authenticated', 'public.dmr_realocar_equipe_data(uuid[],uuid)', 'EXECUTE'),
  'operador autenticado pode realocar a operacao'
);

insert into public.empresas (id, nome, tipo_contratacao, endereco, numero, bairro, cidade)
values (
  '41000000-0000-0000-0000-000000000002',
  'Empresa Destino',
  'intermitente',
  'Avenida Destino',
  '20',
  'Industrial',
  'Betim'
);

insert into public.empresa_horarios (id, empresa_id, horario_entrada, horario_saida)
values (
  '42000000-0000-0000-0000-000000000002',
  '41000000-0000-0000-0000-000000000002',
  '13:00',
  '22:00'
);

insert into public.turnos_empresa (id, empresa_id, empresa_horario_id, nome, horario_inicio, prioridade_envio)
values (
  '43000000-0000-0000-0000-000000000002',
  '41000000-0000-0000-0000-000000000002',
  '42000000-0000-0000-0000-000000000002',
  '13:00 as 22:00',
  '13:00',
  'normal'
);

insert into public.empresa_colaboradores (
  id, empresa_id, empresa_horario_id, colaborador_id, ativo
) values (
  '47000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  '44000000-0000-0000-0000-000000000001',
  true
);

insert into public.fila_mensagens (
  escala_colaborador_id, tipo, status, prioridade, telefone_destino,
  mensagem, agendado_para, enviada_em, chave_unica
) values
(
  '46000000-0000-0000-0000-000000000001', 'confirmacao_inicial', 'enviada', 'normal',
  '5510900000001', 'Mensagem enviada antes da realocacao', '2030-08-01 08:00:00+00',
  '2030-08-01 08:00:05+00', 'teste-realocacao-enviada'
),
(
  '46000000-0000-0000-0000-000000000001', 'lembrete_1', 'pendente', 'normal',
  '5510900000001', 'Mensagem futura da origem', '2030-08-01 11:00:00+00',
  null, 'teste-realocacao-pendente'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.dmr_realocar_equipe_permanente(
    array['47000000-0000-0000-0000-000000000001']::uuid[],
    '42000000-0000-0000-0000-000000000002'
  )$$,
  'equipe fixa pode ser realocada'
);

reset role;

select is(
  (select ativo from public.empresa_colaboradores where id = '47000000-0000-0000-0000-000000000001'),
  false,
  'vinculo permanente de origem fica inativo'
);

select ok(
  exists (
    select 1 from public.empresa_colaboradores
    where colaborador_id = '44000000-0000-0000-0000-000000000001'
      and empresa_horario_id = '42000000-0000-0000-0000-000000000002'
      and ativo
  ),
  'vinculo permanente de destino fica ativo'
);

select is(
  (select escala_id from public.escala_colaboradores where id = '46000000-0000-0000-0000-000000000001'),
  '45000000-0000-0000-0000-000000000001'::uuid,
  'realocacao permanente nao altera historico diario'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.dmr_realocar_equipe_data(
    array['46000000-0000-0000-0000-000000000001']::uuid[],
    '42000000-0000-0000-0000-000000000002'
  )$$,
  'registro diario pode ser realocado'
);

reset role;

select is(
  (
    select escala.empresa_horario_id
    from public.escala_colaboradores item
    join public.escalas escala on escala.id = item.escala_id
    where item.id = '46000000-0000-0000-0000-000000000001'
  ),
  '42000000-0000-0000-0000-000000000002'::uuid,
  'registro diario aponta para a jornada de destino'
);

select is(
  (
    select format('%s|%s|%s', status_confirmacao, resposta_normalizada, resposta_original)
    from public.escala_colaboradores
    where id = '46000000-0000-0000-0000-000000000001'
  ),
  'confirmado|sim|1',
  'realocacao diaria preserva a resposta recebida'
);

select is(
  (select status::text from public.fila_mensagens where chave_unica like 'teste-realocacao-pendente%'),
  'cancelada',
  'mensagem futura incompatível e cancelada'
);

select is(
  (select status::text from public.fila_mensagens where chave_unica = 'teste-realocacao-enviada'),
  'enviada',
  'mensagem ja enviada permanece no historico'
);

select * from finish();
rollback;
