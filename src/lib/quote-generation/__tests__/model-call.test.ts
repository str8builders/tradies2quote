import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiError } from "@/lib/ai/errors";

/**
 * The pipeline's model call: structured output on the hosted path, ONE
 * repair retry that tells the model what was wrong, then a plain failure.
 */

type Reply = { text: string; stopReason?: string; truncated?: boolean; finishReason?: string; usage?: Record<string, number> };

const h = vi.hoisted(() => ({
  anthropic: vi.fn(),
  local: vi.fn(),
  capture: vi.fn(),
  step: vi.fn(),
}));

vi.mock("@/lib/llm/anthropic-quote", () => ({
  ANTHROPIC_QUOTE_MAX_TOKENS: 16384,
  runAnthropicQuoteCompletion: h.anthropic,
}));
vi.mock("@/lib/llm/local-chat", () => ({ runLocalChatCompletion: h.local }));
vi.mock("@/lib/observability", () => ({ captureError: h.capture }));
vi.mock("@/lib/agent-monitor/logger", () => ({
  logAgentStep: h.step,
  logAgentEvent: vi.fn(),
  logAgentError: vi.fn(),
  logAgentApprovalNeeded: vi.fn(),
  logAgentRunStart: vi.fn(),
  logAgentRunFinish: vi.fn(),
  newRunId: (p: string) => `${p}_t`,
  flushAgentRun: async () => undefined,
}));

import { callQuoteModel, repairInstruction } from "../model-call";
import { QUOTE_MODEL_OUTPUT_SCHEMA } from "../model-output";
import { renderQuotePrompt } from "@/lib/quote-prompt";

const PROMPT = { stable: "STABLE RULES", tradie: "TRADIE PART" };
const USER = "<job_transcript>deck</job_transcript>";
const GOOD = JSON.stringify({ client: { name: "Dave" }, job_summary: "Deck", line_items: [{ type: "labour", description: "Build", quantity: 1, unit: "hour", unit_price: 0 }], notes: [] });

const anthropicReply = (r: Reply) => ({
  text: r.text,
  model: "claude-sonnet-5",
  stopReason: r.stopReason ?? "end_turn",
  truncated: r.truncated ?? r.stopReason === "max_tokens",
  usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 2900, cacheCreationTokens: 0, ...r.usage },
  attempts: 1,
});

const call = (textProvider: "anthropic" | "local" = "anthropic") =>
  callQuoteModel({
    textProvider,
    prompt: PROMPT,
    userMessage: USER,
    monitor: { agentName: "Quote Pipeline", runId: "qpipe_t", quoteId: "q-1" },
  });

beforeEach(() => {
  h.anthropic.mockReset();
  h.local.mockReset();
  h.capture.mockReset();
  h.step.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("callQuoteModel — hosted (Anthropic)", () => {
  it("asks once with the schema and a cached stable block", async () => {
    h.anthropic.mockResolvedValueOnce(anthropicReply({ text: GOOD }));
    const out = await call();
    expect(out).toMatchObject({ ok: true, tries: 1, repaired: false });
    expect(h.anthropic).toHaveBeenCalledTimes(1);
    const args = h.anthropic.mock.calls[0][0];
    expect(args.outputSchema).toBe(QUOTE_MODEL_OUTPUT_SCHEMA);
    expect(args.maxTokens).toBe(16384);
    expect(args.user).toBe(USER);
    expect(args.system).toEqual([
      { type: "text", text: "STABLE RULES", cache_control: { type: "ephemeral" } },
      { type: "text", text: "TRADIE PART" },
    ]);
  });

  it("repairs a cut-off reply once, saying it was cut off, keeping the cached prefix", async () => {
    h.anthropic
      .mockResolvedValueOnce(anthropicReply({ text: '{"line_items":[{"type":"mat', stopReason: "max_tokens" }))
      .mockResolvedValueOnce(anthropicReply({ text: GOOD }));
    const out = await call();
    expect(out).toMatchObject({ ok: true, tries: 2, repaired: true });
    const [first, second] = h.anthropic.mock.calls.map((c) => c[0]);
    expect(second.system).toEqual(first.system); // same bytes → cache hit on the stable block
    expect(second.user).toBe(`${USER}\n\n${repairInstruction({ kind: "truncated" })}`);
    expect(second.user).toMatch(/cut off by the output limit/);
    // Usage of both replies is counted.
    if (out.ok) expect(out.usage).toMatchObject({ inputTokens: 200, outputTokens: 100, cacheReadTokens: 5800 });
    expect(h.step).toHaveBeenCalledTimes(1);
    expect(h.step.mock.calls[0][0]).toMatchObject({ runId: "qpipe_t", stepName: "model.repair", quoteId: "q-1" });
  });

  it("repairs prose / bad JSON and a missing line_items array with the reason", async () => {
    h.anthropic
      .mockResolvedValueOnce(anthropicReply({ text: "Sure! Here's your quote." }))
      .mockResolvedValueOnce(anthropicReply({ text: GOOD }));
    expect(await call()).toMatchObject({ ok: true, repaired: true });
    expect(h.anthropic.mock.calls[1][0].user).toMatch(/not a single valid JSON object/);

    h.anthropic.mockReset();
    h.anthropic
      .mockResolvedValueOnce(anthropicReply({ text: '{"quote":{"line_items":[]}}' }))
      .mockResolvedValueOnce(anthropicReply({ text: GOOD }));
    expect(await call()).toMatchObject({ ok: true, repaired: true });
    expect(h.anthropic.mock.calls[1][0].user).toMatch(/no "line_items" array/);
  });

  it("repairs an empty reply", async () => {
    h.anthropic
      .mockRejectedValueOnce(new AiError({ kind: "invalid_output", provider: "anthropic", message: "Claude returned an empty response." }))
      .mockResolvedValueOnce(anthropicReply({ text: GOOD }));
    expect(await call()).toMatchObject({ ok: true, tries: 2, repaired: true });
  });

  it("fails plainly when the repair is cut off too", async () => {
    h.anthropic.mockResolvedValue(anthropicReply({ text: "{", stopReason: "max_tokens" }));
    const out = await call();
    expect(out).toMatchObject({
      ok: false,
      status: 502,
      tries: 2,
      body: {
        error: "This job was too long to quote in one go. Shorten the description or split it into separate quotes.",
        code: "truncated",
      },
    });
    expect(h.anthropic).toHaveBeenCalledTimes(2);
  });

  it("fails plainly when the repair is still unusable, and reports it", async () => {
    h.anthropic.mockResolvedValue(anthropicReply({ text: "not json" }));
    const out = await call();
    expect(out).toMatchObject({
      ok: false,
      status: 502,
      body: { error: "Quote response was malformed. Please try again.", code: "invalid_output" },
    });
    expect(h.anthropic).toHaveBeenCalledTimes(2);
    expect(h.capture).toHaveBeenCalledWith(expect.any(Error), { route: "quotes/generate" });
  });

  it.each([
    [new AiError({ kind: "overloaded", provider: "anthropic", status: 529, attempts: 3 }), 503, /busy right now/],
    [new AiError({ kind: "rate_limited", provider: "anthropic", status: 429, attempts: 3 }), 503, /busy right now/],
    [new AiError({ kind: "timeout", provider: "anthropic" }), 504, /took too long/],
    [new AiError({ kind: "refused", provider: "anthropic" }), 422, /declined/],
    [new AiError({ kind: "auth", provider: "anthropic", status: 401 }), 503, /isn't available/],
    [new Error("socket hang up"), 502, /Quote generation failed/],
  ])("does not repair a provider failure (%s)", async (error, status, message) => {
    h.anthropic.mockRejectedValueOnce(error);
    const out = await call();
    expect(h.anthropic).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(status);
      expect(out.body.error).toMatch(message);
      expect(JSON.stringify(out.body)).not.toMatch(/HTTP|Anthropic|529|socket/);
    }
    expect(h.capture).toHaveBeenCalledWith(error, { route: "/api/quotes/generate" });
  });
});

describe("callQuoteModel — self-hosted", () => {
  const localReply = (text: string, finishReason = "stop") => ({
    text,
    model: "qwen",
    finishReason,
    truncated: finishReason === "length",
    usage: { inputTokens: 900, outputTokens: 2048 },
  });

  it("sends the whole prompt as one system string, free-text JSON mode", async () => {
    h.local.mockResolvedValueOnce(localReply(GOOD));
    expect(await call("local")).toMatchObject({ ok: true, tries: 1 });
    const args = h.local.mock.calls[0][0];
    expect(args.system).toBe(renderQuotePrompt(PROMPT));
    expect(args.maxTokens).toBe(2048);
    expect(args.responseSchema.schema).toEqual({ type: "object" });
    expect(h.anthropic).not.toHaveBeenCalled();
  });

  it("gets the same one repair on a length stop", async () => {
    h.local.mockResolvedValueOnce(localReply('{"line_items":[', "length")).mockResolvedValueOnce(localReply(GOOD));
    expect(await call("local")).toMatchObject({ ok: true, tries: 2, repaired: true });
    expect(h.local.mock.calls[1][0].user).toMatch(/cut off by the output limit/);
  });

  it("fails plainly after the repair", async () => {
    h.local.mockResolvedValue(localReply("```json\n{ broken", "stop"));
    expect(await call("local")).toMatchObject({ ok: false, status: 502, body: { code: "invalid_output" } });
    expect(h.local).toHaveBeenCalledTimes(2);
  });
});
