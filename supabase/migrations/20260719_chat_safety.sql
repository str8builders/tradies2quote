-- ===========================================================================
-- Customer-chat safety controls (App Store Guideline 1.2).
--
-- The public quote chat (/quote/[token]) is user-generated + AI-generated
-- content. Apple requires three controls for that surface:
--   (a) filtering of objectionable material  → src/lib/moderation.ts (code)
--   (b) a way to REPORT offensive content    → chat_reports (this table)
--   (c) a way to BLOCK the abusive party     → quotes.chat_disabled (the
--       sender is an anonymous token-holder, so "block" = the tradie turns
--       the chat off for that quote link)
--
-- Idempotent: safe to re-run; the apply-migrations tracker also guards it.
-- ===========================================================================

-- (c) Per-quote chat kill-switch, owned by the tradie.
alter table public.quotes
  add column if not exists chat_disabled boolean not null default false;

-- (b) Reports from either side of the conversation. Written and read via
-- the service role only (API routes verify token/ownership first) — RLS is
-- enabled with NO policies so anon/authenticated roles have zero direct
-- access.
create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  reporter text not null check (reporter in ('customer', 'tradie')),
  reason text,
  message_index integer,
  message_preview text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.chat_reports enable row level security;

create index if not exists chat_reports_quote_id_idx
  on public.chat_reports (quote_id);
