-- ===========================================================================
-- Profile avatar storage bucket (self-hosted Supabase).
--
-- The `profile-avatars` bucket existed on the old hosted project but was never
-- captured as a migration, so the self-hosted database came up without it and
-- every avatar upload failed with "Bucket not found" (storage log, 13 Sep 2026).
-- Creates the public bucket and the owner-scoped policies that
-- 20260718_business_logo_bucket.sql was written to mirror.
--
-- Idempotent: safe to re-run.
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists profile_avatars_owner_insert on storage.objects;
create policy profile_avatars_owner_insert on storage.objects
  for insert to public
  with check (
    bucket_id = 'profile-avatars'
    and owner_id = (auth.uid())::text
  );

drop policy if exists profile_avatars_owner_select on storage.objects;
create policy profile_avatars_owner_select on storage.objects
  for select to public
  using (
    bucket_id = 'profile-avatars'
    and owner_id = (auth.uid())::text
  );

drop policy if exists profile_avatars_owner_update on storage.objects;
create policy profile_avatars_owner_update on storage.objects
  for update to public
  using (
    bucket_id = 'profile-avatars'
    and owner_id = (auth.uid())::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and owner_id = (auth.uid())::text
  );

drop policy if exists profile_avatars_owner_delete on storage.objects;
create policy profile_avatars_owner_delete on storage.objects
  for delete to public
  using (
    bucket_id = 'profile-avatars'
    and owner_id = (auth.uid())::text
  );
