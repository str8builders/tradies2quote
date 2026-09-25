-- Location (2026-09-28): clocking in and out with a pin, job sites, travel
-- (km), automatic clock-in at job sites, and the owner's live team map.
--
-- Privacy, by design (NZ Privacy Act 2020; App Store 5.1.1/5.1.2):
--   - Nothing is collected until the person turns location on themselves
--     (location_consents), and they can turn it off at any time.
--   - A position is only stored while its person is clocked in (an open
--     work_sessions row). Automatic clock-in compares positions with job
--     sites ON THE PHONE; nothing is uploaded before arrival.
--   - People see their own; the business owner sees their business's.
--   - Route points older than 90 days are deleted (purge_location_history,
--     run daily). The start and finish pins on hours that are on a live
--     invoice are kept with it; other pins are cleared after 90 days.
--
-- Tables:
--   location_consents  one row per person: on/off, automatic clock-in, and
--                      the work hours automatic clock-in is allowed in.
--   job_sites          a client's job site as a point (street geocoded, or
--                      saved from a phone on site), for pins and geofences.
--   work_sessions      clock in to clock out, with start and finish pins.
--                      Clocking out makes the time_entries row.
--   location_points    the route while clocked in (travel km, live map).
--   location_devices   an upload key per phone, so the iPhone app can send
--                      the route while it's in the background. Only its
--                      hash is stored.
--
-- Additive and idempotent. Order: apply BEFORE activating the release.
begin;
set local lock_timeout = '5s';

-- ── Consent ────────────────────────────────────────────────────────────────
create table if not exists public.location_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  granted boolean not null default false,
  auto_clock boolean not null default false,
  work_start time not null default '05:00',
  work_end time not null default '19:00',
  work_days smallint[] not null default '{1,2,3,4,5,6}',
  granted_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint location_consents_window check (work_end > work_start),
  constraint location_consents_days check (work_days <@ '{0,1,2,3,4,5,6}'::smallint[])
);
comment on table public.location_consents is
  'Each person''s own location choice: on/off, automatic clock-in, and its allowed hours (0 = Sunday).';

alter table public.location_consents enable row level security;
drop policy if exists location_consents_own on public.location_consents;
create policy location_consents_own on public.location_consents for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and owner_id = coalesce(public.my_team_owner(), (select auth.uid())));
drop policy if exists location_consents_owner_read on public.location_consents;
create policy location_consents_owner_read on public.location_consents for select to authenticated
  using ((select auth.uid()) = owner_id);
revoke all on public.location_consents from public, anon, authenticated;
grant select, insert, update on public.location_consents to authenticated;
grant all on public.location_consents to service_role;

-- Location switched on for this person right now.
create or replace function public.location_allowed(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.location_consents c where c.user_id = p_user and c.granted);
$$;

-- ── Job sites ──────────────────────────────────────────────────────────────
create table if not exists public.job_sites (
  client_id uuid primary key references public.clients(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  radius_m integer not null default 150,
  source text not null default 'geocoded',
  updated_at timestamptz not null default now(),
  constraint job_sites_lat check (latitude between -90 and 90),
  constraint job_sites_lng check (longitude between -180 and 180),
  constraint job_sites_radius check (radius_m between 50 and 1000),
  constraint job_sites_source check (source in ('geocoded', 'pinned'))
);
create index if not exists job_sites_owner on public.job_sites (owner_id);

alter table public.job_sites enable row level security;
drop policy if exists job_sites_read on public.job_sites;
create policy job_sites_read on public.job_sites for select to authenticated
  using (owner_id = coalesce(public.my_team_owner(), (select auth.uid())));
drop policy if exists job_sites_write on public.job_sites;
create policy job_sites_write on public.job_sites for all to authenticated
  using (owner_id = coalesce(public.my_team_owner(), (select auth.uid())))
  with check (
    owner_id = coalesce(public.my_team_owner(), (select auth.uid()))
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = owner_id)
  );
revoke all on public.job_sites from public, anon, authenticated;
grant select, insert, update, delete on public.job_sites to authenticated;
grant all on public.job_sites to service_role;

-- ── Clocked-in sessions ────────────────────────────────────────────────────
create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  start_lat double precision,
  start_lng double precision,
  start_accuracy real,
  start_place text,
  end_lat double precision,
  end_lng double precision,
  end_accuracy real,
  end_place text,
  source text not null default 'tap',
  time_entry_id uuid references public.time_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint work_sessions_order check (ended_at is null or ended_at > started_at),
  constraint work_sessions_length check (ended_at is null or ended_at - started_at <= interval '24 hours'),
  constraint work_sessions_source check (source in ('tap', 'auto')),
  constraint work_sessions_place check (
    (start_place is null or char_length(start_place) <= 200) and (end_place is null or char_length(end_place) <= 200)
  )
);
create unique index if not exists work_sessions_one_open on public.work_sessions (user_id) where ended_at is null;
create index if not exists work_sessions_owner_started on public.work_sessions (owner_id, started_at desc);
create index if not exists work_sessions_user_started on public.work_sessions (user_id, started_at desc);

alter table public.work_sessions enable row level security;
drop policy if exists work_sessions_read on public.work_sessions;
create policy work_sessions_read on public.work_sessions for select to authenticated
  using ((select auth.uid()) = user_id or (select auth.uid()) = owner_id);
-- Writes go through clock_in / clock_out (below), which check everything.
revoke all on public.work_sessions from public, anon, authenticated;
grant select on public.work_sessions to authenticated;
grant all on public.work_sessions to service_role;

-- time_entries made by clocking out point back at their session.
alter table public.time_entries add column if not exists session_id uuid references public.work_sessions(id) on delete set null;

-- ── Route points ───────────────────────────────────────────────────────────
create table if not exists public.location_points (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.work_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy real,
  speed real,
  constraint location_points_lat check (latitude between -90 and 90),
  constraint location_points_lng check (longitude between -180 and 180)
);
create index if not exists location_points_session_time on public.location_points (session_id, recorded_at);
create index if not exists location_points_owner_time on public.location_points (owner_id, recorded_at desc);
create index if not exists location_points_recorded on public.location_points (recorded_at);

alter table public.location_points enable row level security;
drop policy if exists location_points_read on public.location_points;
create policy location_points_read on public.location_points for select to authenticated
  using ((select auth.uid()) = user_id or (select auth.uid()) = owner_id);
revoke all on public.location_points from public, anon, authenticated;
grant select on public.location_points to authenticated;
grant all on public.location_points to service_role;

-- ── Upload keys for the iPhone app ─────────────────────────────────────────
create table if not exists public.location_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
create index if not exists location_devices_user on public.location_devices (user_id);
alter table public.location_devices enable row level security;
revoke all on public.location_devices from public, anon, authenticated;
grant all on public.location_devices to service_role;

-- ── Clock in / clock out ───────────────────────────────────────────────────
-- Start work: one open session per person, for their current business, with
-- an optional pin (only stored when location is on). `p_at` lets the phone
-- record the true arrival time of an automatic clock-in delivered late
-- (no more than 12 hours ago, never in the future).
create or replace function public.clock_in(
  p_at timestamptz default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy real default null,
  p_place text default null,
  p_client_id uuid default null,
  p_source text default 'tap'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  owner uuid;
  started timestamptz := coalesce(p_at, now());
  pinned boolean;
  session uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if p_source not in ('tap', 'auto') then raise exception 'Bad source' using errcode = '22023'; end if;
  if started > now() + interval '2 minutes' or started < now() - interval '12 hours' then
    raise exception 'That start time is out of range' using errcode = '22023';
  end if;
  owner := coalesce(public.my_team_owner(), actor);
  if p_client_id is not null and not exists (select 1 from public.clients c where c.id = p_client_id and c.user_id = owner) then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.work_sessions s where s.user_id = actor and s.ended_at is null) then
    raise exception 'Already clocked in' using errcode = '23505';
  end if;
  pinned := public.location_allowed(actor) and p_lat is not null and p_lng is not null
    and p_lat between -90 and 90 and p_lng between -180 and 180;
  insert into public.work_sessions (owner_id, user_id, client_id, started_at, start_lat, start_lng, start_accuracy, start_place, source)
  values (owner, actor, p_client_id, started,
          case when pinned then p_lat end, case when pinned then p_lng end,
          case when pinned then p_accuracy end, case when pinned then left(p_place, 200) end, p_source)
  returning id into session;
  return session;
end;
$$;

-- Finish work: close the open session and make its hours (start, finish,
-- break) in the business's time zone. Hours over midnight are refused (the
-- timesheet is per day); the phone asks the person to fix those by hand.
create or replace function public.clock_out(
  p_at timestamptz default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy real default null,
  p_place text default null,
  p_client_id uuid default null,
  p_break_minutes integer default 0,
  p_time_zone text default 'Pacific/Auckland'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  s public.work_sessions%rowtype;
  ended timestamptz := coalesce(p_at, now());
  zone text := coalesce(nullif(p_time_zone, ''), 'Pacific/Auckland');
  local_start timestamp;
  local_end timestamp;
  entry uuid;
  pinned boolean;
  client uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = zone) then zone := 'Pacific/Auckland'; end if;
  select * into s from public.work_sessions where user_id = actor and ended_at is null for update;
  if not found then raise exception 'Not clocked in' using errcode = 'P0002'; end if;
  if ended > now() + interval '2 minutes' then raise exception 'That finish time is out of range' using errcode = '22023'; end if;
  if ended <= s.started_at + interval '1 minute' then raise exception 'Finish has to be after start' using errcode = '22023'; end if;
  if ended - s.started_at > interval '24 hours' then raise exception 'That session is over 24 hours' using errcode = '22023'; end if;
  client := coalesce(p_client_id, s.client_id);
  if client is not null and not exists (select 1 from public.clients c where c.id = client and c.user_id = s.owner_id) then
    client := null;
  end if;
  local_start := s.started_at at time zone zone;
  local_end := ended at time zone zone;
  if local_start::date <> local_end::date then
    raise exception 'Clocked in over midnight: add the hours by hand' using errcode = '22023';
  end if;
  if coalesce(p_break_minutes, 0) < 0 or coalesce(p_break_minutes, 0) * interval '1 minute' >= (local_end - local_start) then
    raise exception 'The break is longer than the time worked' using errcode = '22023';
  end if;
  pinned := public.location_allowed(actor) and p_lat is not null and p_lng is not null
    and p_lat between -90 and 90 and p_lng between -180 and 180;
  insert into public.time_entries (owner_id, user_id, client_id, work_date, start_time, end_time, break_minutes, session_id)
  values (s.owner_id, actor, client, local_start::date,
          date_trunc('minute', local_start)::time, date_trunc('minute', local_end)::time,
          coalesce(p_break_minutes, 0), s.id)
  returning id into entry;
  update public.work_sessions set
    ended_at = ended,
    client_id = client,
    end_lat = case when pinned then p_lat end,
    end_lng = case when pinned then p_lng end,
    end_accuracy = case when pinned then p_accuracy end,
    end_place = case when pinned then left(p_place, 200) end,
    time_entry_id = entry
  where id = s.id;
  return jsonb_build_object('session_id', s.id, 'time_entry_id', entry);
end;
$$;

-- Route points while clocked in, from the signed-in person (web) or their
-- phone's upload key (service role, the API route checks the key). Points
-- outside the open session's time, or for someone with location off, are
-- dropped. Returns how many were kept.
create or replace function public.add_location_points(p_user uuid, p_points jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := coalesce(auth.uid(), p_user);
  s public.work_sessions%rowtype;
  kept integer;
begin
  if actor is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if auth.uid() is not null and p_user is not null and p_user <> auth.uid() then
    raise exception 'Not yours' using errcode = '42501';
  end if;
  if jsonb_typeof(p_points) is distinct from 'array' or jsonb_array_length(p_points) > 500 then
    raise exception 'Up to 500 points' using errcode = '22023';
  end if;
  if not public.location_allowed(actor) then return 0; end if;
  select * into s from public.work_sessions where user_id = actor and ended_at is null;
  if not found then return 0; end if;
  insert into public.location_points (session_id, owner_id, user_id, recorded_at, latitude, longitude, accuracy, speed)
  select s.id, s.owner_id, actor, to_timestamp((p ->> 't')::double precision / 1000),
         (p ->> 'lat')::double precision, (p ->> 'lng')::double precision,
         nullif(p ->> 'acc', '')::real, nullif(p ->> 'speed', '')::real
  from jsonb_array_elements(p_points) p
  where (p ->> 'lat')::double precision between -90 and 90
    and (p ->> 'lng')::double precision between -180 and 180
    and to_timestamp((p ->> 't')::double precision / 1000) between s.started_at - interval '1 minute' and now() + interval '2 minutes';
  get diagnostics kept = row_count;
  return kept;
end;
$$;

-- Daily: route points go after 90 days; pins after 90 days unless their
-- hours are on a live invoice.
create or replace function public.purge_location_history()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare points integer; pins integer;
begin
  delete from public.location_points where recorded_at < now() - interval '90 days';
  get diagnostics points = row_count;
  update public.work_sessions s set start_lat = null, start_lng = null, start_accuracy = null, start_place = null,
    end_lat = null, end_lng = null, end_accuracy = null, end_place = null
  where s.started_at < now() - interval '90 days'
    and (s.start_lat is not null or s.end_lat is not null)
    and not exists (
      select 1 from public.time_entries e
      where e.id = s.time_entry_id and public.time_entry_billed(e.invoice_id)
    );
  get diagnostics pins = row_count;
  return jsonb_build_object('points', points, 'pins', pins);
end;
$$;

revoke all on function public.location_allowed(uuid) from public, anon;
grant execute on function public.location_allowed(uuid) to authenticated, service_role;
revoke all on function public.clock_in(timestamptz, double precision, double precision, real, text, uuid, text) from public, anon;
grant execute on function public.clock_in(timestamptz, double precision, double precision, real, text, uuid, text) to authenticated;
revoke all on function public.clock_out(timestamptz, double precision, double precision, real, text, uuid, integer, text) from public, anon;
grant execute on function public.clock_out(timestamptz, double precision, double precision, real, text, uuid, integer, text) to authenticated;
revoke all on function public.add_location_points(uuid, jsonb) from public, anon;
grant execute on function public.add_location_points(uuid, jsonb) to authenticated, service_role;
revoke all on function public.purge_location_history() from public, anon, authenticated;
grant execute on function public.purge_location_history() to service_role;

-- ── Travel lines on timesheet invoices ─────────────────────────────────────
-- Same checks as before for the labour lines; travel lines ("other", in km,
-- up to 5,000 km each) may be added at a per-km rate.
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
  labour_hours numeric;
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

  if p_quote_data is null or jsonb_typeof(p_quote_data -> 'line_items') is distinct from 'array' then
    raise exception 'No invoice lines' using errcode = '22023';
  end if;
  select count(*),
         coalesce(sum((l ->> 'quantity')::numeric) filter (where l ->> 'type' = 'labour'), 0),
         count(*) filter (where
           not (l ->> 'type' = 'labour'
                or (l ->> 'type' = 'other' and l ->> 'unit' = 'km' and (l ->> 'quantity')::numeric <= 5000))
           or (l ->> 'quantity')::numeric <= 0
           or (l ->> 'unit_price')::numeric < 0
           or round((l ->> 'line_total')::numeric, 2)
              <> round((l ->> 'quantity')::numeric * (l ->> 'unit_price')::numeric, 2)),
         coalesce(sum(round((l ->> 'line_total')::numeric, 2)), 0)
    into line_count, labour_hours, bad_lines, line_sum
  from jsonb_array_elements(p_quote_data -> 'line_items') l;
  if line_count = 0 or bad_lines > 0 then
    raise exception 'Invoice lines must be labour hours at a rate (or travel in km)' using errcode = '22023';
  end if;
  if abs(labour_hours - entry_hours) > 0.005 then
    raise exception 'Invoice hours must match the timesheet' using errcode = '22023';
  end if;
  if round((p_quote_data ->> 'subtotal_before_tax')::numeric, 2) <> line_sum then
    raise exception 'Invoice subtotal must match its lines' using errcode = '22023';
  end if;
  total := round((p_quote_data ->> 'total')::numeric, 2);

  insert into public.quotes (id, user_id, client_id, status, quote_data, total_amount, currency, completed_at)
  values (new_quote, actor, p_client_id, 'completed', p_quote_data, total,
          coalesce(nullif(p_quote_data ->> 'currency', ''), 'NZD'), now());

  new_invoice := public.create_invoice_from_quote(new_quote);

  update public.time_entries set invoice_id = new_invoice, updated_at = now()
  where id = any(p_entry_ids);

  return jsonb_build_object('quote_id', new_quote, 'invoice_id', new_invoice);
end;
$$;

commit;
