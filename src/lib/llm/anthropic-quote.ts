import "server-only";

import { fetchWithTimeout, FetchTimeoutError, TIMEOUTS } from "@/lib/fetchTimeout";

/**
 * Hosted quote generation on Anthropic Claude.
 *
 * This is the original quote-generation path (before the self-hosted Qwen
 * integration) restored as a selectable provider. It is used when
 * TEXT_AI_PROVIDER is anything other than "local" and ANTHROPIC_API_KEY is
 * present. A hosted model answers a full quote in seconds; the CPU-only Qwen
 * server on the VPS needs 5–15 minutes for the same job.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const DEFAULT_ANTHROPIC_QUOTE_MODEL = "claude-sonnet-5";
// A long quote with 40+ line items, labour breakdowns, notes and compliance
// review can plausibly push past 8192 output tokens; 16384 keeps headroom.
// max_tokens is a CAP not a minimum — normal quotes cost the same.
export const ANTHROPIC_QUOTE_MAX_TOKENS = 16384;

// Anthropic intermittently returns 429 (rate limit), 500, 503 and 529
// (overloaded). Retry transient failures server-side with exponential
// backoff so a blip is invisible to the tradie.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 529]);

export type AnthropicQuoteOptions = {
  apiKey: string;
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type AnthropicQuoteResult = {
  text: string;
  model: string;
  /** "end_turn" | "max_tokens" | "refusal" | … */
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
};

export function resolveAnthropicQuoteModel(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.ANTHROPIC_QUOTE_MODEL?.trim() || DEFAULT_ANTHROPIC_QUOTE_MODEL;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch,
  { attempts = 3, baseDelayMs = 500 }: { attempts?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  for (let i = 0; i < attempts; i++) {
    const isLast = i === attempts - 1;
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs, fetchImpl);
      if (res.ok || !RETRYABLE_STATUSES.has(res.status) || isLast) {
        return res;
      }
      console.warn(`Claude API ${res.status}; retrying (${i + 1}/${attempts - 1})`);
    } catch (e) {
      // A timed-out attempt already spent the request budget — retrying
      // would just leave the client hanging past its own abort.
      if (e instanceof FetchTimeoutError) throw e;
      if (isLast) throw e;
      console.warn(`Claude API network error; retrying (${i + 1}/${attempts - 1})`, e);
    }
    await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
  }
  throw new Error("fetchWithRetry exhausted all attempts");
}

export async function runAnthropicQuoteCompletion(
  opts: AnthropicQuoteOptions,
): Promise<AnthropicQuoteResult> {
  const model = opts.model ?? resolveAnthropicQuoteModel();
  const res = await fetchWithRetry(
    ANTHROPIC_URL,
    {
      method: "POST",
      headers: {
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      // Current Claude models reject non-default `temperature` and
      // assistant prefills (both 400) — parseModelJsonObject handles fences.
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? ANTHROPIC_QUOTE_MAX_TOKENS,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }),
    },
    opts.timeoutMs ?? TIMEOUTS.generation,
    opts.fetchImpl ?? fetch,
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Claude API ${res.status}: ${detail.slice(0, 200)}`);
  }

  const payload = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string | null;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = payload.content?.find((c) => c.type === "text")?.text ?? "";
  if (!text.trim()) {
    throw new Error("Claude returned an empty response.");
  }
  return {
    text,
    model,
    stopReason: payload.stop_reason ?? null,
    usage: {
      inputTokens: payload.usage?.input_tokens ?? 0,
      outputTokens: payload.usage?.output_tokens ?? 0,
    },
  };
}
