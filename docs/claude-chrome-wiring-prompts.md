# Claude in Chrome prompts — wiring the paid providers

Claude in Chrome can navigate dashboards, find the right pages and copy IDs for you,
but it will stop and hand over to you for account creation, payments, passwords and
pasting secret keys. That is by design. Do those steps yourself, then tell it "done".

Nothing goes live until the keys are in `/srv/t2q/app.env` on the server and the
service is restarted (final step at the bottom). Keep keys out of chat and git.

---

## Prompt 1 — Anthropic (fast quotes + plan/drawing scanning)

```
Help me set up an Anthropic API key for my app Tradies2Quote.
1. Open https://console.anthropic.com and tell me whether I'm signed in. If not, stop and let me sign in or create the account myself.
2. Go to Plans & Billing. Tell me the current credit balance. If it is $0, take me to the add-credit page and stop — I'll add US$10 myself.
3. Go to API Keys and open the "Create key" dialog. Stop before creating it. I will create a key named "tradies2quote-prod" and copy it into my password manager myself.
4. Confirm the workspace default is the production workspace and that no spend limit below US$20/month is set. If there is one, show me where to change it.
Do not enter any payment details and do not copy the key anywhere.
```

Server line for later: `ANTHROPIC_API_KEY=<key>` and `TEXT_AI_PROVIDER=anthropic`.

## Prompt 2 — OpenAI (voice recording to text)

```
Help me set up an OpenAI API key for voice transcription in my app Tradies2Quote.
1. Open https://platform.openai.com and tell me whether I'm signed in. If not, stop and I'll sign in.
2. Go to Settings → Billing. Tell me the credit balance. If it is $0, take me to "Add to credit balance" and stop — I'll add US$10 myself.
3. Go to API keys and open "Create new secret key". Stop before creating it. I'll create one called "tradies2quote-prod" with default permissions and save it myself.
4. Check that the model gpt-4o-transcribe is available on my account (Settings → Limits or the Models page) and tell me.
Do not enter payment details and do not copy the key anywhere.
```

Server line for later: `OPENAI_API_KEY=<key>`.

## Prompt 3 — Resend (emailing quotes/invoices + password reset emails)

```
Help me set up Resend so my app Tradies2Quote can send email from quotes@tradies2quote.com.
1. Open https://resend.com and tell me whether I'm signed in. If not, stop and I'll sign up (free tier).
2. Go to Domains → Add Domain, enter tradies2quote.com, region closest to Sydney, and stop before confirming so I can click Add.
3. After I add it, read the DNS records Resend wants (the MX, SPF TXT and DKIM TXT rows). List each one as: type, name/host, value, priority. Keep the tab open.
4. Open my DNS host for tradies2quote.com in a new tab (Vercel → the tradies2quote.com domain → DNS records). For each Resend record, open the "Add record" form and fill it in, but stop before saving each one so I can confirm.
5. Back in Resend, click Verify and tell me when every record shows Verified (it can take a few minutes; re-check twice).
6. Go to API Keys → Create API Key. Stop before creating. I'll create one named "tradies2quote-prod" with Sending access and save it myself.
Do not create the key yourself and do not paste it anywhere.
```

Server lines for later:
`RESEND_API_KEY=<key>`, `RESEND_FROM_EMAIL=quotes@tradies2quote.com`, `FEEDBACK_EMAIL=challis836@gmail.com`.

Password-reset emails use the same key through Supabase's SMTP (see the final step).

## Prompt 4 — Stripe (taking the $49 NZD/month)

```
Help me set up Stripe billing for my app Tradies2Quote. Work in LIVE mode, not test mode, and tell me which mode the dashboard is in before each step.
1. Open https://dashboard.stripe.com and tell me whether I'm signed in and whether the account is fully activated for live payments. If sign-in or activation is needed, stop and I'll do it.
2. Product catalogue → Add product. Fill in: name "Tradies2Quote Solo", description "AI quoting and invoicing for one tradie", recurring price NZ$49.00 per month, tax behaviour "inclusive". Stop before saving so I can confirm.
3. After I save, open the price and read me the Price ID (starts with price_). 
4. Settings → Customer portal: turn on "Cancel subscriptions" and "Update payment method", save.
5. Developers → Webhooks → Add endpoint. URL https://tradies2quote.com/api/stripe/webhook . Events: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed. Stop before saving so I can confirm.
6. After I save, open the endpoint and show me where the Signing secret (starts with whsec_) is revealed. Don't reveal or copy it — I'll do that.
7. Developers → API keys: show me where the live Secret key is. Don't reveal or copy it.
Do not enter bank or card details anywhere.
```

Server lines for later:
`STRIPE_SECRET_KEY=<sk_live_…>`, `STRIPE_PRICE_ID=<price_…>`, `STRIPE_WEBHOOK_SECRET=<whsec_…>`.

## Prompt 5 — check what's live (after the server step)

```
Open https://tradies2quote.com and check these pages, telling me exactly what you see:
1. Sign in with the account I'm already logged into in this browser (don't type a password; if I'm not signed in, stop and I'll sign in).
2. Go to New quote. Tell me which tabs appear: Voice, Type, Scan.
3. On the Type tab, enter: "Replace 12 metres of timber fence, 1.8 high, treated pine palings, two new posts in concrete, remove old fence and dump." Continue and time how long the quote takes to generate. Report the total and the line items.
4. On the quote preview, click Send by email and tell me whether it asks for a client email or shows an error. Stop before actually sending.
5. Go to Settings and tell me whether a "Manage subscription" or upgrade link is shown.
```

---

## Final step — you, in Terminal (not Claude in Chrome)

Paste the keys into the server env file. One line per key, no quotes, no spaces around `=`.

```bash
ssh str8-sydney 'sudo nano /srv/t2q/app.env'
```

Add or change:

```
TEXT_AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=quotes@tradies2quote.com
FEEDBACK_EMAIL=challis836@gmail.com
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
```

Restart and check:

```bash
ssh str8-sydney 'sudo systemctl restart t2q.service && sleep 4 && curl -s https://tradies2quote.com/api/health && echo && cd /srv/t2q/app && node --env-file=/srv/t2q/app.env deploy/check-release.mjs | grep -B1 blocked | grep id'
```

Anything still listed as blocked is not wired yet.

Password-reset emails (Supabase auth SMTP), same Resend key:

```bash
ssh str8-sydney 'sudo nano /srv/t2q/supabase-official/docker/.env'
```

Set:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<the Resend API key>
SMTP_ADMIN_EMAIL=quotes@tradies2quote.com
SMTP_SENDER_NAME=Tradies2Quote
```

Then:

```bash
ssh str8-sydney 'cd /srv/t2q/supabase-official/docker && sudo docker compose up -d auth'
```

Test it by clicking "Forgot password" on tradies2quote.com/login with your own email.

---

## Prompt 6 — GitHub SSH key (so the 58 unpushed commits can go up)

```
Add an SSH authentication key to my GitHub account so my Mac can push to the repository str8builders/tradies2quote.
1. Open https://github.com/settings/keys and tell me which account is signed in (top-right avatar). It must be str8builders. If it is a different account, stop and let me switch.
2. Click "New SSH key". Set Title to "MacBook Air". Set Key type to "Authentication Key" (NOT Signing Key).
3. Paste exactly this into the Key box, as one line:
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBNStSs20gVqGUM0/8uAKeBeQPxOin1Y5KUGVLnlneN7 challis836@gmail.com str8builders
4. Click "Add SSH key". If GitHub asks to confirm my password or 2FA, stop and let me do that, then continue.
5. If GitHub says "Key is already in use", do NOT retry. Instead open https://github.com/str8builders/tradies2quote/settings/keys, tell me what deploy keys are listed, delete the one whose fingerprint is SHA256:cw+qKwVM9eH8crzSFgtSYruep2qVrU80nnvzH92e++4 if present, then click "Add deploy key", paste the same key, tick "Allow write access", and add it.
6. Finish by showing me the keys page with the new key listed.
Do not change any other settings and do not enter passwords yourself.
```

After it reports success, run in Terminal:

```bash
ssh -T git@github-str8builders
```

It should say "Hi str8builders! You've successfully authenticated". Then push:

```bash
cd ~/Desktop/tradies2quote && git push origin snapshot/production-2026-07-26
```
