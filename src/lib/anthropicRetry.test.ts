import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithOverloadRetry, MAX_RETRY_WAIT_MS, retryDelayMs } from "./anthropicRetry";

const fetchMock = vi.fn();
const waits: number[] = [];
const sleep = async (ms: number) => {
  waits.push(ms);
};

beforeEach(() => {
  fetchMock.mockReset();
  waits.length = 0;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const res = (status: number, headers: Record<string, string> = {}) => new Response("{}", { status, headers });

describe("fetchWithOverloadRetry", () => {
  it("retries a 529 (overloaded) once with a ~1.5 s backoff", async () => {
    fetchMock.mockResolvedValueOnce(res(529)).mockResolvedValueOnce(res(200));
    const out = await fetchWithOverloadRetry("https://api.anthropic.com/v1/messages", { method: "POST" }, 1000, { sleep });
    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(1500);
    expect(waits[0]).toBeLessThan(2000);
  });

  it("honours retry-after on a 429", async () => {
    fetchMock.mockResolvedValueOnce(res(429, { "retry-after": "2" })).mockResolvedValueOnce(res(200));
    await fetchWithOverloadRetry("https://api.anthropic.com/v1/messages", {}, 1000, { sleep });
    expect(waits).toEqual([2000]);
  });

  it("retries only once, then hands back the last response", async () => {
    fetchMock.mockResolvedValue(res(529));
    const out = await fetchWithOverloadRetry("https://api.anthropic.com/v1/messages", {}, 1000, { sleep });
    expect(out.status).toBe(529);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry other failures", async () => {
    for (const status of [400, 401, 404, 500, 503]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(res(status));
      expect((await fetchWithOverloadRetry("https://x.test", {}, 1000, { sleep })).status).toBe(status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
    expect(waits).toEqual([]);
  });
});

describe("retryDelayMs", () => {
  it("caps a long retry-after", () => {
    expect(retryDelayMs(res(429, { "retry-after": "120" }), 0)).toBe(MAX_RETRY_WAIT_MS);
  });
  it("backs off with jitter when no retry-after is given", () => {
    expect(retryDelayMs(res(529), 0, () => 0)).toBe(1500);
    expect(retryDelayMs(res(529), 0, () => 0.999)).toBe(1999);
  });
});
