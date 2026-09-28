-- Audit 2026-09-28 — tell the tradie when a client first opens a quote.
--
-- mark_quote_viewed (service role only, called by the public quote page)
-- records the sent -> viewed transition atomically. It returned nothing, so
-- the page could not tell whether THIS visit was the first view. It now
-- returns {"quote_id": …, "user_id": …} for the call that recorded the first
-- view, and null for every other call; the page uses that to send the
-- tradie one "Sam opened your quote" notification.
--
-- The transition itself is unchanged (same predicate, same viewed event).
-- The return type changes, so the function is dropped and recreated in one
-- transaction with the same grants. Idempotent; no row is read or written by
-- the migration itself.
--
-- Order: either way round. The current app ignores the result; the new app
-- treats a null result (this migration not applied yet) as "not a first
-- view", so it only starts sending the notification once this is applied.
-- Check: deploy/test-public-quote-rpcs.sql still passes (it calls the
-- function with PERFORM).
begin;
set local lock_timeout = '5s';

drop function if exists public.mark_quote_viewed(text);

create function public.mark_quote_viewed(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  viewed_quote_id uuid;
  viewed_owner_id uuid;
begin
  -- Atomic predicate prevents concurrent page requests recording two views.
  update public.quotes set status = 'viewed', viewed_at = coalesce(viewed_at, now())
  where public_token = p_token and status = 'sent' and deleted_at is null
    and (expires_at is null or expires_at >= now())
  returning id, user_id into viewed_quote_id, viewed_owner_id;
  if viewed_quote_id is null then
    return null;
  end if;
  insert into public.quote_events(quote_id, type, metadata)
    values (viewed_quote_id, 'viewed', '{}'::jsonb);
  return jsonb_build_object('quote_id', viewed_quote_id, 'user_id', viewed_owner_id);
end;
$$;

revoke all on function public.mark_quote_viewed(text) from public, anon, authenticated;
grant execute on function public.mark_quote_viewed(text) to service_role;

commit;
notify pgrst, 'reload schema';
