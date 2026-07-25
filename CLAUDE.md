# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**tradies2Quote** — voice/type/form AI quoting and invoicing SaaS for tradies (builders, plumbers, sparkies, painters, landscapers, roofers) in NZ, AU, UK, US, CA. Built by Challis Samu, qualified builder running STR8 Builders in Tauranga, NZ.

**Current phase:** MVP build, voice flow Stage 1 in progress. The full product spec lives in [tradies2quote-build-prompt.md](tradies2quote-build-prompt.md) — read it before starting a new phase.

## ⚠ This is Next.js 16 — not the version you were trained on

Concrete breaking changes that bite if you reach for older patterns:

- **`src/proxy.ts`** replaces `middleware.ts`. The exported function is `proxy`, not `middleware`. The `matcher` config still lives there.
- **`cookies()`, `headers()`, and route `params` are async.** Always `await cookies()` from `next/headers` (see `src/lib/supabase/server.ts`).
- **Turbopack is the default builder.** It refuses to follow `node_modules` symlinks that resolve outside the project root, so each worktree needs its own `npm install`.
- **Tailwind CSS v4** — design tokens live in an `@theme {}` block in `src/app/globals.css`, not in `tailwind.config.js`.
- **React 19** — server components by default; mark client components with `"use client"`.

Before adding APIs you haven't used in this codebase yet (route handlers, server actions, file conventions, caching directives), consult the bundled docs at `node_modules/next/dist/docs/01-app/`. Heed deprecation notices.

## Stack

- **Framework:** Next.js 16.2.4 (App Router) + React 19.2.4 + TypeScript strict
- **Styling:** Tailwind CSS v4 + Phosphor icons (no emojis in UI)
- **Auth/DB/Storage:** Supabase via `@supabase/ssr` — project id `guiovuqccbzlbacaxepd`
- **AI:** OpenAI Whisper (transcription) and Anthropic Claude `claude-sonnet-4` (quote generation, planned). Prefer `fetch` over SDKs where the API surface is small.
- **Hosting:** self-hosted VPS (84.247.170.160) — `tradies2quote.com` DNS points there; Caddy → systemd `tradies2quote.service` (`next start` on 127.0.0.1:3001) + self-hosted Supabase docker stack (`tradies-supabase-*`, kong on :8100). The old Vercel project `tradies-nz` is legacy/rollback only.
- **Planned later:** Stripe (subscriptions), Resend (email), react-pdf or pdf-lib (PDF generation)

Avoid adding dependencies unless absolutely necessary.

## Architecture

```
src/
├── app/
│   ├── page.tsx              — marketing landing (server-rendered)
│   ├── _components/landing/  — landing-only components
│   ├── (auth)/               — login, signup, forgot-password, reset-password
│   ├── app/                  — protected app pages (dashboard, /app/quotes/new, …)
│   ├── api/                  — route handlers (POST /api/quotes/transcribe, …)
│   ├── auth/callback/        — Supabase OAuth/magic-link return
│   └── globals.css           — Tailwind v4 @theme tokens + design system utilities
├── lib/supabase/
│   ├── client.ts             — browser client
│   ├── server.ts             — server client (await cookies())
│   └── middleware.ts         — session refresh helper, called from proxy.ts
└── proxy.ts                  — Next 16 proxy: refreshes session, gates /app/*
```

`proxy.ts` already protects `/app/*`; auth-protected pages still call `await supabase.auth.getUser()` and `redirect("/login")` as defense-in-depth — see `src/app/app/page.tsx` for the canonical pattern.

## Conventions

- **Server components by default**; `"use client"` only when state, refs, or browser APIs are needed.
- **Server Actions for form submissions** (Next 16 idiomatic) — see `src/app/(auth)/login/actions.ts`.
- **All new tables: RLS enabled, scoped by `auth.uid() = user_id`.** Never accept user IDs from the client — read them from `auth.getUser()` server-side.
- **Mobile-first**, minimum 44 px tap targets, one-handed thumb-friendly layouts.
- **Phosphor icons, not emojis** in any UI surface.

### Design system (defined in `src/app/globals.css`)

- Colours: `bg-ink-900` (#111) base, `bg-ink-950` (#0A0A0A) deep, `text-brand` (#FF5F15) orange, `text-hivis` (#FFEA00) yellow, `text-ink-{300,400,500}` for muted text. Full `ink` and `brand` scales available.
- Typography: `font-display` (Archivo Black, uppercase) for headings, `font-mono` (IBM Plex Mono) with `tracking-[0.2em]` for `// EYEBROW` labels, IBM Plex Sans body.
- Components: `t2q-btn-primary`, `t2q-btn-ghost`, `t2q-card`, `t2q-section-label`, `t2q-shadow-brutal`.
- **Eyebrow labels must be written `{"// label"}` in JSX** (the linter rejects raw `// label` as a comment-text-node).

Semantic tokens (`bg-background`, `text-ink`, `bg-surface`) were never defined in `@theme` and have been fully cleaned out of auth/dashboard files (verified 2026-07-10) — use the landing/design-system tokens above for new pages.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | local dev server (Turbopack), `http://localhost:3000` |
| `npm run build` | production build — run at the end of every chunk, expect zero errors |
| `npm run lint` | ESLint with the Next preset |
| `npm test` | vitest unit tests (also run in CI on every push) |
## Deploy model (VPS — since 2026-07)

Production runs on the owner's VPS (84.247.170.160, ssh alias `nursemate-vps` /
user `deploy`), NOT Vercel. GitHub pushes deploy nothing. The zero-downtime
update path (ask the owner before any production deploy):

1. `cp -r ~/tradies2quote ~/tradies2quote-release && rm -rf ~/tradies2quote-release/{.next,node_modules}` on the VPS (preserves `.env.local`).
2. rsync the local working tree → `~/tradies2quote-release/`, excluding
   `.git node_modules .next .env* .claude .vercel coverage tsconfig.tsbuildinfo`.
3. `npm ci && npm run build` in the release dir (live app keeps serving).
4. Apply any new `supabase/migrations/*.sql` (see `deploy/apply-migrations.sh`).
5. `sudo systemctl stop tradies2quote && mv ~/tradies2quote ~/tradies2quote.previous-$(date +%Y%m%d%H%M%S) && mv ~/tradies2quote-release ~/tradies2quote && sudo systemctl start tradies2quote`.
6. Verify `https://tradies2quote.com/api/health` + key routes return 200.

Rollback: stop the service, `mv` the `previous-*` dir back, start.
Runtime env/secrets live ONLY in `/home/deploy/tradies2quote/.env.local` on the
VPS (never in git, excluded from rsync). Cron jobs run as systemd timers
(`tradies2quote-cron@<name>.timer` → curl the `/api/cron/*` route with
`CRON_SECRET`); daily DB+storage backups via `tradies2quote-backup.timer` to
`/var/backups/tradies2quote` (14-day retention).

Legacy: the Vercel project `tradies-nz` still exists for rollback history; the
old `vercel deploy --prod` path and the `str8685` deploy-mirror notes are
retired. `knockoff.app` is a separate Vercel project and is unaffected.

## Scope boundaries

Out of scope for the MVP — do not build:
- Live supplier price scraping
- Xero / MYOB / QuickBooks integrations
- Multi-language, white-label, native mobile apps

**Now in scope (opted in by the owner):** lightweight **job scheduling** — a quote can carry a job date (`quotes.scheduled_for`, set via the date picker on the LifecycleCard schedule step) and the dashboard shows a month **calendar** (`src/app/app/_components/ScheduleCalendar.tsx`) of scheduled jobs plus personal day-**notes** (`calendar_notes` table, owner-only RLS). Full job management / time tracking is still out.

Do **not** modify the marketing landing page (`src/app/page.tsx` and `src/app/_components/landing/*`) without an explicit request.

## Observability (current posture)

Primary error monitoring is the **internal Supabase sink**, not Sentry:
`captureError()` (`src/lib/observability.ts`) writes scrubbed, fingerprinted rows to
`app_error_events` / `app_error_groups` via the `record_app_error` RPC, off the hot
path and failure-safe. Browser errors flow through `/api/internal/client-error`
(per-IP rate-limited, works for anonymous users on the public quote page). The
owner-only dashboard lives at `/app/debug`. Sentry is wired but **optional** — every
Sentry side effect is env-gated and a no-op when `NEXT_PUBLIC_SENTRY_DSN` /
`SENTRY_*` are absent. When adding a catch block on an API route, call
`captureError(e, { route })` alongside `console.error`.

## AI eval loop (Wave 40)

Every quote save logs an AI-vs-tradie diff so prompt improvements can be grounded in evidence instead of guessing.

- `quotes.ai_snapshot` (JSONB, nullable) — frozen QuoteData written ONCE in `/api/quotes/generate`. Never mutated afterwards; `quote_data` is the live editable copy.
- `quote_edit_events` — one row per `saveQuoteChanges` call. Holds `edited_data` (user's saved version) and `diff` (structured before/after vs `ai_snapshot`).
- Diff is computed by `src/lib/quoteEditDiff.ts` — matches lines by `library_id` → description → position, emits per-field changes plus removed/added line counts.

Read patterns the AI gets wrong (e.g. "what fields are corrected most"):
```sql
select field->>'name' as field_name, count(*)
from quote_edit_events,
  jsonb_array_elements(diff->'modified') as line,
  jsonb_array_elements(line->'fields') as field
group by field->>'name' order by count(*) desc;
```

When fixing a recurring AI mistake, prefer a clean-room rule in the system prompt (we can't legally ingest copyrighted manuals from GIB / James Hardie / MiTek into a commercial product). The facts themselves aren't copyrightable.

## Working preferences

- **Scoped chunks**, not one-shot builds. Stage 1, Stage 2, etc. — finish one before touching the next.
- **Show the file plan before writing code** — files to create/edit + one-line purpose each.
- **Ask before risky/irreversible commands**: deletes, force-pushes, deploys, destructive migrations.
- **`npm run build` at the end of every chunk** — zero errors before declaring a chunk done.
- **Commit after every working feature** with a descriptive message.

## References

- [tradies2quote-build-prompt.md](tradies2quote-build-prompt.md) — full product spec; consult before starting a new phase
- [tradies2quote-setup-guide.md](tradies2quote-setup-guide.md) — Supabase / Stripe / Resend setup steps
- `node_modules/next/dist/docs/01-app/` — bundled Next.js 16 docs
