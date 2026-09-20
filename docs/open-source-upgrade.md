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
