# App Store Connect — submission pack (updated 2026-09-26)

Everything to enter in App Store Connect, in one place. The review notes
block is the important part: login-gated apps get rejected fastest for "we
couldn't get in", and 4.2 (web wrapper) pushback is headed off by naming the
native layer. The iPhone app always shows the new look (tabs Home, Jobs,
New, Prices, Timesheet), so every step below is written for it.

Every step here matches the code as of this date. If a screen, label or
permission changes, change this file in the same commit.

---

## 1. App Review Information

### Sign-in information

| Field | Value |
|---|---|
| User name | `demo@tradies2quote.com` (the comped review account in `src/lib/reviewer.ts`) |
| Password | **Owner enters it in App Store Connect.** Never write it in this repo. |

Before each submission run `node --env-file=/srv/t2q/app.env scripts/seed-demo-account.mjs`
on the VPS (from `/srv/t2q/app`): it tops up the demo data, adds the last
finished Monday to Friday of timesheet hours, and turns the demo's location
setting and AI consent off so the reviewer sees both consent flows.

### Notes (paste verbatim; App Store Connect allows 4,000 characters, this is under)

```
SIGN IN
Use the demo account in the Sign-in fields (demo@tradies2quote.com). It is a New Zealand builder's account with data on every screen: jobs at each stage, an invoice, three clients with job sites, a price list and a week of timesheet hours.

WHAT IT IS
Tradies2Quote helps tradespeople quote, invoice and keep a timesheet. Describe a job by voice, typing or a photo of a plan; AI drafts the quote (materials, labour, GST) to check and send.

GETTING AROUND
Tabs: Home, Jobs, New (+), Prices, Timesheet. Your photo (top left) opens the menu: Your profile, Business details, Rates and quotes, Payments, Clients, Calendar, Team, Help, Send feedback, Privacy policy, Terms, Outdoor mode, Sign out. The weather (top right) opens "Weather impact".

TRY IT
1. Jobs: open a job. More tools (the ... button) > "Download the PDF" opens the iOS share sheet (Save to Files, Mail).
2. New (+): the AI consent screen first (below). Then Talk (microphone prompt), Type, or Photo of a plan (camera or photo library) > Write my quote.
3. Prices: "Scan a supplier quote" (photo or PDF) and "Import a price list" (CSV, Excel, PDF or photo) read prices into the list.
4. Timesheet: tap the Last week arrow for a week of hours across three clients. "Job location" on a day shows the site on a map, with where work started and finished. "Invoice this week" bills a client's hours.
5. Start work, wait a minute or more, then Finish work (set Break to None). The hours land on today.
6. Location: the gear on the Start work card. The sheet says what is kept. Turn on "Use my location for work" > Save: iOS asks for While Using. Turn on "Automatic clock-in at jobs" > Save: iOS asks for Always. The demo's job sites are in Tauranga, NZ, so arrival notifications ("Arrived at the Hemi Walker job") only fire there.
7. Weather (top right) > "Use my location": iOS asks for While Using.
8. Delete account: photo > Your profile > "Delete my account" (bottom) > type DELETE > "Delete forever". You land on the sign-in screen ("Your account has been deleted."). The demo account is only signed out, so you can sign in again.

LOCATION
Off until the person turns it on in the Timesheet. No background location mode is used. Automatic clock-in uses iOS region monitoring (up to 18 job sites) and acts only in the person's work hours. Travel kilometres: precise updates while the app is open; iOS significant-change updates in the background, only while clocked in with Always. Route points are deleted after 90 days. Weather rounds the location to about 1 km and doesn't save it (only that area's forecast is cached for 30 minutes).

AI CONSENT (5.1.2(i))
Before anything is sent to AI the app names the providers (Anthropic, OpenAI) and asks: "I agree — continue" or "Not now". Until then the server refuses AI requests from the app. Withdraw any time: Your profile > AI features.

BUSINESS MODEL (3.1.3(f))
The app is free: no in-app purchases, prices, plans, trials, upgrade prompts or purchase links. The server recognises the app and leaves them out of every page it sends.

NATIVE FEATURES
Location module (job-site arrival and leaving notifications, travel kilometres while clocked in); push notifications (Your profile > Quote notifications); share sheet and Files for PDFs; offline screen; microphone and camera.

PRIVACY
Photo menu > Privacy policy and Terms (also on the sign-in and sign-up screens). No analytics or tracking, no cookie banner: essential cookies only.

CUSTOMER CHAT (1.2)
On a sent job, More tools > Customer chat: the client's AI chat about the quote, labelled as AI. Both sides go through a content filter; "Report chat" (reviewed within 24 hours) and "Turn chat off" are there.

SIGN-IN (4.8): our own email and password accounts only.

Support: support@tradies2quote.com
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
| Age rating | Answer the questionnaire honestly: the app has an AI chatbot + user-generated content (customer quote chat) WITH all three 1.2 controls (automated filter, in-app report reviewed <24 h, per-quote turn-off). Declare those; accept whatever rating the questionnaire computes — do not hand-pick 4+. |
| Support URL | https://tradies2quote.com/support |
| Marketing URL | https://tradies2quote.com |
| Privacy Policy URL | https://tradies2quote.com/privacy |
| Copyright | © 2026 Challis Samu / STR8 Builders |

Promotional text (170 chars, editable without review):
`Say the job out loud — get a professional quote with materials, labour and GST. Scan hand-drawn plans, send for one-tap acceptance, invoice when the work's done.`

Keywords (100 chars — no word repeated):
`tradie,quote,invoice,builder,estimate,voice,plumber,sparkie,chippie,GST,timesheet,construction,NZ`

---

## 3. App Privacy (nutrition labels) — must match PrivacyInfo.xcprivacy and the privacy policy

Data collection: **Yes**, all linked to identity except crash data, **none used for tracking**.

| Data type | Collected? | Linked | Tracking | Purpose |
|---|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | No | App Functionality |
| Contact Info → Name | Yes | Yes | No | App Functionality |
| Contact Info → Phone Number | Yes | Yes | No | App Functionality |
| Contact Info → Physical Address (business and client addresses) | Yes | Yes | No | App Functionality |
| User Content → Audio Data | Yes | Yes | No | App Functionality |
| User Content → Photos or Videos | Yes | Yes | No | App Functionality |
| User Content → Other User Content (quotes, timesheet hours) | Yes | Yes | No | App Functionality |
| Identifiers → User ID | Yes | Yes | No | App Functionality |
| Location → Precise Location | Yes | **Yes** (only if the person turns location on: where they start and finish work, and their route while clocked in; route points deleted after 90 days) | No | App Functionality |
| Diagnostics → Crash Data (our own error reports: scrubbed, no account ID) | Yes | **No** | No | App Functionality |

Weather: the phone's location is rounded to about 1 km and sent for the
forecast; it is not saved with the account. Only that area's forecast is
cached for 30 minutes, keyed by the rounded area and linked to no one.
Location is declared above anyway (the Timesheet), so the label covers it.

Everything else: Not collected. Tracking section: **No tracking** (no ATT
prompt needed). Third-party SDKs: none that collect data (no analytics, no
ads; the website's opt-in analytics script never loads in the app).

---

## 4. Archive-day checklist (after the Apple Developer membership lands)

1. Xcode → Signing: select the team (automatic signing).
2. APNs: create the key (.p8) in the developer portal → put APNS_TEAM_ID /
   APNS_KEY_ID / APNS_PRIVATE_KEY into `/srv/t2q/app.env` → restart. Push
   goes live.
3. Product → Archive. In the Organizer, inspect the archive's entitlements:
   `aps-environment` MUST read `production` (automatic signing flips it from
   the checked-in `development` — VERIFY, don't assume).
4. Confirm `Info.plist` still has no `UIBackgroundModes` location entry (the
   notes above say none is used) and that both location purpose strings
   (While Using, Always) read as intended.
5. Run the demo seed on the VPS (Section 1). Then, ON THE BUILT BINARY: sign
   in with the demo account and walk steps 1–8 of the notes, including the
   While Using and Always prompts, Start/Finish work, and a new quote (proves
   the review comp is active).
6. Keep weather impact on (`T2Q_WEATHER_IMPACT` / `NEXT_PUBLIC_T2Q_WEATHER_IMPACT`
   not set to `0`), or take step 7 out of the notes.
7. Validate → Distribute → TestFlight internal first; tap through the notes
   on a real phone, including an Airplane-Mode launch and one pass on a slow
   network — no price, plan, trial or "subscribe" may ever appear.
8. Screenshots: a FRESH 6.9" set (1290×2796 or 1320×2868) from the real
   binary — not public/screens/*.jpg. Show: voice recorder mid-capture, a
   generated quote, the Timesheet with a job location map, scan→prices, the
   native share sheet. iPhone-only → no iPad screenshots.
9. Keep `NEXT_PUBLIC_SENTRY_DSN` unset in the VPS environment: the App Privacy
   answers declare only our own crash data (not linked), no third-party
   diagnostics. If it is ever set, update the privacy policy and App Privacy
   first.
10. Submit with the Section 1 notes, and the demo password in the Sign-in
    fields.

## 5. If a Guideline 4.2 question comes back anyway

Reply with (short version): the app's core flows are built on device
capabilities — microphone dictation, camera plan and supplier-quote scanning,
a native location module (clocking in and out with pins, job-site region
monitoring for automatic clock-in with arrival notifications, travel
kilometres), native share/save, push, and offline handling; the binary
carries native code for each. The web view renders a product whose
processing is server-side AI. Offer a screen recording of the voice→quote
and Timesheet flows. Do not resubmit unchanged without replying — the reply
text is what reviewers weigh.
