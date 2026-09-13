/**
 * Vitest stub for `@/lib/agent-monitor/logger`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The real logger writes to Supabase through `adminClient()` whenever
 * SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL are present in the
 * environment — and they are present on the maintainer's machine. Because
 * `runStructuredAgent` / `runOpenAIStructuredAgent` log run.start +
 * run.finish on every call, unit tests that exercise an agent with an
 * injected `fetchImpl` were inserting REAL rows into the production
 * `agent_runs` / `agent_events` tables (observed 12 Sep 2026: agentName
 * "Test" from `src/lib/agents/__tests__/runtime.test.ts` and "Quote Critic"
 * from `src/lib/agents/verify/__tests__/quoteVerify.test.ts`).
 *
 * `vitest.config.ts` aliases the `@/lib/agent-monitor/logger` specifier to
 * this file, so telemetry is a no-op for the whole suite. Same trick as
 * `server-only-stub.ts`.
 *
 * NOTES
 *  - Tests that need to ASSERT on logging still do so: `vi.mock()` on the
 *    same specifier replaces this stub with their own spies.
 *  - `src/lib/agent-monitor/__tests__/logger.test.ts` tests the real logger.
 *    It imports it by RELATIVE path (`../logger`), which the alias does not
 *    touch, and mocks `@/lib/supabase/admin` itself.
 *  - Every runtime export of the real module must be mirrored here or a
 *    module under test gets `undefined` and throws. The parity is enforced
 *    by `src/test/__tests__/agent-monitor-logger-stub.test.ts`.
 */

/** Marker the stub test asserts on to prove the alias is wired up. */
export const __isAgentMonitorLoggerTestStub = true;

/** Unique-per-call, mirroring the real helper's contract. */
let counter = 0;
export function newRunId(prefix: string): string {
  counter += 1;
  return `${prefix}_stub${counter}`;
}

export function logAgentEvent(): void {}
export function logAgentStep(): void {}
export function logAgentError(): void {}
export function logAgentApprovalNeeded(): void {}
export function logAgentRunStart(): void {}
export function logAgentRunFinish(): void {}

/** The real helper resolves once queued run-row writes settle; nothing is
 *  queued here, so resolve immediately. Never rejects, same as the real one. */
export function flushAgentRun(): Promise<void> {
  return Promise.resolve();
}
