import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * `generateQuoteForUser` is the pipeline EVERY real quote goes through — the
 * app route and the public "Request a quote" intake both call it — yet it
 * logged nothing, so /app/agents/monitor only ever showed the owner-only
 * agent tools. It now wraps the pipeline in one run.start/run.finish pair.
 *
 * The pipeline's early exits are enough to prove the wrapper: no LLM call is
 * needed, and the DB reads are a small chainable stub.
 */
const logs = vi.hoisted(() => ({
  start: vi.fn(),
  finish: vi.fn(),
  flushed: [] as string[],
}));

vi.mock("@/lib/agent-monitor/logger", () => ({
  logAgentRunStart: logs.start,
  logAgentRunFinish: logs.finish,
  logAgentEvent: vi.fn(),
  logAgentStep: vi.fn(),
  logAgentError: vi.fn(),
  logAgentApprovalNeeded: vi.fn(),
  newRunId: (prefix: string) => `${prefix}_test1`,
  flushAgentRun: async (runId: string) => {
    logs.flushed.push(runId);
  },
}));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import {
  QUOTE_PIPELINE_AGENT_NAME,
  generateQuoteForUser,
} from "../run";

const TRANSCRIPT =
  "Deck for Sarah Smith at 12 Beach Road, about 24 square metres, 021 555 1234";

/** Minimal `db` stub: the first `quotes` read decides the outcome. */
function makeDb(quoteRow: {
  data: unknown;
  error: unknown;
}): SupabaseClient<Database> {
  const single = async () => quoteRow;
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ single, maybeSingle: single }),
          maybeSingle: single,
          order: () => ({
            order: async () => ({ data: [], error: null }),
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
}

const OPTS = {
  userId: "11111111-1111-1111-1111-111111111111",
  quoteId: "22222222-2222-2222-2222-222222222222",
  textProvider: "anthropic" as const,
};

describe("generateQuoteForUser agent-monitor logging", () => {
  beforeEach(() => {
    logs.start.mockClear();
    logs.finish.mockClear();
    logs.flushed.length = 0;
  });

  it("opens and closes one run, and flushes before returning", async () => {
    const db = makeDb({ data: null, error: { message: "no rows" } });
    const result = await generateQuoteForUser({ ...OPTS, db });

    expect(result).toEqual({
      ok: false,
      status: 404,
      body: { error: "Quote not found" },
    });

    expect(logs.start).toHaveBeenCalledTimes(1);
    expect(logs.finish).toHaveBeenCalledTimes(1);
    const start = logs.start.mock.calls[0][0];
    const finish = logs.finish.mock.calls[0][0];
    expect(start).toMatchObject({
      agentName: QUOTE_PIPELINE_AGENT_NAME,
      runId: "qpipe_test1",
      status: "running",
      quoteId: OPTS.quoteId,
    });
    expect(finish).toMatchObject({
      agentName: QUOTE_PIPELINE_AGENT_NAME,
      runId: "qpipe_test1",
      status: "failed",
      message: "Stopped with HTTP 404",
    });
    expect(typeof finish.durationMs).toBe("number");
    // run.finish must be settled before the caller answers, or the dashboard
    // shows the run "running" forever.
    expect(logs.flushed).toEqual(["qpipe_test1"]);
  });

  it("records a failure and rethrows when the pipeline throws", async () => {
    const db = {
      from: () => {
        throw new Error("connection reset");
      },
    } as unknown as SupabaseClient<Database>;

    await expect(generateQuoteForUser({ ...OPTS, db })).rejects.toThrow(
      /connection reset/,
    );

    expect(logs.start).toHaveBeenCalledTimes(1);
    expect(logs.finish).toHaveBeenCalledTimes(1);
    expect(logs.finish.mock.calls[0][0]).toMatchObject({
      runId: "qpipe_test1",
      status: "failed",
    });
    expect(logs.finish.mock.calls[0][0].message).toMatch(/connection reset/);
    expect(logs.flushed).toEqual(["qpipe_test1"]);
  });

  it("never puts the transcript or client data in a logged message", async () => {
    const db = makeDb({
      data: { id: OPTS.quoteId, voice_transcript: TRANSCRIPT, quote_data: null },
      error: null,
    });
    // The pipeline runs on past this point; whatever it does, the two log
    // payloads must stay operator-only.
    await generateQuoteForUser({ ...OPTS, db }).catch(() => undefined);

    const payloads = [
      ...logs.start.mock.calls.map((c) => c[0]),
      ...logs.finish.mock.calls.map((c) => c[0]),
    ];
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      const message = String(p.message ?? "");
      expect(message).not.toContain("Sarah Smith");
      expect(message).not.toContain("Beach Road");
      expect(message).not.toContain("021 555 1234");
      expect(message.length).toBeLessThanOrEqual(280);
    }
  });
});
