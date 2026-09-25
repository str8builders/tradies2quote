-- Your first name, for the new-look greeting ("Good morning, Challis")
-- (new look round two, 2026-09-26).
--
-- One nullable column on profiles, written only by setFirstNameAction from
-- Settings → Your account. null (the default everywhere) means "not given":
-- the greeting falls back to the business name, then to no name at all
-- (src/lib/profile-name.ts). The check mirrors the app's own limit so a
-- hand-crafted API write can't store an essay.
--
-- Additive and idempotent: no existing row is rewritten, and a re-run finds
-- the column (with its check) and the grants already in place.
--
-- Access. profiles uses column-level insert/update grants for `authenticated`
-- (20260906_restore_core_owner_access.sql), so the column needs its own
-- update grant; the profiles_update_own policy still limits writes to the
-- caller's own row.
--
-- Order: apply BEFORE activating an app release that shows the field. Until
-- then the app treats the column as absent: the greeting uses the business
-- name and saving the field reports an error.
begin;
set local lock_timeout = '5s';

alter table public.profiles
  add column if not exists first_name text
  constraint profiles_first_name_length check (first_name is null or char_length(first_name) between 1 and 40);

comment on column public.profiles.first_name is
  'First name for the app greeting. null = not given. Written by setFirstNameAction (trimmed, 1-40 characters).';

grant select (first_name), update (first_name) on public.profiles to authenticated;

commit;
