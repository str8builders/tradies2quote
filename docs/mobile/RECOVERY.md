# Durable deletion and supplier import recovery

## Account deletion

Apply `20260921_account_deletion_guard.sql` before releasing the new deletion handler. A service-only RPC records deletion intent under a per-account advisory lock. Database triggers on existing owned application tables and storage objects serialize writes with that lock and reject inserts/updates while deletion is pending. Other accounts remain writable. New owned tables introduced by future migrations must register the same guard.

Deletion cancels website billing where configured, enumerates all owned file pages and nested folders, deletes personal records, and removes the auth user last. The marker and login remain available after an interrupted attempt. The native account response shows pending deletion and links to retry. Apple subscription cancellation remains a separate customer action in Apple settings.

Install `deploy/systemd/t2q-account-deletions.timer` during release activation. It uses the existing authenticated loopback runner and claims at most five requests, with ten minutes between attempts. A failed run is visible to systemd and monitoring; the next run retries. `node deploy/run-cron.mjs account-deletions --dry-run` only counts pending requests. The timer has not been installed in production.

This is application/database/storage recovery, not a claim that every processor or backup has been independently audited. Verify backup retention, any legally retained billing tombstones, external processors, and shared-team behaviour before submission.

## Supplier quote creation

Apply `20260921_atomic_supplier_quotes.sql` after the native quote transaction migration. Reviewed supplier lines, quote header, frozen `ai_snapshot`, and operation receipt commit together. A failed item insertion rolls everything back. Repeating the same operation returns the existing quote even if its editable version has since changed; it never overwrites later edits or the frozen supplier source. A reused operation identifier with different content fails as a conflict. Invalid runtime payloads and non-boolean acknowledgements are rejected before writes.

The native importer retains its operation UUID for retries. Web callers that omit an operation UUID retain legacy create behaviour; they should pass a stable UUID for automatic lost-response recovery.

## Evidence recorded on 21 September 2026

- 3,208 backend tests passed, 25 provider/environment tests skipped; lint, TypeScript and production build passed.
- Synthetic schema-only SQL tests passed deletion intent/idempotence, interrupted-request claim/cooldown/permissions, owner/child write blocking, other-account isolation and cleanup.
- Real isolated HTTP document/deletion suite: 44 checks passed, including a simulated process interruption and late upload/edit rejection before retry.
- Supplier SQL tests injected an item write failure and verified no quote or receipt survived. The real HTTP supplier suite passed 12 checks, including edited-quote retry, frozen source preservation, malformed input and account isolation.

Production data, real recipients, customer charges and App Store state were not changed by these checks.
