-- Stripe webhook ledger keyed per endpoint (audit 2026-09-28).
--
-- Both Stripe webhooks — /api/stripe/webhook (subscriptions) and
-- /api/payments/webhook (deposits) — record the events they have processed in
-- public.stripe_webhook_events, keyed on the event id alone. Stripe sends the
-- SAME checkout.session.completed to every endpoint that subscribes to it, so
-- whichever webhook recorded it first made the other skip it as a duplicate:
-- a paid deposit stayed "pending" and the quote's other payment links stayed
-- payable. (Dormant until the deposits endpoint is added in Stripe.)
--
-- This adds `endpoint` ('subscriptions' | 'payments') and moves the unique key
-- to (endpoint, event_id). No rows are deleted:
--   * existing rows are the subscriptions webhook's (the deposits endpoint has
--     no signing secret in production yet);
--   * rows the new app code writes BEFORE this migration use the old shape,
--     with the deposits webhook's ids prefixed "payments:evt_…" so the two
--     can't collide; they become (payments, evt_…) here.
-- Idempotent: re-running changes nothing.
--
-- Not applied by this change — reviewed and applied at release. Order: either
-- way round. The app release (src/lib/stripe-webhook-ledger.ts) detects the
-- missing column and falls back to the old shape, and keeps working once the
-- column exists. The default below keeps the OLD app build working after this
-- migration too (its inserts land as 'subscriptions').
begin;
set local lock_timeout = '5s';

alter table public.stripe_webhook_events
  add column if not exists endpoint text;

-- Drop every uniqueness on event_id ALONE (the original primary key and/or
-- 20260906's stripe_webhook_events_event_id_key), before the backfill below
-- can produce the same event id under two endpoints.
do $drop_event_id_key$
declare
  event_col smallint;
  constraint_names text[];
  index_names text[];
  obj text;
begin
  select attnum into event_col
    from pg_attribute
   where attrelid = 'public.stripe_webhook_events'::regclass
     and attname = 'event_id'
     and not attisdropped;
  -- Collect first, then drop (constraint-backed keys by constraint).
  select coalesce(array_agg(con.conname::text) filter (where con.conname is not null), '{}'),
         coalesce(array_agg(i.indexrelid::regclass::text) filter (where con.conname is null), '{}')
    into constraint_names, index_names
    from pg_index i
    left join pg_constraint con
      on con.conindid = i.indexrelid and con.conrelid = i.indrelid
   where i.indrelid = 'public.stripe_webhook_events'::regclass
     and i.indisunique
     and i.indnkeyatts = 1
     and i.indkey[0] = event_col;
  foreach obj in array constraint_names loop
    execute format('alter table public.stripe_webhook_events drop constraint %I', obj);
  end loop;
  foreach obj in array index_names loop
    execute format('drop index %s', obj);
  end loop;
end $drop_event_id_key$;

-- Backfill: rows the deposits webhook wrote in the old shape, then the rest.
update public.stripe_webhook_events
   set endpoint = 'payments',
       event_id = substr(event_id, length('payments:') + 1)
 where endpoint is null
   and event_id like 'payments:%';

update public.stripe_webhook_events
   set endpoint = 'subscriptions'
 where endpoint is null;

alter table public.stripe_webhook_events
  alter column endpoint set default 'subscriptions',
  alter column endpoint set not null;

do $endpoint_check$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.stripe_webhook_events'::regclass
       and conname = 'stripe_webhook_events_endpoint_check'
  ) then
    alter table public.stripe_webhook_events
      add constraint stripe_webhook_events_endpoint_check
      check (endpoint in ('subscriptions', 'payments'));
  end if;
end $endpoint_check$;

-- The new key. It becomes the primary key when the old one was on event_id
-- (tools and replication expect one); otherwise a unique index.
do $endpoint_key$
begin
  if exists (
    select 1 from pg_index i
     where i.indrelid = 'public.stripe_webhook_events'::regclass
       and i.indisunique
       and i.indpred is null
       and pg_get_indexdef(i.indexrelid) like '%(endpoint, event_id)'
  ) then
    return; -- already keyed (a re-run)
  end if;
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.stripe_webhook_events'::regclass
       and contype = 'p'
  ) then
    create unique index stripe_webhook_events_endpoint_event_id_key
      on public.stripe_webhook_events (endpoint, event_id);
  else
    alter table public.stripe_webhook_events
      add constraint stripe_webhook_events_pkey primary key (endpoint, event_id);
  end if;
end $endpoint_key$;

comment on column public.stripe_webhook_events.endpoint is
  'Which webhook processed the event: subscriptions (/api/stripe/webhook) or payments (/api/payments/webhook). Stripe sends the same event to both; each keeps its own record. See src/lib/stripe-webhook-ledger.ts.';

commit;
notify pgrst, 'reload schema';
