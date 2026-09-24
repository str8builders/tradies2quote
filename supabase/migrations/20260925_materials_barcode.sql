-- Barcode scanning (2026-09-25). A tradie scans a product (box of screws,
-- tube of sealant, bag of cement) and the code is stored on THEIR library
-- item, so the next scan finds it instantly. There is no outside product
-- database; the library learns as they scan.
--
-- Additive and idempotent: one nullable column, one check constraint and one
-- partial unique index. No existing row is rewritten (the new column is null
-- everywhere). Not applied by this change — the lead engineer reviews and runs
-- it.
--
-- Access is unchanged. The materials policies from
-- 20260906_restore_core_owner_access.sql already limit insert, update and
-- delete to user_id = auth.uid(); select also returns the shared catalogue
-- (user_id is null), so the app filters barcode lookups by user_id itself. The
-- table-level grants to `authenticated` cover the new column.
--
-- Order: apply BEFORE activating the app release that reads and writes
-- materials.barcode (src/app/app/materials/barcode-actions.ts). Releases
-- without the scanner never touch the column, so applying it early is safe.
begin;
set local lock_timeout = '5s';

alter table public.materials add column if not exists barcode text;

comment on column public.materials.barcode is
  'Product barcode the owner scanned or typed, normalised by src/lib/materials/barcode.ts (EAN/UPC check digits verified, UPC-A stored as EAN-13). Unique per owner.';

-- 4-64 printable ASCII characters (space to ~) with no leading or trailing
-- space; mirrors isStorableBarcode() in src/lib/materials/barcode.ts. Added
-- NOT VALID and then validated, so existing values are checked explicitly and
-- a re-run finds the constraint already in place.
do $materials_barcode_format$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.materials'::regclass
      and conname = 'materials_barcode_format'
  ) then
    alter table public.materials
      add constraint materials_barcode_format check (
        barcode is null
        or (
          char_length(barcode) between 4 and 64
          and barcode ~ '^[!-~]([ -~]*[!-~])?$'
        )
      ) not valid;
  end if;
end
$materials_barcode_format$;

alter table public.materials validate constraint materials_barcode_format;

-- One item per code per owner: a scan resolves to exactly one library item.
-- Also serves the owner-scoped lookup (user_id = … and barcode = …).
create unique index if not exists materials_user_barcode_key
  on public.materials (user_id, barcode)
  where barcode is not null;

commit;
