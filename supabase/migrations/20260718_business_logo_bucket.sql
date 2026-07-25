-- ===========================================================================
-- Business logo storage bucket + column.
--
-- Finishes the branding feature: `profiles.logo_url` already existed and was
-- read by the quote PDF/SMS/send routes and the public /api/quote/[token]/logo
-- route, but there was no bucket to hold a logo and no UI to set one. This adds
-- the public `business-logos` bucket and mirrors the proven `profile-avatars`
-- storage policies EXACTLY (owner_id = auth.uid()), so a tradie can only ever
-- write inside their own uploads.
--
-- Idempotent: safe to re-run. The `apply-migrations.sh` tracker also guarantees
-- it runs at most once, but every statement here is guarded regardless.
-- ===========================================================================

-- 1. Column (already present on the live DB; guarded for fresh/dev databases).
alter table public.profiles add column if not exists logo_url text;

-- 2. Public bucket. `public = true` so the logo can be <img>-served on the
--    customer's quote page and fetched by the PDF generator without a signed
--    URL. No file_size_limit / allowed_mime_types set at the bucket level —
--    identical to `profile-avatars`; the server action is the enforcement point
--    (jpg/png only, size backstop), and client-side compression keeps uploads
--    tiny.
insert into storage.buckets (id, name, public)
values ('business-logos', 'business-logos', true)
on conflict (id) do nothing;

-- 3. RLS policies on storage.objects, scoped to this bucket. These mirror the
--    live `profile_avatars_owner_*` policies verbatim with the bucket id
--    swapped. Dropped-then-created so a re-run replaces cleanly.
drop policy if exists business_logos_owner_insert on storage.objects;
create policy business_logos_owner_insert on storage.objects
  for insert to public
  with check (
    bucket_id = 'business-logos'
    and owner_id = (auth.uid())::text
  );

drop policy if exists business_logos_owner_select on storage.objects;
create policy business_logos_owner_select on storage.objects
  for select to public
  using (
    bucket_id = 'business-logos'
    and owner_id = (auth.uid())::text
  );

drop policy if exists business_logos_owner_update on storage.objects;
create policy business_logos_owner_update on storage.objects
  for update to public
  using (
    bucket_id = 'business-logos'
    and owner_id = (auth.uid())::text
  )
  with check (
    bucket_id = 'business-logos'
    and owner_id = (auth.uid())::text
  );

drop policy if exists business_logos_owner_delete on storage.objects;
create policy business_logos_owner_delete on storage.objects
  for delete to public
  using (
    bucket_id = 'business-logos'
    and owner_id = (auth.uid())::text
  );
