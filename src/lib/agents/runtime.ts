// ─────────────────────────────────────────────────────────────────────────
// Shared agent runtime — the platform layer every agent runs through.
//
// What it does, in one call:
//   1. Structured tool output — the model is FORCED to call a tool whose
//      input_schema shapes the result, so we read `tool_use.input` (an object)
//      instead of JSON.parse-ing free text. No more "malformed quote" failures.
//   2. Prompt caching — the big static system prompt is marked
//      `cache_control: ephemeral`, so repeat calls are ~90% cheaper + faster on
//      that block (5-minute TTL).
//   3. Validation + one retry — the caller's `parse` validates/normalises the
//      tool input; on failure we retry once with the error fed back, then throw.
//   4. Model routing — fast / default / deep tiers.
//   5. Observability — logs run.start / run.finish to agent-monitor.
//   6. Transport — every call goes through the shared AI client
//      (src/lib/ai): per-attempt timeout, bounded retries with backoff on
//      429/5xx/529 and network errors, typed AiErrors with plain messages.
//
// The request builder, model resolver and tool-use extractor are PURE and
// exported for unit tests; `runStructuredAgent` is the orchestrator (fetch +
// logging) and accepts an injectable `fetchImpl` so it's testable too.
// ─────────────────────────────────────────────────────────────────────────
import "server-only";
import {
  logAgentRunFinish,
  logAgentRunStart,
  newRunId,
} from "@/lib/agent-monitor/logger";
import { TIMEOUTS } from "@/lib/fetchTimeout";
import { isLocalTextAiProvider } from "@/lib/llm/local-chat";
import { AI_MODEL_DEFAULTS, aiModel } from "@/lib/ai/models";
import { addUsage, callAnthropic, ZERO_USAGE, type AiUsage } from "@/lib/ai/anthropic";
import { AiError, describeAiError } from "@/lib/ai/errors";
import { runOpenAIStructuredAgent } from "./openai-runtime";

export type ModelTier = "fast" | "default" | "deep";

const TIER_ROLES = {
  fast: "agent.fast",
  default: "agent.default",
  deep: "agent.deep",
} as const;

/**
 * Default model id per tier. The ids live in src/lib/ai/models.ts (one config
 * for the whole app, env-overridable there); this map keeps the tier view.
 */
export const TIER_MODELS: Record<ModelTier, string> = {
  fast: AI_MODEL_DEFAULTS["agent.fast"],
  default: AI_MODEL_DEFAULTS["agent.default"],
  deep: AI_MODEL_DEFAULTS["agent.deep"],
};

export function resolveModel(tier: ModelTier = "default"): string {
  return aiModel(TIER_ROLES[tier] ?? TIER_ROLES.default);
}

/** A subset of Anthropic content blocks we build (text + image). */
export type AgentContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Per-invocation options an agent wrapper accepts from its caller (a route
 * handler, a server action). Threading `runId` in means the caller and the
 * shared runtime write to ONE `agent_runs` row instead of two.
 */
export interface AgentRunOptions {
  runId?: string;
}

export interface StructuredAgentOptions<T> {
  /** Display name for the monitor dashboard, e.g. "Quote Generation". */
  agentName: string;
  /** Static system prompt — cached across calls. */
  system: string;
  /** Dynamic user turn — a string, or content blocks (for images). */
  user: string | AgentContentBlock[];
  /** The tool the model MUST call; its `schema` is the JSON Schema for output. */
  tool: { name: string; description: string; schema: Record<string, unknown> };
  /** Validate + normalise the tool input into T. Return an error to retry once. */
  parse: (input: unknown) => ParseResult<T>;
  tier?: ModelTier;
  maxTokens?: number;
  /**
   * Outbound ceiling for the Anthropic call. Defaults by output size — see
   * `resolveAgentTimeoutMs`. Override only when an agent knows better.
   */
  timeoutMs?: number;
  /** Cache the system block (default true). */
  cacheSystem?: boolean;
  runId?: string;
  quoteId?: string;
  userId?: string;
  apiKey?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export type AgentUsage = AiUsage;

export interface StructuredAgentResult<T> {
  value: T;
  model: string;
  attempts: number;
  usage: AgentUsage;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AgentContentBlock[];
}

/** Build the Anthropic request body. Pure — no I/O. */
export function buildRequestBody(args: {
  model: string;
  system: string;
  messages: AnthropicMessage[];
  tool: { name: string; description: string; schema: Record<string, unknown> };
  maxTokens: number;
  cacheSystem: boolean;
  /**
   * Only Haiku 4.5 still accepts the temperature knob — Sonnet 5 rejects
   * non-default sampling params with a 400 and Opus 4.x deprecates them.
   */
  includeTemperature: boolean;
}): Record<string, unknown> {
  const systemBlock = [
    {
      type: "text",
      text: args.system,
      ...(args.cacheSystem ? { cache_control: { type: "ephemeral" } } : {}),
    },
  ];
  const body: Record<string, unknown> = {
    model: args.model,
    max_tokens: args.maxTokens,
    system: systemBlock,
    tools: [
      {
        name: args.tool.name,
        description: args.tool.description,
        input_schema: args.tool.schema,
      },
    ],
    tool_choice: { type: "tool", name: args.tool.name },
    messages: args.messages,
  };
  if (args.includeTemperature) body.temperature = 0;
  // Sonnet 5 / Opus reason adaptively INSIDE max_tokens. A small cap at the
  // default effort can be consumed entirely by reasoning, leaving no room
  // for the tool call (seen live: 748 of 768 tokens spent thinking). For
  // tight caps, ask for low effort so the answer fits. Haiku 4.5 does not
  // accept the effort knob and does not think unless asked, so it is
  // excluded.
  if (args.maxTokens <= SMALL_CAP_TOKENS && !/haiku/i.test(args.model)) {
    body.output_config = { effort: "low" };
  }
  return body;
}

/** Caps at or below this get `effort: "low"` so reasoning can't starve the answer. */
export const SMALL_CAP_TOKENS = 1024;

/**
 * Output caps above this are "big completion" territory and need the longer
 * `generation` ceiling. The 4096-token agents (Quote Generation, Materials
 * Takeoff) were timing out on the 50s `llm` ceiling — see the note on
 * `TIMEOUTS.generation` in src/lib/fetchTimeout.ts, which records two live
 * 504s at exactly 50s for that output size.
 */
export const LARGE_CAP_TOKENS = 4000;

/**
 * Pick the outbound timeout for an agent call. Pure — exported for tests.
 * An explicit `override` always wins.
 */
export function resolveAgentTimeoutMs(
  maxTokens: number,
  override?: number,
): number {
  if (override !== undefined) return override;
  return maxTokens > LARGE_CAP_TOKENS ? TIMEOUTS.generation : TIMEOUTS.llm;
}

interface AnthropicResponsePayload {
  content?: Array<{
    type: string;
    name?: string;
    input?: unknown;
    text?: string;
  }>;
}

/** Pull the forced tool call's `input` object out of a response. Pure. */
export function extractToolUse(
  payload: AnthropicResponsePayload,
  toolName: string,
): unknown {
  const block = payload.content?.find(
    (c) => c.type === "tool_use" && c.name === toolName,
  );
  if (!block || block.input === undefined) {
    throw new Error(
      `Model did not return the expected "${toolName}" tool call.`,
    );
  }
  return block.input;
}

/**
 * Run an agent with forced structured output, caching, validation-with-retry,
 * model routing and monitor logging. Returns the validated value plus usage.
 */
export async function runStructuredAgent<T>(
  opts: StructuredAgentOptions<T>,
): Promise<StructuredAgentResult<T>> {
  const hasImages = Array.isArray(opts.user) && opts.user.some(block => block.type === "image");
  if (isLocalTextAiProvider() && hasImages && !(opts.apiKey ?? process.env.ANTHROPIC_API_KEY)) {
    throw new Error("The local text AI provider does not support image input. Configure Anthropic vision for this agent.");
  }
  if (isLocalTextAiProvider() && !hasImages) {

    const localUser =
      typeof opts.user === "string"
        ? opts.user
        : opts.user
            .filter(
              (block): block is Extract<AgentContentBlock, { type: "text" }> =>
                block.type === "text",
            )
            .map((block) => block.text)
            .join("\n\n");
    const localResult = await runOpenAIStructuredAgent<T>({
      agentName: opts.agentName,
      system: opts.system,
      user: localUser,
      tool: opts.tool,
      parse: opts.parse,
      maxTokens: opts.maxTokens,
      temperature: 0,
      runId: opts.runId,
      quoteId: opts.quoteId,
      userId: opts.userId,
      apiKey: opts.apiKey,
      provider: "local",
      fetchImpl: opts.fetchImpl,
    });

    return {
      value: localResult.value,
      model: localResult.model,
      attempts: localResult.attempts,
      usage: {
        // Some injected test adapters and older compatible runtimes do not
        // report token usage. Observability must not turn a valid model result
        // into a runtime failure.
        inputTokens: localResult.usage?.inputTokens ?? 0,
        outputTokens: localResult.usage?.outputTokens ?? 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    };
  }

  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiError({
      kind: "not_configured",
      provider: "anthropic",
      message: "ANTHROPIC_API_KEY is not configured.",
    });
  }

  const doFetch = opts.fetchImpl ?? fetch;
  const tier = opts.tier ?? "default";
  const model = resolveModel(tier);
  const maxTokens = opts.maxTokens ?? 4096;
  const cacheSystem = opts.cacheSystem ?? true;
  const timeoutMs = resolveAgentTimeoutMs(maxTokens, opts.timeoutMs);
  const runId = opts.runId ?? newRunId(opts.agentName.toLowerCase());

  const userContent: AgentContentBlock[] =
    typeof opts.user === "string"
      ? [{ type: "text", text: opts.user }]
      : opts.user;
  const messages: AnthropicMessage[] = [{ role: "user", content: userContent }];

  logAgentRunStart({
    agentName: opts.agentName,
    runId,
    status: "running",
    message: `Started (${model}, tier=${tier})`,
    quoteId: opts.quoteId,
    userId: opts.userId,
  });

  const MAX_ATTEMPTS = 2;
  let lastError = "";
  // True when the latest reply stopped at max_tokens — the final error is
  // then typed "truncated" rather than "invalid_output".
  let lastTruncated = false;
  let usage: AgentUsage = { ...ZERO_USAGE };

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const body = buildRequestBody({
        model,
        system: opts.system,
        messages,
        tool: opts.tool,
        maxTokens,
        cacheSystem,
        includeTemperature: tier === "fast",
      });

      // Transport, retries on 429/5xx/529 and refusal typing happen in the
      // shared client; a max_tokens stop comes back flagged so the one
      // corrective retry below still gets its chance.
      const reply = await callAnthropic({
        apiKey,
        body,
        timeoutMs,
        fetchImpl: doFetch,
        onTruncated: "return",
      });
      usage = addUsage(usage, reply.usage);
      lastTruncated = reply.truncated;
      const payload: AnthropicResponsePayload = reply.payload;

      let input: unknown;
      try {
        input = extractToolUse(payload, opts.tool.name);
      } catch (e) {
        lastError = (e as Error).message;
        // No tool call at all — retrying won't usually help, but a single
        // nudge is cheap.
        if (attempt < MAX_ATTEMPTS) {
          messages.push({
            role: "user",
            content: [
              {
                type: "text",
                text: `You must respond by calling the "${opts.tool.name}" tool. Do not reply with prose.`,
              },
            ],
          });
          continue;
        }
        throw new AiError({
          kind: lastTruncated ? "truncated" : "invalid_output",
          provider: "anthropic",
          attempts: attempt,
          message: lastError,
        });
      }

      const parsed = opts.parse(input);
      if (parsed.ok) {
        logAgentRunFinish({
          agentName: opts.agentName,
          runId,
          status: "complete",
          message: `OK in ${attempt} attempt(s) · ${usage.outputTokens} out tok · cache ${usage.cacheReadTokens} read`,
          quoteId: opts.quoteId,
          userId: opts.userId,
        });
        return { value: parsed.value, model, attempts: attempt, usage };
      }

      lastError = parsed.error;
      if (attempt < MAX_ATTEMPTS) {
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `Your previous "${opts.tool.name}" call was invalid: ${parsed.error}. Call the tool again with corrected values.`,
            },
          ],
        });
      }
    }

    throw new AiError({
      kind: lastTruncated ? "truncated" : "invalid_output",
      provider: "anthropic",
      attempts: MAX_ATTEMPTS,
      message: `Agent "${opts.agentName}" failed validation after ${MAX_ATTEMPTS} attempts: ${lastError}`,
    });
  } catch (err) {
    logAgentRunFinish({
      agentName: opts.agentName,
      runId,
      status: "failed",
      // Operator-only monitor: the typed kind, status and provider detail.
      message: `Failed: ${describeAiError(err)}`.slice(0, 280),
      quoteId: opts.quoteId,
      userId: opts.userId,
    });
    throw err;
  }
}
