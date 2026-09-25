// ─────────────────────────────────────────────────────────────────────────
// OpenAI structured runtime — the OpenAI sibling of runtime.ts.
//
// Same contract as the Anthropic runtime, but speaks OpenAI Chat Completions:
//   - Cloud OpenAI keeps the existing forced function-call contract.
//   - Local OpenAI-compatible models use response_format.json_schema and return
//     the structured object in message.content.
//   - Validation + one retry — caller's parse() validates/normalises.
//   - Observability — logs run.start / run.finish to agent-monitor.
//   - Vision-ready — user content may include image_url blocks.
//   - Transport — the shared AI client (src/lib/ai): timeout, bounded
//     retries on 429/5xx and network errors, typed AiErrors. The local model
//     rides its node:http transport (no undici header timeout) under the
//     same policy.
//
// (OpenAI caches long prompts automatically, so there's no cache_control to
// set — the caching win is free.)
//
// Pure builder + extractor are exported for unit tests; the orchestrator takes
// an injectable fetch.
// ─────────────────────────────────────────────────────────────────────────
import "server-only";
import {
  logAgentRunFinish,
  logAgentRunStart,
  newRunId,
} from "@/lib/agent-monitor/logger";
import { TIMEOUTS } from "@/lib/fetchTimeout";
import {
  buildLocalJsonSchemaResponseFormat,
  clampLocalMaxTokens,
  localHttpTransport,
  resolveLocalLlmConfig,
  toChatCompletionsUrl,
} from "@/lib/llm/local-chat";
import { aiModel } from "@/lib/ai/models";
import { AiError, describeAiError } from "@/lib/ai/errors";
import {
  callChatCompletions,
  OPENAI_CHAT_COMPLETIONS_URL,
} from "@/lib/ai/openai";
import type { ParseResult } from "./runtime";

export type OpenAIContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface OpenAIStructuredOptions<T> {
  agentName: string;
  system: string;
  user: string | OpenAIContentBlock[];
  tool: { name: string; description: string; schema: Record<string, unknown> };
  parse: (input: unknown) => ParseResult<T>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  runId?: string;
  quoteId?: string;
  userId?: string;
  apiKey?: string;
  /** Defaults to cloud OpenAI. Shared text runtime passes "local" explicitly. */
  provider?: "openai" | "local";
  /** Optional OpenAI-compatible base URL, normally ending in /v1. */
  baseUrl?: string;
  outputFormat?: "tool_call" | "json_schema";
  fetchImpl?: typeof fetch;
}

export interface OpenAIStructuredResult<T> {
  value: T;
  model: string;
  attempts: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

interface OpenAIMessage {
  role: "system" | "user";
  content: string | OpenAIContentBlock[];
}

/** Build the OpenAI Chat Completions request body. Pure — no I/O. */
export function buildOpenAIRequestBody(args: {
  model: string;
  messages: OpenAIMessage[];
  tool: { name: string; description: string; schema: Record<string, unknown> };
  maxTokens: number;
  temperature: number;
  outputFormat?: "tool_call" | "json_schema";
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: args.model,
    max_tokens: args.maxTokens,
    temperature: args.temperature,
    messages: args.messages,
  };

  if (args.outputFormat === "json_schema") {
    body.response_format = buildLocalJsonSchemaResponseFormat({
      name: args.tool.name,
      description: args.tool.description,
      schema: args.tool.schema,
    });
  } else {
    body.tools = [
      {
        type: "function",
        function: {
          name: args.tool.name,
          description: args.tool.description,
          parameters: args.tool.schema,
        },
      },
    ];
    body.tool_choice = {
      type: "function",
      function: { name: args.tool.name },
    };
  }

  return body;
}

interface OpenAIResponsePayload {
  choices?: Array<{
    message?: {
      content?: string | null;
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

/**
 * Pull the forced function call's parsed arguments out of a response. Pure.
 * OpenAI returns `arguments` as a JSON STRING — we parse it here.
 */
export function extractOpenAIToolCall(
  payload: OpenAIResponsePayload,
  toolName: string,
): unknown {
  const call = payload.choices?.[0]?.message?.tool_calls?.find(
    (c) => c.function?.name === toolName,
  );
  const argStr = call?.function?.arguments;
  if (typeof argStr !== "string") {
    throw new Error(`Model did not call the expected "${toolName}" function.`);
  }
  try {
    return JSON.parse(argStr);
  } catch (e) {
    throw new Error(
      `Function "${toolName}" arguments were not valid JSON: ${(e as Error).message}`,
    );
  }
}

/** Parse a json_schema response returned in choices[0].message.content. */
export function extractOpenAIJsonContent(
  payload: OpenAIResponsePayload,
  schemaName: string,
): unknown {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(
      `Model did not return JSON content for schema "${schemaName}".`,
    );
  }
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error(
      `Schema "${schemaName}" content was not valid JSON: ${(e as Error).message}`,
    );
  }
}

export async function runOpenAIStructuredAgent<T>(
  opts: OpenAIStructuredOptions<T>,
): Promise<OpenAIStructuredResult<T>> {
  const provider = opts.provider ?? "openai";
  const localConfig =
    provider === "local"
      ? resolveLocalLlmConfig({
          apiKey: opts.apiKey,
          baseUrl: opts.baseUrl,
          model: opts.model,
        })
      : null;
  const apiKey = localConfig?.apiKey ?? opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AiError({
      kind: "not_configured",
      provider,
      message:
        provider === "local"
          ? "LOCAL_LLM_API_KEY is not configured."
          : "OPENAI_API_KEY is not configured.",
    });
  }

  const model = localConfig?.model ?? opts.model ?? aiModel("openaiDefault");
  const url =
    localConfig?.chatCompletionsUrl ??
    (opts.baseUrl
      ? toChatCompletionsUrl(opts.baseUrl)
      : OPENAI_CHAT_COMPLETIONS_URL);
  const outputFormat =
    opts.outputFormat ?? (provider === "local" ? "json_schema" : "tool_call");
  const maxTokens = localConfig
    ? clampLocalMaxTokens(opts.maxTokens, localConfig.maxTokensCeiling)
    : (opts.maxTokens ?? 1500);
  const timeoutMs = localConfig?.timeoutMs ?? TIMEOUTS.llm;
  const temperature = opts.temperature ?? 0;
  const runId = opts.runId ?? newRunId(opts.agentName.toLowerCase());

  const messages: OpenAIMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];

  logAgentRunStart({
    agentName: opts.agentName,
    runId,
    status: "running",
    message: `Started (${model})`,
    quoteId: opts.quoteId,
    userId: opts.userId,
  });

  const MAX_ATTEMPTS = 2;
  let lastError = "";
  let lastTruncated = false;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const body = buildOpenAIRequestBody({
        model,
        messages,
        tool: opts.tool,
        maxTokens,
        temperature,
        outputFormat,
      });

      const reply = await callChatCompletions({
        provider,
        url,
        apiKey,
        body,
        timeoutMs,
        fetchImpl: opts.fetchImpl,
        // Production local calls use node:http so a slow CPU model's silent
        // prompt phase can't trip undici's 300 s header timeout. Tests (and
        // any caller that injects fetch) keep their fetch.
        transport:
          provider === "local" && !opts.fetchImpl ? localHttpTransport : undefined,
        onTruncated: "return",
      });
      const payload = reply.payload as OpenAIResponsePayload;
      inputTokens += reply.usage.inputTokens;
      outputTokens += reply.usage.outputTokens;
      lastTruncated = reply.truncated;

      let input: unknown;
      try {
        input =
          outputFormat === "json_schema"
            ? extractOpenAIJsonContent(payload, opts.tool.name)
            : extractOpenAIToolCall(payload, opts.tool.name);
      } catch (e) {
        lastError = (e as Error).message;
        if (attempt < MAX_ATTEMPTS) {
          messages.push({
            role: "user",
            content:
              outputFormat === "json_schema"
                ? `Return valid JSON matching the "${opts.tool.name}" schema.`
                : `You must respond by calling the "${opts.tool.name}" function with valid arguments.`,
          });
          continue;
        }
        throw new AiError({
          kind: lastTruncated ? "truncated" : "invalid_output",
          provider,
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
          message: `OK in ${attempt} attempt(s)`,
          quoteId: opts.quoteId,
          userId: opts.userId,
        });
        return {
          value: parsed.value,
          model,
          attempts: attempt,
          usage: { inputTokens, outputTokens },
        };
      }

      lastError = parsed.error;
      if (attempt < MAX_ATTEMPTS) {
        messages.push({
          role: "user",
          content:
            outputFormat === "json_schema"
              ? `Your previous JSON for "${opts.tool.name}" was invalid: ${parsed.error}. Return corrected JSON matching the schema.`
              : `Your previous "${opts.tool.name}" call was invalid: ${parsed.error}. Call it again with corrected values.`,
        });
      }
    }

    throw new AiError({
      kind: lastTruncated ? "truncated" : "invalid_output",
      provider,
      attempts: MAX_ATTEMPTS,
      message: `Agent "${opts.agentName}" failed validation after ${MAX_ATTEMPTS} attempts: ${lastError}`,
    });
  } catch (err) {
    logAgentRunFinish({
      agentName: opts.agentName,
      runId,
      status: "failed",
      message: `Failed: ${describeAiError(err)}`.slice(0, 280),
      quoteId: opts.quoteId,
      userId: opts.userId,
    });
    throw err;
  }
}
