import "server-only";

import { adminClient } from "@/lib/supabase/admin";

/**
 * Server-only logger that records agent events to the in-app monitoring
 * tables (`public.agent_events` + `public.agent_runs`). Read by the
 * owner-only dashboard at `/app/agents/monitor`.
 *
 * Earlier revisions POSTed to an external dashboard (685agents project)
 * via AGENT_DASHBOARD_URL / AGENT_DASHBOARD_SECRET — that project never
 * shipped, and the t2q app now owns the dashboard end-to-end.
 *
 * Hard rules — every change must preserve these:
 *  1. Server-only. The `import "server-only"` at the top makes the
 *     Next build fail if anyone tries to import this from a client
 *     component, and Vitest stubs it for tests.
 *  2. Never throws. Every helper returns void and swallows all errors —
 *     a failed log MUST NOT break the request that triggered it.
 *  3. No-op when Supabase isn't configured. The admin client throws if
 *     SUPABASE_SERVICE_ROLE_KEY is missing; that throw is caught and
 *     silently dropped — telemetry is operator-only, never load-bearing.
 *  4. PII safe. The caller may pass extra fields (userId, metadata,
 *     startedAt, finishedAt) but only an allow-listed subset reaches
 *     the database. Anything else is silently dropped.
 *  5. Fire and forget. The helpers do NOT return a Promise. The insert
 *     promise is started but never awaited — `.then()` swallows both
 *     success and failure so a slow Supabase round-trip can never
 *     block a page render. Vercel's serverless runtime continues the
 *     request until the function's maxDuration; the typical insert
 *     completes in under 50ms so it almost always lands before the
 *     function exits.
 *  6. No retries. No batching. No queue. If telemetry volume grows
 *     past what a synchronous insert can absorb, a follow-up wave
 *     adds a queue.
 */

export type AgentLogStatus =
  | "pending"
  | "running"
  | "complete"
  | "failed"
  | "waiting_approval";

/**
 * The input the wiring code passes in. Several fields are accepted but
 * deliberately NOT written to the database (see PII allow-list inside
 * `send`):
 *   - userId         → dropped
 *   - metadata       → dropped
 *   - startedAt      → dropped (Supabase stamps its own created_at)
 *   - finishedAt     → dropped (server stamps its own at run.finish time)
 *   - durationMs     → folded into the human-readable message
 */
export interface AgentLogInput {
  /** Display name of the agent, e.g. "Lifecycle Orchestrator". */
  agentName: string;
  /** Opaque grouping id. Pass the same value to correlate run.start →
   * run.finish on the dashboard. Free-form; clamped to 64 chars. */
  runId?: string;
  /** Short verb describing the step ("transition", "rpc.start"). */
  stepName?: string;
  status: AgentLogStatus;
  /** Short human-readable summary; clamped to 280 chars. */
  message?: string;
  /** Opaque quote id (uuid). NEVER an email or customer name. */
  quoteId?: string;
  /** Accepted for caller convenience but NOT transmitted. */
  userId?: string;
  /** Accepted for caller convenience but NOT transmitted. */
  metadata?: Record<string, unknown>;
  /** Accepted but not transmitted. */
  startedAt?: number;
  /** Accepted but not transmitted. */
  finishedAt?: number;
  /** Folded into the message if present, e.g. "ok · 240ms". */
  durationMs?: number;
}

type EventType = "event" | "error" | "run.start" | "run.finish";

const SHORT_MSG_MAX = 280;
const ERROR_MSG_MAX = 500;
const AGENT_NAME_MAX = 80;
const ACTION_TYPE_MAX = 40;
const QUOTE_ID_MAX = 80;
const RUN_ID_MAX = 64;

/* ----------------------------------------------------------------------
 * Internals
 * -------------------------------------------------------------------- */

function clamp(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function formatDuration(ms: number): string {
  if (ms < 0) return `${ms}ms`;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

/** Looks like a UUID? quote_id and user_id columns are uuid-typed, so
 * inserting an arbitrary string would 22P02-fail. Callers occasionally
 * pass non-UUID identifiers (especially in tests), so we coerce to null
 * for anything that doesn't match the canonical 8-4-4-4-12 hex shape.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuidOrNull(s: string | undefined): string | null {
  if (!s) return null;
  return UUID_RE.test(s.trim()) ? s.trim() : null;
}

interface NormalizedLog {
  type: EventType;
  agent: string;
  status: AgentLogStatus;
  runId: string | null;
  stepName: string | null;
  message: string | null;
  errorMessage: string | null;
  quoteId: string | null;
  approvalRequired: boolean;
}

/**
 * Build the database row from a caller's AgentLogInput. The allow-list
 * is enforced here — every field on the row has to be picked
 * explicitly, which means new fields can never accidentally leak from
 * a future callsite that adds a property.
 */
function normalize(type: EventType, input: AgentLogInput): NormalizedLog {
  const messageWithDuration =
    input.durationMs !== undefined
      ? input.message
        ? `${input.message} · ${formatDuration(input.durationMs)}`
        : formatDuration(input.durationMs)
      : input.message;
  return {
    type,
    agent: clamp(input.agentName, AGENT_NAME_MAX) ?? "Unknown Agent",
    status: input.status,
    runId: clamp(input.runId, RUN_ID_MAX) ?? null,
    stepName: clamp(input.stepName, ACTION_TYPE_MAX) ?? null,
    message: clamp(messageWithDuration, SHORT_MSG_MAX) ?? null,
    errorMessage: null,
    quoteId: uuidOrNull(clamp(input.quoteId, QUOTE_ID_MAX)),
    approvalRequired: false,
  };
}

/**
 * The actual write. Always fire-and-forget — no awaitable return.
 * Synchronous errors are caught and turned into console.warn so the
 * caller can never have a try/catch around this function trip on a log
 * failure.
 */
/**
 * Per-run write queue for the `agent_runs` lifecycle row.
 *
 * run.start (upsert) and run.finish (update) are usually issued back to
 * back without awaiting. Fired concurrently, the update can land BEFORE
 * the upsert, which then overwrites the row back to status=running — the
 * run shows as "running" forever on the dashboard. Chaining the run-row
 * writes for the same run_id keeps them in issue order while the public
 * helpers stay fire-and-forget. Event-row inserts are append-only and
 * stay concurrent.
 */
const runQueues = new Map<string, Promise<void>>();

function enqueueRunWrite(
  runId: string | null,
  task: () => PromiseLike<unknown>,
): void {
  if (!runId) return;
  const settle = (p: PromiseLike<unknown>): Promise<void> =>
    Promise.resolve(p).then(
      () => undefined,
      () => undefined,
    );
  const previous = runQueues.get(runId);
  // First write for a run is issued synchronously (unchanged behaviour);
  // later writes for the same run wait for the earlier ones to settle.
  const next = previous
    ? previous.then(() => settle(task()))
    : settle(task());
  runQueues.set(runId, next);
  void next.then(() => {
    if (runQueues.get(runId) === next) runQueues.delete(runId);
  });
}

/**
 * Resolve once every queued run-row write for `runId` has settled. Server
 * actions that record a whole run in one call await this so the response
 * does not race the writes.
 */
export function flushAgentRun(runId: string): Promise<void> {
  return runQueues.get(runId) ?? Promise.resolve();
}

function send(log: NormalizedLog): void {
  try {
    const admin = adminClient();
    const runId = log.runId;

    // 1. Append-only event row, always written.
    admin
      .from("agent_events")
      .insert({
        run_id: runId,
        agent_name: log.agent,
        event_type: log.type,
        status: log.status,
        step: log.stepName,
        message: log.message,
        quote_id: log.quoteId,
        // user_id intentionally NOT written — PII allow-list.
        // metadata intentionally NOT written — PII allow-list.
      })
      .then(({ error }) => {
        if (error) {
          console.warn("[agent-monitor] event insert failed:", error.message);
        }
      });

    // 2. Run lifecycle: upsert on run.start, update on run.finish.
    //    Both keyed by the unique run_id. Without a run_id there's no
    //    way to correlate, so the run-table write is skipped — the
    //    event row above still lands.
    if (log.type === "run.start" && runId) {
      enqueueRunWrite(runId, () =>
        admin
          .from("agent_runs")
          .upsert(
            {
              run_id: runId,
              agent_name: log.agent,
              status: log.status,
              quote_id: log.quoteId,
              last_step: log.stepName,
              last_message: log.message,
              approval_required: log.approvalRequired,
            },
            { onConflict: "run_id" },
          )
          .then(({ error }) => {
            if (error) {
              console.warn(
                "[agent-monitor] run upsert failed:",
                error.message,
              );
            }
          }),
      );
    } else if (log.type === "run.finish" && runId) {
      const finishedAt = new Date().toISOString();
      enqueueRunWrite(runId, () =>
        admin
          .from("agent_runs")
          .update({
            status: log.status,
            finished_at: finishedAt,
            last_step: log.stepName,
            last_message: log.message,
            error_message: log.errorMessage,
          })
          .eq("run_id", runId)
          .then(({ error }) => {
            if (error) {
              console.warn(
                "[agent-monitor] run update failed:",
                error.message,
              );
            }
          }),
      );
    } else if (log.type === "event" && runId) {
      // Mid-run heartbeat — refresh the run's last_step/last_message so
      // the dashboard's Runs view reflects current progress even before
      // run.finish lands. Status stays whatever the run.start set; we
      // only patch the cosmetic fields.
      enqueueRunWrite(runId, () =>
        admin
          .from("agent_runs")
          .update({
            last_step: log.stepName,
            last_message: log.message,
            approval_required: log.approvalRequired,
          })
          .eq("run_id", runId)
          .then(({ error }) => {
            if (error) {
              console.warn(
                "[agent-monitor] run heartbeat failed:",
                error.message,
              );
            }
          }),
      );
    }
  } catch (err) {
    console.warn(
      "[agent-monitor] log threw synchronously:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/* ----------------------------------------------------------------------
 * Public API — event / error / approval helpers, plus the
 * run.start / run.finish pair that drives the dashboard's Runs view.
 * Same shape as before; existing callers don't need to change.
 * -------------------------------------------------------------------- */

/**
 * Mint a run id for correlating a run.start with its run.finish. Lives
 * here (rather than inlined at call sites) so React Server Components
 * can get a unique id without tripping the `react-hooks/purity` lint
 * rule — `Math.random()` is impure and may not be called directly in a
 * component render body.
 */
export function newRunId(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Log a generic agent event (status check, suggestion surfaced, etc.).
 */
export function logAgentEvent(input: AgentLogInput): void {
  send(normalize("event", input));
}

/**
 * Log a step in a multi-step run. Functionally identical to
 * `logAgentEvent` but signals caller intent. The dashboard groups
 * events by `run_id` if you pass one through.
 */
export function logAgentStep(input: AgentLogInput): void {
  send(normalize("event", input));
}

/**
 * Log an error. Forces status=failed and type=error. The full message
 * is also stored on the run's `error_message` column (clamped to 500
 * chars) so the dashboard's Runs view surfaces failure text inline.
 */
export function logAgentError(
  input: AgentLogInput & { message: string },
): void {
  const log = normalize("error", { ...input, status: "failed" });
  log.errorMessage = clamp(input.message, ERROR_MSG_MAX) ?? null;
  send(log);
}

/**
 * Log "owner approval needed". Forces status=waiting_approval and
 * sets approval_required=true so the dashboard can highlight runs
 * blocked on a human.
 */
export function logAgentApprovalNeeded(input: AgentLogInput): void {
  const log = normalize("event", { ...input, status: "waiting_approval" });
  log.approvalRequired = true;
  send(log);
}

/**
 * Mark the START of an agent run. Emits type=run.start so the dashboard
 * opens a row in its Runs view and starts the clock. Forces
 * status=running. Pass a `runId` and reuse the exact same value on the
 * matching `logAgentRunFinish` so the dashboard can pair the two.
 */
export function logAgentRunStart(input: AgentLogInput): void {
  send(normalize("run.start", { ...input, status: "running" }));
}

/**
 * Mark the END of an agent run. Emits type=run.finish so the dashboard
 * closes the matching run row (paired by `runId`). The caller sets
 * `status`: "complete" for success, "failed" for a failure. On a
 * failure the `message` is also written as `error_message` (clamped
 * to 500 chars) so the failure text surfaces on the dashboard.
 */
export function logAgentRunFinish(input: AgentLogInput): void {
  const log = normalize("run.finish", input);
  if (input.status === "failed" && input.message) {
    log.errorMessage = clamp(input.message, ERROR_MSG_MAX) ?? null;
  }
  send(log);
}
