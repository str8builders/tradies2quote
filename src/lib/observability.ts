import { after } from "next/server";
import { buildErrorRow, type CaptureContext } from "./observability/fingerprint";
import { sanitizeClientReport } from "./observability/clientErrors";
import { writeAppError } from "./observability/sink";

export type { CaptureContext } from "./observability/fingerprint";

// A dropped connection isn't a bug — the visitor left mid-response (closed
// the tab, backgrounded the app, walked out of signal) — but Next/Node
// phrase it a different way at almost every layer:
//   - Next: "The destination stream closed early" / "failed to pipe
//     response" (the real reason is one level down, in `.cause`)
//   - Node: message "Premature close", code ERR_STREAM_PREMATURE_CLOSE
//   - Socket resets / broken pipes: ECONNRESET, EPIPE
//   - Aborted fetches/streams: a bare "aborted" message
const DROPPED_CONNECTION_PATTERN =
  /destination stream closed early|ERR_STREAM_PREMATURE_CLOSE|Premature close|ECONNRESET|EPIPE|^aborted$/i;

/**
 * Whether an error (at any depth of its `.cause` chain) is one of the noise
 * patterns above. Walks up to `maxDepth` levels — Next wraps the real reason
 * one or two levels down, and this stays bounded in case something builds a
 * pathological or circular cause chain.
 *
 * Shared by both capture paths below AND by `instrumentation.ts`'s
 * `onRequestError` hook (imported dynamically there, same nodejs-only
 * guard), so a caught error reported via an explicit `captureError()` call
 * is filtered exactly the same way as one that bubbles out unhandled.
 */
export function isDroppedConnectionNoise(error: unknown, maxDepth = 4): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < maxDepth && current != null; depth++) {
    if (current instanceof Error) {
      if (DROPPED_CONNECTION_PATTERN.test(current.message)) return true;
      const code = (current as NodeJS.ErrnoException).code;
      if (typeof code === "string" && DROPPED_CONNECTION_PATTERN.test(code)) return true;
      current = (current as { cause?: unknown }).cause;
    } else if (typeof current === "string") {
      return DROPPED_CONNECTION_PATTERN.test(current);
    } else {
      return false;
    }
  }
  return false;
}

/**
 * Report a CAUGHT error to the INTERNAL error monitor (own Supabase, owner-only
 * dashboard — not a paid 3rd party).
 *
 * Why this exists: Next's `onRequestError` only sees errors that BUBBLE OUT of
 * a handler. Our API routes catch their errors and return JSON, so those
 * failures never reach monitoring on their own. Call this in those catch blocks
 * (alongside the existing `console.error`) so caught failures are recorded.
 *
 * Safe by construction:
 *   - Runs OFF the hot path: scheduled via `after()` (post-response) when in a
 *     request scope, else fire-and-forget — the caller never awaits the write.
 *   - NEVER throws: building the row and scheduling the write are fully wrapped.
 *   - No-op-safe if the DB tables/RPC aren't applied yet — the sink swallows
 *     the RPC error.
 *   - No customer data / request bodies / secrets stored — see fingerprint.ts.
 */
export function captureError(error: unknown, context?: CaptureContext): void {
  try {
    if (isDroppedConnectionNoise(error)) return;
    const row = buildErrorRow(error, context);
    const flush = () => writeAppError(row); // never throws
    try {
      // Preferred: run after the response is sent (request scope only).
      after(flush);
    } catch {
      // Outside a request scope (or `after` unavailable) → fire-and-forget.
      void flush().catch(() => {});
    }
  } catch {
    /* reporting must never change request behaviour */
  }
}

/**
 * Report a CLIENT (browser) error to the internal monitor. Called server-side
 * from the /api/internal/client-error route with the raw, untrusted browser
 * payload. Sanitizes into the shared AppErrorRow model (surface = "client")
 * and writes via the same non-blocking, failure-safe path as captureError.
 *
 * Safe by construction: never throws; no-ops if the payload is empty/garbage;
 * scrubs + truncates message/stack; stores no request bodies, customer data,
 * or secrets — see clientErrors.ts.
 */
export function captureClientReport(raw: unknown): void {
  try {
    const row = sanitizeClientReport(raw);
    if (!row) return;
    // Belt-and-braces: a browser report is never itself a dropped server
    // connection, but the message/stack text is checked the same way as the
    // server path so any of this noise that does turn up (e.g. relayed from
    // a fetch failure) is dropped here too, not just server-side.
    if (
      isDroppedConnectionNoise(row.message) ||
      isDroppedConnectionNoise(row.stack)
    ) {
      return;
    }
    const flush = () => writeAppError(row); // never throws
    try {
      after(flush);
    } catch {
      void flush().catch(() => {});
    }
  } catch {
    /* reporting must never change request behaviour */
  }
}
