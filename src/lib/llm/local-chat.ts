import "server-only";

import { fetchWithTimeout } from "@/lib/fetchTimeout";

export type LocalJsonSchema = {
  name: string;
  description?: string;
  schema: Record<string, unknown>;
};

export type LocalLlmConfig = {
  baseUrl: string;
  chatCompletionsUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxTokensCeiling: number;
};

export type LocalLlmOverrides = Partial<
  Pick<
    LocalLlmConfig,
    "baseUrl" | "apiKey" | "model" | "timeoutMs" | "maxTokensCeiling"
  >
>;

export type LocalChatCompletionOptions = LocalLlmOverrides & {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  responseSchema?: LocalJsonSchema;
  fetchImpl?: typeof fetch;
};

export type LocalChatCompletionResult = {
  text: string;
  model: string;
  finishReason: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
};

type Env = Record<string, string | undefined>;

export const DEFAULT_LOCAL_LLM_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_LOCAL_LLM_MAX_TOKENS = 2048;

function positiveInteger(
  value: number | string | undefined,
  fallback: number,
  envName: string,
): number {
  if (value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive integer.`);
  }
  return parsed;
}

export function clampLocalMaxTokens(
  requested: number | undefined,
  ceiling: number,
): number {
  const parsed = positiveInteger(
    requested,
    ceiling,
    "Local LLM max_tokens",
  );
  return Math.min(parsed, ceiling);
}

export function isLocalTextAiProvider(
  provider = process.env.TEXT_AI_PROVIDER,
): boolean {
  return provider?.trim().toLowerCase() === "local";
}

export function toChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("LOCAL_LLM_BASE_URL is not configured.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("LOCAL_LLM_BASE_URL must be a valid HTTP(S) URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("LOCAL_LLM_BASE_URL must use HTTP or HTTPS.");
  }

  return trimmed.endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;
}

/** Resolve local model settings without ever including secret values in errors. */
export function resolveLocalLlmConfig(
  overrides: LocalLlmOverrides = {},
  env: Env = process.env,
): LocalLlmConfig {
  const baseUrl = overrides.baseUrl?.trim() || env.LOCAL_LLM_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("LOCAL_LLM_BASE_URL is not configured.");
  }

  const apiKey = overrides.apiKey?.trim() || env.LOCAL_LLM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("LOCAL_LLM_API_KEY is not configured.");
  }

  const model = overrides.model?.trim() || env.LOCAL_LLM_MODEL?.trim();
  if (!model) {
    throw new Error("LOCAL_LLM_MODEL is not configured.");
  }

  const timeoutMs = positiveInteger(
    overrides.timeoutMs ?? env.LOCAL_LLM_TIMEOUT_MS,
    DEFAULT_LOCAL_LLM_TIMEOUT_MS,
    "LOCAL_LLM_TIMEOUT_MS",
  );
  const maxTokensCeiling = positiveInteger(
    overrides.maxTokensCeiling ?? env.LOCAL_LLM_MAX_TOKENS,
    DEFAULT_LOCAL_LLM_MAX_TOKENS,
    "LOCAL_LLM_MAX_TOKENS",
  );

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    chatCompletionsUrl: toChatCompletionsUrl(baseUrl),
    apiKey,
    model,
    timeoutMs,
    maxTokensCeiling,
  };
}

export function buildLocalJsonSchemaResponseFormat(schema: LocalJsonSchema) {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: schema.name,
      ...(schema.description ? { description: schema.description } : {}),
      strict: true,
      schema: schema.schema,
    },
  };
}

/**
 * Small OpenAI-compatible text helper for direct route integrations.
 * Structured callers should pass responseSchema; plain-text callers omit it.
 */
export async function runLocalChatCompletion(
  opts: LocalChatCompletionOptions,
): Promise<LocalChatCompletionResult> {
  const config = resolveLocalLlmConfig(opts);
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: clampLocalMaxTokens(opts.maxTokens, config.maxTokensCeiling),
    temperature: opts.temperature ?? 0,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };
  if (opts.responseSchema) {
    body.response_format = buildLocalJsonSchemaResponseFormat(
      opts.responseSchema,
    );
  }

  const res = await fetchWithTimeout(
    config.chatCompletionsUrl,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    config.timeoutMs,
    opts.fetchImpl ?? fetch,
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Local LLM ${res.status}: ${detail.slice(0, 200)}`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{
      finish_reason?: string | null;
      message?: { content?: string | null };
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = payload.choices?.[0];
  const text = choice?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Local LLM returned an empty response.");
  }

  return {
    text,
    model: config.model,
    finishReason: choice?.finish_reason ?? null,
    usage: {
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
    },
  };
}
