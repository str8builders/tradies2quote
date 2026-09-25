-- Quote generation lease (2026-09-26). A double tap, a second tab or a revisit
-- while a quote was being written ran the quote model twice for one quote:
-- two bills, and whichever finished last won. The app now claims an atomic
-- lease before it calls the model (src/lib/quote-generation/lease.ts):
--
--   update public.quotes set generation_started_at = <now>
--    where id = <quote> and user_id = <owner>
--      and quote_data is null
--      and (generation_started_at is null
--           or generation_started_at < <now> - interval '4 minutes')
--
-- (sent as two conditional updates — free lease, then stale lease — so each
-- is a single atomic statement). A second request while the lease is live is
-- told "we're already writing this quote" and waits. The worker refreshes the
-- lease every minute while it runs, and clears it in the same update that
-- saves the quote, or on failure. A crashed worker's lease goes stale after
-- 4 minutes and the next request takes it over.
--
-- Additive and idempotent: one nullable column, no default, no backfill, no
-- existing row rewritten. The quotes_guard_content trigger fires only on
-- updates OF quote_data, total_amount, currency and version, so lease writes
-- never bump the version or trip the post-acceptance lock. Access is
-- unchanged: the table-level grants to authenticated / service_role
-- (20260906_restore_core_owner_access.sql) cover the new column, and the
-- owner RLS policies already scope the rows.
--
-- Not applied by this change — the lead engineer reviews and runs it.
-- Order: apply BEFORE activating the app release that writes
-- quotes.generation_started_at. (That release fails open without it: if the
-- column is missing, generation runs unlocked as before and the lease error
-- is reported to the internal error monitor.)
begin;
set local lock_timeout = '5s';

alter table public.quotes
  add column if not exists generation_started_at timestamptz;

comment on column public.quotes.generation_started_at is
  'Quote-generation lease. Set when a request starts writing the quote and refreshed each minute while it works; cleared when the quote is saved or generation fails. Older than 4 minutes = stale, and the next request may take it over. See src/lib/quote-generation/lease.ts.';

commit;
notify pgrst, 'reload schema';
