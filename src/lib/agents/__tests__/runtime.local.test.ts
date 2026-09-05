import { afterEach, describe, expect, it } from "vitest";
import { runStructuredAgent } from "../runtime";

const ORIGINAL = {
  provider: process.env.TEXT_AI_PROVIDER,
  baseUrl: process.env.LOCAL_LLM_BASE_URL,
  apiKey: process.env.LOCAL_LLM_API_KEY,
  model: process.env.LOCAL_LLM_MODEL,
  timeoutMs: process.env.LOCAL_LLM_TIMEOUT_MS,
  maxTokens: process.env.LOCAL_LLM_MAX_TOKENS,
};

afterEach(() => {
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore("TEXT_AI_PROVIDER", ORIGINAL.provider);
  restore("LOCAL_LLM_BASE_URL", ORIGINAL.baseUrl);
  restore("LOCAL_LLM_API_KEY", ORIGINAL.apiKey);
  restore("LOCAL_LLM_MODEL", ORIGINAL.model);
  restore("LOCAL_LLM_TIMEOUT_MS", ORIGINAL.timeoutMs);
  restore("LOCAL_LLM_MAX_TOKENS", ORIGINAL.maxTokens);
});

function enableLocalProvider() {
  process.env.TEXT_AI_PROVIDER = "local";
  process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:8088/v1";
  process.env.LOCAL_LLM_API_KEY = "test-key";
  process.env.LOCAL_LLM_MODEL = "qwen-test";
  process.env.LOCAL_LLM_TIMEOUT_MS = "1800000";
  process.env.LOCAL_LLM_MAX_TOKENS = "256";
}

describe("runStructuredAgent local provider", () => {
  it("delegates text calls through json_schema", async () => {
    enableLocalProvider();
    let body: Record<string, unknown> = {};
    const fetchImpl: typeof fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"answer":"yes"}' } }],
          usage: { prompt_tokens: 12, completion_tokens: 3 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await runStructuredAgent({
      agentName: "Test agent",
      system: "Return an answer.",
      user: "Is this local?",
      tool: {
        name: "emit_answer",
        description: "Return the answer.",
        schema: {
          type: "object",
          properties: { answer: { type: "string" } },
          required: ["answer"],
        },
      },
      parse: (input) => ({
        ok: true as const,
        value: input as { answer: string },
      }),
      maxTokens: 4096,
      fetchImpl,
    });

    expect(body).toHaveProperty("response_format.type", "json_schema");
    expect(body).toHaveProperty("max_tokens", 256);
    expect(body).not.toHaveProperty("tools");
    expect(result).toMatchObject({
      value: { answer: "yes" },
      model: "qwen-test",
      usage: {
        inputTokens: 12,
        outputTokens: 3,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    });
  });

  it("rejects image blocks before any local request", async () => {
    enableLocalProvider();
    let fetchCalled = false;
    const fetchImpl: typeof fetch = async () => {
      fetchCalled = true;
      throw new Error("unexpected request");
    };

    await expect(
      runStructuredAgent({
        agentName: "Vision test",
        system: "Inspect the image.",
        user: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "AA==",
            },
          },
        ],
        tool: {
          name: "emit_result",
          description: "Return a result.",
          schema: { type: "object", properties: {} },
        },
        parse: () => ({ ok: true as const, value: {} }),
        fetchImpl,
      }),
    ).rejects.toThrow(/does not support image input/i);
    expect(fetchCalled).toBe(false);
  });
});
