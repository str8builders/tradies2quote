-- Quote video RPCs, RLS, grants and bucket (migration 20260925_quote_videos.sql).
-- Run with psql against an isolated restored database only (t2q_release_audit_*),
-- after applying the migration there. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() not like 't2q_release_audit_%' then raise exception 'Isolated test database required'; end if; end $$;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end $$;
create function pg_temp.assert_sqlstate(statement text, expected text, label text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected then raise notice 'PASS: % (%)', label, expected; return; end if;
    raise exception 'FAIL: % raised % (%), expected %', label, sqlstate, sqlerrm, expected;
  end;
  raise exception 'FAIL: % was allowed', label;
end $$;

-- Owner c…01 and another account c…02; a priced draft, an empty draft and an accepted quote.
insert into auth.users(id, email, email_confirmed_at, aud, role, created_at, updated_at)
select ('c1000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 't2q-video-fixture-' || i || '@example.invalid',
       now(), 'authenticated', 'authenticated', now(), now()
from generate_series(1, 2) i;
insert into public.quotes(id, user_id, quote_data, status, total_amount, currency) values
  ('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   '{"line_items":[{"type":"labour","description":"Fixture","quantity":1,"unit":"job","unit_price":100,"line_total":100}],"total":115,"tax_rate":15,"tax_label":"GST"}',
   'draft', 115, 'NZD'),
  ('d1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', '{"line_items":[]}', 'draft', 0, 'NZD'),
  ('d1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001',
   '{"line_items":[{"type":"labour","description":"Fixture","quantity":1,"unit":"job","unit_price":100,"line_total":100}]}',
   'accepted', 115, 'NZD');

-- ── Who may request ────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.assert_sqlstate($s$select public.request_quote_video('d1000000-0000-0000-0000-000000000001')$s$, '28000', 'signed-out request');
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_sqlstate($s$select public.request_quote_video('d1000000-0000-0000-0000-000000000001')$s$, '42501', 'request for another account''s quote');
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_sqlstate($s$select public.request_quote_video('d1000000-0000-0000-0000-00000000ffff')$s$, 'P0002', 'request for a missing quote');
select pg_temp.assert_sqlstate($s$select public.request_quote_video('d1000000-0000-0000-0000-000000000002')$s$, '22023', 'request for a quote without lines');
select pg_temp.assert_sqlstate($s$select public.request_quote_video('d1000000-0000-0000-0000-000000000003')$s$, '55000', 'request for an accepted quote');

-- ── Queue the current version; repeats return the same row ─────────────────
select public.request_quote_video('d1000000-0000-0000-0000-000000000001') as first_request \gset
select pg_temp.assert_true((:'first_request'::jsonb ->> 'status') = 'queued'
  and (:'first_request'::jsonb ->> 'quote_version') = '1', 'owner request queues the current version');
select pg_temp.assert_true(public.request_quote_video('d1000000-0000-0000-0000-000000000001') = :'first_request'::jsonb,
  'a repeat request returns the same row');
select pg_temp.assert_true((select count(*) from public.quote_videos) = 1, 'the owner reads their row');

select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true((select count(*) from public.quote_videos) = 0, 'another account reads no rows');
select pg_temp.assert_sqlstate($s$update public.quote_videos set status = 'ready'$s$, '42501', 'direct update by a client');
select pg_temp.assert_sqlstate($s$insert into public.quote_videos(quote_id, user_id, quote_version, status)
  values ('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 1, 'queued')$s$, '42501', 'direct insert by a client');
select pg_temp.assert_sqlstate($s$select count(*) from public.quote_video_requests$s$, '42501', 'reading the request log');
select pg_temp.assert_sqlstate($s$select * from public.claim_quote_video_job()$s$, '42501', 'claiming a job as a client');
reset role;
select pg_temp.assert_true((select count(*) from public.quote_video_requests
  where user_id = 'c1000000-0000-0000-0000-000000000001') = 1, 'only the request that queued work was logged');

-- ── Worker claim ───────────────────────────────────────────────────────────
set local role service_role;
select id, status, attempts from public.claim_quote_video_job() \gset claimed_
select pg_temp.assert_true(:'claimed_id' = (:'first_request'::jsonb ->> 'id') and :'claimed_status' = 'rendering'
  and :'claimed_attempts' = '1', 'the claim moves the oldest queued job to rendering and counts the attempt');
select pg_temp.assert_true(not exists (select 1 from public.claim_quote_video_job()), 'an empty queue returns no job');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true((public.request_quote_video('d1000000-0000-0000-0000-000000000001') ->> 'status') = 'rendering',
  'a request while rendering returns the job as is');
reset role;

update public.quote_videos set status = 'failed', error = 'render_failed', attempts = 3
 where quote_id = 'd1000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true((public.request_quote_video('d1000000-0000-0000-0000-000000000001') ->> 'status') = 'queued',
  'a failed render is re-queued');
reset role;
select pg_temp.assert_true((select attempts = 0 and error is null from public.quote_videos
  where quote_id = 'd1000000-0000-0000-0000-000000000001'), 'a re-queue resets the attempts and the error');

-- ── Hourly limit ───────────────────────────────────────────────────────────
insert into public.quote_video_requests(user_id, requested_at)
select 'c1000000-0000-0000-0000-000000000001', now() - interval '5 minutes' from generate_series(1, 8);
update public.quote_videos set status = 'failed' where quote_id = 'd1000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_sqlstate($s$select public.request_quote_video('d1000000-0000-0000-0000-000000000001')$s$, '54000',
  'an 11th request within the hour');
reset role;
update public.quote_video_requests set requested_at = now() - interval '2 hours'
 where user_id = 'c1000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true((public.request_quote_video('d1000000-0000-0000-0000-000000000001') ->> 'status') = 'queued',
  'requests older than an hour no longer count');
reset role;

-- ── A new quote version gets its own row ───────────────────────────────────
update public.quotes set quote_data = jsonb_set(quote_data, '{line_items,0,line_total}', '200')
 where id = 'd1000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select version from public.quotes where id = 'd1000000-0000-0000-0000-000000000001') = 2,
  'editing the quote bumps its version');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true((public.request_quote_video('d1000000-0000-0000-0000-000000000001') ->> 'quote_version') = '2',
  'a request after an edit queues the new version');
reset role;

-- ── Jobs abandoned mid-render ──────────────────────────────────────────────
update public.quote_videos set status = 'rendering', attempts = 1, updated_at = now() - interval '20 minutes'
 where quote_id = 'd1000000-0000-0000-0000-000000000001' and quote_version = 1;
update public.quote_videos set status = 'rendering', attempts = 3, updated_at = now() - interval '20 minutes'
 where quote_id = 'd1000000-0000-0000-0000-000000000001' and quote_version = 2;
set local role service_role;
select quote_version from public.claim_quote_video_job() \gset swept_
reset role;
select pg_temp.assert_true(:'swept_quote_version' = '1'
  and (select status = 'rendering' and attempts = 2 from public.quote_videos
       where quote_id = 'd1000000-0000-0000-0000-000000000001' and quote_version = 1),
  'an abandoned job goes back to the queue and is claimed again');
select pg_temp.assert_true((select status = 'failed' and error = 'abandoned' from public.quote_videos
  where quote_id = 'd1000000-0000-0000-0000-000000000001' and quote_version = 2),
  'an abandoned job that used its three attempts fails');

-- ── Grants and bucket ──────────────────────────────────────────────────────
select pg_temp.assert_true(not has_function_privilege('anon', 'public.request_quote_video(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.request_quote_video(uuid)', 'execute'), 'only signed-in owners request videos');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.claim_quote_video_job()', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_quote_video_job()', 'execute')
  and has_function_privilege('service_role', 'public.claim_quote_video_job()', 'execute'), 'only the service role claims jobs');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.quote_videos', 'select')
  and not has_table_privilege('authenticated', 'public.quote_videos', 'insert')
  and not has_table_privilege('authenticated', 'public.quote_videos', 'update')
  and not has_table_privilege('authenticated', 'public.quote_videos', 'delete')
  and not has_table_privilege('authenticated', 'public.quote_video_requests', 'select'), 'clients cannot write video rows or read the log');
select pg_temp.assert_true((select not public and file_size_limit = 26214400
  and allowed_mime_types = array['video/mp4', 'image/jpeg'] from storage.buckets where id = 'quote-videos'),
  'the quote-videos bucket is private with size and type limits');
select pg_temp.assert_true(not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and (coalesce(qual, '') like '%quote-videos%' or coalesce(with_check, '') like '%quote-videos%')),
  'no storage policy opens the quote-videos bucket to clients');
rollback;
\echo Quote video request, claim, hourly limit, RLS, grant and bucket checks passed.
