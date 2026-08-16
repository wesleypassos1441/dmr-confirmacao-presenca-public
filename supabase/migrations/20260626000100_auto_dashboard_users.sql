create or replace function public.dmr_sync_auth_user_to_dashboard()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  user_email text;
  user_name text;
begin
  user_email := nullif(trim(new.email), '');

  if user_email is null then
    return new;
  end if;

  user_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(user_email, '@', 1),
    'Usuario DMR'
  );

  insert into public.usuarios_dashboard(auth_user_id, email, nome, papel, ativo)
  values (new.id, user_email, user_name, 'admin', true)
  on conflict (email) do update
  set auth_user_id = coalesce(public.usuarios_dashboard.auth_user_id, excluded.auth_user_id),
      nome = coalesce(nullif(public.usuarios_dashboard.nome, ''), excluded.nome),
      papel = case
        when public.usuarios_dashboard.papel is null then excluded.papel
        else public.usuarios_dashboard.papel
      end,
      ativo = true,
      atualizado_em = now();

  return new;
end;
$$;

drop trigger if exists dmr_auth_user_to_dashboard on auth.users;

create trigger dmr_auth_user_to_dashboard
after insert on auth.users
for each row
execute function public.dmr_sync_auth_user_to_dashboard();

insert into public.usuarios_dashboard(auth_user_id, email, nome, papel, ativo)
select
  u.id,
  u.email,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'name'), ''),
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    split_part(u.email, '@', 1),
    'Usuario DMR'
  ),
  'admin',
  true
from auth.users u
where u.email is not null
on conflict (email) do update
set auth_user_id = coalesce(public.usuarios_dashboard.auth_user_id, excluded.auth_user_id),
    ativo = true,
    atualizado_em = now();
