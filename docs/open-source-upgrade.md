# Open-source upgrade — implementation record

Authorized 20 September 2026. Base: `7ae64580885396e7d124ac700673ba83adbf5b16`.

## File plan and sequence

1. Supplier review: `QuoteImportClient.tsx`, a reusable `src/components/review-table.tsx`, material list and quote editor. Add search, sorting, attention filters and reversible scoped bulk selection; preserve server actions and reconciliation.
2. Offline: `src/t2qcal/lib/local-db.ts`, migration and sync modules; adapt DeviceWorking, JobsScreen, CalculatorWorkspace and SaveCalculation. Preserve legacy exports and account ownership. Extend account identity and revision checks without destructive migrations.
3. Plans: new `src/t2qcal/components/takeoff/` and `/t2qcal/takeoff` route. Uppy input, PDF.js worker, Konva calibrated overlays, IndexedDB persistence, existing calculator handoffs and quote provenance.
4. Presentation: selected accessible components, landing workflow demonstration and React Email templates through existing transport.
5. Verification: isolated local fixtures/browser harness, targeted data/concurrency tests, full suite, lint, TypeScript and production build. Record unverified physical-device and live-provider boundaries explicitly.

Conditional extensions in the research plan (IFC, accounting, alternative OCR, replacement calendar and money arithmetic) require the stated evidence; they are not prerequisites for the approved core upgrade.

## Baseline

The original build-prompt file referenced by CLAUDE.md is absent from this checkout. Current code, existing architecture/release docs and the approved reuse plan govern this increment.

No production environment files are copied into this worktree. Builds use local placeholder Supabase configuration. Tests must not write to the production database or send provider messages.

Dependency installation needs network-enabled execution. Baseline Node is 22.23.1. Test/build results will be appended as stages complete.

Baseline build passed. Existing suite: 3,114 passed, 25 gated skips, four local HTTP tests blocked by sandbox sockets; the affected file passed all 12 tests with local socket access. Stage 1 targeted reconciliation/retry tests: 33 passed.

Stage 1 completed: production build, full lint and TypeScript passed. Browser fixture verified 200 supplier rows at 390 px, correct editing after sorting, SKU filtering, scoped bulk exclusion/undo and no horizontal overflow. The initial browser run exposed an unstable table sorting state; memoizing that state and disabling pagination resets resolved it. Quote retry tests cover identical replay, changed payload and different account ownership.

Stage 2 completed: 1,060 calculator/storage/API tests passed, followed by 12 focused migration/outbox/account-guard tests after final fixes. TypeScript, scoped lint and production build passed. The 390 px browser flow verified job creation, device save, offline queue, reconnect into a conflict, explicit new-copy resolution, jobs/calculations export, removal and Undo restoring job links. Browser testing exposed a migration inside a Dexie live query; initialization now precedes the subscription. Device and account saves share stable calculation IDs. Queues are owner-scoped and server requests reject a changed account. No production database access occurred.

Stage 3 completed: 1,163 calculator/material tests passed; TypeScript, scoped lint and production build passed. Mobile Chrome verified PDF.js rendering, keyboard calibration, a 50 m² rectangle, pointer length after 90° rotation and 200% zoom (one-screen-pixel tolerance), independent page calibration, quote source/quantity payload, measurement export and reopening the IndexedDB PDF. Supplier browser test now includes cancellation and retry, plus 200-row reconciliation filtering. PDF.js worker, fonts, CMaps and WASM are generated from the pinned package at predev/prebuild and served locally. No drawing is uploaded by the PDF workspace. Each annotation retains its original calibration; cross-tab saves reject a changed stored document. Exported PDF and measurement JSON form the portable backup pair.

Stage 4 and integration: all 3,137 tests passed across 216 test files; 25 existing gated tests skipped. Full lint, TypeScript, whitespace check and the final production build passed. The only lint exclusion added is generated, pinned PDF.js vendor output. Website browser checks covered phone/desktop layouts, calculation changes, invalid input and feature links. Three fictional React Email templates were rendered at 390 px without overflow; tests verified escaped names, action URLs, attachment bytes, reply-to and plain-text content. The conflict-copy regression now proves later edits keep targeting that new server copy, including edits queued before its first upload. Backup restore preserves the active job when the destination has none.

Release boundaries: this is an isolated web-app/website branch, not a production deployment or native iOS/TestFlight release. Live Supabase persistence, provider delivery, physical Safari/iPhone storage eviction and Outlook/Gmail rendering were not exercised. Account backups run while the app is open and connected. Jobs and PDF plans remain device-local with exports. The native calculator catalogue remains unchanged. Conditional accounting/IFC/OCR/calendar/money-library projects remain deferred as specified in the research plan.

Production offline regression: a real offline reload exposed an uncached PDF worker. PDF runtime assets now live inside the T2QCAL service-worker scope at `/t2qcal/vendor/pdfjs/6.3.289/`. A generated asset manifest supports explicit viewer preparation; its readiness marker is written only after every asset is cached. Two tests cover partial failure/retry and rejection of paths outside that directory. The production Chrome run then passed reopening a saved PDF and calibrated measurements after a full reload with networking disabled. The UI reports offline plan readiness separately from saving the document.

Final validation after the offline regression fix: 3,139 tests passed, 25 gated skips; full lint, TypeScript, production build and whitespace checks passed. Production takeoff and scoped PDF worker returned 200; the development harness returned 404.

## 20 September 2026 — WebKit and touch release checks

Mobile WebKit found that persisting a PDF as a Blob could fail with IndexedDB's
"Error preparing Blob/File data" error. New saves store an ArrayBuffer read before
the write transaction; old Blob records remain readable and convert on their next
save. Conflict checks and the 20-plan limit stay transactional. A newer edit made
while a save is pending remains marked unsaved.

Trusted touch tests also found one tap could trigger both Konva `tap` and its
compatibility `click`, adding two points. The canvas now listens to `pointerclick`
once for mouse, pen and touch. The public worker cache was versioned to deliver
the corrected client.

Five storage regressions cover byte preservation without Blob support, legacy
records, changes in another tab during file reading, failed reads and the plan
limit. The full suite passes 3,144 tests with 25 existing gated skips. Production
build, lint and TypeScript checks passed.

`scripts/test-plan-upgrade.mjs` accepts `T2Q_BROWSER=chromium|webkit`,
`T2Q_BASE_URL`, `T2Q_POINTER=mouse` (touch is default), `T2Q_TEST_OUTPUT_DIR` and
`T2Q_CHECK_OFFLINE=1`. The two fixture account/quote APIs are stubbed at the page
boundary because WebKit routing does not reliably intercept them after service
worker activation. Real authenticated acceptance remains a separate release gate.

Chrome touch and mouse checks pass with browser networking disabled. WebKit touch
checks pass with a local test origin disconnected from its upstream: the built-in
offline emulation raised an internal browser error on service-worker navigation.
The origin test confirms no requests are forwarded while the saved PDF and its
50 m² measurement reopen after a full reload. This is automated WebKit evidence,
not a physical iPhone/Safari or installed home-screen app certification.

The saved-plan picker walks an IndexedDB cursor and retains only each plan's ID
and name. It does not materialise the whole library's PDF byte arrays together.
Legacy Blob and new byte-backed records are both covered by the list regression.
