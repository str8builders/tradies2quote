import { describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  anthropicText,
  callAnthropic,
} from "../anthropic";
import { AiError } from "../errors";
import { callChatCompletions } from "../openai";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function capture(response: Response) {
  const seen: { url?: string; init?: RequestInit } = {};
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.url = String(url);
    seen.init = init;
    return response;
  }) as typeof fetch;
  return { fetchImpl, seen };
}

const body = { model: "claude-sonnet-5", max_tokens: 100, messages: [{ role: "user", content: "hi" }] };

describe("callAnthropic", () => {
  it("posts to the Messages API with the version header and parses usage", async () => {
    const { fetchImpl, seen } = capture(
      json({
        model: "claude-sonnet-5",
        content: [{ type: "thinking", thinking: "…" }, { type: "text", text: '{"a":1}' }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 900, cache_creation_input_tokens: 12 },
      }),
    );
    const out = await callAnthropic({ apiKey: "k", body, timeoutMs: 1000, fetchImpl });
    expect(seen.url).toBe(ANTHROPIC_MESSAGES_URL);
    const headers = new Headers(seen.init?.headers);
    expect(headers.get("x-api-key")).toBe("k");
    expect(headers.get("anthropic-version")).toBe(ANTHROPIC_VERSION);
    expect(JSON.parse(String(seen.init?.body))).toEqual(body);
    expect(out).toMatchObject({
      text: '{"a":1}',
      stopReason: "end_turn",
      truncated: false,
      attempts: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 900, cacheCreationTokens: 12 },
    });
  });

  it("types a refusal", async () => {
    const { fetchImpl } = capture(json({ content: [], stop_reason: "refusal" }));
    const err = await callAnthropic({ apiKey: "k", body, timeoutMs: 1000, fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("refused");
  });

  it("types max_tokens as truncated, or hands it back when asked", async () => {
    const reply = { content: [{ type: "text", text: '{"a":' }], stop_reason: "max_tokens" };
    const err = await callAnthropic({ apiKey: "k", body, timeoutMs: 1000, fetchImpl: capture(json(reply)).fetchImpl }).catch((e) => e);
    expect(err.kind).toBe("truncated");
    const out = await callAnthropic({
      apiKey: "k",
      body,
      timeoutMs: 1000,
      fetchImpl: capture(json(reply)).fetchImpl,
      onTruncated: "return",
    });
    expect(out.truncated).toBe(true);
    expect(out.text).toBe('{"a":');
  });

  it("refuses to call without a key", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const err = await callAnthropic({ apiKey: "", body, timeoutMs: 1000, fetchImpl }).catch((e) => e);
    expect(err.kind).toBe("not_configured");
    expect(err.message).toMatch(/ANTHROPIC_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("types a 200 that is not JSON as unavailable", async () => {
    const { fetchImpl } = capture(new Response("<html>proxy</html>", { status: 200 }));
    const err = await callAnthropic({ apiKey: "k", body, timeoutMs: 1000, fetchImpl }).catch((e) => e);
    expect(err.kind).toBe("unavailable");
  });

  it("never puts the key in an error", async () => {
    const { fetchImpl } = capture(json({ error: { type: "authentication_error", message: "invalid x-api-key" } }, 401));
    const err = await callAnthropic({ apiKey: "sk-ant-secret-123456", body, timeoutMs: 1000, fetchImpl }).catch((e) => e);
    expect(err.kind).toBe("auth");
    expect(`${err.message} ${err.detail}`).not.toContain("sk-ant-secret-123456");
  });
});

describe("anthropicText", () => {
  it("joins text blocks and skips the rest", () => {
    expect(
      anthropicText({ content: [{ type: "text", text: "a" }, { type: "tool_use", name: "x" }, { type: "text", text: "b" }] }),
    ).toBe("a\nb");
    expect(anthropicText({})).toBe("");
  });
});

describe("callChatCompletions", () => {
  it("returns content, finish reason and usage", async () => {
    const { fetchImpl, seen } = capture(
      json({ choices: [{ finish_reason: "stop", message: { content: "{}" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }),
    );
    const out = await callChatCompletions({
      provider: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: "k",
      body: { model: "gpt-4o-mini" },
      timeoutMs: 1000,
      fetchImpl,
    });
    expect(new Headers(seen.init?.headers).get("authorization")).toBe("Bearer k");
    expect(out).toMatchObject({ content: "{}", finishReason: "stop", truncated: false, usage: { inputTokens: 3, outputTokens: 2 } });
  });

  it("types refusals, content filters and length stops", async () => {
    const call = (reply: unknown, onTruncated?: "return") =>
      callChatCompletions({
        provider: "local",
        url: "http://127.0.0.1/v1/chat/completions",
        apiKey: "k",
        body: { max_tokens: 5 },
        timeoutMs: 1000,
        fetchImpl: capture(json(reply)).fetchImpl,
        onTruncated,
      });
    await expect(call({ choices: [{ message: { refusal: "no" } }] })).rejects.toMatchObject({ kind: "refused" });
    await expect(call({ choices: [{ finish_reason: "content_filter", message: {} }] })).rejects.toMatchObject({ kind: "refused" });
    await expect(call({ choices: [{ finish_reason: "length", message: { content: "{" } }] })).rejects.toMatchObject({ kind: "truncated" });
    expect((await call({ choices: [{ finish_reason: "length", message: { content: "{" } }] }, "return")).truncated).toBe(true);
  });

  it("names the missing key per provider", async () => {
    const run = (provider: "openai" | "local") =>
      callChatCompletions({ provider, url: "http://x", apiKey: undefined, body: {}, timeoutMs: 1 });
    await expect(run("openai")).rejects.toThrow(/OPENAI_API_KEY/);
    await expect(run("local")).rejects.toThrow(/LOCAL_LLM_API_KEY/);
  });
});
