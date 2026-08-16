begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

select has_table(
  'public',
  'empresa_horario_regras_semanais',
  'regras semanais existem'
);

select has_table(
  'public',
  'empresa_horario_excecoes',
  'excecoes por data existem'
);

select has_function(
  'public',
  'dmr_resolver_jornada_efetiva',
  array['uuid', 'date'],
  'resolver de jornada efetiva existe'
);

select has_function(
  'public',
  'dmr_salvar_jornada_semanal',
  array['uuid', 'time without time zone', 'time without time zone', 'jsonb'],
  'salvamento semanal existe'
);

select has_function(
  'public',
  'dmr_salvar_excecao_jornada',
  array['uuid', 'date', 'time without time zone', 'time without time zone', 'text'],
  'salvamento de excecao existe'
);

insert into public.empresas (
  id,
  nome,
  endereco,
  numero,
  bairro,
  cidade
) values (
  '10000000-0000-0000-0000-000000000001',
  'Empresa Teste Jornada',
  'Rua Teste',
  '100',
  'Centro',
  'Contagem'
);

insert into public.empresa_horarios (
  id,
  empresa_id,
  horario_entrada,
  horario_saida
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '09:00',
  '18:00'
);

select is(
  (
    select count(*)::integer
    from public.empresa_horario_regras_semanais
    where empresa_horario_id = '20000000-0000-0000-0000-000000000001'
  ),
  5,
  'novo horario recebe regras padrao de segunda a sexta'
);

update public.empresa_horario_regras_semanais
set horario_entrada = '10:00', horario_saida = '19:00'
where empresa_horario_id = '20000000-0000-0000-0000-000000000001'
  and dia_semana = 1;

select is(
  (
    select format('%s|%s|%s', horario_entrada, horario_saida, origem)
    from public.dmr_resolver_jornada_efetiva(
      '20000000-0000-0000-0000-000000000001',
      '2026-07-27'
    )
  ),
  '10:00:00|19:00:00|semanal',
  'regra semanal prevalece sobre o horario base'
);

insert into public.empresa_horario_excecoes (
  empresa_horario_id,
  data,
  horario_entrada,
  horario_saida,
  motivo
) values (
  '20000000-0000-0000-0000-000000000001',
  '2026-07-27',
  '12:00',
  '21:00',
  'Teste de sexta excepcional'
);

select is(
  (
    select format('%s|%s|%s', horario_entrada, horario_saida, origem)
    from public.dmr_resolver_jornada_efetiva(
      '20000000-0000-0000-0000-000000000001',
      '2026-07-27'
    )
  ),
  '12:00:00|21:00:00|excecao',
  'excecao da data prevalece sobre a regra semanal'
);

delete from public.empresa_horario_excecoes
where empresa_horario_id = '20000000-0000-0000-0000-000000000001';

delete from public.empresa_horario_regras_semanais
where empresa_horario_id = '20000000-0000-0000-0000-000000000001'
  and dia_semana = 1;

select is(
  (
    select format('%s|%s|%s', horario_entrada, horario_saida, origem)
    from public.dmr_resolver_jornada_efetiva(
      '20000000-0000-0000-0000-000000000001',
      '2026-07-27'
    )
  ),
  '09:00:00|18:00:00|base',
  'horario base e usado quando nao ha regra nem excecao'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.empresa_horario_regras_semanais',
    'INSERT'
  ),
  'frontend nao escreve regras semanais diretamente'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.empresa_horario_excecoes',
    'INSERT'
  ),
  'frontend nao escreve excecoes diretamente'
);

select * from finish();
rollback;
