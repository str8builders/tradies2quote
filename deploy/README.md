# tradies2quote — VPS self-hosting runbook

Move the app off Vercel and the database off Supabase Cloud onto **one VPS**,
running the Next.js app + a **self-hosted Supabase stack** behind Caddy (auto-HTTPS).

```
Internet ──▶ Caddy (:443)
              ├── tradies2quote.com      ──▶ app        (Next.js standalone :3000)
              └── api.tradies2quote.com  ──▶ kong :8000 ──▶ Supabase (Auth/PostgREST/Storage/Realtime) ──▶ Postgres
```

Everything in this `deploy/` folder is the app + proxy layer. The Supabase
services come from the **official** `supabase/docker` stack (you never
hand-write those — they change often and are easy to get subtly wrong).

---

## What you need before starting (the 2 blockers)

1. **A VPS** — Ubuntu 22.04/24.04, ≥ 4 GB RAM (Supabase's ~10 containers + the
   app need headroom; 8 GB comfortable), Docker + Docker Compose installed,
   ports 80/443 open. Give Claude SSH access (key-based) **or** run the steps
   yourself with Claude guiding.
2. **Secrets** — the values currently in your Vercel project
   (Settings → Environment Variables): OpenAI, Anthropic, Stripe, Resend,
   Twilio, VAPID. Copy them into `deploy/.env.vps`.

> **No data migration needed** (decided 2026-07-12): the cloud Supabase data
> was test-only, so the VPS starts with a **fresh, empty database** — schema
> comes from the repo's migrations (Step 7). The paused cloud project
> `guiovuqccbzlbacaxepd` can stay paused; Step 8 is skipped.

---

## Step 1 — DNS

Point these A records at your VPS public IP:

| Record | Purpose |
|---|---|
| `tradies2quote.com` | the app |
| `www.tradies2quote.com` | redirects to apex |
| `api.tradies2quote.com` | self-hosted Supabase API |

Caddy provisions TLS automatically on first hit once DNS resolves.

## Step 2 — Get the code onto the VPS

```bash
git clone https://github.com/str8builders/tradies2quote.git
cd tradies2quote
```

## Step 3 — Stand up the official Supabase stack

```bash
# Official self-hosted Supabase (canonical, maintained).
git clone --depth 1 https://github.com/supabase/supabase deploy/supabase-official
cd deploy/supabase-official/docker
cp .env.example .env
```

Now edit that `.env` and set, at minimum:

- `POSTGRES_PASSWORD` — strong password.
- `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` — generate as a matched set with
  the Supabase JWT generator (https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys).
- `SITE_URL=https://tradies2quote.com`, `API_EXTERNAL_URL=https://api.tradies2quote.com`,
  `SUPABASE_PUBLIC_URL=https://api.tradies2quote.com`.
- SMTP settings if you want Supabase to send its own auth emails (optional —
  the app also sends via Resend).

Start it:

```bash
docker compose up -d
docker network ls        # note the network name, usually `supabase_default`
cd ../../..              # back to repo root
```

## Step 4 — Configure the app env

```bash
cp deploy/.env.vps.example deploy/.env.vps
```

Fill `deploy/.env.vps`:

- **Supabase (section A):** set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the
  `ANON_KEY` and `SUPABASE_SERVICE_ROLE*` = the `SERVICE_ROLE_KEY` you generated
  in Step 3. Set `SUPABASE_NETWORK` to the network name from `docker network ls`.
- **Third-party keys (section C):** paste from Vercel.
- Generate the ones marked: `CRON_SECRET` (`openssl rand -hex 32`) and, if you
  don't already have them, VAPID keys (`npx web-push generate-vapid-keys`).

> The `NEXT_PUBLIC_*` values are **baked into the build**, so they're passed as
> build args automatically by the compose file — just make sure they're correct
> in `.env.vps` before building.

## Step 5 — Set the domains in the proxy

Edit `deploy/Caddyfile` — replace `tradies2quote.com` / `api.tradies2quote.com`
if your domains differ.

## Step 6 — Build & run the app + proxy

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.vps up -d --build
docker compose -f deploy/docker-compose.yml logs -f app     # watch it boot
curl -fsS https://tradies2quote.com/api/health              # should return JSON
```

## Step 7 — Create / update the schema on the self-hosted DB

Use the tracked migration runner (idempotent — applies only files it hasn't
applied before, in name order, and records them in
`public._applied_migrations`):

```bash
DRY_RUN=1 ./deploy/apply-migrations.sh   # list what would run
./deploy/apply-migrations.sh             # apply pending migrations
```

**Run this on every deploy that adds files to `supabase/migrations/`** —
the rsync deploy ships app code only, so a forgotten migration means the app
hits a schema that doesn't match.

One-time baseline for a database that already has the schema (created before
the runner existed): insert the already-applied filenames into
`public._applied_migrations` first, so the runner doesn't re-apply them.

## Step 8 — Copy the data from Cloud Supabase  ⟵ SKIPPED (test data only)

**Not needed for this migration** — the cloud data was test-only, so we start
fresh. Kept below in case you ever want it. It requires `guiovuqccbzlbacaxepd`
to be restored (currently paused/billing-blocked):

```bash
# Dry run first — dumps only, writes nothing:
SOURCE_DB_URL='postgresql://postgres:PASS@db.guiovuqccbzlbacaxepd.supabase.co:5432/postgres' \
  ./deploy/migrate-supabase.sh

# Inspect deploy/_dump/*.sql, then apply:
SOURCE_DB_URL='...' TARGET_DB_URL='postgresql://postgres:PASS@VPS_IP:5432/postgres' \
  APPLY=1 ./deploy/migrate-supabase.sh
```

Then copy the **storage files** for the `signatures` bucket (the script moves
only the DB rows) — see the note the script prints on completion.

## Step 9 — Point Stripe / webhooks at the new host

- Update Stripe webhook endpoints to `https://tradies2quote.com/api/payments/webhook`
  (and the subscriptions webhook), then refresh `STRIPE_*_WEBHOOK_SECRET`.
- Update any Resend/Twilio callback URLs similarly.
- Re-issue OAuth redirect URLs in Supabase Auth config to the new `api.*` host.

## Step 10 — Cut over & verify

Smoke-test end-to-end before flipping DNS TTL down:

- [ ] Landing page loads over HTTPS
- [ ] **Sign up + log in** (auth against self-hosted GoTrue)
- [ ] Create a quote (OpenAI/Anthropic calls succeed)
- [ ] Public `/quote/[token]` accept + **signature upload** (storage works)
- [ ] Stripe checkout + webhook received
- [ ] `/api/health` green

---

## Rollback

Vercel stays live and untouched until you flip DNS. If anything fails, point
DNS back to Vercel. (No cloud data is at risk — the migration doesn't touch
the old Supabase project at all.)

## Notes / gotchas

- **RAM:** the Supabase stack is heavy. If the VPS is < 4 GB, expect OOM. Add
  swap or size up.
- **Backups:** set up `pg_dump` cron on the VPS Postgres — you're now your own
  DBA. Supabase Cloud's automatic backups won't cover you anymore.
- **Sentry** is optional and stays a no-op unless you set `NEXT_PUBLIC_SENTRY_DSN`.
- The app reads either `SUPABASE_SERVICE_ROLE` or `SUPABASE_SERVICE_ROLE_KEY` —
  `.env.vps` sets both to the same value.
