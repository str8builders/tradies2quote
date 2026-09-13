import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Same defect as the materials-takeoff route: the handler minted a `qgen_…`
 * run id and logged run.start/run.finish as "Quote Generation Agent" while
 * `runStructuredAgent` minted a second id and logged as "Quote Generation" —
 * two `agent_runs` rows per invocation. One id is now threaded through.
 */
const mock = vi.hoisted(() => ({
  agent: vi.fn(async (_input: unknown, _opts?: { runId?: string }) => ({
    jobName: "Deck",
    clientName: "Dave",
    lineItems: [],
    subtotal: 0,
    gstRate: 0.15,
    gstAmount: 0,
    total: 0,
    notes: [],
    terms: "",
  })),
  start: vi.fn(),
  finish: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "owner-1", email: "challis836@gmail.com" } },
      }),
    },
  }),
}));
vi.mock("@/lib/agents/quote-generation", () => ({
  QUOTE_GENERATION_AGENT_NAME: "Quote Generation",
  runQuoteGenerationAgent: mock.agent,
}));
vi.mock("@/lib/agent-monitor/logger", () => ({
  logAgentRunStart: mock.start,
  logAgentRunFinish: mock.finish,
  logAgentEvent: vi.fn(),
  logAgentStep: vi.fn(),
  logAgentError: vi.fn(),
  logAgentApprovalNeeded: vi.fn(),
  newRunId: (prefix: string) => `${prefix}_route1`,
  flushAgentRun: async () => undefined,
}));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new NextRequest("https://tradies2quote.com/api/agents/quote-generation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/agents/quote-generation run ids", () => {
  beforeEach(() => {
    mock.agent.mockClear();
    mock.start.mockClear();
    mock.finish.mockClear();
  });

  it("threads one run id into the agent and logs no second run.start", async () => {
    const res = await post({ transcript: "Deck for Dave, 24 square metres" });
    expect(res.status).toBe(200);

    expect(mock.agent).toHaveBeenCalledTimes(1);
    expect(mock.agent.mock.calls[0][0]).toMatchObject({
      transcript: "Deck for Dave, 24 square metres",
    });
    expect(mock.agent.mock.calls[0][1]).toEqual({ runId: "qgen_route1" });

    expect(mock.start).not.toHaveBeenCalled();
    expect(mock.finish).not.toHaveBeenCalled();
  });

  it("closes the same run id under one agent name when the agent throws", async () => {
    mock.agent.mockRejectedValueOnce(new Error("Anthropic 529: overloaded"));
    const res = await post({ transcript: "Deck for Dave" });
    expect(res.status).toBe(502);

    expect(mock.start).not.toHaveBeenCalled();
    expect(mock.finish).toHaveBeenCalledTimes(1);
    expect(mock.finish.mock.calls[0][0]).toMatchObject({
      runId: "qgen_route1",
      agentName: "Quote Generation",
      status: "failed",
    });
  });
});
