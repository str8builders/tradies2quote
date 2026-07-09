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
- **Hosting:** Vercel project `tradies-nz` — production aliases `tradies2quote.com` and `tradies-nz.vercel.app`. **`knockoff.app` is a separate Vercel project** (`knockoff`) — `vercel --prod` from this repo does NOT touch it.
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
| `git push origin main` | preview deployment via the Vercel GitHub integration |
| `git push origin prod-shell` | **PRODUCTION deployment** — ask the owner first (see Deploy model) |

## Deploy model

**⚠ Corrected 2026-06-12 — the Git integration claim below was wrong again.** The
`tradies-nz` Vercel project has **NO Git link** (`link: null` on the project API);
pushes to GitHub deploy NOTHING. Verified exhaustively (pushed `prod-shell`, zero
builds; GitHub deployment-events count: 0 forever).

**The working deploy path: `vercel deploy --prod --yes` from the repo root**
(commit first; the CLI uploads the working tree). `/api/health` then reports the
local commit SHA. `vercel rollback` is the emergency rollback tool — see LAUNCH.md.
Ask the owner before any production deploy.

**Why the integration is broken (two GitHub accounts):** the Vercel account's
GitHub OAuth identity is `str8685`, but the repo lives under `str8builders` — a
SEPARATE personal GitHub account. Vercel only surfaces namespaces/installations
visible to its single OAuth identity, so `str8builders/tradies2quote` can never be
linked directly. A deploy mirror **`str8685/tradies2quote`** exists (keep it synced:
`git push https://github.com/str8685/tradies2quote.git main:main main:prod-shell`);
linking it in Vercel still requires the str8685 GitHub App installation
(63277212, "selected repos") to be granted access to that repo — a str8685
web-session-only action. `gh` CLI has BOTH accounts (`gh auth switch -u str8685`).
str8685 has admin on the str8builders repo and vice versa.

Per-deployment URLs from older deploys keep serving their frozen content forever —
that's by design. `knockoff.app` lives in a different Vercel project and is unaffected.

Set runtime env vars (`OPENAI_API_KEY`, etc.) in Vercel project settings →
Environment Variables. Local dev reads `/Users/str8685/Desktop/tradies2quote/.env.local`.

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
