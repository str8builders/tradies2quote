-- Wave 47 — kill the phantom-generation bug (self-hosted schema drift).
--
-- The self-hosted quotes table was created with
--   quote_data  jsonb DEFAULT '{}'::jsonb
--   ai_snapshot jsonb DEFAULT '{}'::jsonb
-- (no repo migration ever specified that — it crept in with the hand-built
-- base schema on the VPS). The app's contract everywhere is
-- "quote_data IS NULL until generation succeeds":
--   * the preview page renders the generator vs editor on that test,
--   * /api/quotes/generate's already-generated guard is `if (quote.quote_data)`.
-- With the default, every fresh draft got `{}` — truthy — so the preview
-- skipped generation and rendered the editor against an empty object,
-- crashing SSR + client ("x is not iterable") for EVERY new quote.
--
-- Fix: drop the defaults and normalise the poisoned rows back to NULL so
-- their quotes become generatable again (transcripts are intact).

alter table public.quotes alter column quote_data drop default;
alter table public.quotes alter column ai_snapshot drop default;

update public.quotes set quote_data = null where quote_data = '{}'::jsonb;
update public.quotes set ai_snapshot = null where ai_snapshot = '{}'::jsonb;
