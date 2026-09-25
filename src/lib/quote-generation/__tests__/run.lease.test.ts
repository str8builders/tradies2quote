import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiError } from "@/lib/ai/errors";

/**
 * The generation lease end to end through the real pipeline: a double tap
 * (or a revisit) while the quote is being written runs the model ONCE; the
 * second request gets a plain "already writing" status to wait on; the
 * lease clears with the saved quote, or on failure so a retry can start.
 */

const provider = vi.hoisted(() => ({
  calls: 0,
  /** Resolves the in-flight model call when the test says so. */
  release: null as null | (() => void),
  fail: null as unknown,
}));

const REPLY = JSON.stringify({
  client: { name: "Dave", address: null, email: null, phone: null },
  job_summary: "Paint a fence",
  line_items: [{ type: "labour", description: "Paint fence", quantity: 4, unit: "hour", unit_price: 75, line_total: 300 }],
  terms: "",
  notes: [],
});

vi.mock("@/lib/llm/anthropic-quote", () => ({
  ANTHROPIC_QUOTE_MAX_TOKENS: 16384,
  runAnthropicQuoteCompletion: async () => {
    provider.calls += 1;
    if (provider.fail) throw provider.fail;
    await new Promise<void>((resolve) => {
      provider.release = resolve;
    });
    return { text: REPLY, model: "mock", stopReason: "end_turn" };
  },
}));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { generateQuoteForUser } from "../run";
import { makeFakeQuotesDb } from "./fakeQuotesDb";

const U = "11111111-1111-1111-1111-111111111111";
const PROFILE = { business_name: "Test Builders", country: "NZ", default_labour_rate: 75, default_markup_pct: 20, tax_label: "GST", tax_rate: 15, currency: "NZD" };

function setup() {
  return makeFakeQuotesDb({
    quote: { id: "q-1", user_id: U, voice_transcript: "Paint Dave's fence, about 4 hours", quote_data: null, generation_started_at: null },
    profile: PROFILE,
  });
}

const run = (db: ReturnType<typeof setup>["db"]) =>
  generateQuoteForUser({ db, userId: U, quoteId: "q-1", textProvider: "anthropic" });

/** Let queued microtasks run until the model call is in flight. */
async function untilModelCalled(expected: number) {
  for (let i = 0; i < 200 && provider.calls < expected; i++) {
    await new Promise((r) => setImmediate(r));
  }
  expect(provider.calls).toBe(expected);
}

const saved = { summary: process.env.TRANSCRIPT_SUMMARY, verify: process.env.QUOTE_VERIFY_ENABLED };
beforeEach(() => {
  provider.calls = 0;
  provider.release = null;
  provider.fail = null;
  process.env.TRANSCRIPT_SUMMARY = "off";
  delete process.env.QUOTE_VERIFY_ENABLED;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  if (saved.summary === undefined) delete process.env.TRANSCRIPT_SUMMARY;
  else process.env.TRANSCRIPT_SUMMARY = saved.summary;
  if (saved.verify !== undefined) process.env.QUOTE_VERIFY_ENABLED = saved.verify;
  vi.restoreAllMocks();
});

describe("quote generation lease", () => {
  it("a double tap runs the model once; the second request is told to wait", async () => {
    const f = setup();
    const first = run(f.db);
    await untilModelCalled(1);
    expect(f.quote.generation_started_at).toEqual(expect.any(String));

    const second = await run(f.db);
    expect(second).toEqual({
      ok: false,
      status: 409,
      body: {
        error: "We're already writing this quote. It will open here as soon as it's ready.",
        code: "generation_in_progress",
        retry_after_s: 10,
      },
    });
    expect(provider.calls).toBe(1);

    provider.release?.();
    expect(await first).toEqual({ ok: true });
    expect(provider.calls).toBe(1);
    // Saved, and the same write cleared the lease.
    expect((f.quote.quote_data as { line_items: unknown[] }).line_items.length).toBeGreaterThan(0);
    expect(f.quote.generation_started_at).toBeNull();
    const save = f.quoteUpdates.find((u) => "quote_data" in u.payload);
    expect(save?.payload).toMatchObject({ generation_started_at: null });

    // A revisit after it finished is "already generated", not a new run.
    expect(await run(f.db)).toMatchObject({ ok: false, status: 409, body: { error: "Quote has already been generated" } });
    expect(provider.calls).toBe(1);
  });

  it("releases the lease when generation fails, so a retry can start at once", async () => {
    const f = setup();
    provider.fail = new AiError({ kind: "overloaded", provider: "anthropic", status: 529, attempts: 3 });
    const result = await run(f.db);
    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(f.quote.generation_started_at).toBeNull();
    expect(f.quote.quote_data).toBeNull();

    provider.fail = null;
    const retry = run(f.db);
    await untilModelCalled(2);
    provider.release?.();
    expect(await retry).toEqual({ ok: true });
  });

  it("runs unlocked (as before) when the lease column is missing", async () => {
    const f = setup();
    f.failNextQuoteUpdate("column quotes.generation_started_at does not exist");
    const pending = run(f.db);
    await untilModelCalled(1);
    provider.release?.();
    expect(await pending).toEqual({ ok: true });
    // No lease write in the save when no lease was taken.
    const save = f.quoteUpdates.find((u) => "quote_data" in u.payload);
    expect(save?.payload).not.toHaveProperty("generation_started_at");
  });
});
