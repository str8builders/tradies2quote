// ─────────────────────────────────────────────────────────────────────────
// Anthropic Messages API over raw fetch, through the shared retry policy.
//
// Raw HTTP on purpose (CLAUDE.md: prefer fetch where the API surface is
// small). Shapes follow the current Messages API: `system` may be text
// blocks with `cache_control`, structured outputs go in
// `output_config.format`, and every reply is checked for `stop_reason`:
//   refusal     → AiError("refused")
//   max_tokens  → AiError("truncated"), or `truncated: true` when the caller
//                 asks to handle it (the quote pipeline repairs once).
// Browser-safe (no Node or server-only imports).
// ─────────────────────────────────────────────────────────────────────────

import { AiError } from "./errors";
import { sendWithRetry, type AiTransport, type RetryOptions } from "./http";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

export type AnthropicCacheControl = { type: "ephemeral"; ttl?: "5m" | "1h" };

export type AnthropicTextBlock = {
  type: "text";
  text: string;
  cache_control?: AnthropicCacheControl;
};

export type AnthropicImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
  cache_control?: AnthropicCacheControl;
};

/** Mark a block as the end of a cacheable prefix (5-minute TTL). */
export const EPHEMERAL_CACHE: AnthropicCacheControl = { type: "ephemeral" };

export interface AnthropicResponsePayload {
  id?: string;
  model?: string;
  content?: Array<{
    type: string;
    text?: string;
    name?: string;
    input?: unknown;
  }>;
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export const ZERO_USAGE: AiUsage = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
});

export function addUsage(a: AiUsage, b: Partial<AiUsage> | null | undefined): AiUsage {
  return {
    inputTokens: a.inputTokens + (b?.inputTokens ?? 0),
    outputTokens: a.outputTokens + (b?.outputTokens ?? 0),
    cacheReadTokens: a.cacheReadTokens + (b?.cacheReadTokens ?? 0),
    cacheCreationTokens: a.cacheCreationTokens + (b?.cacheCreationTokens ?? 0),
  };
}

export function anthropicUsage(payload: AnthropicResponsePayload): AiUsage {
  const u = payload.usage ?? {};
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
  };
}

/** Every text block, in order (thinking / tool blocks are skipped). */
export function anthropicText(payload: AnthropicResponsePayload): string {
  return (payload.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
}

export function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  };
}

export interface AnthropicCallOptions extends RetryOptions {
  apiKey: string | null | undefined;
  /** The full Messages API body (model, max_tokens, system, messages …). */
  body: Record<string, unknown>;
  /** Per-attempt ceiling. */
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  transport?: AiTransport;
  /** `max_tokens` handling: throw (default) or hand back `truncated: true`. */
  onTruncated?: "error" | "return";
  url?: string;
}

export interface AnthropicCallResult {
  payload: AnthropicResponsePayload;
  text: string;
  stopReason: string | null;
  truncated: boolean;
  usage: AiUsage;
  attempts: number;
  model: string;
}

export async function callAnthropic(
  opts: AnthropicCallOptions,
): Promise<AnthropicCallResult> {
  if (!opts.apiKey) {
    throw new AiError({
      kind: "not_configured",
      provider: "anthropic",
      message: "ANTHROPIC_API_KEY is not configured.",
    });
  }
  const { response, attempts } = await sendWithRetry({
    provider: "anthropic",
    url: opts.url ?? ANTHROPIC_MESSAGES_URL,
    init: {
      method: "POST",
      headers: anthropicHeaders(opts.apiKey),
      body: JSON.stringify(opts.body),
    },
    timeoutMs: opts.timeoutMs,
    fetchImpl: opts.fetchImpl,
    transport: opts.transport,
    maxAttempts: opts.maxAttempts,
    budgetMs: opts.budgetMs,
    sleep: opts.sleep,
    random: opts.random,
    now: opts.now,
    onRetry: opts.onRetry,
  });

  let payload: AnthropicResponsePayload;
  try {
    payload = (await response.json()) as AnthropicResponsePayload;
  } catch (e) {
    throw new AiError({
      kind: "unavailable",
      provider: "anthropic",
      status: response.status,
      attempts,
      detail: "The API answered 200 with a body that was not JSON.",
      cause: e,
    });
  }
  if (!payload || typeof payload !== "object") {
    throw new AiError({
      kind: "unavailable",
      provider: "anthropic",
      attempts,
      detail: "The API answered 200 with an empty body.",
    });
  }

  const stopReason = payload.stop_reason ?? null;
  const model = String(payload.model ?? opts.body.model ?? "");
  if (stopReason === "refusal") {
    throw new AiError({
      kind: "refused",
      provider: "anthropic",
      attempts,
      message: `Anthropic refused the request (${model})`,
      detail: "stop_reason: refusal",
    });
  }
  const truncated = stopReason === "max_tokens";
  if (truncated && opts.onTruncated !== "return") {
    throw new AiError({
      kind: "truncated",
      provider: "anthropic",
      attempts,
      message: `Anthropic reply hit max_tokens (${String(opts.body.max_tokens)}) on ${model}`,
      detail: "stop_reason: max_tokens",
    });
  }

  return {
    payload,
    text: anthropicText(payload),
    stopReason,
    truncated,
    usage: anthropicUsage(payload),
    attempts,
    model,
  };
}
