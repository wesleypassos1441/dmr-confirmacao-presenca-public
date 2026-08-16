begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select has_column('public', 'escalas', 'horario_entrada_snapshot', 'snapshot de entrada existe');
select has_column('public', 'escalas', 'horario_saida_snapshot', 'snapshot de saida existe');
select has_column('public', 'escalas', 'origem_horario_snapshot', 'snapshot da origem da jornada existe');
select has_column('public', 'escalas', 'empresa_nome_snapshot', 'snapshot do nome da empresa existe');
select has_column('public', 'escalas', 'endereco_snapshot', 'snapshot do endereco existe');
select has_column('public', 'escalas', 'tipo_contratacao_snapshot', 'snapshot da contratacao existe');
select has_column('public', 'escalas', 'prioridade_envio_snapshot', 'snapshot da prioridade existe');

select has_function(
  'public',
  'dmr_criar_operacao_com_equipe',
  array['uuid', 'date', 'time without time zone', 'dmr_prioridade_envio', 'uuid[]'],
  'criacao transacional da operacao existe'
);

select has_function(
  'public',
  'dmr_aplicar_excecao_operacao',
  array['uuid', 'uuid'],
  'aplicacao explicita de excecao existe'
);

insert into public.empresas (
  id,
  nome,
  tipo_contratacao,
  endereco,
  numero,
  bairro,
  cidade
) values (
  '31000000-0000-0000-0000-000000000001',
  'Empresa Snapshot Original',
  'freelancer',
  'Rua Original',
  '10',
  'Centro',
  'Contagem'
);

insert into public.empresa_horarios (
  id,
  empresa_id,
  horario_entrada,
  horario_saida
) values (
  '32000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  '09:00',
  '18:00'
);

insert into public.escalas (
  id,
  empresa_id,
  empresa_horario_id,
  data,
  horario_entrada_snapshot,
  horario_saida_snapshot,
  origem_horario_snapshot,
  empresa_nome_snapshot,
  endereco_snapshot,
  tipo_contratacao_snapshot,
  prioridade_envio_snapshot
) values (
  '33000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  '2026-07-29',
  '09:00',
  '18:00',
  'semanal',
  'Empresa Snapshot Original',
  'Rua Original 10, Centro - Contagem',
  'freelancer',
  'normal'
);

update public.empresas
set
  nome = 'Empresa Editada Depois',
  tipo_contratacao = 'intermitente',
  endereco = 'Rua Nova'
where id = '31000000-0000-0000-0000-000000000001';

update public.empresa_horarios
set horario_entrada = '12:00', horario_saida = '21:00'
where id = '32000000-0000-0000-0000-000000000001';

select is(
  (
    select format(
      '%s|%s|%s|%s|%s',
      horario_entrada_snapshot,
      horario_saida_snapshot,
      empresa_nome_snapshot,
      endereco_snapshot,
      tipo_contratacao_snapshot
    )
    from public.escalas
    where id = '33000000-0000-0000-0000-000000000001'
  ),
  '09:00:00|18:00:00|Empresa Snapshot Original|Rua Original 10, Centro - Contagem|freelancer',
  'edicoes posteriores nao alteram os dados historicos da operacao'
);

select * from finish();
rollback;
