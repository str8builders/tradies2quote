-- One-tap sign-in from Tradies2Quote into the T2QCAL app (28 Sep 2026).
--
-- A signed-in tradie taps T2QCAL in the Tradies2Quote iPhone app: the server
-- issues a one-time code (only its SHA-256 is kept here), the app leaves it in
-- a pasteboard only the owner's own apps can read (never in the t2qcal://
-- link), and T2QCAL trades it once, within 60 seconds, for its own session of
-- the same account. Only the server (service role) reads or writes this table.
--
-- Additive and idempotent.
begin;
set local lock_timeout = '5s';

create table if not exists public.t2qcal_handoffs (
  code_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  constraint t2qcal_handoffs_hash check (char_length(code_hash) = 64),
  constraint t2qcal_handoffs_short_lived check (expires_at <= created_at + interval '10 minutes')
);
comment on table public.t2qcal_handoffs is
  'One-time codes that sign the T2QCAL app in as a Tradies2Quote account (SHA-256 of the code; 60 s; single use). Server only.';
create index if not exists t2qcal_handoffs_expires on public.t2qcal_handoffs (expires_at);

alter table public.t2qcal_handoffs enable row level security;
revoke all on public.t2qcal_handoffs from public, anon, authenticated;
grant all on public.t2qcal_handoffs to service_role;

commit;
notify pgrst, 'reload schema';
