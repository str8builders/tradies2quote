import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The route used to mint its own `mtake_…` run id AND log run.start /
 * run.finish under "Materials & Takeoff Agent", while `runStructuredAgent`
 * minted a second id and logged under "Materials Takeoff" — two
 * `agent_runs` rows per invocation. Now the route mints ONE id, threads it
 * into the agent, and only closes the row itself if the agent throws before
 * the runtime opened it.
 */
const mock = vi.hoisted(() => ({
  agent: vi.fn(
    async (_input: unknown, _opts?: { runId?: string }) => ({
      understoodAs: "Deck",
      lines: [],
      assumptions: [],
      reviewFlags: [],
    }),
  ),
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
vi.mock("@/lib/agents/materials-takeoff", () => ({
  MATERIALS_TAKEOFF_AGENT_NAME: "Materials Takeoff",
  runMaterialsTakeoffAgent: mock.agent,
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
    new NextRequest("https://tradies2quote.com/api/agents/materials-takeoff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/agents/materials-takeoff run ids", () => {
  beforeEach(() => {
    mock.agent.mockClear();
    mock.start.mockClear();
    mock.finish.mockClear();
  });

  it("threads one run id into the agent and logs no second run.start", async () => {
    const res = await post({ jobText: "Build a small deck", country: "NZ" });
    expect(res.status).toBe(200);

    expect(mock.agent).toHaveBeenCalledTimes(1);
    expect(mock.agent.mock.calls[0][0]).toMatchObject({
      jobText: "Build a small deck",
      country: "NZ",
    });
    expect(mock.agent.mock.calls[0][1]).toEqual({ runId: "mtake_route1" });

    // The shared runtime owns the lifecycle for that id — the route must not
    // open (or close) a second row on the happy path.
    expect(mock.start).not.toHaveBeenCalled();
    expect(mock.finish).not.toHaveBeenCalled();
  });

  it("closes the same run id under one agent name when the agent throws", async () => {
    mock.agent.mockRejectedValueOnce(new Error("Anthropic 500: boom"));
    const res = await post({ jobText: "Build a small deck" });
    expect(res.status).toBe(502);

    expect(mock.start).not.toHaveBeenCalled();
    expect(mock.finish).toHaveBeenCalledTimes(1);
    expect(mock.finish.mock.calls[0][0]).toMatchObject({
      runId: "mtake_route1",
      agentName: "Materials Takeoff",
      status: "failed",
    });
  });
});
