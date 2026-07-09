# Tradies2Quote — App Store readiness plan & checklist

Last updated: 2026-07-10 (full audit + research pass; supersedes the 2026-06-05 notes)

## The decision: hardened Capacitor shell, not a Swift rewrite (yet)

Research verdict (Apple guidelines current as of July 2026):

- **A full Swift/SwiftUI rebuild buys no rule advantage.** The IAP/billing rules
  bind native apps identically, and it means rebuilding every screen and
  maintaining two codebases forever — 2–4+ months vs 3–5 weeks. supabase-swift
  and the API routes make it *possible* later if iOS becomes the main channel.
- **A Capacitor iOS shell around the existing app is the fastest defensible
  path**, provided it is hardened against Guideline 4.2 (minimum functionality):
  web build **bundled locally** (never `server.url` to the live site), plus real
  native capabilities — APNs push, native mic/camera, native share sheet,
  Face ID login, and a native offline screen (reviewers Airplane-Mode-test).
- **Billing stays 100% on Stripe/web** under Guideline **3.1.3(f) "Free
  Stand-alone Apps"**: the iOS app is free, login-first, with **zero pricing,
  upgrade buttons, or billing links in the binary**. This is exactly how NZ
  competitor Tradify ships. Marketing pricing by email is explicitly allowed.
  (A US-storefront-only "manage billing" link is legal post-Epic, but the
  Supreme Court took the case in June 2026 — treat it as nice-to-have.)
- **Sign in with Apple is NOT required** while auth is Supabase email/password
  only (Guideline 4.8 exception for own-account systems). Adding Google login
  later makes it mandatory.
- **In-app account deletion (5.1.1(v)) is mandatory** — ✅ built 2026-07-10
  (Settings → danger zone → typed DELETE → cancels Stripe sub, purges rows +
  storage, deletes the auth user).

---

## Phase 1 — Apple Developer account (owner action, start NOW — longest pole)

- [ ] Decide entity: **Organization** if STR8 Builders is a registered NZ
      limited company (seller shows as the company); **Individual** if sole
      trader (seller shows as "Challis Samu", ~48 h approval, can migrate later).
      A sole trader **cannot** get an Organization account (D-U-N-S needs a
      legal entity; NZBN is not accepted).
- [ ] Organization path only: check/request a **free D-U-N-S number** via
      Apple's D-U-N-S lookup (developer.apple.com/support/D-U-N-S/) — NZ
      companies often already have one. Allow 1–2 weeks + 1–2 weeks Apple
      verification.
- [ ] Enroll at developer.apple.com/programs/enroll — **US$99/year**, personal
      Apple ID with 2FA on.
- [ ] App Store Connect → Agreements: accept the free-app agreement. (Banking/
      tax forms only needed if IAP is ever sold — with Stripe-only billing,
      Apple never touches the money and NZ GST arrangements stay as-is.)
- [ ] Install **Xcode** from the Mac App Store (this Mac currently has only
      Command Line Tools — `xcodebuild` is missing). macOS 26.5 is fine.

## Phase 2 — iOS app build (dev work, ~3–5 weeks)

**Shell**
- [ ] `npm install @capacitor/core @capacitor/cli @capacitor/ios`
- [ ] Bundle ID `com.str8builders.tradies2quote`; **bundle the web build
      locally** (static export of the shell or local assets calling the
      production API) — a remote-URL wrapper is the classic 4.2 rejection.
- [ ] Native splash + full icon set (Capacitor assets tooling).

**Native value (the 4.2 defence — each is also genuinely useful)**
- [ ] **APNs push**: `@capacitor/push-notifications`. Web push (VAPID/service
      worker) does NOT exist inside WKWebView — the current PushToggle would
      show dead "add to Home Screen" copy. Server work: add an APNs token type
      to `push_subscriptions` (or a sibling table) and branch the sender in
      `src/lib/push.ts` (APNs p8 token key, or FCM as the cross-platform layer).
- [ ] **Native share sheet for PDFs**: `navigator.share({files})` and blob
      `a[download]` are no-ops in WKWebView — bridge `SavePdfButton` to
      `@capacitor/share` / native file save (capability-detect so web keeps
      the current path).
- [ ] **Mic**: `getUserMedia`/MediaRecorder works in WKWebView (the existing
      audio/mp4 fallback is right) — needs `NSMicrophoneUsageDescription`.
      Optionally record via a native plugin for a stronger 4.2 story.
- [ ] **Camera/photos**: existing `<input capture>` works in WKWebView — needs
      `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription`. HEIC
      conversion already handled in `src/lib/scanImage.ts`.
- [ ] **Face ID login** (biometric unlock of the stored session) — reviewers
      love it in screenshots; cite it in review notes.
- [ ] **Native offline screen** — reviewers Airplane-Mode-test; a browser error
      page = wrapper rejection. (The PWA deliberately has no offline mode;
      handle it at the shell level.)
- [ ] Purpose strings that say *why*: mic "Record your voice to generate
      quotes", camera "Scan plans and site drawings", photos "Attach plan
      photos to quotes".
- [ ] **PrivacyInfo.xcprivacy** privacy manifest (mandatory since May 2024):
      required-reason APIs (UserDefaults etc. — Capacitor ships its own),
      data categories, no tracking domains.
- [ ] In-app copy sweep: **no pricing, no "upgrade", no billing links** in the
      iOS binary (hide `/app/upgrade` + subscription panel behind a platform
      check); free-trial signup in-app is fine under 3.1.3(f).
- [ ] Update `PushToggle` copy/behaviour when running inside the native shell.

## Phase 3 — App Store Connect listing

- [ ] App name "Tradies2Quote", category Business; support URL
      tradies2quote.com/support, privacy URL tradies2quote.com/privacy (both live ✅).
- [ ] **Privacy nutrition labels** matching reality: contact info (name, email,
      phone), audio recordings (voice quotes — processed, not retained beyond
      transcription), photos (plan scans), user content (quotes/invoices),
      identifiers. Mismatches are a top rejection cause.
- [ ] Screenshots: **1320×2868** (6.9" iPhone) × up to 10 — include one showing
      a native feature (Face ID prompt or the voice recorder). iPad screenshots
      (2064×2752) only if iPad is enabled — consider iPhone-only for v1.
- [ ] **Demo account with seeded data** in App Review notes (login-gated SaaS =
      #1 avoidable rejection): a test tradie with quotes, a client, materials.
      Review notes should name the native features explicitly.

## Phase 4 — TestFlight → submission

- [ ] Internal TestFlight (instant, up to 100 testers) — the owner + crew.
- [ ] External TestFlight with real tradies (Beta App Review ~24–48 h, builds
      expire after 90 days).
- [ ] Submit. New-app review currently ~2–7 days. A 4.2 rejection on first try
      is possible and fixable — respond with the native-feature list, don't panic.

## Remaining code items from the 2026-07-10 audit (web, pre-launch polish)

Fixed in commit `2873153` (all blockers/highs): webhook retry-loss, deposit
double-payment window, ungated LLM routes, core-flow fetch stall guards,
account deletion, tap targets, sw.js icon path, error-text leaks, cron
double-email, generate double-insert.

Still open (medium/low):
- [ ] iOS **startup splash images** for the PWA (white flash on cold launch) —
      moot for the native shell, nice for PWA users.
- [ ] Secondary-panel fetch timeouts (TranscriptPanel, CompliancePanel,
      SuggestPricePanel, PhotoPlanPanel, InvoiceDraftCard) — same AbortSignal
      pattern as the core flow.
- [ ] `/api/quote/[token]/logo` 302s to whatever `profiles.logo_url` contains —
      validate host or serve from Supabase storage.
- [ ] Rate limiting is per-lambda-instance (documented as circuit-breaker) —
      consider a durable (DB/Upstash) limiter for the public endpoints before
      heavy marketing.
- [ ] Weather caches (`weather_forecasts_cache`, `job_weather_assessments`) are
      location-keyed; confirm nothing user-identifying lingers post-deletion.

## App details (unchanged)

- App name: Tradies2Quote · Bundle ID: `com.str8builders.tradies2quote`
- Category: Business · Support: `/support` · Privacy: `/privacy`
- Review summary: record job notes by voice, generate a quote, review
  materials/labour/GST, share a PDF, convert accepted work to an invoice.
