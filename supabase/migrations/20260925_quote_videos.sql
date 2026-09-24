-- Quote videos (2026-09-25). A tradie turns a quote into a 15-second branded
-- MP4 their client watches on a phone. The owner asks for it from the quote
-- page; a render worker on our own server (scripts/quote-video-worker.mjs,
-- systemd unit deploy/t2q-video.service) claims the job, renders it with
-- Remotion, uploads the MP4 and a poster JPEG to a private bucket and marks
-- the row ready. The client's quote link shows the video only while it was
-- made from the quote's CURRENT quotes.version, so a stale video never
-- reaches a client.
--
-- Objects (all new; no existing row is read, rewritten or deleted):
--   public.quote_videos            one row per (quote, version) render
--   public.quote_video_requests    request log for the hourly limit
--   public.request_quote_video()   owner request (authenticated only)
--   public.claim_quote_video_job() worker claim (service_role only)
--   storage bucket quote-videos    private, 25 MB, video/mp4 + image/jpeg
--
-- Access: the owner may SELECT their own quote_videos rows; nobody but the
-- service role writes them directly. The request log and the bucket have no
-- anon/authenticated access at all: every file is read through a short-lived
-- signed URL the app server creates with the service role.
--
-- Idempotent: safe to re-run. Not applied by this change — the lead engineer
-- reviews and runs it.
--
-- Order: apply BEFORE activating the app release that shows the quote video
-- card, and before starting t2q-video.service. Releases without the feature
-- never touch these objects, so applying it early is safe. Checks:
-- deploy/test-quote-video-rpcs.sql on an isolated release-audit database.
begin;
set local lock_timeout = '5s';

-- ── Table ──────────────────────────────────────────────────────────────────
create table if not exists public.quote_videos (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_version integer not null check (quote_version >= 1),
  status text not null check (status in ('queued', 'rendering', 'ready', 'failed')),
  storage_path text,
  poster_path text,
  error text check (error is null or char_length(error) <= 64),
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rendered_at timestamptz,
  constraint quote_videos_quote_version_key unique (quote_id, quote_version),
  constraint quote_videos_ready_has_files
    check (status <> 'ready' or (storage_path is not null and poster_path is not null))
);

comment on table public.quote_videos is
  'Quote video renders, one row per (quote_id, quote_version). Written only by request_quote_video (owner) and the render worker (service role); the public quote page shows a ready video only when quote_version = quotes.version.';
comment on column public.quote_videos.quote_version is
  'quotes.version the video was rendered from. A newer quote version makes it stale.';
comment on column public.quote_videos.storage_path is
  'Object in the private quote-videos bucket: {user_id}/{quote_id}/v{version}.mp4. Served only through signed URLs.';
comment on column public.quote_videos.poster_path is
  'Poster frame in the quote-videos bucket: {user_id}/{quote_id}/v{version}.jpg.';
comment on column public.quote_videos.error is
  'Short failure code from the worker (stale, quote_missing, no_items, render_failed, render_timeout, upload_failed, load_failed, abandoned). Never personal data.';
comment on column public.quote_videos.attempts is
  'Render attempts for the current request; the worker gives up after 3. A new owner request resets it.';

-- Worker queue: queued rows by wait time, and rendering rows for the stale sweep.
create index if not exists quote_videos_pending_idx
  on public.quote_videos (status, updated_at)
  where status in ('queued', 'rendering');
-- Covers the user_id foreign key (account deletion cascades through it).
create index if not exists quote_videos_user_idx on public.quote_videos (user_id);

alter table public.quote_videos enable row level security;

drop policy if exists quote_videos_select_own on public.quote_videos;
create policy quote_videos_select_own on public.quote_videos
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.quote_videos from public, anon, authenticated;
grant select on public.quote_videos to authenticated;
grant all on public.quote_videos to service_role;

-- ── Request log (hourly limit) ────────────────────────────────────────────
-- One row per request that queues work (a new render or a re-queued failure).
-- Rows older than a day are pruned by request_quote_video itself.
create table if not exists public.quote_video_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);
comment on table public.quote_video_requests is
  'Quote video request log for the per-owner hourly limit in request_quote_video. No client access.';
create index if not exists quote_video_requests_user_time_idx
  on public.quote_video_requests (user_id, requested_at);

alter table public.quote_video_requests enable row level security;
revoke all on public.quote_video_requests from public, anon, authenticated;
grant all on public.quote_video_requests to service_role;

-- ── Owner request ──────────────────────────────────────────────────────────
-- Queues a render of the quote's CURRENT version and returns
-- {id, quote_version, status}. An existing queued/rendering/ready row for
-- that version is returned as is (a double tap costs nothing); a failed one
-- is re-queued with fresh attempts. At most 10 requests that queue work per
-- owner per hour (SQLSTATE 54000).
create or replace function public.request_quote_video(p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  q record;
  v public.quote_videos%rowtype;
  had_row boolean;
  recent integer;
begin
  if actor is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  select id, user_id, status::text as status, version, quote_data into q
    from public.quotes where id = p_quote_id and deleted_at is null;
  if not found then raise exception 'Quote not found' using errcode = 'P0002'; end if;
  if q.user_id <> actor then raise exception 'Quote belongs to another account' using errcode = '42501'; end if;
  -- The video asks the client to accept; an accepted (locked) quote has no use
  -- for one. Keep in sync with EDITABLE_QUOTE_STATUSES in src/lib/lifecycle/lock.ts.
  if q.status <> all (array['draft', 'sent', 'viewed', 'declined', 'expired']) then
    raise exception 'Quote is locked after acceptance' using errcode = '55000';
  end if;
  -- Two checks: SQL does not promise to evaluate an OR left to right, and
  -- jsonb_array_length fails on a non-array.
  if q.quote_data is null or jsonb_typeof(q.quote_data -> 'line_items') is distinct from 'array' then
    raise exception 'Quote has no line items' using errcode = '22023';
  end if;
  if jsonb_array_length(q.quote_data -> 'line_items') = 0 then
    raise exception 'Quote has no line items' using errcode = '22023';
  end if;

  -- One request at a time per owner, so the limit below cannot be raced.
  perform pg_advisory_xact_lock(hashtext('public.request_quote_video'), hashtext(actor::text));

  select * into v from public.quote_videos
    where quote_id = p_quote_id and quote_version = q.version
    for update;
  had_row := found;
  if had_row and v.status <> 'failed' then
    return jsonb_build_object('id', v.id, 'quote_version', v.quote_version, 'status', v.status);
  end if;

  select count(*) into recent from public.quote_video_requests
    where user_id = actor and requested_at > now() - interval '1 hour';
  if recent >= 10 then
    raise exception 'Too many quote video requests' using errcode = '54000',
      hint = 'At most 10 quote videos an hour. Try again later.';
  end if;
  delete from public.quote_video_requests
    where user_id = actor and requested_at < now() - interval '1 day';
  insert into public.quote_video_requests (user_id) values (actor);

  if had_row then
    update public.quote_videos
       set status = 'queued', error = null, attempts = 0, updated_at = now()
     where id = v.id
     returning * into v;
  else
    insert into public.quote_videos (quote_id, user_id, quote_version, status)
    values (p_quote_id, actor, q.version, 'queued')
    returning * into v;
  end if;
  return jsonb_build_object('id', v.id, 'quote_version', v.quote_version, 'status', v.status);
end;
$$;

comment on function public.request_quote_video(uuid) is
  'Owner request for a quote video of the quote''s current version. Errors: 28000 signed out, P0002 not found, 42501 other account, 55000 accepted/locked, 22023 no line items, 54000 more than 10 requests in an hour.';

revoke all on function public.request_quote_video(uuid) from public, anon, authenticated;
grant execute on function public.request_quote_video(uuid) to authenticated;

-- ── Worker claim ───────────────────────────────────────────────────────────
-- Atomically moves the oldest waiting job to 'rendering', counts the attempt
-- and returns it (no row when the queue is empty). Concurrent workers never
-- get the same row (for update skip locked). A job left 'rendering' by a
-- worker that stopped mid-render (crash, OOM kill, reboot) is handed back to
-- the queue after 15 minutes, or failed once it has used its 3 attempts; the
-- worker cancels any render long before that.
create or replace function public.claim_quote_video_job()
returns setof public.quote_videos language plpgsql security definer set search_path = '' as $$
declare
  job public.quote_videos%rowtype;
begin
  update public.quote_videos
     set status = case when attempts >= 3 then 'failed' else 'queued' end,
         error = 'abandoned',
         updated_at = now()
   where status = 'rendering' and updated_at < now() - interval '15 minutes';

  update public.quote_videos v
     set status = 'rendering', attempts = v.attempts + 1, error = null, updated_at = now()
   where v.id = (
     select c.id from public.quote_videos c
      where c.status = 'queued'
      order by c.updated_at, c.created_at, c.id
      limit 1
      for update skip locked)
  returning v.* into job;
  if found then
    return next job;
  end if;
  return;
end;
$$;

comment on function public.claim_quote_video_job() is
  'Render worker only (service role): claim the oldest queued quote video job.';

revoke all on function public.claim_quote_video_job() from public, anon, authenticated;
grant execute on function public.claim_quote_video_job() to service_role;

-- ── Storage ────────────────────────────────────────────────────────────────
-- Private bucket for the MP4s and posters, keyed {user_id}/{quote_id}/v{n}.*.
-- No storage.objects policies for anon/authenticated: the app server signs
-- short-lived URLs with the service role after its own ownership or public
-- link checks. The storage API enforces the size and type limits for every
-- role, including the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-videos', 'quote-videos', false, 26214400, array['video/mp4', 'image/jpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
notify pgrst, 'reload schema';
