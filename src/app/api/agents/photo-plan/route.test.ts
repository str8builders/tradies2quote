// These orchestration cases start after permission has been granted.
vi.mock("@/lib/ai-consent", () => ({ aiConsentGate: async () => null }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** One `agent_runs` row per invocation: the route mints the id, the OpenAI runtime owns the lifecycle. */
const mock = vi.hoisted(() => ({
  agent: vi.fn(async (_input: unknown, _opts?: { runId?: string }) => ({ description: "A deck", items: [], reviewFlags: [], quoteNote: "" })),
  start: vi.fn(),
  finish: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1", email: "tradie@example.invalid", created_at: "2026-09-01T00:00:00Z" } } }) } }),
}));
vi.mock("@/lib/subscription", () => ({ getSubscriptionStatus: async () => ({ state: "trialing" }), canWrite: () => true }));
vi.mock("@/lib/rate-limit", () => ({ consumeDailyQuota: () => ({ ok: true }), tooManyRequestsResponse: () => new Response(null, { status: 429 }) }));
vi.mock("@/lib/imageUpload", () => ({ detectImageMime: () => "image/jpeg", isPreparedScanMime: () => true, sniffPreparedImageMime: () => "image/jpeg" }));
vi.mock("@/lib/agents/photo-plan", () => ({ MAX_IMAGE_BYTES: 8 * 1024 * 1024, PHOTO_PLAN_AGENT_NAME: "Photo Plan", runPhotoPlanAgent: mock.agent }));
vi.mock("@/lib/agent-monitor/logger", () => ({
  logAgentRunStart: mock.start, logAgentRunFinish: mock.finish, logAgentEvent: vi.fn(), logAgentStep: vi.fn(), logAgentError: vi.fn(), logAgentApprovalNeeded: vi.fn(),
  newRunId: (prefix: string) => `${prefix}_route1`, flushAgentRun: async () => undefined,
}));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { POST } from "./route";
function post() {
  const form = new FormData();
  form.append("image", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], "site.jpg", { type: "image/jpeg" }));
  form.append("hint", "north wall");
  return POST(new NextRequest("https://tradies2quote.com/api/agents/photo-plan", { method: "POST", body: form }));
}

describe("POST /api/agents/photo-plan run ids", () => {
  beforeEach(() => { mock.agent.mockClear(); mock.start.mockClear(); mock.finish.mockClear(); });

  it("threads one run id into the agent and logs no second row", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(mock.agent).toHaveBeenCalledTimes(1);
    expect(mock.agent.mock.calls[0][0]).toMatchObject({ mimeType: "image/jpeg", hint: "north wall" });
    expect(mock.agent.mock.calls[0][1]).toEqual({ runId: "photo_route1" });
    expect(mock.start).not.toHaveBeenCalled();
    expect(mock.finish).not.toHaveBeenCalled();
  });

  it("closes the same run id under the agent's own name when it throws", async () => {
    mock.agent.mockRejectedValueOnce(new Error("OpenAI 500: boom"));
    const res = await post();
    expect(res.status).toBe(502);
    expect(mock.finish).toHaveBeenCalledTimes(1);
    expect(mock.finish.mock.calls[0][0]).toMatchObject({ runId: "photo_route1", agentName: "Photo Plan", status: "failed" });
  });
});
