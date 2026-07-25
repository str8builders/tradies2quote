-- Wave 40 — invoice payment instructions.
--
-- Invoices were being sent with `paymentInstructions: null` because the
-- schema had no column for them (the send route carried a "for now"
-- comment admitting bank details had nowhere to live). Clients received
-- an invoice PDF with no way to actually pay it.
--
-- This migration adds a nullable free-text `payment_instructions`
-- column on `profiles`. The tradie fills it once in Settings ("Bank:
-- 12-3456-7890123-00, ref the invoice number") and every invoice email
-- + PDF renders it in the existing "How to pay" block (the renderer in
-- src/lib/invoice-pdf-generator.ts and email-invoice.ts already accept
-- the field — only the source was missing).
--
-- Why this is safe:
--   * Column is nullable with no default — existing rows untouched,
--     and both renderers already handle null by omitting the block.
--   * RLS policies on `profiles` are unchanged; `profiles_update_own`
--     covers the new column automatically (row-level, not column-level).
--   * No index needed — only ever read via the id-keyed profile fetch.

alter table public.profiles
  add column if not exists payment_instructions text;

comment on column public.profiles.payment_instructions is
  'Free-text payment/bank details printed on invoices (e.g. bank account + reference). Nullable; invoices omit the block when unset.';
