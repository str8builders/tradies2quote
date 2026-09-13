import { describe, expect, it } from "vitest";
import {
  buildRequestBody,
  extractToolUse,
  resolveModel,
  runStructuredAgent,
  TIER_MODELS,
  type AgentContentBlock,
} from "../runtime";

const TOOL = {
  name: "emit_quote",
  description: "Return the quote",
  schema: { type: "object", properties: { total: { type: "number" } } },
};

/** Build a fake Anthropic Response with a forced tool_use block. */
function toolResponse(input: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      content: [{ type: "tool_use", name: "emit_quote", input }],
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 80 },
    }),
  } as unknown as Response;
}

/** A fetch stub that returns queued responses and records request bodies. */
function fakeFetch(responses: Response[]) {
  const bodies: Record<string, unknown>[] = [];
  let i = 0;
  const impl = (async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return responses[Math.min(i++, responses.length - 1)];
  }) as unknown as typeof fetch;
  return { impl, bodies };
}

describe("resolveModel", () => {
  it("maps tiers and defaults safely", () => {
    expect(resolveModel("default")).toBe(TIER_MODELS.default);
    expect(resolveModel("fast")).toBe(TIER_MODELS.fast);
    expect(resolveModel("deep")).toBe(TIER_MODELS.deep);
    // @ts-expect-error — exercising the runtime fallback
    expect(resolveModel("nonsense")).toBe(TIER_MODELS.default);
    expect(resolveModel()).toBe(TIER_MODELS.default);
  });
});

describe("buildRequestBody", () => {
  const base = {
    model: "m",
    system: "SYSTEM",
    messages: [
      { role: "user" as const, content: [{ type: "text" as const, text: "hi" }] },
    ],
    tool: TOOL,
    maxTokens: 1000,
  };

  it("caches the system block and forces the tool", () => {
    const body = buildRequestBody({
      ...base,
      cacheSystem: true,
      includeTemperature: true,
    });
    const system = body.system as Array<Record<string, unknown>>;
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.tool_choice).toEqual({ type: "tool", name: "emit_quote" });
    expect((body.tools as unknown[]).length).toBe(1);
    expect(body.temperature).toBe(0);
  });

  it("omits cache_control + temperature when asked", () => {
    const body = buildRequestBody({
      ...base,
      cacheSystem: false,
      includeTemperature: false,
    });
    const system = body.system as Array<Record<string, unknown>>;
    expect(system[0].cache_control).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });
});

describe("extractToolUse", () => {
  it("returns the tool input", () => {
    expect(
      extractToolUse(
        { content: [{ type: "tool_use", name: "emit_quote", input: { total: 9 } }] },
        "emit_quote",
      ),
    ).toEqual({ total: 9 });
  });

  it("throws when the tool call is missing", () => {
    expect(() =>
      extractToolUse({ content: [{ type: "text", text: "nope" }] }, "emit_quote"),
    ).toThrow(/did not return/);
  });
});

describe("runStructuredAgent", () => {
  const okParse = (input: unknown) =>
    typeof (input as { total?: unknown }).total === "number"
      ? ({ ok: true as const, value: input as { total: number } })
      : ({ ok: false as const, error: "total must be a number" });

  it("returns the validated value on the happy path", async () => {
    const { impl } = fakeFetch([toolResponse({ total: 42 })]);
    const res = await runStructuredAgent({
      agentName: "Test",
      system: "S",
      user: "U",
      tool: TOOL,
      parse: okParse,
      apiKey: "key",
      fetchImpl: impl,
    });
    expect(res.value).toEqual({ total: 42 });
    expect(res.attempts).toBe(1);
    expect(res.usage.cacheReadTokens).toBe(80);
    expect(res.model).toBe(TIER_MODELS.default);
  });

  it("retries once with a corrective message, then succeeds", async () => {
    const { impl, bodies } = fakeFetch([
      toolResponse({ total: "oops" }), // invalid → triggers retry
      toolResponse({ total: 7 }), // valid
    ]);
    const res = await runStructuredAgent({
      agentName: "Test",
      system: "S",
      user: "U",
      tool: TOOL,
      parse: okParse,
      apiKey: "key",
      fetchImpl: impl,
    });
    expect(res.value).toEqual({ total: 7 });
    expect(res.attempts).toBe(2);
    // Second request must carry the original turn plus a corrective nudge.
    const secondMsgs = bodies[1].messages as Array<{ content: AgentContentBlock[] }>;
    expect(secondMsgs.length).toBe(2);
    const nudge = secondMsgs[1].content[0];
    expect(nudge.type === "text" && nudge.text).toMatch(/invalid/i);
  });

  it("throws after exhausting retries on persistent invalid output", async () => {
    const { impl } = fakeFetch([
      toolResponse({ total: "x" }),
      toolResponse({ total: "y" }),
    ]);
    await expect(
      runStructuredAgent({
        agentName: "Test",
        system: "S",
        user: "U",
        tool: TOOL,
        parse: okParse,
        apiKey: "key",
        fetchImpl: impl,
      }),
    ).rejects.toThrow(/failed validation after 2 attempts/i);
  });

  it("throws without an API key", async () => {
    const { impl } = fakeFetch([toolResponse({ total: 1 })]);
    await expect(
      runStructuredAgent({
        agentName: "Test",
        system: "S",
        user: "U",
        tool: TOOL,
        parse: okParse,
        apiKey: "",
        fetchImpl: impl,
      }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe("small-cap effort guard", () => {
  const small = {
    system: "SYSTEM",
    messages: [
      { role: "user" as const, content: [{ type: "text" as const, text: "hi" }] },
    ],
    tool: TOOL,
    cacheSystem: false,
    includeTemperature: false,
  };

  it("asks for low effort when a thinking model has a tight cap", () => {
    const body = buildRequestBody({ ...small, model: "claude-sonnet-5", maxTokens: 400 });
    expect(body.output_config).toEqual({ effort: "low" });
  });

  it("leaves effort alone for roomy caps and for Haiku", () => {
    expect(
      buildRequestBody({ ...small, model: "claude-sonnet-5", maxTokens: 4096 }).output_config,
    ).toBeUndefined();
    expect(
      buildRequestBody({ ...small, model: "claude-haiku-4-5", maxTokens: 400 }).output_config,
    ).toBeUndefined();
  });
});
