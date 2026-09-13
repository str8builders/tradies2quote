import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** One `agent_runs` row per invocation: the route mints the id, the runtime owns the lifecycle. */
const mock = vi.hoisted(() => ({
  agent: vi.fn(async (_input: unknown, _opts?: { runId?: string }) => ({ intent: "question", confidence: 0.9, reasoning: "", replyDraft: "Hi" })),
  start: vi.fn(),
  finish: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner-1", email: "owner@example.invalid" } } }) } }),
}));
vi.mock("@/lib/owner", () => ({ isOwnerEmail: () => true }));
vi.mock("@/lib/rate-limit", () => ({ consumeDailyQuota: () => ({ ok: true }), tooManyRequestsResponse: () => new Response(null, { status: 429 }) }));
vi.mock("@/lib/agents/customer-reply", () => ({ CUSTOMER_REPLY_AGENT_NAME: "Customer Reply", runCustomerReplyAgent: mock.agent }));
vi.mock("@/lib/agent-monitor/logger", () => ({
  logAgentRunStart: mock.start, logAgentRunFinish: mock.finish, logAgentEvent: vi.fn(), logAgentStep: vi.fn(), logAgentError: vi.fn(), logAgentApprovalNeeded: vi.fn(),
  newRunId: (prefix: string) => `${prefix}_route1`, flushAgentRun: async () => undefined,
}));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { POST } from "./route";
const post = (body: unknown) => POST(new NextRequest("https://tradies2quote.com/api/agents/customer-reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("POST /api/agents/customer-reply run ids", () => {
  beforeEach(() => { mock.agent.mockClear(); mock.start.mockClear(); mock.finish.mockClear(); });

  it("threads one run id into the agent and logs no second row", async () => {
    const res = await post({ customerMessage: "Can you start Monday?" });
    expect(res.status).toBe(200);
    expect(mock.agent).toHaveBeenCalledTimes(1);
    expect(mock.agent.mock.calls[0][1]).toEqual({ runId: "creply_route1" });
    expect(mock.start).not.toHaveBeenCalled();
    expect(mock.finish).not.toHaveBeenCalled();
  });

  it("closes the same run id under the agent's own name when it throws", async () => {
    mock.agent.mockRejectedValueOnce(new Error("Anthropic 500: boom"));
    const res = await post({ customerMessage: "Can you start Monday?" });
    expect(res.status).toBe(502);
    expect(mock.start).not.toHaveBeenCalled();
    expect(mock.finish).toHaveBeenCalledTimes(1);
    expect(mock.finish.mock.calls[0][0]).toMatchObject({ runId: "creply_route1", agentName: "Customer Reply", status: "failed" });
  });
});
