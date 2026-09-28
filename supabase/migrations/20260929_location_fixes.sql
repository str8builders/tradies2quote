-- Location fixes (2026-09-29), from the 28 September audit of
-- 20260928_location.sql:
--
--  1. clock_out drops route points recorded after the finish. An automatic
--     clock-out often lands late (the phone hands the departure over when
--     the app next opens) and the drive home in between counted as travel.
--  2. add_location_points keeps a point only for the business the person
--     works for now: an open session left with a team they've since left
--     (or whose plan lapsed) no longer receives their position.
--  3. job_site_misses: a client address OpenStreetMap couldn't place is
--     remembered with when it failed, so it is looked up again after a
--     while (the app waits 7 days, 1 day after a network error) or when
--     the address changes, instead of on every Timesheet load (Nominatim's
--     usage policy).
--  4. Leaving or being removed from a team ends the person's open work
--     session for the old business (its hours up to then go on the
--     timesheet, as clocking out would, when they fit in one day) and stops
--     sharing their location setting with the old owner. Before, the old
--     owner kept seeing their live position, and the person couldn't clock
--     in for anyone else.
--
-- Additive and idempotent: two functions replaced with the same
-- signatures, one table, two new functions and a trigger. No existing row
-- changes when this is applied. Sessions already left open by a departure
-- before it lands are not closed here (the person finishes them from the
-- Timesheet); from then on they receive no more route points (2).
-- Order: any time after 20260928_location.sql. The app works with or
-- without it: the Timesheet ignores points outside a session's start and
-- finish, the team map ignores people no longer in the team, and a missing
-- job_site_misses table reads as "no misses yet".
begin;
set local lock_timeout = '5s';

-- ── 1. Finish work: no route after the finish ─────────────────────────────
-- As in 20260928_location.sql, plus the delete before the session closes.
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
  -- Travel is the route between start and finish: anything the phone sent
  -- from after the finish (the drive home, before a late clock-out) goes.
  delete from public.location_points p where p.session_id = s.id and p.recorded_at > ended;
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

-- ── 2. Route points: only for the business the person works for now ───────
-- As in 20260928_location.sql, plus the owner check: clock_in gives every
-- session to coalesce(my_team_owner(), the person); when that has changed
-- since (they left the team, were removed, or its plan lapsed) the old
-- business gets no more of their route.
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
  if s.owner_id <> coalesce(public.active_team_owner(actor), actor) then return 0; end if;
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

revoke all on function public.clock_out(timestamptz, double precision, double precision, real, text, uuid, integer, text) from public, anon;
grant execute on function public.clock_out(timestamptz, double precision, double precision, real, text, uuid, integer, text) to authenticated;
revoke all on function public.add_location_points(uuid, jsonb) from public, anon;
grant execute on function public.add_location_points(uuid, jsonb) to authenticated, service_role;

-- ── 3. Addresses that couldn't be found ────────────────────────────────────
-- One row per client whose address found no street-level point. `address`
-- is the address that failed (a changed address is looked up at once);
-- `reason` is 'not_found' (no match, or only a town) or 'error' (network or
-- service trouble). Removed when a point is found. Same access as job_sites.
create table if not exists public.job_site_misses (
  client_id uuid primary key references public.clients(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  address text not null,
  reason text not null default 'not_found',
  failed_at timestamptz not null default now(),
  constraint job_site_misses_reason check (reason in ('not_found', 'error')),
  constraint job_site_misses_address check (char_length(address) <= 1000)
);
comment on table public.job_site_misses is
  'Client addresses the street lookup (OpenStreetMap Nominatim) could not place, and when, so they are not looked up on every load.';
create index if not exists job_site_misses_owner on public.job_site_misses (owner_id);

alter table public.job_site_misses enable row level security;
drop policy if exists job_site_misses_read on public.job_site_misses;
create policy job_site_misses_read on public.job_site_misses for select to authenticated
  using (owner_id = coalesce(public.my_team_owner(), (select auth.uid())));
drop policy if exists job_site_misses_write on public.job_site_misses;
create policy job_site_misses_write on public.job_site_misses for all to authenticated
  using (owner_id = coalesce(public.my_team_owner(), (select auth.uid())))
  with check (
    owner_id = coalesce(public.my_team_owner(), (select auth.uid()))
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = owner_id)
  );
revoke all on public.job_site_misses from public, anon, authenticated;
grant select, insert, update, delete on public.job_site_misses to authenticated;
grant all on public.job_site_misses to service_role;

-- ── 4. Leaving a team ends work for the old business ───────────────────────
-- The zone a person's hours are written in: their stored zone
-- (profiles.time_zone) when it is a real zone in their country, else their
-- country's, else New Zealand's; the app's rule (businessTimeZone in
-- src/app/app/_v2/lib/dates.ts, which clock_out gets through p_time_zone).
-- time_zone is read through to_jsonb so this works before
-- 20260929_profiles_time_zone.sql adds the column.
create or replace function public.person_time_zone(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  with p as (
    select upper(btrim(coalesce(pr.country, ''))) as country,
           upper(btrim(coalesce(pr.currency, ''))) as currency,
           nullif(btrim(to_jsonb(pr) ->> 'time_zone'), '') as stored
    from public.profiles pr
    where pr.id = p_user
  ), c as (
    select p.stored,
           case
             when p.country in ('NZ', 'AU', 'UK', 'US', 'CA') then p.country
             when p.country = 'GB' then 'UK'
             when p.currency = 'AUD' then 'AU'
             when p.currency = 'GBP' then 'UK'
             when p.currency = 'USD' then 'US'
             when p.currency = 'CAD' then 'CA'
             else 'NZ'
           end as place
    from p
  )
  select coalesce(
    (select c.stored from c
     where exists (select 1 from pg_catalog.pg_timezone_names z where z.name = c.stored)
       and case c.place
             when 'NZ' then c.stored in ('Pacific/Auckland', 'Pacific/Chatham')
             when 'AU' then c.stored like 'Australia/%'
             when 'UK' then c.stored = 'Europe/London'
             when 'US' then c.stored like 'America/%'
               or c.stored in ('Pacific/Honolulu', 'Pacific/Guam', 'Pacific/Saipan', 'Pacific/Pago_Pago')
             else c.stored like 'America/%'
           end),
    (select case c.place
              when 'AU' then 'Australia/Sydney'
              when 'UK' then 'Europe/London'
              when 'US' then 'America/Chicago'
              when 'CA' then 'America/Toronto'
              else 'Pacific/Auckland'
            end
     from c),
    'Pacific/Auckland');
$$;
revoke all on function public.person_time_zone(uuid) from public, anon, authenticated;
grant execute on function public.person_time_zone(uuid) to service_role;

-- After a membership row goes (leave, remove, or the team deleted): the
-- person's open session for any business other than their own is finished
-- now (at most 24 hours after it started), with its hours as clocking out
-- would make them (no break) when start and finish fall on one day in
-- their zone; otherwise it just ends, as the Timesheet can't hold hours
-- over midnight. Route points after the end go, and their location setting
-- (location_consents.owner_id) points back at themselves, so the old owner
-- no longer reads it.
-- When the membership goes because an account is being deleted (the
-- person's, or the owner's through their team), nothing is written: those
-- rows go with the account (on delete cascade), and a new time entry for a
-- deleted account would stop the deletion.
create or replace function public.end_departed_member_work()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s public.work_sessions%rowtype;
  ended timestamptz;
  zone text;
  local_start timestamp;
  local_end timestamp;
  entry uuid;
begin
  if not exists (select 1 from auth.users u where u.id = old.user_id) then return null; end if;
  for s in
    select * from public.work_sessions w
    where w.user_id = old.user_id and w.ended_at is null and w.owner_id <> old.user_id
      and exists (select 1 from auth.users o where o.id = w.owner_id)
    for update of w
  loop
    ended := least(greatest(now(), s.started_at + interval '1 second'), s.started_at + interval '24 hours');
    zone := public.person_time_zone(s.user_id);
    local_start := s.started_at at time zone zone;
    local_end := ended at time zone zone;
    entry := null;
    if local_start::date = local_end::date
       and date_trunc('minute', local_end) > date_trunc('minute', local_start) then
      insert into public.time_entries (owner_id, user_id, client_id, work_date, start_time, end_time, break_minutes, session_id)
      values (s.owner_id, s.user_id, s.client_id, local_start::date,
              date_trunc('minute', local_start)::time, date_trunc('minute', local_end)::time, 0, s.id)
      returning id into entry;
    end if;
    delete from public.location_points p where p.session_id = s.id and p.recorded_at > ended;
    update public.work_sessions set ended_at = ended, time_entry_id = entry where id = s.id;
  end loop;
  update public.location_consents c set owner_id = old.user_id, updated_at = now()
  where c.user_id = old.user_id and c.owner_id <> old.user_id
    and exists (select 1 from auth.users o where o.id = c.owner_id);
  return null;
end;
$$;
revoke all on function public.end_departed_member_work() from public, anon, authenticated;

drop trigger if exists team_members_end_work on public.team_members;
create trigger team_members_end_work
  after delete on public.team_members
  for each row execute function public.end_departed_member_work();

commit;
