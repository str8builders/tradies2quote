import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runStructuredAgent } from "../runtime";
import { runOpenAIStructuredAgent } from "../openai-runtime";
import { AiError } from "@/lib/ai/errors";

/**
 * The shared runtimes used to throw on the first non-2xx (`Anthropic 529:
 * {...}`), so every agent on them — customer chat, materials takeoff,
 * Pat/Willa, suggest-price, the critic, request questions, photo plan —
 * failed on a transient blip. They now ride the shared AI client.
 */

const TOOL = {
  name: "emit",
  description: "emit",
  schema: { type: "object", properties: { total: { type: "number" } } },
};
const parse = (input: unknown) =>
  typeof (input as { total?: unknown }).total === "number"
    ? { ok: true as const, value: input as { total: number } }
    : { ok: false as const, error: "total must be a number" };

const anthropicTool = () =>
  new Response(
    JSON.stringify({
      content: [{ type: "tool_use", name: "emit", input: { total: 3 } }],
      stop_reason: "tool_use",
      usage: { input_tokens: 5, output_tokens: 2 },
    }),
  );
const openaiTool = () =>
  new Response(
    JSON.stringify({
      choices: [
        { finish_reason: "stop", message: { tool_calls: [{ function: { name: "emit", arguments: '{"total":3}' } }] } },
      ],
    }),
  );
const busy = (status: number) =>
  new Response(JSON.stringify({ error: { type: "overloaded_error" } }), {
    status,
    headers: { "retry-after": "0" },
  });

const ENV = ["TEXT_AI_PROVIDER"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  delete process.env.TEXT_AI_PROVIDER;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("runStructuredAgent (Anthropic) HTTP retry", () => {
  it("rides out a 529 and a 429 before the answer", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(busy(529))
      .mockResolvedValueOnce(busy(429))
      .mockResolvedValueOnce(anthropicTool());
    const res = await runStructuredAgent({
      agentName: "Retry Test",
      system: "S",
      user: "U",
      tool: TOOL,
      parse,
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.value).toEqual({ total: 3 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 400 and throws a typed error without the body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "bad tool schema" } }), { status: 400 }),
    );
    const err = await runStructuredAgent({
      agentName: "Retry Test",
      system: "S",
      user: "U",
      tool: TOOL,
      parse,
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("bad_request");
    expect(err.message).not.toContain("bad tool schema");
    expect(err.detail).toContain("bad tool schema");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("types a refusal", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [], stop_reason: "refusal" })));
    await expect(
      runStructuredAgent({ agentName: "T", system: "S", user: "U", tool: TOOL, parse, apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ kind: "refused" });
  });

  it("gives a max_tokens stop its one corrective retry, then types it truncated", async () => {
    const cut = () => new Response(JSON.stringify({ content: [{ type: "text", text: "thinking" }], stop_reason: "max_tokens" }));
    const fetchImpl = vi.fn().mockImplementation(async () => cut());
    await expect(
      runStructuredAgent({ agentName: "T", system: "S", user: "U", tool: TOOL, parse, apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ kind: "truncated" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("model config overrides", () => {
  it("sends temperature to a Haiku fast tier only", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return anthropicTool();
    });
    const run = () =>
      runStructuredAgent({ agentName: "T", system: "S", user: "U", tool: TOOL, parse, apiKey: "k", tier: "fast", fetchImpl: fetchImpl as unknown as typeof fetch });
    await run();
    expect(bodies[0]).toMatchObject({ model: "claude-haiku-4-5", temperature: 0 });

    vi.stubEnv("AI_MODEL_AGENT_FAST", "claude-sonnet-5");
    try {
      await run();
      expect(bodies[1].model).toBe("claude-sonnet-5");
      expect(bodies[1]).not.toHaveProperty("temperature");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("runOpenAIStructuredAgent HTTP retry", () => {
  it("rides out a 503 on cloud OpenAI", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(busy(503)).mockResolvedValueOnce(openaiTool());
    const res = await runOpenAIStructuredAgent({
      agentName: "Retry Test",
      system: "S",
      user: "U",
      tool: TOOL,
      parse,
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.value).toEqual({ total: 3 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("agents use a shared runtime, never their own HTTP", () => {
  const agents = [
    "src/lib/agents/customer-chat.ts",
    "src/lib/agents/customer-reply.ts",
    "src/lib/agents/materials-takeoff.ts",
    "src/lib/agents/pat.ts",
    "src/lib/agents/willa.ts",
    "src/lib/agents/suggestPrice/index.ts",
    "src/lib/agents/verify/quoteVerify.ts",
    "src/lib/agents/photo-plan.ts",
    "src/lib/agents/quote-generation.ts",
    "src/lib/quote-requests/questions.ts",
    "src/lib/moderation.ts",
  ];
  it.each(agents)("%s", (file) => {
    const src = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(src).toMatch(/run(?:OpenAI)?StructuredAgent/);
    expect(src).not.toMatch(/\bfetch(?:WithTimeout)?\(|api\.anthropic\.com|api\.openai\.com/);
  });
});
