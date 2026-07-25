# App Store Connect — submission pack (prepared 2026-07-17)

Everything to paste/enter in App Store Connect, in one place. The review
notes block is the important part — login-gated SaaS apps get rejected
fastest for "we couldn't access the app", and 4.2 (web wrapper) pushback
is pre-empted by naming the native layer explicitly.

---

## 1. App Review Information → Notes (paste verbatim)

```
DEMO ACCOUNT (fully seeded — every screen has data)
  Email:    demo@tradies2quote.com
  Password: T2Q-review-2026
The account contains quotes in every lifecycle state (draft, sent,
scheduled, completed), invoices, a client, and a stocked materials
library. Nothing needs to be created to explore, but creating works too.

WHAT THE APP IS
Tradies2Quote lets a tradesperson describe a job by voice, typed text,
or a photo of a hand-drawn plan. The app's AI pipeline turns that into
an editable quote (materials, labour, NZ GST), sends it to the client
for online acceptance, and converts accepted work into an invoice.

QUICK TEST PATH (~3 minutes)
1. Log in with the demo account. The dashboard shows a live weather-risk
   outlook for the job site (wind/rain safety for outdoor trade work).
2. Quotes → open any quote → edit a line → Save → Email sends the quote
   PDF to the client with a live accept link.
3. New (bottom nav) → Voice tab → tap record and describe any small job
   (microphone permission prompts here) → a draft quote is generated
   with calculated material quantities.
4. New → Scan tab → photograph any hand-drawn plan or sketch (camera
   permission prompts here) → dimensions are read off the drawing and
   quantities calculated from them.
5. On a quote: "Materials list" shares a quantities-only list via the
   native share sheet; "Save / back up" saves the PDF via Files.
6. Weather (account menu) → "Use my location" demonstrates the
   location-permission flow (location is requested only on that tap).
7. Settings → scroll to the bottom: in-app account deletion (5.1.1(v)).
   The flow completes end-to-end; the demo account itself is preserved
   so you can sign back in for any later review round.
8. Optional — customer chat (Guideline 1.2 controls): open any SENT
   quote → "Public link" shows the customer's view, which has an AI
   chat about the quote. Both sides of the chat pass through an
   automated content filter, the chat carries a visible "Report"
   control (reports are reviewed within 24 hours), and the tradie can
   turn any quote's chat off ("Turn chat off" in the Customer chat
   panel). The chat is labelled as AI and cannot change pricing.

NATIVE CAPABILITIES (not a website wrapper)
- Native APNs push notifications — opt-in toggle in the account menu
  ("Quote notifications"), alerts when a client accepts a quote.
- Native share sheet + native file save for quote/invoice PDFs.
- Native offline screen — Airplane-Mode launch shows a branded retry
  screen, not a browser error.
- Microphone voice capture drives the core quoting flow; camera drives
  plan scanning; location (on user tap only) drives job-site weather.
- The AI quoting pipeline (transcription, plan takeoff, quantity
  calculation, compliance notes) is the product and is exclusive to
  this app and its web companion.

BUSINESS MODEL — Guideline 3.1.3(f) free stand-alone app
The iOS app is free. It contains no in-app purchases, no subscription
offers, no pricing, and no links or references to any external purchase
flow. This is enforced SERVER-side: the app's server detects the iOS
shell and never emits pricing or billing markup to it. Some customers
use paid business features on our website; the iOS app neither
advertises nor links to those.

The app requires an internet connection (stated on its offline screen).

AI DISCLOSURE
Quote generation, plan scanning and the customer chat use third-party
AI (OpenAI, Anthropic). This is disclosed in-app, in the privacy
policy (tradies2quote.com/privacy) and terms. AI chat output is
content-filtered before display; users can report any content and the
tradie can disable a quote's chat entirely.

AUTHENTICATION — Guideline 4.8
Sign-in uses our own email/password account system only. No third-party
login providers are offered, so Sign in with Apple is not required.

Support: support@tradies2quote.com — replies within one business day.
```

---

## 2. App Information

| Field | Value |
|---|---|
| Name | Tradies2Quote |
| Subtitle (30 chars) | `Speak the job. Send the quote.` |
| Bundle ID | com.str8builders.tradies2quote |
| SKU | tradies2quote-ios |
| Primary category | Business |
| Secondary category | Productivity |
| Age rating | Answer the questionnaire honestly: the app has an AI chatbot + user-generated content (customer quote chat) WITH all three 1.2 controls (automated filter, in-app report reviewed <24 h, per-quote disable). Declare those; accept whatever rating the questionnaire computes — do not hand-pick 4+. |
| Support URL | https://tradies2quote.com/support |
| Marketing URL | https://tradies2quote.com |
| Privacy Policy URL | https://tradies2quote.com/privacy |
| Copyright | © 2026 Challis Samu / STR8 Builders |

Promotional text (170 chars, editable without review):
`Say the job out loud — get a professional quote with materials, labour and GST. Scan hand-drawn plans, send for one-tap acceptance, invoice when the work's done.`

Keywords (100 chars — no word repeated, "quote/quoting/job" deduped):
`tradie,quote,invoice,builder,estimate,voice,plumber,sparkie,chippie,GST,construction,NZ`

---

## 3. App Privacy (nutrition labels) — answers matching PrivacyInfo.xcprivacy

Data collection: **Yes**, all linked to identity, **none used for tracking**.

| Data type | Collected? | Linked | Tracking | Purpose |
|---|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | No | App Functionality |
| Contact Info → Name | Yes | Yes | No | App Functionality |
| Contact Info → Phone Number | Yes | Yes | No | App Functionality |
| User Content → Audio Data | Yes | Yes | No | App Functionality |
| User Content → Photos or Videos | Yes | Yes | No | App Functionality |
| User Content → Other User Content | Yes | Yes | No | App Functionality |
| Identifiers → User ID | Yes | Yes | No | App Functionality |
| Location → Precise Location | Yes | **Yes** (job-site weather assessments are stored on the account; purged on deletion) | No | App Functionality |

Everything else: Not collected. Tracking section: **No tracking** (no ATT
prompt needed). Third-party SDKs: none that collect data (no analytics,
no ads).

---

## 4. Archive-day checklist (after the Apple Developer membership lands)

1. Xcode → Signing: select the new team (automatic signing).
2. APNs: create the key (.p8) in the developer portal → paste
   APNS_TEAM_ID / APNS_KEY_ID / APNS_PRIVATE_KEY into the VPS
   `.env.local` (helper-script pattern) → restart. Push goes live.
3. Product → Archive. In the Organizer, inspect the archive's
   entitlements: `aps-environment` MUST read `production` (automatic
   signing flips it from the checked-in `development` — VERIFY, don't
   assume; a development value ships broken push).
4. Demo account preflight, ON THE BUILT BINARY: sign in with
   demo@tradies2quote.com / T2Q-review-2026 and run Quick Test Path
   steps 1–3 (login, open a quote, create a NEW quote — proves the
   code-level review comp is active). If the demo data was ever reset,
   re-run `node scripts/seed-demo-account.mjs` on the VPS first.
5. Validate → Distribute → TestFlight internal first; tap through the
   Quick Test Path above on a real phone, including Airplane-Mode launch
   AND one pass with Network Link Conditioner (slow network) on
   /app/settings — no pricing may ever appear.
6. Screenshots: capture a FRESH 6.9" set (1290×2796 or 1320×2868) on
   the real binary — do NOT reuse public/screens/*.jpg (720×1560 web
   mockups with a simulated status bar; screen-1 is a loading splash).
   Show: voice recorder mid-capture, a generated quote, scan→takeoff,
   native share sheet. iPhone-only → no iPad screenshots.
7. Keep `NEXT_PUBLIC_SENTRY_DSN` unset in the VPS env (it currently
   is): the App Privacy answers declare no third-party diagnostics.
   If you ever set it, update the privacy policy + App Privacy first.
8. Submit with the Section-1 notes pasted into App Review Information.

## 5. If a Guideline 4.2 question comes back anyway

Reply with (short version): the app's core creation flows are built on
device capabilities (microphone dictation, camera plan-scanning, native
share/save, push, offline handling); the binary carries native
Capacitor plugins for each; the web view is the rendering layer for a
product whose processing pipeline is server-side AI. Offer a screen
recording of the voice→quote and scan→quote flows. Do not resubmit
unchanged without replying — the response text is what reviewers weigh.
