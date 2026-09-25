import "server-only";

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { FetchTimeoutError } from "@/lib/fetchTimeout";
import { AiError } from "@/lib/ai/errors";
import type { AiTransport } from "@/lib/ai/http";
import { callChatCompletions } from "@/lib/ai/openai";

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
  /** True when the model stopped at its token cap (finish_reason "length"). */
  truncated: boolean;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
};

type Env = Record<string, string | undefined>;

export const DEFAULT_LOCAL_LLM_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_LOCAL_LLM_MAX_TOKENS = 2048;

/** Configuration problems are typed so routes answer 503 "not set up". */
function configError(message: string): AiError {
  return new AiError({ kind: "not_configured", provider: "local", message });
}

function positiveInteger(
  value: number | string | undefined,
  fallback: number,
  envName: string,
): number {
  if (value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw configError(`${envName} must be a positive integer.`);
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
    throw configError("LOCAL_LLM_BASE_URL is not configured.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw configError("LOCAL_LLM_BASE_URL must be a valid HTTP(S) URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw configError("LOCAL_LLM_BASE_URL must use HTTP or HTTPS.");
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
    throw configError("LOCAL_LLM_BASE_URL is not configured.");
  }

  const apiKey = overrides.apiKey?.trim() || env.LOCAL_LLM_API_KEY?.trim();
  if (!apiKey) {
    throw configError("LOCAL_LLM_API_KEY is not configured.");
  }

  const model = overrides.model?.trim() || env.LOCAL_LLM_MODEL?.trim();
  if (!model) {
    throw configError("LOCAL_LLM_MODEL is not configured.");
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

/**
 * OpenAI-compatible response_format.
 *
 * A bare `{ type: "object" }` schema carries no shape, so it is sent as plain
 * `json_object` mode — llama.cpp treats the two identically, and hosted
 * OpenAI-compatible endpoints reject a shapeless strict json_schema. Shaped
 * schemas keep `json_schema` (without `strict`, which hosted providers only
 * accept for fully-closed schemas and llama.cpp ignores).
 */
export function buildLocalJsonSchemaResponseFormat(schema: LocalJsonSchema) {
  const shapeKeys = Object.keys(schema.schema ?? {}).filter(
    (key) => key !== "type" && key !== "description",
  );
  if (shapeKeys.length === 0) {
    return { type: "json_object" as const };
  }
  return {
    type: "json_schema" as const,
    json_schema: {
      name: schema.name,
      ...(schema.description ? { description: schema.description } : {}),
      schema: schema.schema,
    },
  };
}

type JsonHttpResponse = {
  ok: boolean;
  status: number;
  /** Response headers (read for `retry-after`). */
  headers: { get(name: string): string | null };
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

/**
 * POST JSON over node:http(s) with NO response-header timeout.
 *
 * Node's built-in fetch (undici) aborts any request whose response headers
 * have not arrived within 300 s, regardless of the caller's AbortSignal. A
 * CPU-only llama.cpp server spends several minutes on prompt processing
 * before it writes headers, so every real-sized quote died with
 * `HeadersTimeoutError`. The only timeout here is the caller's `timeoutMs`,
 * surfaced as FetchTimeoutError so routes can answer 504 "took too long".
 */
export function postJsonWithoutHeaderTimeout(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<JsonHttpResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const impl = target.protocol === "https:" ? httpsRequest : httpRequest;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const req = impl(
      target,
      {
        method: "POST",
        headers: { ...headers, "content-length": Buffer.byteLength(body) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("error", (err) => finish(() => reject(err)));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          const rawHeaders = res.headers;
          finish(() =>
            resolve({
              ok: status >= 200 && status < 300,
              status,
              headers: {
                get: (name: string) => {
                  const value = rawHeaders[name.toLowerCase()];
                  if (value === undefined) return null;
                  return Array.isArray(value) ? value.join(", ") : String(value);
                },
              },
              text: async () => text,
              json: async () => JSON.parse(text) as unknown,
            }),
          );
        });
      },
    );
    const timer = setTimeout(() => {
      const err = new FetchTimeoutError(url, timeoutMs);
      finish(() => reject(err));
      req.destroy(err);
    }, timeoutMs);
    req.on("error", (err) => finish(() => reject(err)));
    req.end(body);
  });
}

function headersRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...(headers as Record<string, string>) };
}

/**
 * The node:http transport as a shared-client `AiTransport`: the self-hosted
 * model keeps its header-timeout-free socket but gets the same retry,
 * backoff, budget and error typing as every hosted call.
 */
export const localHttpTransport: AiTransport = (url, init, timeoutMs) =>
  postJsonWithoutHeaderTimeout(
    url,
    headersRecord(init.headers),
    typeof init.body === "string" ? init.body : "",
    timeoutMs,
  );

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

  // Tests inject fetchImpl; production goes through node:http so a slow
  // model's silent prompt-processing phase cannot trip undici's fixed
  // 300 s response-header timeout. Either way the shared policy applies:
  // bounded retries on 429/5xx/network errors, typed AiErrors.
  const reply = await callChatCompletions({
    provider: "local",
    url: config.chatCompletionsUrl,
    apiKey: config.apiKey,
    body,
    timeoutMs: config.timeoutMs,
    fetchImpl: opts.fetchImpl,
    transport: opts.fetchImpl ? undefined : localHttpTransport,
    onTruncated: "return",
  });

  const text = reply.content;
  if (!text.trim()) {
    throw new AiError({
      kind: reply.truncated ? "truncated" : "invalid_output",
      provider: "local",
      attempts: reply.attempts,
      message: "Local LLM returned an empty response.",
    });
  }

  return {
    text,
    model: config.model,
    finishReason: reply.finishReason,
    truncated: reply.truncated,
    usage: reply.usage,
  };
}
