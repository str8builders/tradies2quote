# Codex prompt — Tradies2Quote follow-up fixes (13 September 2026)

Copy everything below the line into Codex.

---

You are finishing production work on Tradies2Quote, a Next.js 16 / React 19 / Supabase SaaS for NZ tradies. Work carefully, verify every claim against the live system, and never guess.

## Where things are

- Repo: `/Users/admin/Desktop/tradies2quote`, branch `snapshot/production-2026-07-26`, HEAD `7fc6104`. Read `CLAUDE.md`, `deploy/README.md`, `docs/provider-setup.md` first.
- Production: SSH alias `str8-sydney`. App `/srv/t2q/app`, env `/srv/t2q/app.env` (deploy:deploy 0600), service `t2q.service` (Next on 127.0.0.1:3001 behind Caddy), Supabase containers `supabase-db` / `supabase-auth`, compose dir `/srv/t2q/supabase-official/docker`. Health: `https://tradies2quote.com/api/health` must report the deployed commit.
- Release procedure (already proven four times this week): copy `/srv/t2q/app` to `/srv/t2q/releases/<name>` excluding `.next` and `node_modules` (hardlink `node_modules` with `cp -al`), rsync only changed source files in, write `SOURCE_COMMIT`, build as `deploy` with `set -a; . /srv/t2q/app.env; set +a; NODE_ENV=production T2Q_NO_BUILD_CACHE=1 npm run build`, then stop service, move old app to `/srv/t2q/rollback/app-<date>-<name>`, move release into place, update `APP_COMMIT_SHA` in `app.env`, start, check health and key routes. The build takes 5–10 minutes; the box is memory-tight (24 GB, swap full), so run one build at a time.
- Release check: `cd /srv/t2q/app && node --env-file=/srv/t2q/app.env deploy/check-release.mjs --auth-container supabase-auth`. Currently 18 configured; blocked: client-plan-reader, quote-deposits, client-deposits, sms. Those four are expected.
- Vault notes for context: `~/Obsidian/MySecondBrain/10-projects/tradies2quote.md` (append a dated section when you finish).

## Hard rules

1. Never print, log, commit or paste secret values. Reference env keys by name only. `.env*` files are never read into chat.
2. Ask before: any production deploy, deleting anything on the server, stopping another service, pushing to GitHub, anything in the Stripe or Vercel dashboards, any payment. Batch questions; do not stop after each one.
3. Do not modify the marketing landing page (`src/app/page.tsx`, `src/app/_components/landing/*`).
4. `npm test`, `npm run lint`, `npx tsc --noEmit` and a production build must be green before any deploy. Commit after each working change with a descriptive message.
5. Report outcomes honestly: what was verified live, what was only tested locally, what was skipped and why.

## Tasks, in order

### 1. Stripe paid lifecycle has never been exercised
Stripe is wired (restricted live key, price NZ$49, portal config, webhook secret) but there are 0 subscriptions. The first customer trial ends 18 September, so a broken webhook would lock a paying customer out.
- Read `src/app/api/stripe/webhook/route.ts`, `src/app/api/stripe/checkout/route.ts`, `src/lib/subscription.ts`. Confirm which events the webhook handles and what row it writes to `public.subscriptions`.
- The restricted key cannot list webhook endpoints (`webhook_read` missing). Ask the owner to confirm in the Stripe dashboard that the endpoint URL is exactly `https://tradies2quote.com/api/stripe/webhook`, is enabled, and subscribes to `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`.
- Prepare a live verification plan the owner runs with their own card: subscribe on `/app/upgrade`, then you confirm from the server that `/api/stripe/webhook` returned 200 in `journalctl -u t2q.service`, a `subscriptions` row exists with status `active`, and `/app/settings` shows the subscription. Then the owner cancels via the portal and you confirm the row updates. Do not submit any payment yourself.
- If the owner declines a live test, say clearly that billing remains unverified.

### 2. Legacy Vercel project still runs six cron jobs
Project `challis-projects/tradies-nz` (linked from `.vercel/project.json`, CLI works via `npx vercel@latest`) still has crons: engagement 19:00 UTC, trial-emails 20:00 UTC, weather x3, weekly-digest Sunday 20:00 UTC. They hit the old cloud Supabase database and send email through the same Resend account as production, so customers can receive duplicate or stale emails.
- Run `npx vercel@latest crons ls` to confirm.
- Recommended fix is owner-side: pause the project (Vercel → tradies-nz → Settings → Pause) or remove the cron definitions. Present that, wait for the owner, then re-run `crons ls` and show 0 jobs (or a paused project). Do not delete the project; `tradies2quote.com` is registered through Vercel and DNS lives there.

### 3. Push the work to GitHub
49 commits exist only on this Mac and the server. Remote is `git@github-str8builders:str8builders/tradies2quote.git`; `origin/main` is at `945d929`. Try `git push origin snapshot/production-2026-07-26`. If the SSH key is unavailable (permission denied), tell the owner the exact command to run and stop; do not create keys or change git config. If the push succeeds, check the GitHub Actions run (`.github/workflows/ci.yml`) and report its result.

### 4. Free server memory
Swap is 2 GB of 2 GB used and 1-minute load is around 4 on 8 vCPU. `qwen-llama.service` holds about 10 GB and CPU quota 700%; Tradies2Quote no longer uses it (`TEXT_AI_PROVIDER=anthropic`). It may still serve STR8 HUB chat.
- Ask the owner: stop and disable Qwen, or leave it. If leave, propose reducing its context from 65536 back to 8192 via the drop-in `/etc/systemd/system/qwen-llama.service.d/20-speed.conf` (a `.bak-hermes-20260830` rollback copy exists) and get approval before restarting it.
- After any change, record `free -m` and `cat /proc/loadavg` before and after.

### 5. Prune rollback and release copies
`/srv/t2q/rollback` is 17 GB (six app copies), `/srv/t2q/releases` 2.6 GB. Propose keeping `app-20260913-before-welcome` and `app-20260913-before-teams`, deleting the rest plus any leftover directories under `/srv/t2q/releases`. Also propose deleting `/srv/t2q/app.previous-*` and `/srv/t2q/redesign-6e7524f.tar.gz` if they are older than the two kept rollbacks. Delete only after explicit approval; list exact paths first.

### 6. Investigate one React #418 hydration error
`public.app_error_events` has one row at 2026-09-12 18:37:14 UTC, route `/quote/HE0ZITPJE9…`, "Minified React error #418". Static review found every date and currency formatter pinned to `en-NZ` / `Pacific/Auckland`, and the only unpinned candidate (`quoteNumber` using `new Date(createdAt).getFullYear()` in `src/lib/quote-defaults.ts`) is used in metadata only.
- Reproduce with a headless browser (Playwright is acceptable as a dev dependency only if nothing equivalent exists) against a real public quote token supplied by the owner, with the browser timezone set to `Pacific/Auckland` and then to `Europe/Berlin`, and capture console errors.
- If it reproduces, fix the source and add a regression test. If it does not, write the evidence in your report and leave the code alone.

### 7. Restore the transcript summary on the hosted provider
`src/lib/transcriptCleanup.ts` `buildSummary` only runs when `TEXT_AI_PROVIDER=local`; on Claude it returns `null` and the quote's transcript panel loses the structured job summary and compliance risks. Add an Anthropic path mirroring `src/lib/llm/anthropic-quote.ts` (raw `fetch` to `https://api.anthropic.com/v1/messages`, model from `ANTHROPIC_QUOTE_MODEL` defaulting to `claude-sonnet-5`, `TIMEOUTS.llm`, same JSON parsing through `parseModelJsonObject`). Constraints: `transcriptCleanup.ts` is imported by client components through type-only imports, so it must not import `server-only` modules or `node:*`; keep the existing `callAnthropic` test seam working; keep `TRANSCRIPT_SUMMARY=off` as an override. Add tests. Then remove `TRANSCRIPT_SUMMARY=off` from `/srv/t2q/app.env` at deploy time and verify a fresh quote stores `transcript.summary` (owner generates it; you check the row).

### 8. Stop customer emails going out as "Your business"
`quotes/send` currently emails with subject "Quote Q-… from Your business" when `profiles.business_name` is empty (seen live yesterday). Change the send and PDF paths so that an empty business name blocks sending with a clear message linking to Settings, and add a test. Keep the dashboard nudge that already exists in `src/app/app/page.tsx`.

### 9. Small server hygiene (no approval needed, reversible)
- Add `GOTRUE_MAILER_EXTERNAL_HOSTS=api.tradies2quote.com` handling: set `MAILER_EXTERNAL_HOSTS` (check the exact variable name in `/srv/t2q/supabase-official/docker/docker-compose.yml`) in the Supabase `.env`, then `docker compose up -d auth`, and confirm the "external host" info log stops.
- Confirm all four `t2q-*.timer` units are enabled and their next fire times are in Pacific/Auckland as intended.

### 10. Final report
Produce `docs/status-2026-09-13.md` with three sections: verified live (with commit, timestamps and evidence), changed in this session (commits, deploys, rollback paths), still open with owner actions. Append the same summary as a dated section to the vault note. Do not claim anything passed that you did not observe.
