import { NextResponse } from "next/server";

/**
 * Lightweight per-instance daily rate limiter.
 *
 * Centralises the in-memory, UTC-midnight-reset counter that was written
 * inline in /api/suppliers/extract and /api/materials/extract-quote so other
 * cost-bearing (LLM/transcription) routes share one guard instead of each
 * re-implementing it.
 *
 * Tradeoffs (same as the originals it replaces):
 *   - In-memory and per serverless instance. Vercel may run several lambdas,
 *     so a determined, distributed abuser can exceed the cap in aggregate.
 *     The point isn't a hard quota — it's a zero-cost (no DB write on the hot
 *     path) circuit-breaker that shuts down the common cases: a runaway client
 *     loop or one scripted session hammering an endpoint and running up
 *     OpenAI/Anthropic spend.
 *   - When real volume warrants it, swap the Map for a Postgres/Upstash
 *     table-backed counter keyed the same way — call sites won't change.
 *
 * Keys are caller-supplied and namespaced, e.g. `transcribe:${userId}`.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function nextUtcMidnight(): number {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0); // rolls into tomorrow 00:00:00 UTC
  return d.getTime();
}

export type QuotaResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Count one hit against `key` and report whether the caller is still under
 * `limit` for the current UTC day. A blocked call is NOT counted, so an
 * over-limit caller can't keep pushing the window around.
 */
export function consumeDailyQuota(key: string, limit: number): QuotaResult {
  const now = Date.now();
  const existing = buckets.get(key);

  // Fresh window (no bucket yet, or the previous one has expired).
  if (!existing || existing.resetAt <= now) {
    const resetAt = nextUtcMidnight();
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: Math.max(0, limit - 1), resetAt };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}

/**
 * Give back one unit of a daily quota: for a request that was counted but
 * never reached the cost-bearing call (a quote already being written, or
 * already written, answers 409 without running the model). Never goes below
 * zero and never touches an expired window.
 */
export function refundDailyQuota(key: string): void {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= Date.now() || existing.count <= 0) return;
  existing.count -= 1;
}

/**
 * Short fixed-window throttle (e.g. per-minute) over the SAME in-memory,
 * per-instance buckets as `consumeDailyQuota`. Where the daily quota guards
 * cost-bearing LLM routes, this guards bursty, high-frequency endpoints (the
 * client-error ingest): it caps a flood and then recovers within `windowMs`,
 * instead of muting a key for the rest of the day. Blocked calls are NOT
 * counted, so an over-limit caller can't keep pushing the window out.
 *
 * Same tradeoff as the daily limiter: in-memory and per serverless instance, so
 * it's a circuit-breaker for the common cases (a runaway client loop, one
 * scripted spammer), not a hard distributed quota.
 */
export function consumeFixedWindow(
  key: string,
  limit: number,
  windowMs: number,
): QuotaResult {
  const now = Date.now();
  const existing = buckets.get(key);

  // Fresh window (no bucket yet, or the previous one has expired).
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: Math.max(0, limit - 1), resetAt };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}

/** Standard 429 JSON response with a Retry-After header (whole seconds). */
export function tooManyRequestsResponse(resetAt: number): NextResponse {
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json(
    {
      error: "rate_limited",
      message:
        "You've hit today's limit for this action. It resets at midnight UTC — get in touch if you need more headroom.",
      resetAt: new Date(resetAt).toISOString(),
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
