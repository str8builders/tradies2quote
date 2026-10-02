# App Store Connect — submission pack (updated 2026-10-03)

Everything to enter in App Store Connect, in one place. Checked on 3 October
2026 against the open App Store Compliance Playbook
(github.com/mjmirza/app-store-compliance, updated 2 Oct 2026); the result of
that check is in APP_STORE_READINESS.md, "Playbook audit". The playbook's two
biggest causes of rejection are a demo account that doesn't work and privacy
answers that don't match the app: section 1 and section 3 below.

The iPhone app always shows the new look (tabs Home, Jobs, New, Prices,
Timesheet), so every step below is written for it. Every step matches the
code as of this date; `src/lib/app-store-pack.test.ts` checks the notes'
length, every button they name, and that section 3 matches the app's privacy
manifest. If a screen, label or permission changes, change this file in the
same commit.

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
setting and AI consent off so the reviewer sees both consent flows. Then sign
in with it once on the TestFlight build: the playbook's first check is that
the demo login works on the day you submit.

### Contact information

Name: Challis Samu. Email: support@tradies2quote.com. Phone: **international
format with the country code**, for example `+64 21 123 4567` (App Store
Connect has required this since 19 August 2026; digits only are refused).

### Demo video (recommended)

Record the steps below on a real iPhone with the TestFlight build (Control
Centre > Screen Recording), upload it unlisted, and add one line at the top of
the notes: `VIDEO: <link>`. The playbook's review-notes template leads with
it; a reviewer who sees the flows rarely asks.

### Notes (paste verbatim; App Store Connect allows 4,000 characters, this is under)

```
SIGN IN
Use the demo account in the Sign-in fields (demo@tradies2quote.com, no 2FA): a New Zealand builder with data on every screen (jobs at each stage, an invoice, three clients with job sites, a price list, a week of timesheet hours).

WHAT IT IS
Tradies2Quote helps tradespeople quote, invoice and keep a timesheet. Describe a job by voice, typing or a photo of a plan; AI drafts the quote (materials, labour, GST) to check and send.

GETTING AROUND
Tabs: Home, Jobs, New (+), Prices, Timesheet. Your photo (top left) opens the menu: Your profile, Rates and quotes, Your QR code, Clients, Calendar, Team, Help, Send feedback, Privacy policy, Terms, and On this device (Outdoor mode, Text size), Sign out.

TRY IT
1. Press and hold the Home Screen icon: New quote, Timesheet, Jobs, Scan a supplier quote.
2. New (+): AI consent first (below). Then Talk (microphone), Type, or Photo of a plan (camera or library) > Write my quote.
3. Jobs > a draft job > Client card > Edit > "Choose from my contacts": the iOS contact picker (only the contact tapped is shared).
4. Jobs > Booked > the job > More tools > "Add to my calendar": the iOS New Event sheet.
5. Any job > More tools > "Download the PDF": the iOS share sheet.
6. Prices: "Scan a supplier quote" and "Import a price list" read prices into the list.
7. Timesheet > Start work, then lock the phone: a "Clocked in" timer shows on the Lock Screen and Dynamic Island (Live Activity; iOS asks once). Tap it to come back; Finish work (Break: None) ends it.
8. Location: the gear on the Start work card > "Use my location for work" (While Using); "Automatic clock-in at jobs" (Always).
9. Weather (top right) > "Use my location" (While Using).
10. Photo > On this device > Text size: Normal, Large, Extra large. Until one is picked, it follows the iPhone's own text size.
11. Delete account: photo > Your profile > "Delete my account" > type DELETE > "Delete forever". The demo account is only signed out.

NATIVE (4.2)
Native code for: the location module (clock-in pins, job-site arrival and departure, travel kilometres), the Live Activity, Home Screen quick actions, the contact picker and New Event sheet, haptics, the share sheet and Files, push notifications, an offline screen, microphone and camera.

LOCATION
Off until turned on. No background location mode: automatic clock-in uses region monitoring, only in work hours; travel kilometres use significant-change updates only while clocked in with Always. Route points are deleted after 90 days.

AI CONSENT (5.1.2(i))
Before anything is sent to AI the app names the providers (Anthropic, OpenAI) and what is sent, including client details, and asks "I agree — continue" or "Not now". Until then the server refuses AI requests from the app. Withdraw: Your profile > AI features.

BUSINESS MODEL (3.1.3(f))
A free companion app to the Tradies2Quote web service: no in-app purchases, prices, plans, trials, upgrade prompts or purchase links. Team and Terms templates belong to the paid web service; the demo account doesn't include them.

CUSTOMER CHAT (1.2)
On a sent job, More tools > Customer chat: the client's chat about the quote, AI answers labelled as AI. A content filter screens both sides; "Report chat" (reviewed within 24 hours) and "Turn chat off" are there.

EXTERNAL SERVICES
Our own server (Sydney): accounts and data. Anthropic, OpenAI: AI, after consent. Open-Meteo: weather. OpenStreetMap: map tiles. Resend: quote emails. No ads, analytics or tracking SDKs.

PRIVACY AND SIGN-IN
Privacy policy and Terms: photo menu, sign-in and sign-up. Our own email and password accounts only (4.8). The app works the same in every region where it is offered.
```

---

## 2. App Information

| Field | Value |
|---|---|
| Name | Tradies2Quote (13 characters; the limit is 30) |
| Subtitle (30 chars) | `Speak the job. Send the quote.` |
| Bundle ID | com.str8builders.tradies2quote (the Live Activity extension is com.str8builders.tradies2quote.clock: register both App IDs) |
| SKU | tradies2quote-ios |
| Primary category | Business |
| Secondary category | Productivity |
| Support URL | https://tradies2quote.com/support |
| Marketing URL | https://tradies2quote.com |
| Privacy Policy URL | https://tradies2quote.com/privacy |
| Privacy Choices URL (optional) | https://tradies2quote.com/privacy#your-rights (how to get a copy of your data or delete your account) |
| Copyright | © 2026 Challis Samu / STR8 Builders |

Promotional text (170 chars, editable without review):
`Say the job out loud — get a professional quote with materials, labour and GST. Scan hand-drawn plans, send for one-tap acceptance, invoice when the work's done.`

Keywords (100 chars — no word repeated):
`tradie,quote,invoice,builder,estimate,voice,plumber,sparkie,chippie,GST,timesheet,construction,NZ`

### The 2026 App Store Connect questions

| Question | Answer, and why |
|---|---|
| Social media capabilities (asked before any upload since September 2026) | **No.** No feeds, profiles, following or public posts. The customer chat is a private conversation between a business and its own client about one quote. |
| Age rating (the new questionnaire: 4+, 9+, 13+, 16+, 18+) | Answer honestly: Messaging and Chat = yes (customer chat), User-Generated Content = yes, with the 1.2 controls (filter, report reviewed within 24 h, turn chat off); AI chatbot = yes (the customer chat's answers, screened by the same filter); no mature themes, gambling, violence or medical content. Accept the rating it computes; don't hand-pick 4+. |
| Content rights (third-party content) | **Yes, with the rights:** map tiles © OpenStreetMap contributors (ODbL, credited on every map); weather data from Open-Meteo (CC BY 4.0, credited under the forecast; commercial use needs Open-Meteo's paid API plan: see APP_STORE_READINESS.md). Everything else is the person's own content. |
| Export compliance | Already answered in the binary: `ITSAppUsesNonExemptEncryption` = false (HTTPS only). |
| Availability | **Recommended for launch: New Zealand and Australia.** Both work as the app stands. Before adding others: the United States needs the state age-assurance laws handled (Texas SB 2420 is in force: Declared Age Range API); the EU needs DSA trader status declared and verified in App Store Connect (or the app is removed there) plus the EU AI Act notice; the UK and Canada need a fresh check. |
| DSA trader status | Only if EU storefronts are chosen: a business offering an app is a trader; App Store Connect then shows the address, phone and email to EU users. |
| Accessibility Nutrition Labels (voluntary now) | Claim only **Dark Interface** (the app is dark by default). Don't claim Larger Text yet (Apple's bar is text that grows to about 200%; ours is 130%), nor VoiceOver, Voice Control or Sufficient Contrast until each is tested through every common task. A label that over-claims is a 2.3 problem. |

---

## 3. App Privacy (nutrition labels) — must match PrivacyInfo.xcprivacy and the privacy policy

Data collection: **Yes**, linked to the person except the two marked No,
**none used for tracking**, every purpose **App Functionality**.

| Data type | Linked | What it is |
|---|---|---|
| Contact Info → Email Address | Yes | The account email, and client emails on quotes |
| Contact Info → Name | Yes | The person's and their clients' names |
| Contact Info → Phone Number | Yes | Business and client phone numbers |
| Contact Info → Physical Address | Yes | Business and client addresses on quotes and invoices |
| Contacts → Contacts | Yes | Only the one contact tapped in "Choose from my contacts"; the address book is never read |
| User Content → Audio Data | Yes | Voice notes for quotes |
| User Content → Photos or Videos | Yes | Plan, site and supplier-quote photos |
| User Content → Emails or Text Messages | Yes | Quote emails sent to clients, and clients' messages in the quote chat |
| User Content → Customer Support | Yes | What the person writes in "Send feedback" |
| User Content → Other User Content | Yes | Quotes, invoices, prices, timesheet hours |
| Usage Data → Product Interaction | Yes | Quote history and the log of AI runs ("quote generated", "PDF exported") |
| Identifiers → User ID | Yes | The account ID |
| Identifiers → Device ID | Yes | The push token (if notifications are on) and the location module's upload key |
| Location → Precise Location | Yes | Only if location is turned on: start and finish pins, the route while clocked in (deleted after 90 days), job-site arrivals |
| Location → Coarse Location | **No** | Weather: rounded to about 1 km, sent to Open-Meteo with no account ID, not saved |
| Diagnostics → Crash Data | **No** | Our own error reports: scrubbed, no account ID |

Everything else: Not collected. Tracking: **No tracking** (no ATT prompt).
Third-party SDKs that collect data: none (no analytics, no ads; the website's
opt-in analytics script never loads in the app; keep `NEXT_PUBLIC_SENTRY_DSN`
unset or update this section first).

---

## 4. Order of work (updated 2026-10-03)

Only the owner can do the first three; everything after them waits on them.

**A. Owner:**
1. Enrol in the Apple Developer Program (US$99/yr). Enrolment and identity checks are taking two to six weeks in 2026, so start now. A sole trader enrols as an Individual; a registered company as an Organization (needs a D-U-N-S number first). Free-app agreement only: no banking or tax forms. Accept every agreement update the account shows.
2. Make the review account: sign up demo@tradies2quote.com on tradies2quote.com with a password kept only for App Store Connect. Sign-up sends a confirmation link, so demo@ must receive mail (forward it first). Then run the seed in section 1.
3. Weather licence: buy Open-Meteo's API plan (commercial use) and put `OPEN_METEO_API_KEY=<key>` in /srv/t2q/app.env, then restart. The app switches to the paid hosts by itself (`src/lib/open-meteo-endpoint.ts`). Or turn weather off (`T2Q_WEATHER_IMPACT=0`) and take step 9 out of the notes.

**B. When Apple approves the enrolment, owner and Claude:**
4. App Store Connect → My Apps → New app (bundle com.str8builders.tradies2quote), then section 2. Register the extension's App ID com.str8builders.tradies2quote.clock too (automatic signing does it on the first archive).
5. Developer portal → Keys: create an APNs key (.p8). Put APNS_TEAM_ID, APNS_KEY_ID, APNS_PRIVATE_KEY in /srv/t2q/app.env and restart (push goes live, so the native list in the notes is true).
6. Archive-day checklist below.

## 4b. Archive-day checklist (after the Apple Developer membership lands)

1. Xcode → Signing: select the team for both targets, App and T2QWidgets (automatic signing).
2. APNs: as step 5 above.
3. Product → Archive (Xcode 26.2 or later: the SDK floor is the 26 SDKs until April 2027). In the Organizer, inspect the archive's entitlements: `aps-environment` MUST read `production` (automatic signing flips it from the checked-in `development` — VERIFY, don't assume).
4. Confirm `Info.plist` still has no `UIBackgroundModes` entry, `NSSupportsLiveActivities` is true, and both location purpose strings (While Using, Always) read as intended.
5. On the TestFlight build, on a real iPhone: the four quick actions; "Choose from my contacts" (no permission prompt); the booked demo job > More tools > "Add to my calendar" (iOS 17 and later: no prompt; iOS 15 and 16 ask once); Start work then lock the phone (the Live Activity; iOS asks once to allow Live Activities); haptics; Settings > Display & Brightness > Text Size up two steps, then reopen the app (the words follow until a Text size is picked in the app).
6. Run the demo seed on the VPS (section 1). Then, ON THE BUILT BINARY: sign in with the demo account and walk every step of the notes, including the While Using and Always prompts, Start/Finish work and a new quote (proves the review comp is active).
7. Keep weather impact on (`T2Q_WEATHER_IMPACT` / `NEXT_PUBLIC_T2Q_WEATHER_IMPACT` not set to `0`), or take step 9 out of the notes.
8. Validate → Distribute → TestFlight internal first; tap through the notes on a real phone, including an Airplane-Mode launch and one pass on a slow network — no price, plan, trial or "subscribe" may ever appear.
9. Screenshots: a FRESH 6.9" set (1320×2868) from the real binary. Show the app in use, never a splash or sign-in screen: voice recorder mid-capture, a generated quote, the Timesheet with a job location map, the Lock Screen "Clocked in" timer, scan → prices. iPhone-only → no iPad screenshots. (iPhone Duo screenshots can't be uploaded yet; the 6.9" set is scaled for it.)
10. Submit with the section 1 notes, the demo password in the Sign-in fields, the contact phone in +64 format, and the section 2 answers.

## 5. If a Guideline 4.2 question comes back anyway

Reply with (short version): the app's core flows are built on device
capabilities — microphone dictation, camera plan and supplier-quote scanning,
a native location module (clocking in and out with pins, job-site region
monitoring for automatic clock-in with arrival notifications, travel
kilometres), a Live Activity showing the running shift on the Lock Screen and
Dynamic Island, Home Screen quick actions (New quote, Timesheet, Jobs, Scan a
supplier quote), the iOS contact picker for client details, the iOS New Event
sheet for booked jobs, haptics, native share/save, push, and offline
handling; the binary carries native code for each (ios/App/App: the T2Q*
plugins; ios/App/T2QWidgets: the Live Activity). The web view renders a
product whose processing is server-side AI. Offer the screen recording of the
voice → quote and Timesheet flows. Do not resubmit unchanged without replying —
the reply text is what reviewers weigh, and an unchanged resubmit is the
playbook's "compounding resubmit" mistake.

## 6. If a 3.1.1 question comes back (paid features)

Reply: Tradies2Quote is a free companion app to a paid web-based tool
(3.1.3(f)). The app offers no purchase and no call to action to buy outside
it; people who subscribe on the website use the same account in the app. The
demo account shows the full product except team sharing and terms templates,
which only some web plans include.
