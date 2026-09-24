-- Wave 46 perf audit (2026-09-24) — EXPLAIN on the hot list-page queries
-- showed sequential scans on these lookups. Purely additive (no data
-- changes); safe to apply against the live database. Not applied by this
-- change — the lead engineer reviews and runs it separately.

-- /app/invoices — `.eq("user_id", ...).is("deleted_at", null)`, ordered by
-- created_at desc. Partial index matches the filter exactly.
create index if not exists invoices_user_created_idx
  on public.invoices (user_id, created_at desc)
  where deleted_at is null;

-- /app/settings and /app/clients — `.eq("user_id", ...)` full-table scans.
create index if not exists clients_user_id_idx
  on public.clients (user_id);

-- Quote save/load (materials actions, quote-generation run, preview page)
-- all filter `.eq("quote_id", ...)` against this table.
create index if not exists quote_items_quote_id_idx
  on public.quote_items (quote_id);
