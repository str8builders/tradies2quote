// ─────────────────────────────────────────────────────────────────────────
// OpenAI-compatible Chat Completions over raw fetch (cloud OpenAI and the
// self-hosted model), through the shared retry policy.
//
//   refusal / content_filter → AiError("refused")
//   finish_reason "length"   → AiError("truncated"), or `truncated: true`
//                              when the caller handles it.
// Browser-safe (no Node or server-only imports).
// ─────────────────────────────────────────────────────────────────────────

import { AiError, type AiProvider } from "./errors";
import { sendWithRetry, type AiTransport, type RetryOptions } from "./http";

export const OPENAI_CHAT_COMPLETIONS_URL =
  "https://api.openai.com/v1/chat/completions";
export const OPENAI_TRANSCRIPTIONS_URL =
  "https://api.openai.com/v1/audio/transcriptions";

export interface ChatCompletionPayload {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      refusal?: string | null;
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export interface ChatCallOptions extends RetryOptions {
  provider: Extract<AiProvider, "openai" | "local">;
  url: string;
  apiKey: string | null | undefined;
  body: Record<string, unknown>;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  transport?: AiTransport;
  /** `length` handling: throw (default) or hand back `truncated: true`. */
  onTruncated?: "error" | "return";
}

export interface ChatCallResult {
  payload: ChatCompletionPayload;
  /** choices[0].message.content ("" when the model only made tool calls). */
  content: string;
  finishReason: string | null;
  truncated: boolean;
  usage: { inputTokens: number; outputTokens: number };
  attempts: number;
}

const KEY_ENV: Record<ChatCallOptions["provider"], string> = {
  openai: "OPENAI_API_KEY",
  local: "LOCAL_LLM_API_KEY",
};

export async function callChatCompletions(
  opts: ChatCallOptions,
): Promise<ChatCallResult> {
  if (!opts.apiKey) {
    throw new AiError({
      kind: "not_configured",
      provider: opts.provider,
      message: `${KEY_ENV[opts.provider]} is not configured.`,
    });
  }
  const { response, attempts } = await sendWithRetry({
    provider: opts.provider,
    url: opts.url,
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        "content-type": "application/json",
      },
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

  let payload: ChatCompletionPayload;
  try {
    payload = (await response.json()) as ChatCompletionPayload;
  } catch (e) {
    throw new AiError({
      kind: "unavailable",
      provider: opts.provider,
      status: response.status,
      attempts,
      detail: "The API answered 200 with a body that was not JSON.",
      cause: e,
    });
  }

  const choice = payload?.choices?.[0];
  const finishReason = choice?.finish_reason ?? null;
  const refusal = choice?.message?.refusal;
  if ((typeof refusal === "string" && refusal.trim()) || finishReason === "content_filter") {
    throw new AiError({
      kind: "refused",
      provider: opts.provider,
      attempts,
      detail: finishReason === "content_filter" ? "finish_reason: content_filter" : "message.refusal",
    });
  }
  const truncated = finishReason === "length";
  if (truncated && opts.onTruncated !== "return") {
    throw new AiError({
      kind: "truncated",
      provider: opts.provider,
      attempts,
      detail: `finish_reason: length (max_tokens ${String(opts.body.max_tokens)})`,
    });
  }
  const content = choice?.message?.content;

  return {
    payload: payload ?? {},
    content: typeof content === "string" ? content : "",
    finishReason,
    truncated,
    usage: {
      inputTokens: payload?.usage?.prompt_tokens ?? 0,
      outputTokens: payload?.usage?.completion_tokens ?? 0,
    },
    attempts,
  };
}
