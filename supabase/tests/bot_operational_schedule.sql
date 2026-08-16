begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(41);

insert into public.empresas(id, nome, endereco, numero, bairro, cidade, ativa)
values (
  '10000000-0000-0000-0000-000000000001',
  'Empresa Teste Agendamento',
  'Rua Teste',
  '100',
  'Centro',
  'Sao Paulo',
  true
);

insert into public.empresa_horarios(
  id,
  empresa_id,
  horario_entrada,
  horario_saida,
  ativo
)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '12:00',
  '22:00',
  true
);

insert into public.turnos_empresa(
  id,
  empresa_id,
  empresa_horario_id,
  nome,
  horario_inicio,
  ativo
)
values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Turno Teste',
  '12:00',
  true
);

insert into public.escalas(id, empresa_id, empresa_horario_id, data, status)
values
  (
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '2030-01-15',
    'pendente'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '2030-01-13',
    'pendente'
  );

insert into public.colaboradores(id, nome, telefone, ativo)
values
  ('50000000-0000-0000-0000-000000000001', 'Atual Terminal', '5511999990001', true),
  ('50000000-0000-0000-0000-000000000002', 'Lease Recente', '5511999990002', true),
  ('50000000-0000-0000-0000-000000000003', 'Lease Expirado', '5511999990003', true),
  ('50000000-0000-0000-0000-000000000004', 'Historico', '5511999990004', true),
  ('50000000-0000-0000-0000-000000000005', 'Futura Alcancavel', '5511999990005', true),
  ('50000000-0000-0000-0000-000000000006', 'Futura Terminal', '5511999990006', true);

insert into public.escala_colaboradores(
  id,
  escala_id,
  colaborador_id,
  turno_empresa_id,
  horario_inicio,
  horario_inicio_disparo,
  status_confirmacao,
  criado_em
)
values
  (
    '60000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '12:00',
    '08:00',
    'pendente',
    '2030-01-10 00:00:00+00'
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    '12:00',
    '08:00',
    'pendente',
    '2030-01-10 00:00:00+00'
  ),
  (
    '60000000-0000-0000-0000-000000000003',
    '40000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    '12:00',
    '08:00',
    'pendente',
    '2030-01-10 00:00:00+00'
  ),
  (
    '60000000-0000-0000-0000-000000000004',
    '40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000001',
    '12:00',
    '08:00',
    'confirmado',
    '2028-01-01 00:00:00+00'
  );

insert into public.contatos_alerta_dmr(id, nome, telefone, ativo, criado_em)
values (
  '70000000-0000-0000-0000-000000000001',
  'Contato Teste',
  '5511988880001',
  true,
  '2029-01-01 00:00:00+00'
);

insert into public.configuracoes_sistema(chave, valor, descricao)
values (
  'relatorio_whatsapp_ativado_em',
  jsonb_build_object('ativado_em', '2031-01-01T00:00:00+00:00'),
  'Watermark temporario do teste'
)
on conflict (chave) do update
set valor = excluded.valor,
    descricao = excluded.descricao;

insert into public.fila_mensagens(
  id,
  escala_colaborador_id,
  tipo,
  status,
  prioridade,
  telefone_destino,
  mensagem,
  agendado_para,
  tentativas,
  processando_em,
  chave_unica
)
values
  (
    '80000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    'confirmacao_inicial',
    'erro',
    'normal',
    '5511999990001',
    'Confirmacao terminal',
    '2030-01-15 11:00:00+00',
    3,
    null,
    'teste:confirmacao-terminal'
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000002',
    'confirmacao_inicial',
    'processando',
    'normal',
    '5511999990002',
    'Lease recente',
    '2030-01-13 11:00:00+00',
    1,
    '2030-01-15 14:58:00+00',
    'teste:lease-recente'
  ),
  (
    '80000000-0000-0000-0000-000000000003',
    '60000000-0000-0000-0000-000000000003',
    'confirmacao_inicial',
    'processando',
    'normal',
    '5511999990003',
    'Lease expirado',
    '2030-01-13 11:00:00+00',
    1,
    '2030-01-15 14:50:00+00',
    'teste:lease-expirado'
  );

create temporary table bot_schedule_results (
  nome text primary key,
  resultado jsonb not null
) on commit drop;

insert into bot_schedule_results(nome, resultado)
select
  'cadeia_lease',
  public.dmr_status_operacional_bot('2030-01-15 15:00:00+00');

select is(
  ((select resultado from bot_schedule_results where nome = 'cadeia_lease') ->> 'etapas_pendentes')::integer,
  0,
  'confirmacao terminal bloqueia sucessores'
);

select is(
  (select status::text from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000002'),
  'processando',
  'lease recente permanece processando'
);

select is(
  ((select resultado from bot_schedule_results where nome = 'cadeia_lease') ->> 'tem_trabalho')::boolean,
  true,
  'lease recente mantem trabalho'
);

select is(
  (select status::text from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000003'),
  'cancelada',
  'processamento expirado e cancelado'
);

select is(
  ((select resultado from bot_schedule_results where nome = 'cadeia_lease') ->> 'filas_expiradas_canceladas')::integer,
  1,
  'limpeza informa uma fila expirada cancelada'
);

update public.fila_mensagens
set status = 'cancelada',
    processando_em = null
where id = '80000000-0000-0000-0000-000000000002';

insert into public.escala_colaboradores(
  id,
  escala_id,
  colaborador_id,
  turno_empresa_id,
  horario_inicio,
  horario_inicio_disparo,
  status_confirmacao,
  criado_em
)
values
  (
    '60000000-0000-0000-0000-000000000005',
    '40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000005',
    '30000000-0000-0000-0000-000000000001',
    '23:00',
    '20:00',
    'pendente',
    '2030-01-10 00:00:00+00'
  ),
  (
    '60000000-0000-0000-0000-000000000006',
    '40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000006',
    '30000000-0000-0000-0000-000000000001',
    '23:00',
    '20:00',
    'pendente',
    '2030-01-10 00:00:00+00'
  );

insert into public.fila_mensagens(
  id,
  escala_colaborador_id,
  tipo,
  status,
  prioridade,
  telefone_destino,
  mensagem,
  agendado_para,
  tentativas,
  chave_unica
)
values (
  '80000000-0000-0000-0000-000000000006',
  '60000000-0000-0000-0000-000000000006',
  'confirmacao_inicial',
  'erro',
  'normal',
  '5511999990006',
  'Confirmacao futura terminal',
  '2030-01-15 23:00:00+00',
  3,
  'teste:confirmacao-futura-terminal'
);

insert into bot_schedule_results(nome, resultado)
select
  'operacao_noturna_futura',
  public.dmr_status_operacional_bot('2030-01-15 19:00:00+00');

select is(
  ((select resultado from bot_schedule_results where nome = 'operacao_noturna_futura') ->> 'etapas_pendentes')::integer,
  1,
  'operacao noturna futura mantem trabalho: proxima etapa alcancavel e contada'
);

select is(
  ((select resultado from bot_schedule_results where nome = 'operacao_noturna_futura') ->> 'tem_trabalho')::boolean,
  true,
  'operacao noturna futura mantem trabalho antes do horario de disparo'
);

update public.escala_colaboradores
set status_confirmacao = 'confirmado'
where id = '60000000-0000-0000-0000-000000000005';

insert into bot_schedule_results(nome, resultado)
select
  'operacao_futura_terminal',
  public.dmr_status_operacional_bot('2030-01-15 19:00:00+00');

select is(
  ((select resultado from bot_schedule_results where nome = 'operacao_futura_terminal') ->> 'etapas_pendentes')::integer,
  0,
  'predecessor terminal futuro nao mantem trabalho: sucessores seguem bloqueados'
);

select is(
  ((select resultado from bot_schedule_results where nome = 'operacao_futura_terminal') ->> 'tem_trabalho')::boolean,
  false,
  'predecessor terminal futuro nao mantem trabalho sozinho'
);

insert into public.colaboradores(id, nome, telefone, ativo)
values (
  '50000000-0000-0000-0000-000000000007',
  'Resposta Incompreensivel Futura',
  '5511999990007',
  true
);

insert into public.escala_colaboradores(
  id,
  escala_id,
  colaborador_id,
  turno_empresa_id,
  horario_inicio,
  horario_inicio_disparo,
  status_confirmacao,
  mensagem_enviada_em,
  primeiro_lembrete_enviado_em,
  segundo_lembrete_enviado_em,
  alerta_sem_resposta_enviado_em,
  ultima_resposta_incompreensivel_em,
  tentativas_incompreensiveis,
  criado_em
)
values (
  '60000000-0000-0000-0000-000000000007',
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000007',
  '30000000-0000-0000-0000-000000000001',
  '23:00',
  '20:00',
  'resposta_incompreensivel',
  '2030-01-15 16:00:00+00',
  '2030-01-15 17:00:00+00',
  '2030-01-15 18:00:00+00',
  '2030-01-15 18:05:00+00',
  '2030-01-15 18:50:00+00',
  1,
  '2030-01-10 00:00:00+00'
);

insert into bot_schedule_results(nome, resultado)
select
  'incompreensivel_antes_prazo',
  public.dmr_status_operacional_bot('2030-01-15 19:00:00+00');

select is(
  ((select resultado from bot_schedule_results where nome = 'incompreensivel_antes_prazo') ->> 'etapas_pendentes')::integer,
  1,
  'resposta incompreensivel antes de trinta minutos mantem trabalho: alerta futuro e alcancavel'
);

select is(
  ((select resultado from bot_schedule_results where nome = 'incompreensivel_antes_prazo') ->> 'tem_trabalho')::boolean,
  true,
  'resposta incompreensivel antes de trinta minutos mantem trabalho'
);

insert into public.fila_mensagens(
  id,
  escala_colaborador_id,
  contato_alerta_dmr_id,
  tipo,
  status,
  prioridade,
  telefone_destino,
  mensagem,
  agendado_para,
  tentativas,
  chave_unica
)
values (
  '80000000-0000-0000-0000-000000000007',
  '60000000-0000-0000-0000-000000000007',
  '70000000-0000-0000-0000-000000000001',
  'alerta_resposta_incompreensivel_expirada',
  'erro',
  'alta',
  '5511988880001',
  'Alerta incompreensivel terminal',
  '2030-01-15 19:20:00+00',
  3,
  'teste:alerta-incompreensivel-terminal'
);

insert into bot_schedule_results(nome, resultado)
select
  'incompreensivel_terminal',
  public.dmr_status_operacional_bot('2030-01-15 19:00:00+00');

select is(
  ((select resultado from bot_schedule_results where nome = 'incompreensivel_terminal') ->> 'etapas_pendentes')::integer,
  0,
  'alerta incompreensivel terminal nao mantem trabalho: etapa impossivel nao e recriada'
);

select is(
  ((select resultado from bot_schedule_results where nome = 'incompreensivel_terminal') ->> 'tem_trabalho')::boolean,
  false,
  'alerta incompreensivel terminal nao mantem trabalho sozinho'
);

update public.configuracoes_sistema
set valor = jsonb_build_object('ativado_em', '2030-01-15T18:00:00+00:00')
where chave = 'relatorio_whatsapp_ativado_em';

insert into public.colaboradores(id, nome, telefone, ativo)
values (
  '50000000-0000-0000-0000-000000000008',
  'Tratado Manualmente',
  '5511999990008',
  true
);

insert into public.escala_colaboradores(
  id,
  escala_id,
  colaborador_id,
  turno_empresa_id,
  horario_inicio,
  horario_inicio_disparo,
  status_confirmacao,
  tratado_manualmente,
  criado_em
)
values (
  '60000000-0000-0000-0000-000000000008',
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000008',
  '30000000-0000-0000-0000-000000000001',
  '23:00',
  '20:00',
  'tratado_manualmente',
  true,
  '2030-01-15 18:30:00+00'
);

insert into bot_schedule_results(nome, resultado)
select
  'grupo_tratado_antes_limite',
  public.dmr_status_operacional_bot('2030-01-15 19:00:00+00');

select is(
  ((select resultado from bot_schedule_results where nome = 'grupo_tratado_antes_limite') ->> 'relatorios_pendentes')::integer,
  1,
  'grupo tratado manualmente antecipa relatorio antes do limite de noventa minutos'
);

select is(
  ((select resultado from bot_schedule_results where nome = 'grupo_tratado_antes_limite') ->> 'tem_trabalho')::boolean,
  true,
  'grupo tratado manualmente antecipa relatorio e mantem trabalho'
);

update public.configuracoes_sistema
set valor = jsonb_build_object('ativado_em', '2029-01-01T00:00:00+00:00')
where chave = 'relatorio_whatsapp_ativado_em';

insert into public.fila_mensagens(
  id,
  escala_colaborador_id,
  contato_alerta_dmr_id,
  tipo,
  status,
  prioridade,
  telefone_destino,
  mensagem,
  agendado_para,
  tentativas,
  recuperacoes_automaticas,
  chave_unica
)
values
  (
    '80000000-0000-0000-0000-000000000004',
    '60000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'relatorio_diario',
    'erro',
    'alta',
    '5511988880001',
    'Relatorio atual',
    '2030-01-15 13:30:00+00',
    3,
    0,
    'teste:relatorio-atual'
  ),
  (
    '80000000-0000-0000-0000-000000000008',
    '60000000-0000-0000-0000-000000000005',
    '70000000-0000-0000-0000-000000000001',
    'relatorio_diario',
    'erro',
    'alta',
    '5511988880001',
    'Relatorio equivalente em outro membro',
    '2030-01-15 13:30:00+00',
    3,
    0,
    'teste:relatorio-atual-outro-membro'
  );

insert into bot_schedule_results(nome, resultado)
select
  'relatorio_primeira_recuperacao',
  public.dmr_status_operacional_bot('2030-01-15 15:00:00+00');

select is(
  (select status::text from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000004'),
  'pendente',
  'relatorio recupera somente uma vez: primeira recuperacao abre a fila'
);

select is(
  (select recuperacoes_automaticas from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000004'),
  1,
  'primeira recuperacao consome o orçamento duravel'
);

select is(
  (select status::text from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000008'),
  'erro',
  'orcamento logico recupera somente uma fila representante na primeira chamada'
);

select is(
  (select recuperacoes_automaticas from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000008'),
  0,
  'segunda fila equivalente ainda nao consumiu recuperacao'
);

update public.fila_mensagens
set status = 'erro',
    tentativas = max_tentativas,
    processando_em = null
where id = '80000000-0000-0000-0000-000000000004';

insert into bot_schedule_results(nome, resultado)
select
  'relatorio_orcamento_esgotado',
  public.dmr_status_operacional_bot('2030-01-15 15:00:00+00');

select is(
  (select status::text from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000004'),
  'erro',
  'relatorio com recuperacao consumida permanece terminal'
);

select is(
  (select recuperacoes_automaticas from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000004'),
  1,
  'recuperacao automatica nao ultrapassa uma tentativa'
);

select is(
  (select status::text from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000008'),
  'erro',
  'orcamento logico recupera somente uma fila representante entre chamadas'
);

select is(
  (select recuperacoes_automaticas from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000008'),
  0,
  'orcamento consumido por outro membro bloqueia segunda recuperacao'
);

select is(
  ((select resultado from bot_schedule_results where nome = 'relatorio_orcamento_esgotado') ->> 'tem_trabalho')::boolean,
  false,
  'fila impossivel com orçamento esgotado nao mantem trabalho'
);

update public.fila_mensagens
set status = 'enviada',
    enviada_em = '2030-01-15 14:00:00+00'
where id = '80000000-0000-0000-0000-000000000004';

insert into bot_schedule_results(nome, resultado)
select
  'relatorio_enviado',
  public.dmr_status_operacional_bot('2030-01-15 15:00:00+00');

select is(
  (select status::text from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000004'),
  'enviada',
  'relatorio enviado valido satisfaz sem reabrir'
);

select is(
  (select recuperacoes_automaticas from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000004'),
  1,
  'relatorio enviado valido preserva orçamento consumido'
);

select is(
  ((select resultado from bot_schedule_results where nome = 'relatorio_enviado') ->> 'relatorios_pendentes')::integer,
  0,
  'relatorio enviado valido elimina pendencia do contato'
);

select is(
  ((select resultado from bot_schedule_results where nome = 'relatorio_enviado') ->> 'tem_trabalho')::boolean,
  false,
  'relatorio enviado valido nao mantem trabalho'
);

delete from public.fila_mensagens
where id in (
  '80000000-0000-0000-0000-000000000004',
  '80000000-0000-0000-0000-000000000008'
);

insert into public.fila_mensagens(
  id,
  escala_colaborador_id,
  contato_alerta_dmr_id,
  tipo,
  status,
  prioridade,
  telefone_destino,
  mensagem,
  agendado_para,
  recuperacoes_automaticas,
  enviada_em,
  chave_unica
)
values (
  '80000000-0000-0000-0000-000000000005',
  '60000000-0000-0000-0000-000000000004',
  '70000000-0000-0000-0000-000000000001',
  'relatorio_diario',
  'enviada',
  'alta',
  '5511988880001',
  'Relatorio historico',
  '2030-01-15 13:30:00+00',
  0,
  '2030-01-15 14:00:00+00',
  'teste:relatorio-historico'
);

insert into bot_schedule_results(nome, resultado)
select
  'relatorio_historico_enviado',
  public.dmr_status_operacional_bot('2030-01-15 15:00:00+00');

select is(
  ((select resultado from bot_schedule_results where nome = 'relatorio_historico_enviado') ->> 'relatorios_pendentes')::integer,
  1,
  'relatorio historico nao satisfaz nem reabre: envio antigo nao satisfaz'
);

select is(
  (select status::text from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000005'),
  'enviada',
  'relatorio historico enviado permanece inalterado'
);

select is(
  (select recuperacoes_automaticas from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000005'),
  0,
  'relatorio historico enviado nao consome recuperacao'
);

update public.fila_mensagens
set status = 'erro',
    enviada_em = null
where id = '80000000-0000-0000-0000-000000000005';

insert into bot_schedule_results(nome, resultado)
select
  'relatorio_historico_terminal',
  public.dmr_status_operacional_bot('2030-01-15 15:00:00+00');

select is(
  (select status::text from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000005'),
  'erro',
  'relatorio historico terminal nao e reaberto'
);

select is(
  (select recuperacoes_automaticas from public.fila_mensagens where id = '80000000-0000-0000-0000-000000000005'),
  0,
  'relatorio historico terminal preserva orçamento'
);

select is(
  ((select resultado from bot_schedule_results where nome = 'relatorio_historico_terminal') ->> 'relatorios_pendentes')::integer,
  1,
  'relatorio historico terminal nao bloqueia relatorio atual'
);

select is(
  ((select resultado from bot_schedule_results where nome = 'relatorio_historico_terminal') ->> 'tem_trabalho')::boolean,
  true,
  'relatorio atual criavel mantem trabalho apesar do historico'
);

select ok(
  not has_function_privilege('anon', 'public.dmr_status_operacional_bot(timestamptz)', 'EXECUTE'),
  'anon sem execute na funcao de status'
);

select ok(
  not has_function_privilege('authenticated', 'public.dmr_status_operacional_bot(timestamptz)', 'EXECUTE'),
  'authenticated sem execute na funcao de status'
);

select ok(
  has_function_privilege('service_role', 'public.dmr_status_operacional_bot(timestamptz)', 'EXECUTE'),
  'service_role com execute na funcao de status'
);

select ok(
  not has_function_privilege('anon', 'public.dmr_cancelar_filas_expiradas_bot(timestamptz)', 'EXECUTE'),
  'anon sem execute na funcao de limpeza'
);

select ok(
  not has_function_privilege('authenticated', 'public.dmr_cancelar_filas_expiradas_bot(timestamptz)', 'EXECUTE'),
  'authenticated sem execute na funcao de limpeza'
);

select ok(
  has_function_privilege('service_role', 'public.dmr_cancelar_filas_expiradas_bot(timestamptz)', 'EXECUTE'),
  'service_role com execute na funcao de limpeza'
);

select * from finish();

rollback;
