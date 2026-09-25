import { describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_QUOTE_MAX_TOKENS,
  DEFAULT_ANTHROPIC_QUOTE_MODEL,
  resolveAnthropicQuoteModel,
  runAnthropicQuoteCompletion,
} from "@/lib/llm/anthropic-quote";
import { resolveQuoteTextProvider } from "@/lib/llm/quote-text-provider";
import { AiError } from "@/lib/ai/errors";
import { QUOTE_MODEL_OUTPUT_SCHEMA } from "@/lib/quote-generation/model-output";

const noWait = async () => {};

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

  it("retries transient upstream failures and hands back a cut-off reply", async () => {
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
      sleep: noWait,
    });
    expect(calls).toBe(2);
    expect(result.stopReason).toBe("max_tokens");
    expect(result.truncated).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("surfaces non-retryable errors as typed, without leaking the key", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { type: "authentication_error", message: "invalid x-api-key" } }, 401),
    ) as unknown as typeof fetch;
    const err = await runAnthropicQuoteCompletion({ apiKey: "sk-secret-123456", system: "s", user: "u", fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("auth");
    expect(err.status).toBe(401);
    expect(`${err.message} ${err.detail}`).not.toContain("sk-secret-123456");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty response", async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse({ content: [], stop_reason: "end_turn" });
    const err = await runAnthropicQuoteCompletion({ apiKey: "k", system: "s", user: "u", fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("invalid_output");
    expect(err.message).toMatch(/empty response/);
  });

  it("types a refusal", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({ content: [], stop_reason: "refusal" });
    await expect(
      runAnthropicQuoteCompletion({ apiKey: "k", system: "s", user: "u", fetchImpl }),
    ).rejects.toMatchObject({ kind: "refused" });
  });
});

describe("runAnthropicQuoteCompletion — structured output + cached system block", () => {
  it("sends the schema as output_config.format and the system as blocks", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl: typeof fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({
        content: [{ type: "text", text: '{"line_items":[]}' }],
        stop_reason: "end_turn",
        usage: { input_tokens: 400, output_tokens: 30, cache_read_input_tokens: 2900, cache_creation_input_tokens: 0 },
      });
    };
    const result = await runAnthropicQuoteCompletion({
      apiKey: "k",
      system: [
        { type: "text", text: "STABLE RULES", cache_control: { type: "ephemeral" } },
        { type: "text", text: "TRADIE PART" },
      ],
      user: "job",
      outputSchema: QUOTE_MODEL_OUTPUT_SCHEMA,
      fetchImpl,
    });
    expect(body.output_config).toEqual({
      format: { type: "json_schema", schema: QUOTE_MODEL_OUTPUT_SCHEMA },
    });
    expect(body.system).toEqual([
      { type: "text", text: "STABLE RULES", cache_control: { type: "ephemeral" } },
      { type: "text", text: "TRADIE PART" },
    ]);
    expect(body).not.toHaveProperty("temperature");
    expect(result.usage).toEqual({ inputTokens: 400, outputTokens: 30, cacheReadTokens: 2900, cacheCreationTokens: 0 });
  });

  it("omits output_config when no schema is given", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl: typeof fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ content: [{ type: "text", text: "{}" }], stop_reason: "end_turn" });
    };
    await runAnthropicQuoteCompletion({ apiKey: "k", system: "s", user: "u", fetchImpl });
    expect(body).not.toHaveProperty("output_config");
  });
});

describe("QUOTE_MODEL_OUTPUT_SCHEMA", () => {
  /** Walk every object node: structured outputs require them all closed. */
  function objects(node: unknown, path = "$"): Array<[string, Record<string, unknown>]> {
    if (!node || typeof node !== "object") return [];
    const n = node as Record<string, unknown>;
    const here: Array<[string, Record<string, unknown>]> = n.type === "object" ? [[path, n]] : [];
    const kids = [
      ...Object.entries((n.properties as Record<string, unknown>) ?? {}).map(([k, v]) => objects(v, `${path}.${k}`)),
      objects(n.items, `${path}[]`),
      ...((n.anyOf as unknown[]) ?? []).map((v, i) => objects(v, `${path}|${i}`)),
    ];
    return [...here, ...kids.flat()];
  }

  it("closes every object and requires every property", () => {
    for (const [path, obj] of objects(QUOTE_MODEL_OUTPUT_SCHEMA)) {
      expect(obj.additionalProperties, path).toBe(false);
      expect([...(obj.required as string[])].sort(), path).toEqual(Object.keys(obj.properties as object).sort());
    }
  });

  it("uses no constraints structured outputs rejects", () => {
    const json = JSON.stringify(QUOTE_MODEL_OUTPUT_SCHEMA);
    for (const k of ["minimum", "maximum", "minLength", "maxLength", "multipleOf", "$ref", "pattern"]) {
      expect(json).not.toContain(`"${k}"`);
    }
  });

  it("matches the fields the sanitiser reads", () => {
    const props = QUOTE_MODEL_OUTPUT_SCHEMA.properties;
    expect(Object.keys(props.client.properties).sort()).toEqual(["address", "email", "name", "phone"]);
    expect(Object.keys(props.line_items.items.properties)).toEqual(
      expect.arrayContaining(["type", "description", "quantity", "unit", "unit_price"]),
    );
    expect(props.line_items.items.properties.type.enum).toEqual(["material", "labour", "other"]);
    expect(props.notes).toEqual({ type: "array", items: { type: "string" } });
    expect(props.terms).toEqual({ type: "string" });
  });
});
