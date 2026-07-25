-- ===========================================================================
-- Waitlist for the T2QCAL companion calculator app.
--
-- T2QCAL is not on the App Store yet, so /calculator cannot offer a download.
-- The page says so plainly and takes an email instead. This table is the list.
--
-- Posture, same as chat_reports: RLS is enabled with NO policies, so anon and
-- authenticated roles have zero direct access — every write goes through
-- /api/waitlist under the service role, which rate-limits and validates first.
-- The row holds an email, where it was signed up from, and when. Nothing else:
-- no name, no IP, no user agent, so there is nothing here worth stealing.
--
-- A repeat submission is not an error and not a duplicate row — the unique
-- index on lower(email) makes the insert an idempotent no-op, which also means
-- the endpoint cannot be used to probe whether an address is already listed.
--
-- Idempotent: safe to re-run; the apply-migrations tracker also guards it.
-- ===========================================================================
create table if not exists public.app_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 3 and 254),
  source text not null default 'calculator',
  created_at timestamptz not null default now()
);

alter table public.app_waitlist enable row level security;

create unique index if not exists app_waitlist_email_key
  on public.app_waitlist (lower(email));

create index if not exists app_waitlist_created_at_idx
  on public.app_waitlist (created_at desc);
