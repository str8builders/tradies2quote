import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASE_BACKOFF_MS,
  MAX_RETRY_AFTER_MS,
  RETRYABLE_STATUSES,
  backoffDelayMs,
  parseRetryAfterMs,
  sendWithRetry,
  type AiTransport,
} from "../http";
import { AiError } from "../errors";

/**
 * The shared retry policy, driven by a fake fetch and fake timers — no real
 * waits, no network. Real `fetchWithTimeout` is used underneath, so the
 * timeout test exercises the actual AbortSignal path.
 */

const URL_ = "https://api.anthropic.com/v1/messages";

function res(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers,
  });
}

/** A fetch stub that replays `steps` (a Response, or an Error to throw). */
function scripted(steps: Array<Response | Error>) {
  const calls: RequestInit[] = [];
  let i = 0;
  const impl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init ?? {});
    const step = steps[Math.min(i++, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step.clone();
  }) as unknown as typeof fetch;
  return { impl, calls, count: () => i };
}

function send(fetchImpl: typeof fetch, over: Partial<Parameters<typeof sendWithRetry>[0]> = {}) {
  return sendWithRetry({
    provider: "anthropic",
    url: URL_,
    init: { method: "POST", body: "{}" },
    timeoutMs: 10_000,
    fetchImpl,
    random: () => 0,
    ...over,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("backoffDelayMs", () => {
  it("grows exponentially with equal jitter", () => {
    expect(backoffDelayMs(1, () => 0)).toBe(BASE_BACKOFF_MS / 2);
    expect(backoffDelayMs(1, () => 1)).toBe(BASE_BACKOFF_MS);
    expect(backoffDelayMs(2, () => 0)).toBe(BASE_BACKOFF_MS);
    expect(backoffDelayMs(2, () => 1)).toBe(BASE_BACKOFF_MS * 2);
  });

  it("caps the step", () => {
    expect(backoffDelayMs(20, () => 1)).toBe(8_000);
  });
});

describe("parseRetryAfterMs", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  it("reads seconds, fractional seconds, HTTP dates and retry-after-ms", () => {
    expect(parseRetryAfterMs(h({ "retry-after": "2" }))).toBe(2000);
    expect(parseRetryAfterMs(h({ "retry-after": "0.5" }))).toBe(500);
    expect(parseRetryAfterMs(h({ "retry-after-ms": "1250" }))).toBe(1250);
    const now = () => Date.parse("2026-09-25T00:00:00Z");
    expect(parseRetryAfterMs(h({ "retry-after": "Fri, 25 Sep 2026 00:00:03 GMT" }), now)).toBe(3000);
  });

  it("ignores missing or junk values", () => {
    expect(parseRetryAfterMs(h({}))).toBeNull();
    expect(parseRetryAfterMs(h({ "retry-after": "soon" }))).toBeNull();
    expect(parseRetryAfterMs(null)).toBeNull();
  });
});

describe("sendWithRetry", () => {
  it("returns the first OK response without waiting", async () => {
    const f = scripted([res(200, { ok: true })]);
    const out = await send(f.impl);
    expect(out.attempts).toBe(1);
    expect(out.response.status).toBe(200);
    expect(f.count()).toBe(1);
  });

  it("retries a 529 after a jittered backoff and succeeds", async () => {
    const f = scripted([res(529, { type: "error", error: { type: "overloaded_error" } }), res(200)]);
    const p = send(f.impl);
    await vi.advanceTimersByTimeAsync(BASE_BACKOFF_MS / 2 - 1);
    expect(f.count()).toBe(1); // still waiting
    await vi.advanceTimersByTimeAsync(1);
    const out = await p;
    expect(out.attempts).toBe(2);
    expect(f.count()).toBe(2);
  });

  it("retries every retryable status", async () => {
    for (const status of [408, 409, 429, 500, 502, 503, 504, 529]) {
      expect(RETRYABLE_STATUSES.has(status)).toBe(true);
      const f = scripted([res(status), res(200)]);
      const p = send(f.impl);
      await vi.runAllTimersAsync();
      expect((await p).attempts).toBe(2);
    }
  });

  it("honours retry-after exactly", async () => {
    const f = scripted([res(429, {}, { "retry-after": "2" }), res(200)]);
    const p = send(f.impl);
    await vi.advanceTimersByTimeAsync(1999);
    expect(f.count()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await p).attempts).toBe(2);
  });

  it("gives up at once when retry-after is longer than the cap", async () => {
    const f = scripted([res(429, { error: { type: "rate_limit_error", message: "slow down" } }, { "retry-after": "60" })]);
    const err = await send(f.impl).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("rate_limited");
    expect(err.retryAfterMs).toBe(60_000);
    expect(err.retryAfterMs).toBeGreaterThan(MAX_RETRY_AFTER_MS);
    expect(f.count()).toBe(1);
  });

  it("stops after 3 attempts and reports the last failure", async () => {
    const f = scripted([res(503), res(503), res(503), res(200)]);
    const p = send(f.impl).catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await p;
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("overloaded");
    expect(err.status).toBe(503);
    expect(err.attempts).toBe(3);
    expect(f.count()).toBe(3);
  });

  it("never allows more than 3 attempts even if asked", async () => {
    const f = scripted([res(500)]);
    const p = send(f.impl, { maxAttempts: 10 }).catch((e) => e);
    await vi.runAllTimersAsync();
    expect((await p).attempts).toBe(3);
    expect(f.count()).toBe(3);
  });

  it("does not retry other 4xx and types them", async () => {
    const cases: Array<[number, string]> = [
      [400, "bad_request"],
      [404, "bad_request"],
      [413, "bad_request"],
      [422, "bad_request"],
      [401, "auth"],
      [402, "auth"],
      [403, "auth"],
    ];
    for (const [status, kind] of cases) {
      const f = scripted([res(status, { error: { type: "invalid_request_error", message: "nope" } })]);
      const err = await send(f.impl).catch((e) => e);
      expect(err.kind).toBe(kind);
      expect(err.status).toBe(status);
      expect(f.count()).toBe(1);
    }
  });

  it("retries a network error, then succeeds", async () => {
    const f = scripted([new TypeError("fetch failed"), res(200)]);
    const p = send(f.impl);
    await vi.runAllTimersAsync();
    expect((await p).attempts).toBe(2);
  });

  it("reports a persistent network failure as unavailable", async () => {
    const f = scripted([new TypeError("fetch failed")]);
    const p = send(f.impl).catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await p;
    expect(err.kind).toBe("unavailable");
    expect(err.status).toBeNull();
    expect(f.count()).toBe(3);
  });

  it("times out an attempt via AbortSignal and does not retry it", async () => {
    let calls = 0;
    const hanging = ((_: unknown, init?: RequestInit) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    }) as unknown as typeof fetch;
    const p = send(hanging, { timeoutMs: 5_000 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(5_000);
    const err = await p;
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("timeout");
    expect(calls).toBe(1);
  });

  it("shrinks the last attempt's timeout to the remaining budget", async () => {
    const timeouts: number[] = [];
    let n = 0;
    const transport: AiTransport = async (_url, _init, timeoutMs) => {
      timeouts.push(timeoutMs);
      n += 1;
      if (n === 1) {
        await new Promise((r) => setTimeout(r, 7_000)); // a slow 500
        return res(500);
      }
      return res(200);
    };
    const p = sendWithRetry({
      provider: "openai",
      url: URL_,
      init: {},
      timeoutMs: 10_000,
      budgetMs: 12_000,
      transport,
      random: () => 0,
    });
    await vi.runAllTimersAsync();
    await p;
    // 12 s budget − 7 s spent − 0.5 s backoff = 4.5 s left for attempt 2.
    expect(timeouts).toEqual([10_000, 4_500]);
  });

  it("does not wait past the total budget", async () => {
    const f = scripted([res(529), res(200)]);
    const err = await send(f.impl, { timeoutMs: 1_000, budgetMs: 400 }).catch((e) => e);
    expect(err.kind).toBe("overloaded");
    expect(f.count()).toBe(1);
  });

  it("calls onRetry with the failure and the wait", async () => {
    const onRetry = vi.fn();
    const f = scripted([res(429, {}, { "retry-after": "1" }), res(200)]);
    const p = send(f.impl, { onRetry });
    await vi.runAllTimersAsync();
    await p;
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0]).toMatchObject({ attempt: 1, maxAttempts: 3, waitMs: 1000 });
    expect(onRetry.mock.calls[0][0].error.kind).toBe("rate_limited");
  });

  it("keeps the provider's error type and message as server-side detail", async () => {
    const f = scripted([
      res(400, { type: "error", error: { type: "invalid_request_error", message: "max_tokens: too large" } }),
    ]);
    const err = await send(f.impl).catch((e) => e);
    expect(err.detail).toBe("invalid_request_error: max_tokens: too large");
    // The technical message names the kind and status, never the raw body.
    expect(err.message).toBe("Anthropic bad request (HTTP 400)");
  });
});
