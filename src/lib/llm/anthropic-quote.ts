import "server-only";

import { TIMEOUTS } from "@/lib/fetchTimeout";
import { AI_MODEL_DEFAULTS, aiModel } from "@/lib/ai/models";
import {
  callAnthropic,
  type AiUsage,
  type AnthropicTextBlock,
} from "@/lib/ai/anthropic";
import { AiError } from "@/lib/ai/errors";
import type { RetryOptions } from "@/lib/ai/http";

/**
 * Hosted quote generation on Anthropic Claude.
 *
 * This is the original quote-generation path (before the self-hosted Qwen
 * integration) restored as a selectable provider. It is used when
 * TEXT_AI_PROVIDER is anything other than "local" and ANTHROPIC_API_KEY is
 * present. A hosted model answers a full quote in seconds; the CPU-only Qwen
 * server on the VPS needs 5–15 minutes for the same job.
 *
 * Transport, retries (429/5xx/529/network, with backoff inside a time
 * budget) and error typing come from the shared AI client (src/lib/ai).
 */

/** The id lives in src/lib/ai/models.ts (role "quote", env ANTHROPIC_QUOTE_MODEL). */
export const DEFAULT_ANTHROPIC_QUOTE_MODEL = AI_MODEL_DEFAULTS.quote;
// A long quote with 40+ line items, labour breakdowns, notes and compliance
// review can plausibly push past 8192 output tokens; 16384 keeps headroom.
// max_tokens is a CAP not a minimum — normal quotes cost the same.
export const ANTHROPIC_QUOTE_MAX_TOKENS = 16384;

export type AnthropicQuoteOptions = RetryOptions & {
  apiKey: string;
  /**
   * The system prompt: a string, or text blocks. The quote pipeline sends
   * the stable rules block (with cache_control) and then the tradie's block.
   */
  system: string | AnthropicTextBlock[];
  user: string;
  model?: string;
  maxTokens?: number;
  /**
   * JSON Schema for structured outputs (`output_config.format`): the reply
   * is then guaranteed to parse as that shape — unless it was cut off at
   * max_tokens, which comes back as `truncated: true`.
   */
  outputSchema?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type AnthropicQuoteResult = {
  text: string;
  model: string;
  /** "end_turn" | "max_tokens" | … ("refusal" throws a typed AiError). */
  stopReason: string | null;
  /** The reply stopped at max_tokens, so its JSON is incomplete. */
  truncated: boolean;
  usage: AiUsage;
  /** HTTP attempts the shared client made. */
  attempts: number;
};

export function resolveAnthropicQuoteModel(
  env: Record<string, string | undefined> = process.env,
): string {
  return aiModel("quote", env);
}

/** The Messages API body. Pure — exported for tests. */
export function buildAnthropicQuoteBody(opts: {
  model: string;
  maxTokens: number;
  system: string | AnthropicTextBlock[];
  user: string;
  outputSchema?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    model: opts.model,
    max_tokens: opts.maxTokens,
    // Current Claude models reject non-default `temperature` and assistant
    // prefills (both 400); structured outputs replace the old JSON prefill.
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    ...(opts.outputSchema
      ? {
          output_config: {
            format: { type: "json_schema", schema: opts.outputSchema },
          },
        }
      : {}),
  };
}

export async function runAnthropicQuoteCompletion(
  opts: AnthropicQuoteOptions,
): Promise<AnthropicQuoteResult> {
  const model = opts.model ?? resolveAnthropicQuoteModel();
  const reply = await callAnthropic({
    apiKey: opts.apiKey,
    body: buildAnthropicQuoteBody({
      model,
      maxTokens: opts.maxTokens ?? ANTHROPIC_QUOTE_MAX_TOKENS,
      system: opts.system,
      user: opts.user,
      outputSchema: opts.outputSchema,
    }),
    timeoutMs: opts.timeoutMs ?? TIMEOUTS.generation,
    fetchImpl: opts.fetchImpl,
    // The pipeline repairs a cut-off reply once, so hand it back.
    onTruncated: "return",
    maxAttempts: opts.maxAttempts,
    budgetMs: opts.budgetMs,
    sleep: opts.sleep,
    random: opts.random,
    now: opts.now,
    onRetry: opts.onRetry,
  });

  if (!reply.text.trim() && !reply.truncated) {
    throw new AiError({
      kind: "invalid_output",
      provider: "anthropic",
      attempts: reply.attempts,
      message: "Claude returned an empty response.",
    });
  }
  return {
    text: reply.text,
    model,
    stopReason: reply.stopReason,
    truncated: reply.truncated,
    usage: reply.usage,
    attempts: reply.attempts,
  };
}
