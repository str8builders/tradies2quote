import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Audit 2026-09-24, item 12 — a non-OK transcription response was only
 * console-logged. It is now reported to the internal error monitor with the
 * upstream STATUS only (never the provider's body).
 */

const h = vi.hoisted(() => ({
  capture: [] as Array<[Error, Record<string, unknown>]>,
  upstream: { status: 400, body: "" },
}));

vi.mock("@/lib/observability", () => ({
  captureError: (e: Error, ctx: Record<string, unknown>) => h.capture.push([e, ctx]),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-1", created_at: "2026-09-01T00:00:00Z", email: "t@example.com" } },
      }),
    },
  }),
}));
vi.mock("@/lib/ai-consent", () => ({ aiConsentGate: async () => null }));
vi.mock("@/lib/rate-limit", () => ({
  consumeDailyQuota: () => ({ ok: true }),
  tooManyRequestsResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/subscription", () => ({
  getSubscriptionStatus: async () => ({}),
  canWrite: () => true,
}));
vi.mock("@/lib/transcript/vocab", () => ({ loadUserVocab: async () => ({ entries: [] }) }));
vi.mock("@/lib/transcript/asrHints", () => ({
  buildAsrPrompt: () => "GIB, H3.2",
  STATIC_TRADE_VOCAB_PROMPT: "GIB",
}));
vi.mock("@/lib/fetchTimeout", () => ({
  TIMEOUTS: { transcribe: 1000 },
  fetchWithTimeout: async () => new Response(h.upstream.body, { status: h.upstream.status }),
}));

import { POST } from "./route";

function audioRequest(): NextRequest {
  const form = new FormData();
  form.append("audio", new File([new Uint8Array([1, 2, 3])], "clip.webm", { type: "audio/webm" }));
  return new Request("https://app.test/api/quotes/transcribe", { method: "POST", body: form }) as unknown as NextRequest;
}

describe("POST /api/quotes/transcribe — upstream failures are monitored", () => {
  beforeEach(() => {
    h.capture.length = 0;
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports a non-OK response with its status only", async () => {
    h.upstream = { status: 400, body: '{"error":{"message":"Invalid file for user t@example.com"}}' };
    const res = await POST(audioRequest());
    expect(res.status).toBe(502);
    expect(h.capture).toHaveLength(1);
    const [err, ctx] = h.capture[0];
    expect(err.message).toBe("Transcription upstream returned HTTP 400");
    expect(ctx).toEqual({ route: "/api/quotes/transcribe", httpStatus: 400 });
    expect(JSON.stringify([err.message, ctx])).not.toContain("example.com");
  });

  it("does not report a successful transcription", async () => {
    h.upstream = { status: 200, body: JSON.stringify({ text: "deck for Dave" }) };
    const res = await POST(audioRequest());
    expect(res.status).toBe(200);
    expect(h.capture).toHaveLength(0);
  });
});
