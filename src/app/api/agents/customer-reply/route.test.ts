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
import { AI_ERROR_MESSAGES, AiError } from "@/lib/ai/errors";
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

describe("POST /api/agents/customer-reply error mapping — no upstream text reaches the client", () => {
  beforeEach(() => {
    mock.agent.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("an overloaded provider → 503, plain sentence, retry-after, no detail", async () => {
    mock.agent.mockRejectedValueOnce(
      new AiError({
        kind: "overloaded",
        provider: "anthropic",
        status: 529,
        attempts: 3,
        retryAfterMs: 7_000,
        detail: 'overloaded_error: {"request_id":"req_secret"}',
      }),
    );
    const res = await post({ customerMessage: "Can you start Monday?" });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("7");
    const body = await res.json();
    expect(body).toEqual({ error: AI_ERROR_MESSAGES.overloaded, code: "overloaded" });
    expect(JSON.stringify(body)).not.toMatch(/529|req_secret|overloaded_error|Anthropic|OpenAI/);
  });

  it("a plain upstream error string never leaks", async () => {
    mock.agent.mockRejectedValueOnce(new Error('Anthropic 529: {"type":"error","error":{"type":"overloaded_error"}}'));
    const res = await post({ customerMessage: "Can you start Monday?" });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("unknown");
    expect(JSON.stringify(body)).not.toMatch(/529|overloaded_error|Anthropic/);
  });

  it("a timeout → 504 with a plain sentence", async () => {
    mock.agent.mockRejectedValueOnce(new AiError({ kind: "timeout", provider: "anthropic" }));
    const res = await post({ customerMessage: "Can you start Monday?" });
    expect(res.status).toBe(504);
    expect((await res.json()).error).toMatch(/too long/);
  });

  it("missing configuration → 503", async () => {
    mock.agent.mockRejectedValueOnce(
      new AiError({ kind: "not_configured", provider: "anthropic", message: "ANTHROPIC_API_KEY is not configured." }),
    );
    const res = await post({ customerMessage: "Can you start Monday?" });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("not_configured");
    expect(JSON.stringify(body)).not.toContain("API_KEY");
  });
});
