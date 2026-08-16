alter table public.empresas
  add column if not exists tipo_contratacao text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'empresas_tipo_contratacao_check'
      and conrelid = 'public.empresas'::regclass
  ) then
    alter table public.empresas
      add constraint empresas_tipo_contratacao_check
      check (tipo_contratacao is null or tipo_contratacao in ('intermitente', 'freelancer'));
  end if;
end
$$;

comment on column public.empresas.tipo_contratacao is
  'Tipo exibido nas mensagens: intermitente ou freelancer. Nulo indica cadastro antigo ainda nao classificado.';

create or replace function public.dmr_mensagem_com_tipo_contrato(
  p_mensagem text,
  p_tipo_contratacao text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_mensagem text := coalesce(p_mensagem, '');
  v_prefixo text := '';
begin
  v_mensagem := regexp_replace(
    v_mensagem,
    E'^\\*(Freelancer: SEM VÍNCULO EMPREGATÍCIO|Contrato Intermitente: Conforme diárias trabalhadas)\\*\\r?\\n\\r?\\n',
    ''
  );

  if p_tipo_contratacao = 'freelancer' then
    v_prefixo := E'*Freelancer: SEM VÍNCULO EMPREGATÍCIO*\n\n';
  elsif p_tipo_contratacao = 'intermitente' then
    v_prefixo := E'*Contrato Intermitente: Conforme diárias trabalhadas*\n\n';
  end if;

  return v_prefixo || v_mensagem;
end;
$$;

create or replace function public.dmr_aplicar_tipo_contrato_fila()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo_contratacao text;
begin
  if new.tipo::text not in ('confirmacao_inicial', 'lembrete_1', 'lembrete_2', 'reenvio_manual') then
    return new;
  end if;

  select emp.tipo_contratacao
    into v_tipo_contratacao
  from public.escala_colaboradores ec
  join public.escalas e on e.id = ec.escala_id
  join public.empresas emp on emp.id = e.empresa_id
  where ec.id = new.escala_colaborador_id;

  new.mensagem := public.dmr_mensagem_com_tipo_contrato(new.mensagem, v_tipo_contratacao);
  return new;
end;
$$;

drop trigger if exists trg_dmr_aplicar_tipo_contrato_fila on public.fila_mensagens;
create trigger trg_dmr_aplicar_tipo_contrato_fila
before insert or update of mensagem, escala_colaborador_id, tipo
on public.fila_mensagens
for each row
execute function public.dmr_aplicar_tipo_contrato_fila();

create or replace function public.dmr_atualizar_fila_tipo_contrato_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo_contratacao is not distinct from old.tipo_contratacao then
    return new;
  end if;

  update public.fila_mensagens fm
     set mensagem = public.dmr_mensagem_com_tipo_contrato(fm.mensagem, new.tipo_contratacao)
    from public.escala_colaboradores ec
    join public.escalas e on e.id = ec.escala_id
   where fm.escala_colaborador_id = ec.id
     and e.empresa_id = new.id
     and fm.status = 'pendente'
     and fm.tipo::text in ('confirmacao_inicial', 'lembrete_1', 'lembrete_2', 'reenvio_manual');

  return new;
end;
$$;

drop trigger if exists trg_dmr_atualizar_fila_tipo_contrato_empresa on public.empresas;
create trigger trg_dmr_atualizar_fila_tipo_contrato_empresa
after update of tipo_contratacao
on public.empresas
for each row
execute function public.dmr_atualizar_fila_tipo_contrato_empresa();

revoke all on function public.dmr_aplicar_tipo_contrato_fila() from public;
revoke all on function public.dmr_atualizar_fila_tipo_contrato_empresa() from public;
revoke all on function public.dmr_mensagem_com_tipo_contrato(text, text) from public;
revoke all on function public.dmr_mensagem_com_tipo_contrato(text, text) from anon;
revoke all on function public.dmr_mensagem_com_tipo_contrato(text, text) from authenticated;
