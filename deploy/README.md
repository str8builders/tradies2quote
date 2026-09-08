# Tradies2Quote — existing Sydney production release

This replaces the historical fresh-VPS/Vercel migration instructions. The user
approved the audit repairs and deployment on **8 September 2026**. Server access was restored on 8 September. A restricted database backup was
verified, the three core repair migrations and private T2QCAL saved-working
table were applied, and disposable native handoff/owner-isolation tests passed.
The two-web-app release is being built and checked before activation. External
AI, quote-email, billing, SMS, scheduler and push configuration remains incomplete.

## Known deployment (last inspected 8 September 2026)

| Component | Existing destination |
|---|---|
| Server | SSH alias `str8-sydney`, then 46.250.240.146 |
| App / environment | `/srv/t2q/app` / `/srv/t2q/app.env` |
| Process | `t2q.service`, Next.js at 127.0.0.1:3001 behind Caddy |
| Website | https://tradies2quote.com |
| Supabase API | https://api.tradies2quote.com |
| Postgres | Docker container `supabase-db`, database `postgres` |
| Separate native app | T2QCAL, `com.t2qcal.app`; shares accounts and quote drafts |

Recheck the live service, its working directory/launch command and current app
revision before using these paths. Preserve changes made since the audit. Do not
print the external environment, container environment, credentials or customer
records to logs. The old host `84.247.170.160`, `nursemate-vps`, old Docker app
compose file and an empty-database rebuild are not this release procedure.

## Release gates

1. **Access and recovery:** confirm server access, service identity, available disk,
   current application revision and an existing rollback directory. Back up the
   existing database with a restricted custom-format dump and verify its archive
   listing before schema changes. Preserve private storage and the external env.
2. **Configuration:** run the command below using the existing app environment and
   the actual GoTrue container name. It prints setting names/statuses only. A local
   text model does not provide the Anthropic plan routes or OpenAI photo/voice
   routes. Resend quote email and Supabase signup/reset SMTP are separate services.
   Provide real account configuration and exercise the enabled features; do not
   treat placeholders, test Stripe keys or disabled client flags as a full release.
3. **Database:** apply only the reviewed three `20260906_restore_*` migrations in
   the audit's `repair.sql` transaction. Recheck duplicate/JSON preconditions since
   the original rehearsal. This repair retains customer records. Unexpected data
   or locks must abort. The normal migration runner must not replay the historical
   migration directory against this reconstructed database.
4. **Application:** stage the reviewed source into a new release directory, excluding
   `.git`, dependencies, generated builds and all `.env*` files. Run `npm ci`, the
   tests, lint and production build there. Use the real public Supabase/app values
   at build time because Next.js embeds `NEXT_PUBLIC_*` values. Keep production
   serving throughout the build. Retain build logs and source checksums.
5. **Acceptance:** run the disposable native quote fixture through authentication,
   owner insert/read, other-account denial, retry/conflict handling and the signed-in
   website preview. Test representative text/voice/photo/plan inputs, quote edits,
   quantity totals, private evidence, PDF output, and test-mode provider/webhook
   flows. Customer messages or live payments require their own intended recipients
   and transactions; deployment authorisation is not permission to send them.
6. **Activation:** after gates pass, stop `t2q.service` briefly, retain the old app
   directory, move the staged release to the configured app location, and restart.
   Use the verified service account/ownership and existing systemd environment.
   This directory swap involves a brief interruption; do not describe it as zero
   downtime. Confirm the expected revision from `/api/health`, auth, protected
   routes, quote creation/reopen, public quote view and PDF output. The health
   endpoint alone only proves that the Next.js process answers.

Read-only local checks (Node 22+):

```sh
npm run release:test
```

Read-only server configuration inventory (replace `ACTUAL_GOTRUE_CONTAINER` with
its inspected name; do not assume it shares the database container's name):

```sh
node --env-file=/srv/t2q/app.env deploy/check-release.mjs --auth-container ACTUAL_GOTRUE_CONTAINER
```

The preflight makes no network requests, sends nothing, and writes no settings.
It checks static configuration, not provider account entitlements or delivery.
Exit 0 means **configuration present**, 1 means **blocked configuration**, and 2
means the inventory itself could not run. The returned `notVerified` list remains
outstanding even when all configuration checks pass. Its scope is the complete
client feature set requested for this audit, including plan reading and deposits.
Enable those flags only after their respective acceptance checks pass.

The legacy migration runner's `DRY_RUN=1` now performs SELECTs only, including
when the tracking table does not yet exist. Do not interpret its pending list as
approval to execute all historical migrations on Sydney.

## Recovery

Before activation, record the exact previous app path and source revision. If app
acceptance fails, stop the service, retain the failed release for diagnosis,
restore the previous app directory to its configured location and start it again.
Verify health and representative authenticated reads. Keep the database backup
private and preserve storage files. A post-commit database reversal is a separate
operation: assess compatibility and use a reviewed corrective migration or a
coordinated backup restore, accounting for writes made since that backup.

## Native distribution

T2QCAL remains the existing SwiftUI app. The web source package does not publish
it to the App Store. Integrate the reviewed native patch, complete a current Xcode
build and simulator/device checks, configure the correct Apple team and bundle,
then validate a signed archive/TestFlight build and App Store metadata/privacy.
Camera, microphone, RoomPlan/LiDAR, AR accuracy and account/private-document flows
need real-device verification before client release.
