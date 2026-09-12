import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_QUOTE_MAX_TOKENS,
  DEFAULT_ANTHROPIC_QUOTE_MODEL,
  resolveAnthropicQuoteModel,
  runAnthropicQuoteCompletion,
} from "@/lib/llm/anthropic-quote";
import { resolveQuoteTextProvider } from "@/lib/llm/quote-text-provider";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("quote text provider selection", () => {
  it("prefers the explicit local provider", () => {
    expect(
      resolveQuoteTextProvider({ TEXT_AI_PROVIDER: "local", ANTHROPIC_API_KEY: "k" }),
    ).toBe("local");
  });

  it("falls back to hosted Claude when a key is present", () => {
    expect(resolveQuoteTextProvider({ ANTHROPIC_API_KEY: "k" })).toBe("anthropic");
    expect(
      resolveQuoteTextProvider({ TEXT_AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" }),
    ).toBe("anthropic");
  });

  it("returns null when nothing is configured", () => {
    expect(resolveQuoteTextProvider({})).toBeNull();
    expect(resolveQuoteTextProvider({ TEXT_AI_PROVIDER: "anthropic" })).toBeNull();
  });

  it("uses the default model unless overridden", () => {
    expect(resolveAnthropicQuoteModel({})).toBe(DEFAULT_ANTHROPIC_QUOTE_MODEL);
    expect(resolveAnthropicQuoteModel({ ANTHROPIC_QUOTE_MODEL: " claude-opus-5 " })).toBe(
      "claude-opus-5",
    );
  });
});

describe("runAnthropicQuoteCompletion", () => {
  it("posts the system prompt and returns the text block", async () => {
    let requestedUrl = "";
    let requestedBody: Record<string, unknown> = {};
    let headers: Record<string, string> = {};
    const fetchImpl: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      headers = init?.headers as Record<string, string>;
      return jsonResponse({
        content: [{ type: "text", text: '{"job_title":"Deck"}' }],
        stop_reason: "end_turn",
        usage: { input_tokens: 12, output_tokens: 6 },
      });
    };

    const result = await runAnthropicQuoteCompletion({
      apiKey: "sk-test",
      system: "Return JSON.",
      user: "Build a deck.",
      fetchImpl,
    });

    expect(requestedUrl).toBe("https://api.anthropic.com/v1/messages");
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(requestedBody).toMatchObject({
      model: DEFAULT_ANTHROPIC_QUOTE_MODEL,
      max_tokens: ANTHROPIC_QUOTE_MAX_TOKENS,
      system: "Return JSON.",
      messages: [{ role: "user", content: "Build a deck." }],
    });
    expect(requestedBody).not.toHaveProperty("temperature");
    expect(result).toMatchObject({
      text: '{"job_title":"Deck"}',
      stopReason: "end_turn",
      usage: { inputTokens: 12, outputTokens: 6 },
    });
  });

  it("retries transient upstream failures before succeeding", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ type: "overloaded_error" }, 529);
      return jsonResponse({
        content: [{ type: "text", text: "{}" }],
        stop_reason: "max_tokens",
      });
    };
    const result = await runAnthropicQuoteCompletion({
      apiKey: "sk-test",
      system: "s",
      user: "u",
      fetchImpl,
    });
    expect(calls).toBe(2);
    expect(result.stopReason).toBe("max_tokens");
  });

  it("surfaces non-retryable errors without leaking the key", async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse({ error: { message: "invalid x-api-key" } }, 401);
    await expect(
      runAnthropicQuoteCompletion({ apiKey: "sk-secret", system: "s", user: "u", fetchImpl }),
    ).rejects.toThrow(/Claude API 401/);
  });

  it("rejects an empty response", async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse({ content: [], stop_reason: "end_turn" });
    await expect(
      runAnthropicQuoteCompletion({ apiKey: "k", system: "s", user: "u", fetchImpl }),
    ).rejects.toThrow(/empty response/);
  });
});
