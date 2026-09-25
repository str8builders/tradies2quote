import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { NextRequest } from "next/server";

/** One `agent_runs` row per invocation: the route mints the id, the OpenAI runtime owns the lifecycle. */
const mock = vi.hoisted(() => ({
  agent: vi.fn(async (_input: { imageBase64: string; mimeType: string; hint: string | null }, _opts?: { runId?: string }) => ({ description: "A deck", items: [], reviewFlags: [], quoteNote: "" })),
  start: vi.fn(),
  finish: vi.fn(),
  ua: "",
  consentAt: null as string | null,
}));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => (k.toLowerCase() === "user-agent" ? mock.ua : null) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1", email: "tradie@example.invalid", created_at: "2026-09-01T00:00:00Z" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            const { AI_CONSENT_VERSION } = await vi.importActual<typeof import("@/lib/ai-consent")>("@/lib/ai-consent");
            return { data: { ai_consent_at: mock.consentAt, ai_consent_version: AI_CONSENT_VERSION }, error: null };
          },
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/subscription", () => ({ getSubscriptionStatus: async () => ({ state: "trialing" }), canWrite: () => true }));
vi.mock("@/lib/rate-limit", () => ({ consumeDailyQuota: () => ({ ok: true }), tooManyRequestsResponse: () => new Response(null, { status: 429 }) }));
vi.mock("@/lib/agents/photo-plan", () => ({ MAX_IMAGE_BYTES: 8 * 1024 * 1024, PHOTO_PLAN_AGENT_NAME: "Photo Plan", runPhotoPlanAgent: mock.agent }));
vi.mock("@/lib/agent-monitor/logger", () => ({
  logAgentRunStart: mock.start, logAgentRunFinish: mock.finish, logAgentEvent: vi.fn(), logAgentStep: vi.fn(), logAgentError: vi.fn(), logAgentApprovalNeeded: vi.fn(),
  newRunId: (prefix: string) => `${prefix}_route1`, flushAgentRun: async () => undefined,
}));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { POST } from "./route";
import { AI_ERROR_MESSAGES, AiError } from "@/lib/ai/errors";

let sitePhoto: Buffer;
beforeAll(async () => {
  // A real JPEG carrying camera GPS, like a phone photo taken on site.
  sitePhoto = await sharp({ create: { width: 48, height: 32, channels: 3, background: "#7a8b5c" } })
    .jpeg()
    .withExif({
      IFD0: { Copyright: "t2q-exif-marker" },
      IFD3: { GPSLatitudeRef: "S", GPSLatitude: "37/1 41/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "176/1 10/1 0/1" },
    })
    .toBuffer();
});

function post(bytes: Uint8Array<ArrayBuffer> = new Uint8Array(sitePhoto)) {
  const form = new FormData();
  form.append("image", new File([bytes], "site.jpg", { type: "image/jpeg" }));
  form.append("hint", "north wall");
  return POST(new NextRequest("https://tradies2quote.com/api/agents/photo-plan", { method: "POST", body: form }));
}

describe("POST /api/agents/photo-plan run ids", () => {
  beforeEach(() => {
    mock.agent.mockClear(); mock.start.mockClear(); mock.finish.mockClear();
    mock.ua = "Mozilla/5.0 (iPhone) Safari/604.1";
    mock.consentAt = null;
  });

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

  it("requires AI consent in the iOS app before the photo goes to OpenAI", async () => {
    mock.ua = "Mozilla/5.0 (iPhone) Mobile/15E148 T2QNativeShell";
    const res = await post();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error?: string }).error).toBe("ai_consent_required");
    expect(mock.agent).not.toHaveBeenCalled();

    mock.consentAt = "2026-09-01T00:00:00Z";
    expect((await post()).status).toBe(200);
  });

  it("strips EXIF/GPS before the photo is sent to the AI", async () => {
    await post();
    const sent = Buffer.from(mock.agent.mock.calls[0][0].imageBase64, "base64");
    expect(sent.includes(Buffer.from("t2q-exif-marker"))).toBe(false);
    expect((await sharp(sent).metadata()).exif).toBeUndefined();
  });

  it("rejects bytes that only look like a JPEG instead of forwarding them", async () => {
    const res = await post(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    expect(res.status).toBe(415);
    expect(mock.agent).not.toHaveBeenCalled();
  });
});

describe("POST /api/agents/photo-plan error mapping — no upstream text reaches the client", () => {
  beforeEach(() => {
    mock.agent.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("an overloaded provider → 503, plain sentence, retry-after, no detail", async () => {
    mock.agent.mockRejectedValueOnce(
      new AiError({
        kind: "overloaded",
        provider: "openai",
        status: 529,
        attempts: 3,
        retryAfterMs: 7_000,
        detail: 'overloaded_error: {"request_id":"req_secret"}',
      }),
    );
    const res = await post();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("7");
    const body = await res.json();
    expect(body).toEqual({ error: AI_ERROR_MESSAGES.overloaded, code: "overloaded" });
    expect(JSON.stringify(body)).not.toMatch(/529|req_secret|overloaded_error|Anthropic|OpenAI/);
  });

  it("a plain upstream error string never leaks", async () => {
    mock.agent.mockRejectedValueOnce(new Error('Anthropic 529: {"type":"error","error":{"type":"overloaded_error"}}'));
    const res = await post();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("unknown");
    expect(JSON.stringify(body)).not.toMatch(/529|overloaded_error|Anthropic/);
  });

  it("a timeout → 504 with a plain sentence", async () => {
    mock.agent.mockRejectedValueOnce(new AiError({ kind: "timeout", provider: "openai" }));
    const res = await post();
    expect(res.status).toBe(504);
    expect((await res.json()).error).toMatch(/too long/);
  });

  it("missing configuration → 503", async () => {
    mock.agent.mockRejectedValueOnce(
      new AiError({ kind: "not_configured", provider: "openai", message: "ANTHROPIC_API_KEY is not configured." }),
    );
    const res = await post();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("not_configured");
    expect(JSON.stringify(body)).not.toContain("API_KEY");
  });
});
