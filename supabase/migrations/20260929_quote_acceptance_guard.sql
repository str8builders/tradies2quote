-- Audit 2026-09-28 — a signed-in user can no longer unlock an accepted quote or
-- rewrite the record of a customer's acceptance with a direct table write.
--
-- Owners may update their own quotes through the REST API (the app's own
-- server code does, for sending). quotes_guard_content locks the customer
-- content after acceptance, but it only fires when that content changes, so a
-- direct write could set status back to 'draft', change the prices, then set
-- it to 'accepted' again — and could rewrite accepted_total, the signer or the
-- signature file the public page shows.
--
-- The app never writes those directly: accepting, booking, starting and
-- finishing go through accept_quote / transition_quote_lifecycle (security
-- definer, so they run as the function owner, not as 'authenticated'), and the
-- send routes only move a quote between the editable statuses. This trigger
-- holds direct writes by the 'authenticated' role to exactly that. The service
-- role and the database's own functions are unaffected.
--
-- Additive and idempotent: one trigger function and one trigger. No row is
-- rewritten. Safe to apply before or after the app release.
begin;
set local lock_timeout = '5s';

create or replace function public.guard_quote_acceptance()
returns trigger language plpgsql set search_path = '' as $$
declare
  -- Keep in sync with EDITABLE_QUOTE_STATUSES in src/lib/lifecycle/lock.ts.
  editable constant text[] := array['draft', 'sent', 'viewed', 'declined', 'expired'];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.status is distinct from old.status
     and (old.status <> all (editable) or new.status <> all (editable)) then
    raise exception 'Quote % can only move to or from % through the job steps', old.id, coalesce(new.status, 'null')
      using errcode = '55000',
            hint = 'Use accept_quote or transition_quote_lifecycle.';
  end if;
  if new.accepted_at is distinct from old.accepted_at
     or new.accepted_name is distinct from old.accepted_name
     or new.accepted_email is distinct from old.accepted_email
     or new.signature_path is distinct from old.signature_path
     or new.accepted_ip is distinct from old.accepted_ip
     or new.accepted_user_agent is distinct from old.accepted_user_agent
     or new.accepted_total is distinct from old.accepted_total
     or new.accepted_quote_version is distinct from old.accepted_quote_version then
    raise exception 'The record of a customer''s acceptance of quote % cannot be edited', old.id
      using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_quote_acceptance() from public, anon, authenticated;

drop trigger if exists quotes_guard_acceptance on public.quotes;
create trigger quotes_guard_acceptance
  before update of status, accepted_at, accepted_name, accepted_email, signature_path,
    accepted_ip, accepted_user_agent, accepted_total, accepted_quote_version
  on public.quotes
  for each row execute function public.guard_quote_acceptance();

commit;
