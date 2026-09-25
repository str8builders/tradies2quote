-- Timesheet (round three, 2026-09-27): tradies log their hours per day, and
-- the business owner turns a client's week into an invoice.
--
-- time_entries: one row per stretch of work (a day, a start, a finish, a
-- break). `user_id` is who worked; `owner_id` is the business the hours
-- belong to: the caller's active team owner, or the caller themselves
-- (public.active_team_owner, the same rule the shared client book uses).
-- Hours are always worked out from the times, never typed, so they can't
-- disagree: round((finish - start - break) in hours, 2).
--
-- Access (RLS):
--   - Everyone reads their own rows; the business owner also reads every row
--     that belongs to their business (their team's hours).
--   - People add, change and remove only their OWN rows, only for the
--     business they currently work for, only with a client from that
--     business's book, and only while the row isn't on a live invoice.
--   - `invoice_id` is never writable through the API: the only way it is set
--     is public.create_timesheet_invoice below.
--
-- create_timesheet_invoice(p_entry_ids, p_client_id, p_quote_data): the
-- owner bills a client for chosen hours in one transaction. The app builds
-- the labour lines (one per day) and totals with its own totals function
-- (computeQuoteTotals); this checks them against the rows, saves a finished
-- job (a completed quote) for the client, makes its invoice through
-- create_invoice_from_quote (so the invoice is like every other one: Jobs,
-- job page, PDF, email, paid), and stamps the rows so they can't be billed
-- twice. A deleted or cancelled invoice frees its rows again.
--
-- Additive and idempotent: new table, policies, functions and grants only;
-- a re-run replaces the functions and policies with the same definitions.
-- Order: apply BEFORE activating an app release with the Timesheet tab.
begin;
set local lock_timeout = '5s';

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0,
  note text,
  invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_finish_after_start check (end_time > start_time),
  constraint time_entries_break check (
    break_minutes >= 0 and break_minutes <= 600
    and make_interval(mins => break_minutes) < (end_time - start_time)
  ),
  constraint time_entries_note check (note is null or char_length(note) <= 300)
);

comment on table public.time_entries is
  'Timesheet: hours worked (user_id) for a business (owner_id). invoice_id is set only by create_timesheet_invoice.';

create index if not exists time_entries_owner_date on public.time_entries (owner_id, work_date);
create index if not exists time_entries_user_date on public.time_entries (user_id, work_date);
create index if not exists time_entries_client on public.time_entries (client_id);
create index if not exists time_entries_invoice on public.time_entries (invoice_id);

-- Hours for a row, exactly as the app works them out (src/lib/timesheet/hours.ts).
create or replace function public.time_entry_hours(p_start time, p_end time, p_break integer)
returns numeric language sql immutable set search_path = '' as $$
  select round(((extract(epoch from (p_end - p_start)) / 60 - p_break) / 60)::numeric, 2);
$$;

-- On a live invoice (not deleted, not cancelled): locked.
create or replace function public.time_entry_billed(p_invoice uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_invoice is not null and exists (
    select 1 from public.invoices i
    where i.id = p_invoice and i.deleted_at is null and i.status <> 'cancelled'
  );
$$;

alter table public.time_entries enable row level security;

drop policy if exists time_entries_read on public.time_entries;
create policy time_entries_read on public.time_entries for select to authenticated
  using ((select auth.uid()) = user_id or (select auth.uid()) = owner_id);

drop policy if exists time_entries_insert on public.time_entries;
create policy time_entries_insert on public.time_entries for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and owner_id = coalesce(public.my_team_owner(), (select auth.uid()))
    and invoice_id is null
    and (client_id is null or exists (
      select 1 from public.clients c where c.id = client_id and c.user_id = owner_id))
  );

drop policy if exists time_entries_update on public.time_entries;
create policy time_entries_update on public.time_entries for update to authenticated
  using ((select auth.uid()) = user_id and not public.time_entry_billed(invoice_id))
  with check (
    (select auth.uid()) = user_id
    and owner_id = coalesce(public.my_team_owner(), (select auth.uid()))
    and not public.time_entry_billed(invoice_id)
    and (client_id is null or exists (
      select 1 from public.clients c where c.id = client_id and c.user_id = owner_id))
  );

drop policy if exists time_entries_delete on public.time_entries;
create policy time_entries_delete on public.time_entries for delete to authenticated
  using ((select auth.uid()) = user_id and not public.time_entry_billed(invoice_id));

revoke all on public.time_entries from public, anon, authenticated;
grant select, delete on public.time_entries to authenticated;
-- invoice_id is deliberately missing from the writable columns.
grant insert (id, owner_id, user_id, client_id, work_date, start_time, end_time, break_minutes, note)
  on public.time_entries to authenticated;
grant update (client_id, work_date, start_time, end_time, break_minutes, note, updated_at)
  on public.time_entries to authenticated;
grant all on public.time_entries to service_role;

create or replace function public.create_timesheet_invoice(
  p_entry_ids uuid[],
  p_client_id uuid,
  p_quote_data jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  wanted integer := coalesce(array_length(p_entry_ids, 1), 0);
  found_count integer;
  entry_hours numeric;
  line_hours numeric;
  line_count integer;
  bad_lines integer;
  line_sum numeric;
  total numeric;
  new_quote uuid := gen_random_uuid();
  new_invoice uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if wanted = 0 or wanted > 500 then raise exception 'Choose the hours to invoice' using errcode = '22023'; end if;
  if (select count(distinct x) from unnest(p_entry_ids) x) <> wanted then
    raise exception 'Each entry once only' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.user_id = actor) then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  -- Lock the rows so two taps can't bill them twice.
  perform 1 from public.time_entries e where e.id = any(p_entry_ids) for update;
  select count(*), coalesce(sum(public.time_entry_hours(e.start_time, e.end_time, e.break_minutes)), 0)
    into found_count, entry_hours
  from public.time_entries e
  where e.id = any(p_entry_ids)
    and e.owner_id = actor
    and e.client_id = p_client_id
    and not public.time_entry_billed(e.invoice_id);
  if found_count <> wanted then
    raise exception 'Some of those hours are already invoiced or not yours to bill' using errcode = '42501';
  end if;

  -- The lines: labour only, hours adding up to the rows, each line's total right.
  if p_quote_data is null or jsonb_typeof(p_quote_data -> 'line_items') is distinct from 'array' then
    raise exception 'No invoice lines' using errcode = '22023';
  end if;
  select count(*),
         coalesce(sum((l ->> 'quantity')::numeric), 0),
         count(*) filter (where l ->> 'type' is distinct from 'labour'
           or (l ->> 'quantity')::numeric <= 0
           or (l ->> 'unit_price')::numeric < 0
           or round((l ->> 'line_total')::numeric, 2)
              <> round((l ->> 'quantity')::numeric * (l ->> 'unit_price')::numeric, 2)),
         coalesce(sum(round((l ->> 'line_total')::numeric, 2)), 0)
    into line_count, line_hours, bad_lines, line_sum
  from jsonb_array_elements(p_quote_data -> 'line_items') l;
  if line_count = 0 or bad_lines > 0 then
    raise exception 'Invoice lines must be labour hours at a rate' using errcode = '22023';
  end if;
  if abs(line_hours - entry_hours) > 0.005 then
    raise exception 'Invoice hours must match the timesheet' using errcode = '22023';
  end if;
  if round((p_quote_data ->> 'subtotal_before_tax')::numeric, 2) <> line_sum then
    raise exception 'Invoice subtotal must match its lines' using errcode = '22023';
  end if;
  total := round((p_quote_data ->> 'total')::numeric, 2);

  insert into public.quotes (id, user_id, client_id, status, quote_data, total_amount, currency, completed_at)
  values (new_quote, actor, p_client_id, 'completed', p_quote_data, total,
          coalesce(nullif(p_quote_data ->> 'currency', ''), 'NZD'), now());

  -- The invoice exactly as every other one is made (totals re-checked there).
  new_invoice := public.create_invoice_from_quote(new_quote);

  update public.time_entries set invoice_id = new_invoice, updated_at = now()
  where id = any(p_entry_ids);

  return jsonb_build_object('quote_id', new_quote, 'invoice_id', new_invoice);
end;
$$;

revoke all on function public.create_timesheet_invoice(uuid[], uuid, jsonb) from public, anon;
grant execute on function public.create_timesheet_invoice(uuid[], uuid, jsonb) to authenticated;
revoke all on function public.time_entry_billed(uuid) from public, anon;
grant execute on function public.time_entry_billed(uuid) to authenticated, service_role;
grant execute on function public.time_entry_hours(time, time, integer) to authenticated, service_role;

commit;
