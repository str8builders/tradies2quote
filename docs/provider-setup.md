# Provider setup — what to buy and where to put it

Production: Sydney VPS, app in `/srv/t2q/app`, runtime env in `/srv/t2q/app.env`
(owner `deploy`, mode 0600), service `t2q.service`. Supabase auth container
`supabase-auth`, compose dir `/srv/t2q/supabase-official/docker`.

After editing `app.env`:

```bash
sudo systemctl restart t2q.service && sleep 3 && curl -s https://tradies2quote.com/api/health
```

Never paste keys into chat, git, or the build log. `node --env-file=/srv/t2q/app.env
deploy/check-release.mjs` prints configured / blocked per feature without printing values.

## What each feature needs

| Feature customers see | Provider | Env keys in `app.env` | Cost |
|---|---|---|---|
| Quote generation (typed / voice / scan text → quote) | Anthropic Claude (recommended) **or** the on-box Qwen | `ANTHROPIC_API_KEY`, `TEXT_AI_PROVIDER=anthropic` | Sonnet 5: US$2 / 1M in, US$10 / 1M out ≈ NZ$0.03–0.08 per quote. Prepaid credit, US$5 minimum. |
| Scan a hand-drawn plan; read PDF plans; scan supplier quotes; pricing helper | Anthropic Claude (same key) | `ANTHROPIC_API_KEY` | as above |
| Voice recording → text | OpenAI transcription | `OPENAI_API_KEY` | ≈ US$0.006 per minute of audio. Prepaid credit, US$5 minimum. |
| Email a quote / invoice to the client | Resend | `RESEND_API_KEY`, `RESEND_FROM_EMAIL=quotes@tradies2quote.com` | Free: 3,000 emails/month, 100/day. Needs DNS records for tradies2quote.com added at the DNS host (Vercel DNS). |
| Password reset + signup emails | Resend SMTP via Supabase auth | `GOTRUE_SMTP_HOST=smtp.resend.com`, `GOTRUE_SMTP_PORT=465`, `GOTRUE_SMTP_USER=resend`, `GOTRUE_SMTP_PASS=<Resend key>`, `GOTRUE_SMTP_ADMIN_EMAIL=quotes@tradies2quote.com`, `GOTRUE_SMTP_SENDER_NAME=Tradies2Quote` in the Supabase compose `.env`, then `docker compose up -d supabase-auth` | Same Resend account |
| Paid subscriptions ($49 NZD Solo) | Stripe | `STRIPE_SECRET_KEY` (live), `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` (webhook to `https://tradies2quote.com/api/stripe/webhook`) | No monthly fee; ~2.7% + NZ$0.30 per card payment. Until set, every account stays on a free trial forever. |
| Text a quote by SMS | Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Optional. NZ number ≈ US$1–3/month + per message. Button is hidden until configured. |
| Push notification when a client accepts | Web push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (`npx web-push generate-vapid-keys`) | Free |
| Trial / follow-up / digest emails on a schedule | systemd timers | `CRON_SECRET` (32+ random chars) + timers hitting `/api/cron/*` | Free (needs Resend) |
| Native iPhone app in the App Store | Apple Developer Program | signing certificate, bundle `com.str8builders.tradies2quote` | US$99 / year. Not needed for the installable web apps. |

Already paid and working: domain, VPS, Supabase (self-hosted), Open-Meteo weather (free, no key).

## Quote generation: why hosted Claude

The VPS Qwen model runs on CPU at ~14 prompt tokens/s and ~4 output tokens/s. A
normal quote (2,800-token prompt, 400-token answer) takes 5–6 minutes. Since
2026-09-12 the app survives that wait (no 300 s header timeout), but the tradie
still waits minutes. With `ANTHROPIC_API_KEY` set and `TEXT_AI_PROVIDER=anthropic`
the same quote returns in roughly 10–30 s and the scan/plan features switch on
with the same key.

Alternative without Anthropic: point the OpenAI-compatible client at OpenAI —
`TEXT_AI_PROVIDER=local`, `LOCAL_LLM_BASE_URL=https://api.openai.com/v1`,
`LOCAL_LLM_MODEL=gpt-4.1-mini`, `LOCAL_LLM_API_KEY=<OpenAI key>`. Use a gpt-4.1
family model; reasoning models reject `max_tokens` and `temperature`.
