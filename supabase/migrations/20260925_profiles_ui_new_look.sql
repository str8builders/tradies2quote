-- New-look preview switch (redesign phase 1, 2026-09-25).
--
-- One nullable column on profiles. null means "follow the default", which the
-- app reads from T2Q_NEW_LOOK_DEFAULT (off unless set to on); true or false is
-- the owner's explicit choice from Settings → "Try the new look (preview)".
-- Resolution lives in src/lib/ui/newLook.ts. While the default is off only the
-- owner can choose, and a stored value from anyone else is ignored, so turning
-- the default off is a real kill switch.
--
-- Additive and idempotent: no existing row is rewritten (the column is null
-- everywhere), and a re-run finds the column and grants already in place.
-- Not applied by this change — the lead engineer reviews and runs it.
--
-- Access. profiles uses column-level insert/update grants for `authenticated`
-- (20260906_restore_core_owner_access.sql), so the column needs its own update
-- grant; the profiles_update_own policy still limits writes to the caller's
-- own row. Select is already granted on the whole table (repeated here for the
-- column, as 20260913_quote_requests.sql does for request_slug).
--
-- Order: apply BEFORE activating an app release whose Settings page shows the
-- switch to the owner. Until then the app treats the column as absent: the
-- setting reads as "follow the default" and saving it reports an error.
begin;
set local lock_timeout = '5s';

alter table public.profiles add column if not exists ui_new_look boolean;

comment on column public.profiles.ui_new_look is
  'New-look preview choice: null = follow T2Q_NEW_LOOK_DEFAULT, true/false = explicit. Written only by setNewLookAction (owner-only while the default is off).';

grant select (ui_new_look), update (ui_new_look) on public.profiles to authenticated;

commit;
