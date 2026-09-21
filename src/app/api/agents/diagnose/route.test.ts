// These orchestration cases start after permission has been granted.
vi.mock("@/lib/ai-consent", () => ({ aiConsentGate: async () => null }));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The Diagnose button on /app/agents/monitor was dead in production: the
 * route required `isLocalTextAiProvider()` and answered 503 whenever
 * TEXT_AI_PROVIDER was anything else (it is `anthropic` on the VPS). It now
 * runs the same triage prompt through the shared hosted runtime, with a
 * 1024-token cap so the runtime's `effort: "low"` guard applies.
 */
const mock = vi.hoisted(() => ({
  structured: vi.fn(
    async (_opts: { maxTokens?: number; agentName: string }) => ({
      value: "**Probable cause** — the upstream timed out.",
      model: "claude-sonnet-5",
      attempts: 1,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    }),
  ),
  local: vi.fn(async () => ({
    text: "local triage",
    model: "qwen",
    finishReason: "stop",
    usage: { inputTokens: 0, outputTokens: 0 },
  })),
  run: { run_id: "qgen_abc", agent_name: "Quote Generation" } as
    | Record<string, unknown>
    | null,
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
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    from: (table: string) => {
      if (table === "agent_runs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mock.run, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => ({ limit: async () => ({ data: [], error: null }) }),
          }),
        }),
      };
    },
  }),
}));
vi.mock("@/lib/agents/runtime", () => ({ runStructuredAgent: mock.structured }));
vi.mock("@/lib/llm/local-chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/local-chat")>();
  return {
    ...actual,
    resolveLocalLlmConfig: () => ({ model: "qwen" }),
    runLocalChatCompletion: mock.local,
  };
});
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { POST } from "./route";

const ENV = {
  provider: process.env.TEXT_AI_PROVIDER,
  key: process.env.ANTHROPIC_API_KEY,
};

function post(body: unknown) {
  return POST(
    new NextRequest("https://tradies2quote.com/api/agents/diagnose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/agents/diagnose", () => {
  beforeEach(() => {
    mock.structured.mockClear();
    mock.local.mockClear();
    mock.run = { run_id: "qgen_abc", agent_name: "Quote Generation" };
  });

  afterEach(() => {
    if (ENV.provider === undefined) delete process.env.TEXT_AI_PROVIDER;
    else process.env.TEXT_AI_PROVIDER = ENV.provider;
    if (ENV.key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ENV.key;
  });

  it("diagnoses through the hosted runtime when the provider is not local", async () => {
    process.env.TEXT_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";

    const res = await post({ run_id: "qgen_abc" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      diagnosis: "**Probable cause** — the upstream timed out.",
    });

    expect(mock.local).not.toHaveBeenCalled();
    expect(mock.structured).toHaveBeenCalledTimes(1);
    const opts = mock.structured.mock.calls[0][0];
    // Small cap so the runtime applies effort: low — a thinking model must
    // not spend the whole budget reasoning and return nothing.
    expect(opts.maxTokens).toBe(1024);
    expect(opts.agentName).toBe("Run Diagnosis");
  });

  it("keeps the local path when TEXT_AI_PROVIDER=local", async () => {
    process.env.TEXT_AI_PROVIDER = "local";

    const res = await post({ run_id: "qgen_abc" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, diagnosis: "local triage" });
    expect(mock.structured).not.toHaveBeenCalled();
    expect(mock.local).toHaveBeenCalledTimes(1);
  });

  it("503s only when no provider is configured at all", async () => {
    delete process.env.TEXT_AI_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;

    const res = await post({ run_id: "qgen_abc" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("ai_not_configured");
  });

  it("404s for an unknown run before calling any model", async () => {
    process.env.TEXT_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    mock.run = null;

    const res = await post({ run_id: "nope" });
    expect(res.status).toBe(404);
    expect(mock.structured).not.toHaveBeenCalled();
  });

  it("502s when the hosted runtime throws", async () => {
    process.env.TEXT_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    mock.structured.mockRejectedValueOnce(new Error("Anthropic 500"));

    const res = await post({ run_id: "qgen_abc" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("ai_error");
  });
});
