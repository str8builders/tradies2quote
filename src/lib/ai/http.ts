// ─────────────────────────────────────────────────────────────────────────
// The hardened HTTP policy every AI call goes through.
//
//   • Per-attempt timeout via AbortSignal (fetchWithTimeout), never longer
//     than what is left of the total time budget.
//   • Up to 3 attempts. Retries 408/409/429/500/502/503/504/529 and network
//     errors with jittered exponential backoff, honouring `retry-after`
//     (or OpenAI's `retry-after-ms`). A `retry-after` longer than
//     MAX_RETRY_AFTER_MS, or a wait that would overrun the budget, ends the
//     loop instead of hammering the provider.
//   • Never retries other 4xx (a bad request stays bad) or our own timeout
//     (that attempt already spent the caller's time).
//   • Failures are typed `AiError`s — see ./errors.ts.
//
// Transport-agnostic: the default is fetch; the self-hosted model passes its
// node:http transport (src/lib/llm/local-chat.ts) and gets the same policy.
// Browser-safe (no Node or server-only imports) so the transcript summary,
// which is bundled into client code, can use it too.
// ─────────────────────────────────────────────────────────────────────────

import { fetchWithTimeout } from "@/lib/fetchTimeout";
import {
  AiError,
  classifyHttpStatus,
  parseProviderError,
  type AiProvider,
} from "./errors";

/** The subset of a fetch Response the policy needs (node:http adapts to it). */
export interface AiHttpResponse {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null } | null;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type AiTransport = (
  url: string,
  init: RequestInit,
  timeoutMs: number,
) => Promise<AiHttpResponse>;

export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  408, 409, 429, 500, 502, 503, 504, 529,
]);
export const MAX_ATTEMPTS = 3;
export const BASE_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 8_000;
/** A provider asking us to wait longer than this gets an error, not a wait. */
export const MAX_RETRY_AFTER_MS = 20_000;
/** Default budget = per-attempt timeout + this: room for quick retries. */
export const RETRY_HEADROOM_MS = 30_000;

export interface RetryEvent {
  provider: AiProvider;
  /** The attempt that just failed (1-based). */
  attempt: number;
  maxAttempts: number;
  waitMs: number;
  error: AiError;
}

export interface RetryOptions {
  /** 1–3; defaults to 3. */
  maxAttempts?: number;
  /** Total wall-clock budget for all attempts and waits. */
  budgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  onRetry?: (event: RetryEvent) => void;
}

export interface SendRequest extends RetryOptions {
  provider: AiProvider;
  url: string;
  init: RequestInit;
  /** Per-attempt ceiling. */
  timeoutMs: number;
  /** Injectable fetch (tests); ignored when `transport` is given. */
  fetchImpl?: typeof fetch;
  transport?: AiTransport;
}

export interface SendResult {
  response: AiHttpResponse;
  attempts: number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Jittered exponential backoff after failed attempt `attempt` (1-based). */
export function backoffDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const exp = Math.min(
    MAX_BACKOFF_MS,
    BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1),
  );
  // "Equal jitter": at least half the step, so retries never stampede.
  return Math.round(exp / 2 + random() * (exp / 2));
}

/** `retry-after-ms`, or `retry-after` as seconds or an HTTP date. */
export function parseRetryAfterMs(
  headers: AiHttpResponse["headers"],
  now: () => number = Date.now,
): number | null {
  if (!headers) return null;
  const ms = headers.get("retry-after-ms");
  if (ms != null && ms.trim() !== "") {
    const n = Number(ms);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  const raw = headers.get("retry-after");
  if (raw == null || raw.trim() === "") return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.max(0, at - now());
  return null;
}

/** Classify something a transport THREW (there was no HTTP response). */
export function errorFromThrown(
  e: unknown,
  provider: AiProvider,
  attempts: number,
): AiError {
  if (e instanceof AiError) return e.withAttempts(attempts);
  const name = e instanceof Error ? e.name : "";
  const message = e instanceof Error ? e.message : String(e);
  // FetchTimeoutError is matched by name so a mocked fetchTimeout module
  // (or a second copy of it) still classifies correctly.
  if (
    name === "FetchTimeoutError" ||
    name === "TimeoutError" ||
    name === "AbortError"
  ) {
    return new AiError({ kind: "timeout", provider, attempts, detail: message, cause: e });
  }
  const causeCode =
    e instanceof Error && e.cause && typeof e.cause === "object"
      ? (e.cause as { code?: unknown }).code
      : undefined;
  const code = e instanceof Error ? ((e as { code?: unknown }).code ?? causeCode) : undefined;
  return new AiError({
    kind: "unavailable",
    provider,
    attempts,
    detail: [name, typeof code === "string" ? code : "", message]
      .filter(Boolean)
      .join(" "),
    cause: e,
  });
}

async function errorFromResponse(
  res: AiHttpResponse,
  provider: AiProvider,
  attempts: number,
  retryAfterMs: number | null,
): Promise<AiError> {
  // Reading the body also releases the socket before any wait.
  const body = await res.text().catch(() => "");
  const parsed = parseProviderError(body);
  return new AiError({
    kind: classifyHttpStatus(res.status, parsed.type),
    provider,
    status: res.status,
    attempts,
    retryAfterMs,
    detail: parsed.type || parsed.message
      ? [parsed.type, parsed.message].filter(Boolean).join(": ")
      : body,
  });
}

/**
 * Send one AI request under the retry policy. Resolves with the first OK
 * response; throws an `AiError` otherwise.
 */
export async function sendWithRetry(req: SendRequest): Promise<SendResult> {
  const now = req.now ?? Date.now;
  const sleep = req.sleep ?? defaultSleep;
  const random = req.random ?? Math.random;
  const maxAttempts = Math.min(
    MAX_ATTEMPTS,
    Math.max(1, Math.floor(req.maxAttempts ?? MAX_ATTEMPTS)),
  );
  const budgetMs = Math.max(1, req.budgetMs ?? req.timeoutMs + RETRY_HEADROOM_MS);
  const transport: AiTransport =
    req.transport ??
    ((url, init, timeoutMs) =>
      fetchWithTimeout(url, init, timeoutMs, req.fetchImpl ?? fetch));
  const startedAt = now();

  for (let attempt = 1; ; attempt++) {
    const remaining = budgetMs - (now() - startedAt);
    const attemptTimeout = Math.max(1, Math.min(req.timeoutMs, remaining));

    let outcome: { response: AiHttpResponse } | { thrown: unknown };
    try {
      outcome = { response: await transport(req.url, req.init, attemptTimeout) };
    } catch (e) {
      outcome = { thrown: e };
    }

    let error: AiError;
    let retryAfterMs: number | null = null;
    if ("response" in outcome) {
      const { response } = outcome;
      if (response.ok) return { response, attempts: attempt };
      retryAfterMs = parseRetryAfterMs(response.headers, now);
      error = await errorFromResponse(response, req.provider, attempt, retryAfterMs);
      if (!RETRYABLE_STATUSES.has(response.status)) throw error;
    } else {
      error = errorFromThrown(outcome.thrown, req.provider, attempt);
      // Our own timeout (or a caller's abort) already spent the time.
      if (error.kind === "timeout") throw error;
    }

    if (attempt >= maxAttempts) throw error;
    if (retryAfterMs !== null && retryAfterMs > MAX_RETRY_AFTER_MS) throw error;
    const waitMs = retryAfterMs ?? backoffDelayMs(attempt, random);
    if (now() - startedAt + waitMs >= budgetMs) throw error;

    req.onRetry?.({ provider: req.provider, attempt, maxAttempts, waitMs, error });
    console.warn(
      `[ai] ${req.provider} ${error.kind}${error.status ? ` (HTTP ${error.status})` : ""}; retry ${attempt + 1}/${maxAttempts} in ${waitMs}ms`,
    );
    await sleep(waitMs);
  }
}
