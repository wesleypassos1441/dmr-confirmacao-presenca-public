create or replace function public.dmr_bloquear_fila_retroativa()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_data date;
  v_inicio_local timestamp;
  v_now_local timestamp := now() at time zone 'America/Sao_Paulo';
begin
  if new.horario_inicio_disparo is null then
    return new;
  end if;

  select data
  into v_data
  from public.escalas
  where id = new.escala_id;

  if v_data is null then
    raise exception 'Escala invalida para criar fila.';
  end if;

  v_inicio_local := v_data + new.horario_inicio_disparo;

  if v_inicio_local <= v_now_local then
    raise exception 'Horario de Disparo ja passou. Escolha uma data ou horario futuro.';
  end if;

  return new;
end;
$$;

drop trigger if exists escala_colaboradores_bloquear_fila_retroativa on public.escala_colaboradores;

create trigger escala_colaboradores_bloquear_fila_retroativa
before insert or update of escala_id, horario_inicio_disparo
on public.escala_colaboradores
for each row
execute function public.dmr_bloquear_fila_retroativa();
