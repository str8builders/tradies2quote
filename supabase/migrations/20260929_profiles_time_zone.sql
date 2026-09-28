-- The business's own time zone (2026-09-29). One zone per country put
-- Perth, Brisbane and Adelaide on Sydney time and most of North America on
-- Chicago or Toronto time, so the Timesheet, Calendar and Home could show
-- the wrong hours, or the wrong day.
--
-- One nullable column on profiles. The app fills it from the phone's or
-- browser's own zone (Intl) when that is a real zone in the business's
-- country, so a holiday abroad doesn't move the business
-- (saveDeviceTimeZone in src/app/app/timesheet/location-actions.ts). null =
-- not known yet: the app keeps using its country's zone (businessTimeZone
-- in src/app/app/_v2/lib/dates.ts), and so does person_time_zone
-- (20260929_location_fixes.sql). The check mirrors the app's own test of a
-- zone name, so a hand-crafted API write can't store anything else.
--
-- Additive and idempotent: no existing row is rewritten, and a re-run finds
-- the column (with its check) and the grants already in place.
--
-- Access. profiles uses column-level insert/update grants for `authenticated`
-- (20260906_restore_core_owner_access.sql), so the column needs its own
-- update grant; the profiles_update_own policy still limits writes to the
-- caller's own row.
--
-- Order: any time. Until it is applied the app reads the column as absent
-- (no stored zone: the country's zone, as before) and saving the zone
-- quietly does nothing.
begin;
set local lock_timeout = '5s';

alter table public.profiles
  add column if not exists time_zone text
  constraint profiles_time_zone_name check (
    time_zone is null
    or (char_length(time_zone) between 3 and 64 and time_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$')
  );

comment on column public.profiles.time_zone is
  'IANA time zone for this profile''s days and hours, from its own phone or browser (only zones in the profile''s country). null = use the country''s zone.';

grant select (time_zone), update (time_zone) on public.profiles to authenticated;

commit;
