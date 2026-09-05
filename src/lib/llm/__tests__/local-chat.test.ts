import { describe, expect, it } from "vitest";
import {
  buildLocalJsonSchemaResponseFormat,
  clampLocalMaxTokens,
  DEFAULT_LOCAL_LLM_MAX_TOKENS,
  DEFAULT_LOCAL_LLM_TIMEOUT_MS,
  isLocalTextAiProvider,
  resolveLocalLlmConfig,
  runLocalChatCompletion,
  toChatCompletionsUrl,
} from "../local-chat";

describe("local chat configuration", () => {
  it("recognises only the explicit local provider", () => {
    expect(isLocalTextAiProvider("LOCAL")).toBe(true);
    expect(isLocalTextAiProvider("openai")).toBe(false);
    expect(isLocalTextAiProvider(undefined)).toBe(false);
  });

  it("normalises an OpenAI-compatible base URL", () => {
    expect(toChatCompletionsUrl("http://127.0.0.1:8088/v1/")).toBe(
      "http://127.0.0.1:8088/v1/chat/completions",
    );
  });

  it("fails with an env name and never a secret value", () => {
    expect(() =>
      resolveLocalLlmConfig(
        {},
        {
          LOCAL_LLM_BASE_URL: "http://127.0.0.1:8088/v1",
          LOCAL_LLM_MODEL: "qwen",
        },
      ),
    ).toThrow("LOCAL_LLM_API_KEY");
  });

  it("defaults to a 30-minute timeout and 2048-token ceiling", () => {
    const config = resolveLocalLlmConfig(
      {},
      {
        LOCAL_LLM_BASE_URL: "http://127.0.0.1:8088/v1",
        LOCAL_LLM_API_KEY: "test-key",
        LOCAL_LLM_MODEL: "qwen",
      },
    );
    expect(config.timeoutMs).toBe(DEFAULT_LOCAL_LLM_TIMEOUT_MS);
    expect(config.maxTokensCeiling).toBe(DEFAULT_LOCAL_LLM_MAX_TOKENS);
    expect(clampLocalMaxTokens(4096, config.maxTokensCeiling)).toBe(2048);
  });

  it("parses configurable timeout and token ceilings", () => {
    const config = resolveLocalLlmConfig(
      {},
      {
        LOCAL_LLM_BASE_URL: "http://127.0.0.1:8088/v1",
        LOCAL_LLM_API_KEY: "test-key",
        LOCAL_LLM_MODEL: "qwen",
        LOCAL_LLM_TIMEOUT_MS: "900000",
        LOCAL_LLM_MAX_TOKENS: "512",
      },
    );
    expect(config.timeoutMs).toBe(900000);
    expect(config.maxTokensCeiling).toBe(512);
  });

  it("builds llama.cpp-compatible json_schema output", () => {
    expect(
      buildLocalJsonSchemaResponseFormat({
        name: "answer",
        schema: { type: "object", properties: { ok: { type: "boolean" } } },
      }),
    ).toMatchObject({
      type: "json_schema",
      json_schema: { name: "answer", strict: true },
    });
  });
});

describe("runLocalChatCompletion", () => {
  it("posts to the local endpoint and returns content", async () => {
    let requestedUrl = "";
    let requestedBody: Record<string, unknown> = {};
    const fetchImpl: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [
            { finish_reason: "stop", message: { content: '{"ok":true}' } },
          ],
          usage: { prompt_tokens: 8, completion_tokens: 4 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await runLocalChatCompletion({
      baseUrl: "http://127.0.0.1:8088/v1",
      apiKey: "test-secret",
      model: "qwen-test",
      system: "Return JSON.",
      user: "Say yes.",
      maxTokens: 9999,
      responseSchema: {
        name: "answer",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
      },
      fetchImpl,
    });

    expect(requestedUrl).toBe(
      "http://127.0.0.1:8088/v1/chat/completions",
    );
    expect(requestedBody).toHaveProperty("response_format.type", "json_schema");
    expect(requestedBody).toHaveProperty("max_tokens", 2048);
    expect(result).toMatchObject({
      text: '{"ok":true}',
      model: "qwen-test",
      usage: { inputTokens: 8, outputTokens: 4 },
    });
  });
});
