import "server-only";

import { captureError } from "@/lib/observability";
import { logAgentStep } from "@/lib/agent-monitor/logger";
import { parseModelJsonObject } from "@/lib/modelJson";
import {
  ANTHROPIC_QUOTE_MAX_TOKENS,
  runAnthropicQuoteCompletion,
} from "@/lib/llm/anthropic-quote";
import { runLocalChatCompletion } from "@/lib/llm/local-chat";
import type { QuoteTextProvider } from "@/lib/llm/quote-text-provider";
import { renderQuotePrompt, type QuotePromptParts } from "@/lib/quote-prompt";
import {
  EPHEMERAL_CACHE,
  ZERO_USAGE,
  addUsage,
  type AiUsage,
} from "@/lib/ai/anthropic";
import { describeAiError, isAiError, type AiErrorKind } from "@/lib/ai/errors";
import { QUOTE_MODEL_OUTPUT_SCHEMA, checkModelQuoteShape } from "./model-output";

/**
 * The quote pipeline's model call: one reply, checked, and ONE repair retry
 * that tells the model what was wrong — then a plain failure.
 *
 *  - Hosted (Anthropic): structured outputs (`output_config.format` =
 *    QUOTE_MODEL_OUTPUT_SCHEMA) make every complete reply schema-valid JSON.
 *    The system prompt goes as two blocks: the stable rules with
 *    cache_control, then the tradie's part.
 *  - Self-hosted: free-text JSON (json_object mode), same repair.
 *
 * Transport failures (after the shared client's own retries) are not
 * repaired — a new prompt can't fix a 529 — they map straight to a plain
 * message. The sanitiser (model-output.ts) still whitelists whatever comes
 * back; this module only decides whether the reply is usable at all.
 */

/** The live llama.cpp service is capped at 2,048 generated tokens. */
export const LOCAL_QUOTE_MAX_TOKENS = 2048;
/** The first reply plus one repair. */
export const QUOTE_MODEL_MAX_TRIES = 2;

export type ReplyProblem =
  | { kind: "truncated" }
  | { kind: "invalid"; reason: string };

/** What the repair turn tells the model. Pure — exported for tests. */
export function repairInstruction(problem: ReplyProblem): string {
  if (problem.kind === "truncated") {
    return "Your previous reply was cut off by the output limit before the JSON was complete, so it could not be used. Reply again with the complete quote as ONE JSON object in the same shape, and keep it compact: combine minor items into single lines, and keep notes and terms short.";
  }
  return `Your previous reply could not be used: ${problem.reason}. Reply again with ONLY the complete quote as ONE JSON object in the required shape — no prose, no code fences.`;
}

export type QuoteModelResult =
  | {
      ok: true;
      json: unknown;
      /** Model replies requested (1, or 2 after a repair). */
      tries: number;
      repaired: boolean;
      usage: AiUsage;
    }
  | {
      ok: false;
      status: number;
      body: { error: string; code: AiErrorKind | "unknown" };
      tries: number;
      usage: AiUsage;
    };

export interface QuoteModelCall {
  textProvider: QuoteTextProvider;
  prompt: QuotePromptParts;
  userMessage: string;
  /** Repair steps go on the pipeline's own agent_runs row. */
  monitor?: { agentName: string; runId: string; quoteId: string };
}

type Reply = { text: string; truncated: boolean; usage: AiUsage };

async function askModel(call: QuoteModelCall, user: string): Promise<Reply> {
  if (call.textProvider === "anthropic") {
    const r = await runAnthropicQuoteCompletion({
      apiKey: process.env.ANTHROPIC_API_KEY ?? "",
      system: [
        // Identical for every tradie → cached across tradies (5-minute TTL).
        { type: "text", text: call.prompt.stable, cache_control: EPHEMERAL_CACHE },
        { type: "text", text: call.prompt.tradie },
      ],
      user,
      maxTokens: ANTHROPIC_QUOTE_MAX_TOKENS,
      outputSchema: QUOTE_MODEL_OUTPUT_SCHEMA,
    });
    return {
      text: r.text,
      truncated: r.truncated ?? r.stopReason === "max_tokens",
      usage: addUsage(ZERO_USAGE, r.usage),
    };
  }
  const r = await runLocalChatCompletion({
    system: renderQuotePrompt(call.prompt),
    user,
    maxTokens: LOCAL_QUOTE_MAX_TOKENS,
    temperature: 0,
    responseSchema: {
      name: "tradies2quote_quote",
      description: "A structured quote matching the format in the system prompt.",
      schema: { type: "object" },
    },
  });
  return {
    text: r.text,
    truncated: r.truncated ?? r.finishReason === "length",
    usage: addUsage(ZERO_USAGE, r.usage),
  };
}

function inspectReply(
  reply: Reply,
): { ok: true; json: unknown } | { ok: false; problem: ReplyProblem } {
  if (reply.truncated) return { ok: false, problem: { kind: "truncated" } };
  if (!reply.text.trim()) {
    return { ok: false, problem: { kind: "invalid", reason: "the reply was empty" } };
  }
  let json: unknown;
  try {
    json = parseModelJsonObject<unknown>(reply.text);
  } catch {
    return {
      ok: false,
      problem: { kind: "invalid", reason: "it was not a single valid JSON object" },
    };
  }
  const shapeError = checkModelQuoteShape(json);
  if (shapeError) return { ok: false, problem: { kind: "invalid", reason: shapeError } };
  return { ok: true, json };
}

function problemLabel(problem: ReplyProblem): string {
  return problem.kind === "truncated" ? "cut off at the output limit" : problem.reason;
}

/** Plain messages for a provider failure (the detail stays server-side). */
function transportFailure(
  e: unknown,
  call: QuoteModelCall,
  tries: number,
  usage: AiUsage,
): QuoteModelResult {
  console.error(`Quote model (${call.textProvider}) unreachable: ${describeAiError(e)}`);
  captureError(e, { route: "/api/quotes/generate" });
  const kind: AiErrorKind | "unknown" = isAiError(e) ? e.kind : "unknown";
  const answer = (status: number, error: string): QuoteModelResult => ({
    ok: false,
    status,
    body: { error, code: kind },
    tries,
    usage,
  });
  switch (kind) {
    case "timeout":
      return answer(504, "Quote generation took too long. Please try again.");
    case "rate_limited":
    case "overloaded":
      return answer(503, "The quote service is busy right now. Please try again in a minute.");
    case "auth":
    case "not_configured":
      return answer(503, "Quote generation isn't available right now. Please try again later.");
    case "refused":
      return answer(
        422,
        "The AI declined to write this quote. Check the job description and try again.",
      );
    default:
      return answer(502, "Quote generation failed. Please try again.");
  }
}

export async function callQuoteModel(call: QuoteModelCall): Promise<QuoteModelResult> {
  let usage: AiUsage = { ...ZERO_USAGE };
  let problem: ReplyProblem | null = null;
  let lastText = "";

  for (let tries = 1; tries <= QUOTE_MODEL_MAX_TRIES; tries++) {
    const user = problem
      ? `${call.userMessage}\n\n${repairInstruction(problem)}`
      : call.userMessage;

    let reply: Reply;
    try {
      reply = await askModel(call, user);
    } catch (e) {
      // An empty reply is an output problem, not a transport one: repair it.
      if (isAiError(e) && (e.kind === "invalid_output" || e.kind === "truncated")) {
        reply = { text: "", truncated: e.kind === "truncated", usage: { ...ZERO_USAGE } };
      } else {
        return transportFailure(e, call, tries, usage);
      }
    }
    usage = addUsage(usage, reply.usage);
    lastText = reply.text;

    const inspected = inspectReply(reply);
    if (inspected.ok) {
      return { ok: true, json: inspected.json, tries, repaired: tries > 1, usage };
    }
    problem = inspected.problem;
    if (tries < QUOTE_MODEL_MAX_TRIES) {
      console.warn(`[quote-model] reply unusable (${problemLabel(problem)}); one repair retry`);
      if (call.monitor) {
        logAgentStep({
          agentName: call.monitor.agentName,
          runId: call.monitor.runId,
          stepName: "model.repair",
          status: "running",
          message: `Reply ${problemLabel(problem)}; asking once more`,
          quoteId: call.monitor.quoteId,
        });
      }
    }
  }

  // Both replies unusable.
  const finalProblem = problem ?? { kind: "invalid" as const, reason: "no reply" };
  if (finalProblem.kind === "truncated") {
    // A cut-off reply twice means the job really is too big for one quote.
    return {
      ok: false,
      status: 502,
      body: {
        error:
          "This job was too long to quote in one go. Shorten the description or split it into separate quotes.",
        code: "truncated",
      },
      tries: QUOTE_MODEL_MAX_TRIES,
      usage,
    };
  }
  const err = new Error(`Quote model reply unusable after repair: ${finalProblem.reason}`);
  captureError(err, { route: "quotes/generate" });
  console.error(
    `Failed to parse quote model (${call.textProvider}) JSON after repair:`,
    finalProblem.reason,
    "raw (first 800):",
    lastText.slice(0, 800),
  );
  return {
    ok: false,
    status: 502,
    body: { error: "Quote response was malformed. Please try again.", code: "invalid_output" },
    tries: QUOTE_MODEL_MAX_TRIES,
    usage,
  };
}
