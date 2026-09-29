-- Whole plan-set reader (30 Sep 2026).
--
-- A tradie uploads a whole consented plan set (one PDF, 20–60 sheets) to the
-- private plan-uploads bucket ({uid}/sets/{id}/original.pdf). A background
-- job reads every sheet and writes:
--   plan_set_sheets — per sheet: its number, title, kind, proven scale and the
--                     facts read off it (walls, marks, schedules …);
--   plan_sets       — status/progress, the sheet register, the building model
--                     (every fact cites where it came from), the tradie's
--                     answers to its questions, and the last materials list.
--
-- The job writes as the service role. A signed-in owner can read their own
-- rows, create a set, change only its answers and linked quote, and delete it.
-- Owner-only feature for now (PLAN_READER_ENABLED / OWNER_EMAIL gate in the
-- routes). Additive and idempotent.
begin;
set local lock_timeout = '5s';

create table if not exists public.plan_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  original_filename text not null,
  byte_size bigint not null,
  page_count int,
  storage_path text not null,
  status text not null default 'uploading',
  step text,
  progress jsonb not null default '{}'::jsonb,
  register jsonb,
  model jsonb,
  answers jsonb not null default '{}'::jsonb,
  takeoff jsonb,
  error text,
  lease_at timestamptz,
  ai_usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_sets_filename check (char_length(original_filename) between 1 and 255),
  constraint plan_sets_size check (byte_size between 1 and 52428800),
  constraint plan_sets_pages check (page_count is null or page_count between 1 and 200),
  constraint plan_sets_status check (status in ('uploading', 'queued', 'reading', 'ready', 'failed')),
  constraint plan_sets_path check (storage_path like user_id::text || '/sets/%')
);
comment on table public.plan_sets is
  'Whole plan sets read by the plan-set reader: status, sheet register, building model with evidence, the tradie''s answers and the last materials list.';
create index if not exists plan_sets_user_created on public.plan_sets (user_id, created_at desc);

create table if not exists public.plan_set_sheets (
  set_id uuid not null references public.plan_sets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page int not null,
  sheet_id text,
  title text,
  kind text,
  building text,
  scale_ratio numeric,
  scale_basis text,
  facts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (set_id, page),
  constraint plan_set_sheets_page check (page between 1 and 200)
);
comment on table public.plan_set_sheets is
  'One row per page of a plan set: what the reader found on it (sheet number, kind, proven scale, walls, marks, schedules). Written by the server only.';

alter table public.plan_sets enable row level security;
alter table public.plan_set_sheets enable row level security;

drop policy if exists plan_sets_select_own on public.plan_sets;
create policy plan_sets_select_own on public.plan_sets
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists plan_sets_insert_own on public.plan_sets;
create policy plan_sets_insert_own on public.plan_sets
  for insert to authenticated with check ((select auth.uid()) = user_id and status = 'uploading');
drop policy if exists plan_sets_update_own on public.plan_sets;
create policy plan_sets_update_own on public.plan_sets
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists plan_sets_delete_own on public.plan_sets;
create policy plan_sets_delete_own on public.plan_sets
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists plan_set_sheets_select_own on public.plan_set_sheets;
create policy plan_set_sheets_select_own on public.plan_set_sheets
  for select to authenticated using ((select auth.uid()) = user_id);

-- Owners may only create a set and change its answers / linked quote; the
-- job's columns (status, model, register …) are written by the server.
revoke all on public.plan_sets from public, anon, authenticated;
grant select, delete on public.plan_sets to authenticated;
grant insert (id, user_id, quote_id, original_filename, byte_size, storage_path, status) on public.plan_sets to authenticated;
grant update (answers, quote_id, updated_at) on public.plan_sets to authenticated;
grant all on public.plan_sets to service_role;

revoke all on public.plan_set_sheets from public, anon, authenticated;
grant select on public.plan_set_sheets to authenticated;
grant all on public.plan_set_sheets to service_role;

commit;
notify pgrst, 'reload schema';
