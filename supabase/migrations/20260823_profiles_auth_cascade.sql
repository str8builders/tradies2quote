begin;

lock table public.profiles in share row exclusive mode;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id)
      references auth.users (id)
      on delete cascade;
  end if;
end
$$;

insert into public._applied_migrations (name, applied_at)
values ('20260823_profiles_auth_cascade.sql', now())
on conflict (name) do nothing;

commit;
