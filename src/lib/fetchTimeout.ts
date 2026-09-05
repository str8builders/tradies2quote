/**
 * Timeout guard for outbound fetches (Anthropic, OpenAI, Resend, …).
 *
 * Every external call in a route handler must bound its own wait — without
 * this, a hung upstream socket holds the whole Vercel function until the
 * platform kills it (10–60s depending on plan), and the tradie just stares
 * at a spinner. With it, the request fails fast with a named error the
 * caller can map to a clear "try again" message and capture in monitoring.
 *
 * Composes with caller-supplied signals: if `init.signal` is already set,
 * both aborts are honoured (whichever fires first).
 */

export class FetchTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${safeHost(url)} timed out after ${timeoutMs}ms`);
    this.name = "FetchTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "upstream";
  }
}

/** Default ceilings per call class (ms). Chosen below each route's
 *  maxDuration so the app answers before the platform kills the function. */
export const TIMEOUTS = {
  /** LLM text/vision generation (Anthropic/OpenAI chat). */
  llm: 50_000,
  /**
   * Full quote generation — the takeoff/calculator prompt plus a many-line
   * quote is the app's biggest single completion, and on Sonnet 5 it can
   * legitimately run past the 50s `llm` ceiling (two live 504s at exactly
   * 50s proved it). Self-hosted, so no platform kill to duck under — the
   * matching client abort in QuoteGenerator.tsx is 170s.
   */
  generation: 140_000,
  /** Audio transcription — large uploads are slower end-to-end. */
  transcribe: 55_000,
  /** Vision extraction on supplier documents (maxDuration 90 routes). */
  extraction: 80_000,
  /** Transactional email (Resend). */
  email: 15_000,
  /** Small JSON lookups (weather, geocode, webhooks…). */
  short: 10_000,
} as const;

export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs: number = TIMEOUTS.llm,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const ctrl = new AbortController();
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const timer = setTimeout(() => ctrl.abort(new FetchTimeoutError(url, timeoutMs)), timeoutMs);

  // Honour an existing caller signal alongside ours.
  const outer = init.signal;
  const abortFromCaller = () => ctrl.abort(outer?.reason);
  if (outer) {
    if (outer.aborted) ctrl.abort(outer.reason);
    else outer.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    return await fetchImpl(input, { ...init, signal: ctrl.signal });
  } catch (err) {
    // Surface our typed error instead of the generic AbortError so callers
    // and monitoring can tell a timeout from a user-cancelled request.
    if (ctrl.signal.aborted && ctrl.signal.reason instanceof FetchTimeoutError) {
      throw ctrl.signal.reason;
    }
    throw err;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", abortFromCaller);
  }
}
