import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/observability", () => ({ captureError: h.capture }));

import {
  GENERATION_IN_PROGRESS_CODE,
  GENERATION_LEASE_MS,
  claimGenerationLease,
  generationInProgressBody,
  releaseGenerationLease,
  renewGenerationLease,
  startLeaseHeartbeat,
} from "../lease";
import { makeFakeQuotesDb } from "./fakeQuotesDb";

const U = "11111111-1111-1111-1111-111111111111";
const IDS = { quoteId: "q-1", userId: U };
const T0 = Date.parse("2026-09-26T01:00:00.000Z");
const at = (ms: number) => () => T0 + ms;
const iso = (ms: number) => new Date(T0 + ms).toISOString();

function fresh(over: Record<string, unknown> = {}) {
  return makeFakeQuotesDb({
    quote: { id: "q-1", user_id: U, voice_transcript: "deck", quote_data: null, generation_started_at: null, ...over },
  });
}

beforeEach(() => {
  h.capture.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("claimGenerationLease", () => {
  it("claims a free quote with one conditional update", async () => {
    const f = fresh();
    const claim = await claimGenerationLease(f.db, IDS, at(0));
    expect(claim).toEqual({ kind: "claimed", lease: { ...IDS, stamp: iso(0) } });
    expect(f.quote.generation_started_at).toBe(iso(0));
    expect(f.quoteUpdates).toHaveLength(1);
    expect(f.quoteUpdates[0].filters).toEqual([
      { op: "eq", col: "id", value: "q-1" },
      { op: "eq", col: "user_id", value: U },
      { op: "is", col: "quote_data", value: null },
      { op: "is", col: "generation_started_at", value: null },
    ]);
  });

  it("lets exactly one of two racing requests in", async () => {
    const f = fresh();
    const [a, b] = await Promise.all([
      claimGenerationLease(f.db, IDS, at(0)),
      claimGenerationLease(f.db, IDS, at(5)),
    ]);
    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["busy", "claimed"]);
  });

  it("answers busy while a live lease is held", async () => {
    const f = fresh({ generation_started_at: iso(-60_000) });
    const claim = await claimGenerationLease(f.db, IDS, at(0));
    expect(claim).toEqual({ kind: "busy", startedAt: iso(-60_000) });
    expect(f.quote.generation_started_at).toBe(iso(-60_000)); // untouched
  });

  it("takes over a lease older than 4 minutes (a dead worker)", async () => {
    const f = fresh({ generation_started_at: iso(-GENERATION_LEASE_MS - 1) });
    const claim = await claimGenerationLease(f.db, IDS, at(0));
    expect(claim.kind).toBe("claimed");
    expect(f.quote.generation_started_at).toBe(iso(0));
    const staleUpdate = f.quoteUpdates[1];
    expect(staleUpdate.filters).toContainEqual({ op: "lt", col: "generation_started_at", value: iso(-GENERATION_LEASE_MS) });
    expect(staleUpdate.filters).toContainEqual({ op: "is", col: "quote_data", value: null });
  });

  it("reports a quote generated in the meantime", async () => {
    const f = fresh({ quote_data: { line_items: [] } });
    expect(await claimGenerationLease(f.db, IDS, at(0))).toEqual({ kind: "generated" });
  });

  it("fails open, and reports, when the column is missing", async () => {
    const f = fresh();
    f.failNextQuoteUpdate("column quotes.generation_started_at does not exist");
    const claim = await claimGenerationLease(f.db, IDS, at(0));
    expect(claim.kind).toBe("unavailable");
    expect(h.capture).toHaveBeenCalledWith(expect.any(Error), { route: "quotes/generate:lease" });
  });

  it("fails open quietly for the old '{}' quote_data default", async () => {
    const f = fresh({ quote_data: {} });
    const claim = await claimGenerationLease(f.db, IDS, at(0));
    expect(claim.kind).toBe("unavailable");
    expect(h.capture).not.toHaveBeenCalled();
  });

  it("builds the busy body the client waits on", () => {
    expect(generationInProgressBody()).toEqual({
      error: "We're already writing this quote. It will open here as soon as it's ready.",
      code: GENERATION_IN_PROGRESS_CODE,
      retry_after_s: 10,
    });
  });
});

describe("renew / release", () => {
  it("renews only a lease we still hold", async () => {
    const f = fresh();
    const claim = await claimGenerationLease(f.db, IDS, at(0));
    if (claim.kind !== "claimed") throw new Error("expected a claim");
    expect(await renewGenerationLease(f.db, claim.lease, at(60_000))).toBe(true);
    expect(claim.lease.stamp).toBe(iso(60_000));
    expect(f.quote.generation_started_at).toBe(iso(60_000));

    f.quote.generation_started_at = iso(70_000); // someone else took over
    expect(await renewGenerationLease(f.db, claim.lease, at(120_000))).toBe(false);
    expect(f.quote.generation_started_at).toBe(iso(70_000));
  });

  it("releases our own lease and never someone else's", async () => {
    const f = fresh();
    const claim = await claimGenerationLease(f.db, IDS, at(0));
    if (claim.kind !== "claimed") throw new Error("expected a claim");
    f.quote.generation_started_at = iso(300_000); // taken over
    await releaseGenerationLease(f.db, claim.lease);
    expect(f.quote.generation_started_at).toBe(iso(300_000));

    f.quote.generation_started_at = claim.lease.stamp;
    await releaseGenerationLease(f.db, claim.lease);
    expect(f.quote.generation_started_at).toBeNull();
  });
});

describe("startLeaseHeartbeat", () => {
  it("re-stamps every interval and stops cleanly", async () => {
    vi.useFakeTimers({ now: T0 });
    const f = fresh();
    const claim = await claimGenerationLease(f.db, IDS);
    if (claim.kind !== "claimed") throw new Error("expected a claim");
    const hb = startLeaseHeartbeat(f.db, claim.lease, { intervalMs: 60_000 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.quote.generation_started_at).toBe(iso(60_000));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.quote.generation_started_at).toBe(iso(120_000));
    await hb.stop();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(f.quote.generation_started_at).toBe(iso(120_000));
    // A release after stop() sees the last stamp actually written.
    await releaseGenerationLease(f.db, claim.lease);
    expect(f.quote.generation_started_at).toBeNull();
  });

  it("stops by itself once the lease is gone", async () => {
    vi.useFakeTimers({ now: T0 });
    const f = fresh();
    const claim = await claimGenerationLease(f.db, IDS);
    if (claim.kind !== "claimed") throw new Error("expected a claim");
    const hb = startLeaseHeartbeat(f.db, claim.lease, { intervalMs: 60_000 });
    f.quote.generation_started_at = null; // saved by the pipeline
    await vi.advanceTimersByTimeAsync(60_000);
    const writes = f.quoteUpdates.length;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(f.quoteUpdates.length).toBe(writes);
    expect(f.quote.generation_started_at).toBeNull();
    await hb.stop();
  });
});
