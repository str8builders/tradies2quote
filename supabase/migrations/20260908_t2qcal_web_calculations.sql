begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
create table if not exists public.t2qcal_calculations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and snapshot @> '{"version":1}'::jsonb and octet_length(snapshot::text)<=32768),
  revision integer not null default 1 check(revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.t2qcal_calculations enable row level security;
revoke all on public.t2qcal_calculations from anon,authenticated;
grant select,insert,update,delete on public.t2qcal_calculations to authenticated;
drop policy if exists t2qcal_owner on public.t2qcal_calculations;
create policy t2qcal_owner on public.t2qcal_calculations for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create index if not exists t2qcal_owner_recent on public.t2qcal_calculations(user_id,updated_at desc,id);
commit;
