// These orchestration cases start after permission has been granted.
vi.mock("@/lib/ai-consent", () => ({ aiConsentGate: async () => null }));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The route called `runLocalChatCompletion` unconditionally, so supplier
 * extraction was dead in production (TEXT_AI_PROVIDER=anthropic), and it
 * swallowed a bare `JSON.parse` failure as "no product found" — the tradie
 * saw an empty result instead of an error. It now honours the provider and
 * parses with `parseModelJsonObject`, answering 502 on unreadable output.
 */
const mock = vi.hoisted(() => ({
  structured: vi.fn(async (_opts: {
    maxTokens?: number;
    agentName: string;
    parse: (input: unknown) =>
      | { ok: true; value: { name: string; price: number; unit: string } | null }
      | { ok: false; error: string };
  }) => ({
    value: { name: "H3.2 90x45 4.8m", price: 24.5, unit: "each" } as
      | { name: string; price: number; unit: string }
      | null,
    model: "claude-sonnet-5",
    attempts: 1,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
  })),
  local: vi.fn(async () => ({
    text: '{"name":"Pine 90x45","price":19.5,"unit":"each"}',
    model: "qwen",
    finishReason: "stop",
    usage: { inputTokens: 0, outputTokens: 0 },
  })),
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

const PAGE_HTML =
  "<html><body><h1>Pine 90x45</h1><span>$19.50 each</span></body></html>";

function post(url = "https://supplier.example/product/pine-90x45") {
  return POST(
    new NextRequest("https://tradies2quote.com/api/suppliers/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    }),
  );
}

describe("POST /api/suppliers/extract", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    mock.structured.mockClear();
    mock.local.mockClear();
    originalFetch = globalThis.fetch;
    // The supplier page fetch is real `fetch` in the route — stub it.
    globalThis.fetch = (async () =>
      new Response(PAGE_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (ENV.provider === undefined) delete process.env.TEXT_AI_PROVIDER;
    else process.env.TEXT_AI_PROVIDER = ENV.provider;
    if (ENV.key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ENV.key;
  });

  it("extracts through the hosted runtime when the provider is not local", async () => {
    process.env.TEXT_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";

    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      fetched: true,
      product: { name: "H3.2 90x45 4.8m", price: 24.5, unit: "each" },
    });

    expect(mock.local).not.toHaveBeenCalled();
    expect(mock.structured).toHaveBeenCalledTimes(1);
    const opts = mock.structured.mock.calls[0][0];
    // 512 is at or below the runtime's SMALL_CAP_TOKENS, so `effort: "low"`
    // applies and a thinking model can't starve the answer.
    expect(opts.maxTokens).toBe(512);
    expect(opts.agentName).toBe("Supplier Extract");

    // The tool input the runtime would hand back goes through the same
    // normalisation the local path uses — trim, 2dp, unit default, and
    // `found: false` means "no product", not a validation failure.
    expect(
      opts.parse({ found: true, name: "  Pine 90x45 ", price: 19.499, unit: "" }),
    ).toEqual({ ok: true, value: { name: "Pine 90x45", price: 19.5, unit: "each" } });
    expect(opts.parse({ found: false })).toEqual({ ok: true, value: null });
    expect(opts.parse({ found: true, name: "Pine" }).ok).toBe(false);
  });

  it("returns product: null when the hosted model reports no product", async () => {
    process.env.TEXT_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    mock.structured.mockResolvedValueOnce({
      value: null,
      model: "claude-sonnet-5",
      attempts: 1,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    });

    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ fetched: true, product: null });
  });

  it("parses the local model's fenced JSON with parseModelJsonObject", async () => {
    process.env.TEXT_AI_PROVIDER = "local";
    mock.local.mockResolvedValueOnce({
      text: '```json\n{"name":"Pine 90x45","price":19.499,"unit":"m"}\n```',
      model: "qwen",
      finishReason: "stop",
      usage: { inputTokens: 0, outputTokens: 0 },
    });

    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      product: { name: "Pine 90x45", price: 19.5, unit: "m" },
    });
    expect(mock.structured).not.toHaveBeenCalled();
  });

  it("keeps a bare null as 'no product', not an error", async () => {
    process.env.TEXT_AI_PROVIDER = "local";
    mock.local.mockResolvedValueOnce({
      text: "null",
      model: "qwen",
      finishReason: "stop",
      usage: { inputTokens: 0, outputTokens: 0 },
    });

    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ fetched: true, product: null });
  });

  it("502s with a clear message when the model output is unparsable", async () => {
    process.env.TEXT_AI_PROVIDER = "local";
    mock.local.mockResolvedValueOnce({
      // Truncated object — the old bare JSON.parse swallowed this as
      // "product: null" and the tradie got a silent empty result.
      text: '{"name":"Pine 90x45","pri',
      model: "qwen",
      finishReason: "length",
      usage: { inputTokens: 0, outputTokens: 0 },
    });

    const res = await post();
    expect(res.status).toBe(502);
    expect(String((await res.json()).error)).toMatch(/unreadable/i);
  });

  it("503s when no text provider is configured", async () => {
    delete process.env.TEXT_AI_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;

    const res = await post();
    expect(res.status).toBe(503);
    expect(mock.local).not.toHaveBeenCalled();
    expect(mock.structured).not.toHaveBeenCalled();
  });
});
