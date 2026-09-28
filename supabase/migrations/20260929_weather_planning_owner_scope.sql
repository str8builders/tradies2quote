-- Audit 2026-09-28 — close a cross-user quote_id gap in the weather-planning
-- RLS policies (quote_site_context, job_weather_assessments,
-- ai_recommendations, customer_message_drafts — all added by
-- 20260608_weather_planning.sql).
--
-- THE GAP: every insert/update policy on these four tables only ever checked
-- `(select auth.uid()) = user_id` — that the CALLER's own id matches the ROW's
-- claimed user_id column. None of them checked that the row's quote_id itself
-- belongs to a quote that same user owns. So any authenticated session could
-- insert (or, for the two updatable tables, overwrite) a row against ANY
-- quote_id — including a quote that belongs to someone else — simply by
-- setting user_id to itself, which the old `with check` was satisfied by.
--
-- Why "dormant": every write the app makes today goes through
-- src/lib/weather-planning/assess.ts's service-role admin client, which
-- bypasses RLS entirely (Postgres/Supabase's bypassrls), so this never bit in
-- practice. But RLS policies for the 'authenticated' role are reachable by ANY
-- signed-in session directly against Supabase's REST/PostgREST API,
-- independent of this app's own routes or its own ownership re-checks (e.g.
-- assess.ts itself re-verifies quote.user_id before it ever writes, and
-- src/app/api/weather-planning/assess/route.ts takes userId only from the
-- session, never the request body) — none of that protects the database
-- layer itself.
--
-- CONCRETE IMPACT if exploited: assess.ts's own read of quote_site_context
-- (`.eq("quote_id", ...)`, no user_id filter, via the same admin client that
-- trusts the DB to already be owner-scoped) would pick up an attacker-planted
-- row for a victim's quote_id — poisoning that job's weather assessment with
-- attacker-chosen lat/lon/timezone/job_type.
--
-- FIX: every insert/update policy now also requires the quote_id to belong to
-- a quote owned by that same auth.uid(). Idempotent (drop + recreate); no data
-- is touched, so there is nothing to lose. The service-role admin client used
-- throughout assess.ts and cron.ts bypasses RLS entirely and is therefore
-- completely unaffected — this only tightens what the 'authenticated' role
-- (a real signed-in session) may write. select policies are unchanged: they
-- already scope strictly by `user_id`, and after this fix that column can
-- only ever be paired with a quote_id the same user owns.

drop policy if exists quote_site_context_insert_own on public.quote_site_context;
create policy quote_site_context_insert_own
  on public.quote_site_context for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.quotes q
      where q.id = quote_site_context.quote_id
        and q.user_id = (select auth.uid())
    )
  );

drop policy if exists quote_site_context_update_own on public.quote_site_context;
create policy quote_site_context_update_own
  on public.quote_site_context for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.quotes q
      where q.id = quote_site_context.quote_id
        and q.user_id = (select auth.uid())
    )
  );

drop policy if exists job_weather_assessments_insert_own on public.job_weather_assessments;
create policy job_weather_assessments_insert_own
  on public.job_weather_assessments for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.quotes q
      where q.id = job_weather_assessments.quote_id
        and q.user_id = (select auth.uid())
    )
  );

drop policy if exists ai_recommendations_insert_own on public.ai_recommendations;
create policy ai_recommendations_insert_own
  on public.ai_recommendations for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.quotes q
      where q.id = ai_recommendations.quote_id
        and q.user_id = (select auth.uid())
    )
  );

drop policy if exists customer_message_drafts_insert_own on public.customer_message_drafts;
create policy customer_message_drafts_insert_own
  on public.customer_message_drafts for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.quotes q
      where q.id = customer_message_drafts.quote_id
        and q.user_id = (select auth.uid())
    )
  );

drop policy if exists customer_message_drafts_update_own on public.customer_message_drafts;
create policy customer_message_drafts_update_own
  on public.customer_message_drafts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.quotes q
      where q.id = customer_message_drafts.quote_id
        and q.user_id = (select auth.uid())
    )
  );
