import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One invocation must produce exactly ONE `agent_runs` row.
 *
 * The monitor keys runs on `run_id`, so a caller that mints its own id while
 * `runStructuredAgent` mints another gets two rows per call under two
 * different agent names (that was the bug in the materials-takeoff and
 * quote-generation routes). These tests pin the run-id contract at the
 * runtime boundary and at the agent wrappers the routes call.
 */
const logs = vi.hoisted(() => ({
  start: vi.fn(),
  finish: vi.fn(),
}));

vi.mock("@/lib/agent-monitor/logger", () => ({
  logAgentRunStart: logs.start,
  logAgentRunFinish: logs.finish,
  logAgentEvent: vi.fn(),
  logAgentStep: vi.fn(),
  logAgentError: vi.fn(),
  logAgentApprovalNeeded: vi.fn(),
  newRunId: (prefix: string) => `${prefix}_minted`,
  flushAgentRun: async () => undefined,
}));

import { runStructuredAgent } from "../runtime";
import {
  MATERIALS_TAKEOFF_AGENT_NAME,
  runMaterialsTakeoffAgent,
} from "../materials-takeoff";
import {
  QUOTE_GENERATION_AGENT_NAME,
  runQuoteGenerationAgent,
} from "../quote-generation";

const TOOL = {
  name: "emit",
  description: "Return it",
  schema: { type: "object", properties: { total: { type: "number" } } },
};

function toolResponse(name: string, input: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      content: [{ type: "tool_use", name, input }],
      usage: {},
    }),
  } as unknown as Response;
}

const previousProvider = process.env.TEXT_AI_PROVIDER;
const previousKey = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  logs.start.mockClear();
  logs.finish.mockClear();
  process.env.TEXT_AI_PROVIDER = "anthropic";
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterEach(() => {
  if (previousProvider === undefined) delete process.env.TEXT_AI_PROVIDER;
  else process.env.TEXT_AI_PROVIDER = previousProvider;
  if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = previousKey;
});

describe("runStructuredAgent run id", () => {
  it("logs exactly one start/finish pair against a caller-supplied run id", async () => {
    await runStructuredAgent({
      agentName: "Caller Owned",
      system: "S",
      user: "U",
      tool: TOOL,
      parse: (input) => ({ ok: true as const, value: input }),
      apiKey: "key",
      runId: "mtake_caller",
      fetchImpl: (async () =>
        toolResponse("emit", { total: 1 })) as unknown as typeof fetch,
    });

    expect(logs.start).toHaveBeenCalledTimes(1);
    expect(logs.finish).toHaveBeenCalledTimes(1);
    expect(logs.start.mock.calls[0][0]).toMatchObject({
      runId: "mtake_caller",
      agentName: "Caller Owned",
    });
    expect(logs.finish.mock.calls[0][0]).toMatchObject({
      runId: "mtake_caller",
      agentName: "Caller Owned",
      status: "complete",
    });
  });

  it("mints its own only when the caller passes none", async () => {
    await runStructuredAgent({
      agentName: "Unowned",
      system: "S",
      user: "U",
      tool: TOOL,
      parse: (input) => ({ ok: true as const, value: input }),
      apiKey: "key",
      fetchImpl: (async () =>
        toolResponse("emit", { total: 1 })) as unknown as typeof fetch,
    });
    expect(logs.start.mock.calls[0][0].runId).toBe("unowned_minted");
  });
});

describe("agent wrappers forward the caller's run id", () => {
  it("materials takeoff keeps the route's run id and agent name", async () => {
    const fetchImpl = (async () =>
      toolResponse("emit_takeoff", {
        understoodAs: "Deck",
        lines: [
          {
            description: "Decking board",
            quantity: 10,
            unit: "lm",
            note: null,
            ai_estimated: true,
            category: "exterior",
          },
        ],
        assumptions: [],
        reviewFlags: [],
      })) as unknown as typeof fetch;

    // The agent doesn't take a fetchImpl, so stub global fetch for the call.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      await runMaterialsTakeoffAgent(
        { jobText: "Build a small deck", country: "NZ" },
        { runId: "mtake_route1" },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(logs.start).toHaveBeenCalledTimes(1);
    expect(logs.start.mock.calls[0][0]).toMatchObject({
      runId: "mtake_route1",
      agentName: MATERIALS_TAKEOFF_AGENT_NAME,
    });
  });

  it("quote generation keeps the route's run id and agent name", async () => {
    const fetchImpl = (async () =>
      toolResponse("emit_quote", {
        jobName: "Deck",
        clientName: "Dave",
        lineItems: [
          {
            description: "Decking",
            quantity: 2,
            unit: "m2",
            unitPrice: 10,
            lineTotal: 20,
            category: "materials",
          },
        ],
        notes: [],
        terms: "Net 7.",
      })) as unknown as typeof fetch;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      await runQuoteGenerationAgent(
        { transcript: "Build a deck for Dave" },
        { runId: "qgen_route1" },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    const starts = logs.start.mock.calls.map((c) => c[0]);
    const pipelineStart = starts.find(
      (s) => s.agentName === QUOTE_GENERATION_AGENT_NAME,
    );
    expect(pipelineStart).toMatchObject({ runId: "qgen_route1" });
  });
});
