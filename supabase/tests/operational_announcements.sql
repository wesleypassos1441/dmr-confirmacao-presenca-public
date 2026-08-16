begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

select has_table('public', 'comunicados_operacionais', 'cabecalho do comunicado existe');
select has_table('public', 'comunicado_destinatarios', 'destinatarios do comunicado existem');
select has_function(
  'public',
  'dmr_criar_comunicado',
  array['uuid', 'text', 'text', 'timestamp with time zone', 'uuid[]'],
  'RPC de comunicado existe'
);
select ok(
  not has_function_privilege('anon', 'public.dmr_criar_comunicado(uuid,text,text,timestamptz,uuid[])', 'EXECUTE'),
  'anon nao cria comunicado'
);
select ok(
  has_function_privilege('authenticated', 'public.dmr_criar_comunicado(uuid,text,text,timestamptz,uuid[])', 'EXECUTE'),
  'operador autenticado pode criar comunicado'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '50000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'comunicado@dmr.test', 'teste', now(), '{}', '{}', now(), now()
);

update public.usuarios_dashboard
set nome = 'Operador Comunicado', papel = 'operador', ativo = true
where auth_user_id = '50000000-0000-0000-0000-000000000001';

insert into public.empresas (id, nome, tipo_contratacao, endereco, numero, bairro, cidade)
values (
  '51000000-0000-0000-0000-000000000001', 'Empresa Comunicado', 'freelancer',
  'Rua Aviso', '30', 'Centro', 'Contagem'
);

insert into public.empresa_horarios (id, empresa_id, horario_entrada, horario_saida)
values (
  '52000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001', '12:00', '21:00'
);

insert into public.turnos_empresa (id, empresa_id, empresa_horario_id, nome, horario_inicio, prioridade_envio)
values (
  '53000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001', '12:00 as 21:00', '12:00', 'normal'
);

insert into public.colaboradores (id, nome, telefone)
values ('54000000-0000-0000-0000-000000000001', 'Ana Avisada', '5510900000009');

insert into public.escalas (
  id, empresa_id, empresa_horario_id, data, horario_entrada_snapshot,
  horario_saida_snapshot, empresa_nome_snapshot, endereco_snapshot,
  tipo_contratacao_snapshot, prioridade_envio_snapshot
) values (
  '55000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001', '2030-08-02', '12:00',
  '21:00', 'Empresa Comunicado', 'Rua Aviso, 30, Centro - Contagem',
  'freelancer', 'normal'
);

insert into public.escala_colaboradores (
  id, escala_id, colaborador_id, turno_empresa_id, horario_inicio, status_confirmacao
) values (
  '56000000-0000-0000-0000-000000000001',
  '55000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000001',
  '53000000-0000-0000-0000-000000000001', '12:00', 'pendente'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.dmr_criar_comunicado(
    '52000000-0000-0000-0000-000000000001',
    'Mudanca operacional',
    'Ola {nome}. A empresa {empresa} funcionara em {data}, no horario {horario}.',
    '2030-08-01 15:00:00+00',
    array['56000000-0000-0000-0000-000000000001']::uuid[]
  )$$,
  'comunicado valido entra na fila'
);

select throws_ok(
  $$select public.dmr_criar_comunicado(
    '52000000-0000-0000-0000-000000000001',
    'Aviso', '{senha}', '2030-08-01 15:00:00+00',
    array['56000000-0000-0000-0000-000000000001']::uuid[]
  )$$,
  'Variavel desconhecida no comunicado: {senha}.',
  'variavel desconhecida e recusada'
);

reset role;

select is(
  (select count(*)::integer from public.comunicado_destinatarios),
  1,
  'destinatario nao e duplicado'
);

select is(
  (select mensagem from public.fila_mensagens where tipo = 'comunicado_manual'),
  E'*Mudanca operacional*\n\nOla Ana Avisada. A empresa Empresa Comunicado funcionara em 02/08/2030, no horario 12:00 as 21:00.',
  'mensagem individual usa snapshots e formato brasileiro'
);

select is(
  (select status_confirmacao::text from public.escala_colaboradores where id = '56000000-0000-0000-0000-000000000001'),
  'pendente',
  'criar comunicado nao altera confirmacao'
);

select is(
  (select count(*)::integer from public.fila_mensagens where tipo = 'comunicado_manual' and status = 'pendente'),
  1,
  'comunicado cria somente uma mensagem pendente'
);

select * from finish();
rollback;
