set check_function_bodies = off;

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  create type public.dmr_user_role as enum ('admin', 'operador', 'visualizador');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.dmr_prioridade_envio as enum ('alta', 'normal');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.dmr_status_confirmacao as enum (
    'pendente',
    'mensagem_agendada',
    'mensagem_enviada',
    'confirmado',
    'nao_comparecera',
    'sem_resposta',
    'resposta_incompreensivel',
    'erro_envio',
    'cancelado',
    'tratado_manualmente'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.dmr_tipo_fila as enum (
    'confirmacao_inicial',
    'lembrete_1',
    'lembrete_2',
    'resposta_incompreensivel',
    'alerta_sem_resposta',
    'alerta_resposta_incompreensivel',
    'alerta_resposta_incompreensivel_expirada',
    'alerta_nao_comparecera'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.dmr_status_fila as enum ('pendente', 'processando', 'enviada', 'erro', 'cancelada');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.dmr_motivo_alerta as enum (
    'nao_comparecera',
    'sem_resposta',
    'resposta_incompreensivel',
    'resposta_incompreensivel_expirada',
    'erro_envio'
  );
exception when duplicate_object then null;
end $$;

create or replace function public.dmr_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create table if not exists public.usuarios_dashboard (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text not null unique,
  nome text not null,
  papel public.dmr_user_role not null default 'visualizador',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_por uuid references auth.users(id)
);

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  endereco text not null,
  numero text not null,
  bairro text not null,
  cidade text not null,
  ativa boolean not null default true,
  prioridade_envio_padrao public.dmr_prioridade_envio not null default 'normal',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_por uuid references auth.users(id)
);

create table if not exists public.turnos_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  horario_inicio time not null,
  prioridade_envio public.dmr_prioridade_envio,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_por uuid references auth.users(id),
  unique (empresa_id, nome),
  unique (empresa_id, horario_inicio)
);

create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_por uuid references auth.users(id),
  telefone_normalizado text generated always as (regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) stored,
  constraint colaboradores_telefone_minimo check (length(regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) >= 10)
);

create unique index if not exists colaboradores_telefone_normalizado_key
on public.colaboradores(telefone_normalizado);

create table if not exists public.empresa_colaboradores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete restrict,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_por uuid references auth.users(id),
  unique (empresa_id, colaborador_id)
);

create table if not exists public.escalas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  data date not null,
  status public.dmr_status_confirmacao not null default 'pendente',
  prioridade_envio public.dmr_prioridade_envio,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_por uuid references auth.users(id),
  unique (empresa_id, data)
);

create table if not exists public.escala_colaboradores (
  id uuid primary key default gen_random_uuid(),
  escala_id uuid not null references public.escalas(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete restrict,
  turno_empresa_id uuid not null references public.turnos_empresa(id) on delete restrict,
  horario_inicio time not null,
  prioridade_envio public.dmr_prioridade_envio,
  status_confirmacao public.dmr_status_confirmacao not null default 'pendente',
  resposta_normalizada text check (resposta_normalizada in ('sim', 'nao') or resposta_normalizada is null),
  resposta_original text,
  mensagem_enviada_em timestamptz,
  primeiro_lembrete_enviado_em timestamptz,
  segundo_lembrete_enviado_em timestamptz,
  respondido_em timestamptz,
  tentativas_incompreensiveis integer not null default 0 check (tentativas_incompreensiveis >= 0),
  ultima_resposta_incompreensivel_em timestamptz,
  alerta_sem_resposta_enviado_em timestamptz,
  alerta_incompreensivel_enviado_em timestamptz,
  tratado_manualmente boolean not null default false,
  tratado_por uuid references auth.users(id),
  tratado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_por uuid references auth.users(id),
  unique (escala_id, colaborador_id)
);

create table if not exists public.templates_mensagem (
  id uuid primary key default gen_random_uuid(),
  tipo public.dmr_tipo_fila not null,
  nome text not null,
  corpo text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tipo, nome)
);

create table if not exists public.contatos_alerta_dmr (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_por uuid references auth.users(id),
  telefone_normalizado text generated always as (regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) stored
);

create unique index if not exists contatos_alerta_dmr_telefone_key
on public.contatos_alerta_dmr(telefone_normalizado);

create table if not exists public.fila_mensagens (
  id uuid primary key default gen_random_uuid(),
  escala_colaborador_id uuid not null references public.escala_colaboradores(id) on delete cascade,
  contato_alerta_dmr_id uuid references public.contatos_alerta_dmr(id) on delete restrict,
  tipo public.dmr_tipo_fila not null,
  status public.dmr_status_fila not null default 'pendente',
  prioridade public.dmr_prioridade_envio not null default 'normal',
  telefone_destino text not null,
  mensagem text not null,
  agendado_para timestamptz not null,
  tentativas integer not null default 0 check (tentativas >= 0),
  max_tentativas integer not null default 3 check (max_tentativas > 0),
  ultimo_erro text,
  processando_em timestamptz,
  enviada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  chave_unica text not null,
  unique (chave_unica)
);

create table if not exists public.mensagens_recebidas (
  id uuid primary key default gen_random_uuid(),
  escala_colaborador_id uuid references public.escala_colaboradores(id) on delete set null,
  colaborador_id uuid references public.colaboradores(id) on delete set null,
  telefone_origem text not null,
  mensagem_original text,
  resposta_normalizada text check (resposta_normalizada in ('sim', 'nao') or resposta_normalizada is null),
  status_interpretado public.dmr_status_confirmacao not null,
  recebida_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

create table if not exists public.alertas_dmr (
  id uuid primary key default gen_random_uuid(),
  escala_colaborador_id uuid not null references public.escala_colaboradores(id) on delete cascade,
  contato_alerta_dmr_id uuid references public.contatos_alerta_dmr(id) on delete set null,
  motivo public.dmr_motivo_alerta not null,
  mensagem text not null,
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique nulls not distinct (escala_colaborador_id, motivo, contato_alerta_dmr_id)
);

create table if not exists public.bot_heartbeats (
  id uuid primary key default gen_random_uuid(),
  bot_id text not null,
  status text not null,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists public.logs_acoes (
  id uuid primary key default gen_random_uuid(),
  ator_id uuid references auth.users(id),
  ator_email text,
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists public.configuracoes_sistema (
  chave text primary key,
  valor jsonb not null,
  descricao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1 from public.usuarios_dashboard u
    where u.auth_user_id = auth.uid()
      and u.ativo
      and u.papel = 'admin'
  ), false)
$$;

create or replace function public.is_operador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1 from public.usuarios_dashboard u
    where u.auth_user_id = auth.uid()
      and u.ativo
      and u.papel in ('admin', 'operador')
  ), false)
$$;

create or replace function public.is_visualizador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1 from public.usuarios_dashboard u
    where u.auth_user_id = auth.uid()
      and u.ativo
      and u.papel in ('admin', 'operador', 'visualizador')
  ), false)
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_operador() from public;
revoke all on function public.is_visualizador() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_operador() to authenticated;
grant execute on function public.is_visualizador() to authenticated;

create or replace function public.dmr_log_action(
  p_acao text,
  p_entidade text,
  p_entidade_id uuid default null,
  p_detalhes jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.logs_acoes(ator_id, ator_email, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), auth.jwt() ->> 'email', p_acao, p_entidade, p_entidade_id, coalesce(p_detalhes, '{}'::jsonb));
end;
$$;

revoke all on function public.dmr_log_action(text, text, uuid, jsonb) from public;
grant execute on function public.dmr_log_action(text, text, uuid, jsonb) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'usuarios_dashboard', 'empresas', 'turnos_empresa', 'colaboradores',
    'empresa_colaboradores', 'escalas', 'escala_colaboradores',
    'templates_mensagem', 'fila_mensagens', 'mensagens_recebidas',
    'contatos_alerta_dmr', 'alertas_dmr', 'bot_heartbeats',
    'logs_acoes', 'configuracoes_sistema'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;

grant select on public.usuarios_dashboard to authenticated;
grant select, insert, update, delete on public.empresas to authenticated;
grant select, insert, update, delete on public.turnos_empresa to authenticated;
grant select, insert, update, delete on public.colaboradores to authenticated;
grant select, insert, update, delete on public.empresa_colaboradores to authenticated;
grant select, insert, update, delete on public.escalas to authenticated;
grant select, insert, update, delete on public.escala_colaboradores to authenticated;
grant select on public.templates_mensagem to authenticated;
grant select on public.fila_mensagens to authenticated;
grant select on public.mensagens_recebidas to authenticated;
grant select, insert, update, delete on public.contatos_alerta_dmr to authenticated;
grant select on public.alertas_dmr to authenticated;
grant select on public.bot_heartbeats to authenticated;
grant select on public.logs_acoes to authenticated;
grant select, update on public.configuracoes_sistema to authenticated;

create policy "usuarios_dashboard_select_self_or_admin"
on public.usuarios_dashboard for select to authenticated
using (auth_user_id = auth.uid() or public.is_admin());

create policy "usuarios_dashboard_admin_all"
on public.usuarios_dashboard for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "dmr_admin_operador_manage_empresas"
on public.empresas for all to authenticated
using (public.is_operador())
with check (public.is_operador());

create policy "dmr_visualizador_read_empresas"
on public.empresas for select to authenticated
using (public.is_visualizador());

create policy "dmr_operador_manage_turnos"
on public.turnos_empresa for all to authenticated
using (public.is_operador())
with check (public.is_operador());

create policy "dmr_visualizador_read_turnos"
on public.turnos_empresa for select to authenticated
using (public.is_visualizador());

create policy "dmr_operador_manage_colaboradores"
on public.colaboradores for all to authenticated
using (public.is_operador())
with check (public.is_operador());

create policy "dmr_visualizador_read_colaboradores"
on public.colaboradores for select to authenticated
using (public.is_visualizador());

create policy "dmr_operador_manage_vinculos"
on public.empresa_colaboradores for all to authenticated
using (public.is_operador())
with check (public.is_operador());

create policy "dmr_visualizador_read_vinculos"
on public.empresa_colaboradores for select to authenticated
using (public.is_visualizador());

create policy "dmr_operador_manage_escalas"
on public.escalas for all to authenticated
using (public.is_operador())
with check (public.is_operador());

create policy "dmr_visualizador_read_escalas"
on public.escalas for select to authenticated
using (public.is_visualizador());

create policy "dmr_operador_manage_escala_colaboradores"
on public.escala_colaboradores for all to authenticated
using (public.is_operador())
with check (public.is_operador());

create policy "dmr_visualizador_read_escala_colaboradores"
on public.escala_colaboradores for select to authenticated
using (public.is_visualizador());

create policy "dmr_visualizador_read_operational_tables"
on public.templates_mensagem for select to authenticated using (public.is_visualizador());
create policy "dmr_visualizador_read_fila" on public.fila_mensagens for select to authenticated using (public.is_visualizador());
create policy "dmr_visualizador_read_recebidas" on public.mensagens_recebidas for select to authenticated using (public.is_visualizador());
create policy "dmr_visualizador_read_alertas" on public.alertas_dmr for select to authenticated using (public.is_visualizador());
create policy "dmr_visualizador_read_heartbeats" on public.bot_heartbeats for select to authenticated using (public.is_visualizador());
create policy "dmr_visualizador_read_logs" on public.logs_acoes for select to authenticated using (public.is_visualizador());

create policy "dmr_admin_operador_manage_contatos"
on public.contatos_alerta_dmr for all to authenticated
using (public.is_operador())
with check (public.is_operador());

create policy "dmr_visualizador_read_contatos"
on public.contatos_alerta_dmr for select to authenticated
using (public.is_visualizador());

create policy "dmr_admin_manage_config"
on public.configuracoes_sistema for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "dmr_visualizador_read_config"
on public.configuracoes_sistema for select to authenticated
using (public.is_visualizador());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'usuarios_dashboard', 'empresas', 'turnos_empresa', 'colaboradores',
    'empresa_colaboradores', 'escalas', 'escala_colaboradores',
    'templates_mensagem', 'contatos_alerta_dmr', 'fila_mensagens',
    'configuracoes_sistema'
  ]
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.dmr_set_updated_at()', table_name, table_name);
  end loop;
end $$;

create index if not exists idx_empresas_ativa_prioridade on public.empresas(ativa, prioridade_envio_padrao);
create index if not exists idx_turnos_empresa_horario on public.turnos_empresa(empresa_id, horario_inicio, prioridade_envio);
create index if not exists idx_colaboradores_ativo on public.colaboradores(ativo);
create index if not exists idx_empresa_colaboradores_lookup on public.empresa_colaboradores(empresa_id, colaborador_id, ativo);
create index if not exists idx_escalas_data_empresa on public.escalas(data, empresa_id, status);
create index if not exists idx_escala_colaboradores_status_horario on public.escala_colaboradores(status_confirmacao, horario_inicio);
create index if not exists idx_escala_colaboradores_colaborador on public.escala_colaboradores(colaborador_id);
create index if not exists idx_fila_pendentes on public.fila_mensagens(status, agendado_para, prioridade, tentativas);
create index if not exists idx_fila_tipo_status on public.fila_mensagens(tipo, status);
create unique index if not exists fila_mensagens_unica_operacional_idx
on public.fila_mensagens(escala_colaborador_id, tipo, coalesce(contato_alerta_dmr_id, '00000000-0000-0000-0000-000000000000'::uuid))
where tipo <> 'resposta_incompreensivel';
create index if not exists idx_mensagens_recebidas_data on public.mensagens_recebidas(recebida_em, status_interpretado);
create index if not exists idx_alertas_motivo_data on public.alertas_dmr(motivo, criado_em);
create index if not exists idx_logs_acoes_data on public.logs_acoes(criado_em, acao);
create index if not exists idx_bot_heartbeats_bot_data on public.bot_heartbeats(bot_id, criado_em desc);

alter publication supabase_realtime add table public.escala_colaboradores;
alter publication supabase_realtime add table public.fila_mensagens;
alter publication supabase_realtime add table public.alertas_dmr;

insert into public.configuracoes_sistema(chave, valor, descricao)
values
  ('agenda_padrao', '{"entrada_08":{"confirmacao_minutos":-60,"lembrete_1_minutos":-50,"lembrete_2_minutos":-40,"alerta_minutos":-35},"entrada_apos_08":{"confirmacao_minutos":-120,"lembrete_1_minutos":-90,"lembrete_2_minutos":-60,"alerta_minutos":-40},"alerta_incompreensivel_expirada_minutos":30}'::jsonb, 'Offsets padrao para mensagens e alertas.'),
  ('intervalos_bot', '{"alta":{"min_segundos":6,"max_segundos":15},"normal":{"min_segundos":25,"max_segundos":45}}'::jsonb, 'Intervalos aleatorios do bot por prioridade.'),
  ('limites_bot', '{"max_tentativas_envio":3,"max_respostas_incompreensiveis":3}'::jsonb, 'Limites operacionais do bot.')
on conflict (chave) do nothing;

insert into public.templates_mensagem(tipo, nome, corpo)
values
  ('confirmacao_inicial', 'padrao_1', '{saudacao} {nome}. Você poderá comparecer à empresa {empresa} hoje?'),
  ('confirmacao_inicial', 'padrao_2', '{saudacao} {nome}. Você confirma presença na empresa {empresa} hoje?'),
  ('resposta_incompreensivel', 'orientacao_padrao', 'Não entendi sua resposta. Por favor, responda apenas com 1 para Sim ou 2 para Não.')
on conflict (tipo, nome) do nothing;
