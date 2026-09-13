import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shared runtime used to hard-code `TIMEOUTS.llm` (50s) for every agent,
 * including the 4096-token ones — and `src/lib/fetchTimeout.ts` records two
 * live 504s at exactly 50s for that output size. Big-output agents now get
 * `TIMEOUTS.generation` by default, and any agent can override.
 *
 * `fetchWithTimeout` is wrapped so the timeout it is CALLED with is
 * observable; everything else about the module is real.
 */
const captured = vi.hoisted(() => ({ timeouts: [] as number[] }));

vi.mock("@/lib/fetchTimeout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fetchTimeout")>();
  return {
    ...actual,
    fetchWithTimeout: async (
      input: string,
      init: RequestInit,
      timeoutMs: number,
      fetchImpl: typeof fetch,
    ) => {
      captured.timeouts.push(timeoutMs);
      return (fetchImpl ?? fetch)(input, init);
    },
  };
});

import { TIMEOUTS } from "@/lib/fetchTimeout";
import {
  LARGE_CAP_TOKENS,
  resolveAgentTimeoutMs,
  runStructuredAgent,
} from "../runtime";

const TOOL = {
  name: "emit_quote",
  description: "Return the quote",
  schema: { type: "object", properties: { total: { type: "number" } } },
};

const okParse = (input: unknown) =>
  typeof (input as { total?: unknown }).total === "number"
    ? { ok: true as const, value: input as { total: number } }
    : { ok: false as const, error: "total must be a number" };

function toolResponse() {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      content: [{ type: "tool_use", name: "emit_quote", input: { total: 1 } }],
      usage: {},
    }),
  } as unknown as Response;
}

const fakeFetch = (async () => toolResponse()) as unknown as typeof fetch;

async function run(over: { maxTokens?: number; timeoutMs?: number }) {
  return runStructuredAgent({
    agentName: "Timeout Test",
    system: "S",
    user: "U",
    tool: TOOL,
    parse: okParse,
    apiKey: "key",
    fetchImpl: fakeFetch,
    ...over,
  });
}

describe("resolveAgentTimeoutMs", () => {
  it("gives big-output agents the generation ceiling", () => {
    expect(resolveAgentTimeoutMs(LARGE_CAP_TOKENS + 1)).toBe(TIMEOUTS.generation);
    expect(resolveAgentTimeoutMs(4096)).toBe(TIMEOUTS.generation);
    expect(resolveAgentTimeoutMs(16384)).toBe(TIMEOUTS.generation);
  });

  it("leaves small-output agents on the llm ceiling", () => {
    expect(resolveAgentTimeoutMs(LARGE_CAP_TOKENS)).toBe(TIMEOUTS.llm);
    expect(resolveAgentTimeoutMs(1024)).toBe(TIMEOUTS.llm);
    expect(resolveAgentTimeoutMs(512)).toBe(TIMEOUTS.llm);
  });

  it("honours an explicit override either way", () => {
    expect(resolveAgentTimeoutMs(4096, 5_000)).toBe(5_000);
    expect(resolveAgentTimeoutMs(256, 90_000)).toBe(90_000);
  });
});

describe("runStructuredAgent timeout wiring", () => {
  const previousProvider = process.env.TEXT_AI_PROVIDER;

  beforeEach(() => {
    captured.timeouts.length = 0;
    process.env.TEXT_AI_PROVIDER = "anthropic";
  });

  afterEach(() => {
    if (previousProvider === undefined) delete process.env.TEXT_AI_PROVIDER;
    else process.env.TEXT_AI_PROVIDER = previousProvider;
  });

  it("uses the generation ceiling for the default 4096-token cap", async () => {
    await run({});
    expect(captured.timeouts).toEqual([TIMEOUTS.generation]);
  });

  it("uses the llm ceiling for a small cap", async () => {
    await run({ maxTokens: 1024 });
    expect(captured.timeouts).toEqual([TIMEOUTS.llm]);
  });

  it("passes an explicit timeoutMs straight through", async () => {
    await run({ maxTokens: 4096, timeoutMs: 7_000 });
    expect(captured.timeouts).toEqual([7_000]);
  });
});
