# Tradies2Quote native acceptance tests

**Planned release tests — 21 September 2026.** These are requirements for the future build, not claims that the new app has passed them.

Every test record must identify app build, backend revision, device/OS, account role, environment, expected/actual result and relevant logs or screenshots. Redact tokens, personal data and payment information. Maintain a feature-to-screen-to-API-to-provider map so untested connections are visible.

## End-to-end matrix

| ID | Journey | Required assertions |
|---|---|---|
| A01 | Create and verify account | Confirmation email arrives in designated inbox; valid/expired/reused links behave correctly; native return opens the intended screen. |
| A02 | Login/recovery/logout | Correct and incorrect passwords, reset, expired access token, refresh failure and revoked session; no credentials in logs; logout clears private cache. |
| A03 | Account isolation | Account B cannot read/change A's quotes, PDFs, clients, supplier files, notifications, drafts or local data. Repeat through direct API calls. |
| A04 | Team roles | Owner/member actions and seat limits; member removal revokes access; company data never moves to another team through a client-supplied ID. |
| A05 | AI consent | Deny, grant, withdraw and changed-provider consent version. Direct mobile API calls cannot bypass consent by changing the user agent. Declining leaves manual/account functionality usable. |
| Q01 | Text/form quote | Create a representative job, generate/review, edit, save, relaunch and reopen on web; same lines and totals everywhere. |
| Q02 | Voice quote | Actual microphone, denial, interruption/call, Bluetooth route, silent/long recording, failed upload and server transcription; manual input fallback. |
| Q03 | Photo/document input | Native camera/library/files, HEIC/JPEG/PDF, multiple pages, rotation, malformed/oversized files, upload interruption and memory pressure. |
| Q04 | Money and units | Shared fixtures for each supported currency/tax setting, fractional quantities, discounts, rounding, zero/negative/invalid values and large totals; compare server, native display and PDF. |
| Q05 | AI quality | Run relevant provider-gated evaluations with anonymized representative trades, ambiguity, poor photos and unsupported plans. Validate schema/quantities and require human quote review. |
| Q06 | Save/retry/conflict | Double-tap, lost response after commit, offline retry and simultaneous web/native edits; one operation result, no overwritten edits or duplicate records. |
| Q07 | Quote lifecycle | Draft → sent → accepted/declined → scheduled → in progress → completed where supported; reject invalid transitions, archived/deleted tokens and unauthorized edits. |
| D01 | PDF and sharing | Owner/private PDF, public-token PDF, attachment/privacy redaction, logo, pagination, large line sets, share/save/print and expired URLs; confirm actual saved file opens. |
| D02 | Quote/invoice email | Designated-recipient inbox receipt and usable links/PDF; bounce/failure, duplicate request and retry; provider acceptance alone is insufficient. |
| D03 | SMS | If device composer is used, distinguish cancelled/composed from delivered. If server SMS is offered, verify configured provider, designated-recipient receipt and retry behaviour. |
| I01 | Invoice workflow | Eligible quote conversion, adjustments, invoice numbering, totals, send/reopen and payment recording; duplicate action cannot create two invoices. |
| I02 | Deposit/payment | External payment for trade services only; test sandbox success/cancel/failure/refund and signed webhook replay/out-of-order events; amount derived server-side. |
| L01 | Clients/materials/suppliers | Create/edit/search, CSV/import capture, invalid rows, duplicate detection, supplier review, price/unit edits, kits and templates; native/web consistency. |
| R01 | QR request intake | Generate/scan QR on another device, customer form/photos, validation/abuse limits, request creation, owner notification, review/dismiss/restore and quote conversion. |
| R02 | Customer chat/reporting | Message and AI response filters, report persistence, abuse blocking/chat disable, rate limits and support handling; verify controls through the public endpoint. |
| W01 | Scheduling/weather | Job dates, notes, local timezone/DST, location refusal, manual location, forecast outage/staleness, reschedule and scheduled notification. |
| P01 | Native push | Register on real device, foreground/background/terminated receipt, correct quote destination, token rotation, logout and account switch. Verify TestFlight production APNs. |
| T01 | Separate T2QCAL handoff | Real native calculator → save/send → open native quote; identical quantities, totals and provenance; retain current serializer compatibility. |
| T02 | Handoff failures | Different signed-in accounts, expired tokens, send twice/lost response, offline queue, malformed/unowned deep link, no Tradies2Quote installed and no T2QCAL installed. |
| O01 | Offline recovery | Save draft offline, force quit, relaunch, reconnect and reconcile; fail disk writes visibly; never label unsynced work as server-saved. |
| O02 | Account switch with queued work | Pending uploads/drafts retain their captured owner; queue never replays under a different account; private image/PDF caches do not leak. |
| S01 | Subscription purchase | Signed-in account buys localized product; cancelled/pending/failed/unavailable purchase; only verified transactions grant access. |
| S02 | Restore and devices | Reinstall/new device, restore, launch with existing entitlement, another app account on same Apple ID, already-owned product and secure account association. |
| S03 | Subscription lifecycle | Renewal, cancellation at period end, expiry, grace period, billing retry/recovery, refund/revocation, upgrade/downgrade and offer eligibility. |
| S04 | Billing consistency | Same access on web/native; Apple and Stripe events cannot overwrite unrelated entitlements; prevent double billing; enforce team seats. |
| S05 | Notification reliability | Invalid signatures/environment, duplicate/out-of-order Apple/Stripe events, missed webhook reconciliation and temporary provider outage. |
| X01 | Real account deletion | Ordinary account and review account use same logic; auth, database, files, processors, push and local data removed or retained with truthful stated reason. |
| X02 | Deletion failure/shared account | Partial failure/retry is resumable and truthfully shown; other users' company records preserved; shared T2QCAL impact explained; Apple cancellation handled separately. |
| U01 | Native accessibility | VoiceOver journey, largest text sizes, small phone, contrast, reduced motion, keyboard, focus and permission dialogs; no unreachable primary action. |
| U02 | Resilience/performance | Cold launch, background/resume, low memory/storage, large client/quote lists, slow/flaky network, timeout/429/500, server maintenance and upload cancellation. |
| SEC01 | Security boundary | Expired/forged token, IDOR, team privilege escalation, upload abuse, rate limits, public-token leakage, signed URL expiry, secrets in binary/logs and webhook authenticity. |
| REL01 | Distribution build | Archive validation, entitlements/privacy report, symbols, production configuration, no debug/admin exposure, real screenshots, review credentials and exact build provenance. |

## Test layers and release decision

1. **Unit and contract checks:** retain the existing web suite; add Swift tests for state/storage/decoding and shared financial/serializer fixtures. Test mobile APIs with both authorized and unauthorized callers.
2. **Integration environment:** isolated database/storage and provider test credentials with realistic fixtures. Rehearse additive migrations and rollback compatibility, including the old T2QCAL binary. Do not replay historical migrations blindly.
3. **Simulator UI tests:** XCUITest for each customer journey and denied permissions; stable IDs and state assertions. Targeted snapshots help catch clipping and layout changes but do not prove functionality.
4. **Physical devices:** oldest supported OS/device class plus a current large phone. Test camera, mic, files, interruptions, APNs, poor connectivity and offline recovery. Simulator results cannot substitute for these.
5. **StoreKit:** deterministic local StoreKit tests followed by Apple sandbox/TestFlight tests and server-event reconciliation. No real charge is required for the automated suite. [Apple testing overview](https://developer.apple.com/storekit/)
6. **TestFlight acceptance:** representative tradies perform real workflows using designated test data. Capture feedback and crash/hang evidence; rerun affected regressions after fixes.
7. **Release candidate:** all required rows passed, no critical/high findings, no known broken exposed workflow, every remaining lower-priority limitation explicitly assessed. Freeze the candidate and preserve evidence. Any build change triggers relevant revalidation.

A release record must distinguish **passed, failed, blocked, not run, and intentionally excluded**. Exclusion requires a deliberate scope decision and matching UI/listing changes. Counting thousands of unit tests does not replace proving email delivery, a purchase, a real deletion or a working device handoff.

## Current baseline — not native acceptance

- Web source `64fd6b457822ff39456f977bc02293d48027cb1a`: 3,144 passed, 25 skipped across 223 test files (217 passed, 6 skipped).
- TypeScript: passed with no emitted files.
- Release-tool tests: 13 passed. These test the checker itself; the live configuration inventory still reports gaps.
- Live health, privacy and support pages: HTTP 200. Provider credential presence inspected without exposing secrets.
- Native acceptance matrix above: **not run**; authenticated native acceptance is still outstanding. The first native build and focused tests are now recorded below.

## Implementation checkpoint — 21 September 2026

The SwiftUI target builds with Xcode 26.6 for iOS 17+, using pinned Supabase Swift 2.55.2 and GRDB 7.11.1. It excludes embedded T2QCAL screens and retains quote provenance.

- Eight Swift unit tests and one account-screen UI test passed on iPhone 17 Pro / iOS 26.5. Tested: money rounding, unknown field preservation, account-partitioned draft recovery, bearer headers, invalid origins, HTTP errors, malformed responses and pagination. Authenticated journeys remain unverified.
- Backend regression checkpoint: 3,192 passed, 25 environment-gated skips. TypeScript, lint and the production build passed for this checkpoint.
- Four additive migrations have been applied only to a schema-only rehearsal database. SQL tests use synthetic users and roll back: quote totals/provenance, idempotency, stale revisions, invalid-input rollback, RLS isolation, scheduling, kit rollback, transcript update, AI consent, Apple ownership/renewal/refund/grace/retry/notification replay/deleted-account handling/service-role permissions.
- Apple state-normalization tests do not replace signed sandbox purchases. No production data migration, release activation or App Store submission has occurred.
- Private integration auth/REST/storage services now run against the rehearsal database with a separate JWT secret, local-only ports and bounded resources. No production customer records or provider credentials were copied.

Release blockers include Apple distribution/account/product configuration, full authenticated and physical-device acceptance, provider receipts, real StoreKit/webhook tests, concurrency-safe deletion/retention verification, remaining feature parity, production migration rehearsal and final App Store materials.
