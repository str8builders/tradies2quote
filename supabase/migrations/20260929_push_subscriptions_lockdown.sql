-- Close the push_subscriptions REST bypass (2026-09 audit finding 4).
--
-- 20260906_restore_core_owner_access.sql granted authenticated INSERT/UPDATE
-- directly on this table, and its "for all" RLS policy only ever checked
-- user_id — nothing stopped a signed-in user from inserting an arbitrary
-- https endpoint straight through PostgREST, skipping the subscribe route's
-- host allow-list (src/lib/push-endpoint.ts) entirely. The next push the
-- server owed that user would POST to whatever host they'd stored.
--
-- The subscribe route (src/app/api/push/subscribe/route.ts) now writes with
-- the admin (service-role) client, after checking the signed-in user itself
-- — it needs no authenticated-role grant to do that. Only DELETE remains
-- granted: "turn notifications off on this device" still deletes its own
-- row with the user-scoped client.
--
-- No data loss: nothing here removes rows. It only removes future
-- INSERT/UPDATE access through the REST API, and (for platform='web' rows
-- only, going forward) constrains the endpoint host on writes.

revoke insert, update on public.push_subscriptions from authenticated;

-- Split the old "for all" policy so it matches what's actually still
-- granted (select, delete) — a policy that nominally allows insert/update
-- is harmless once the grant is gone, but misleading to a future reader.
drop policy if exists push_subscriptions_all_own on public.push_subscriptions;
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Web-push rows must point at one of the browsers' own push services — the
-- same allow-list src/lib/push-endpoint.ts already enforces at the API
-- layer, kept in sync here as a second, database-level line of defence
-- (src/lib/push.ts also re-checks this immediately before every send).
-- iOS rows store an APNs device token in `endpoint`, not a URL, so they're
-- exempt (platform <> 'web').
--
-- NOT VALID: existing production rows haven't been audited against this
-- from here, and can't be from this worktree — new or changed rows are
-- checked immediately either way. Run `validate constraint` separately,
-- once existing rows are confirmed clean (or cleaned up).
do $$ begin
  alter table public.push_subscriptions
    add constraint push_subscriptions_web_endpoint_host_chk
    check (
      platform <> 'web' or endpoint ~* (
        '^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*push\.services\.mozilla\.com(/|$)'
        || '|^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*googleapis\.com(/|$)'
        || '|^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*notify\.windows\.com(/|$)'
        || '|^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*push\.apple\.com(/|$)'
      )
    ) not valid;
exception when duplicate_object then null; end $$;

-- The table was empty on 28 Sep 2026, so validate straight away; if a
-- non-conforming row has appeared since, leave the check NOT VALID (it
-- still applies to every new or changed row) rather than fail the release.
do $$ begin
  alter table public.push_subscriptions validate constraint push_subscriptions_web_endpoint_host_chk;
exception when check_violation then
  raise notice 'push_subscriptions has web endpoints outside the allow-list; constraint left NOT VALID';
end $$;

comment on constraint push_subscriptions_web_endpoint_host_chk on public.push_subscriptions is
  'Web Push endpoints must be one of the browsers'' own push services (mirrors src/lib/push-endpoint.ts).';
