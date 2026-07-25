-- Wave 46 — APNs (iOS App Store shell) push subscriptions.
--
-- Web Push (service worker + VAPID) does not exist inside WKWebView, so
-- the iOS shell registers through Apple's push service instead. Rather
-- than a sibling table, the existing `push_subscriptions` grows a
-- `platform` discriminator:
--
--   * platform='web' — endpoint + p256dh + auth (unchanged behaviour)
--   * platform='ios' — endpoint holds the APNs DEVICE TOKEN; the two
--     VAPID key columns are irrelevant and stay null
--
-- The sender (src/lib/push.ts) branches on platform; iOS rows go out
-- via APNs HTTP/2 (src/lib/apns.ts) once the APNS_* env keys are set.
--
-- Why this is safe:
--   * platform defaults to 'web' — every existing row keeps working.
--   * p256dh/auth become nullable (no-op for existing non-null rows);
--     the web subscribe route still requires them at the API layer.
--   * Upsert-on-endpoint stays the dedupe key — APNs tokens are unique
--     per device+app the same way endpoints are per browser.

alter table public.push_subscriptions
  add column if not exists platform text not null default 'web';

do $$ begin
  alter table public.push_subscriptions
    add constraint push_subscriptions_platform_chk
    check (platform in ('web', 'ios'));
exception when duplicate_object then null; end $$;

alter table public.push_subscriptions alter column p256dh drop not null;
alter table public.push_subscriptions alter column auth drop not null;

comment on column public.push_subscriptions.platform is
  'web = browser Web Push (endpoint+p256dh+auth); ios = APNs (endpoint holds the device token).';
