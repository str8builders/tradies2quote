import "server-only";
// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — one AI reading of one sheet (or a bundle of consent
// papers): the page as a PDF plus its numbered text runs, structured JSON
// back. Claude Opus 5.5 at high effort: accuracy is the product here.
// Refusals fall back server-side to another model ("default" routing).
// ─────────────────────────────────────────────────────────────────────────

import { callAnthropic, pdfDocumentBlock, type AiUsage } from "@/lib/ai/anthropic";
import { aiModel } from "@/lib/ai/models";
import { EMPTY_READING, SHEET_READING_SCHEMA, type SheetReading } from "./schema";
import { SYSTEM_PROMPT } from "./prompt";

export const SHEET_READ_TIMEOUT_MS = 240_000;

export type SheetCall = {
  /** The page(s) as a small PDF (pdf-lib split); null sends the words alone. */
  pdf: Uint8Array | null;
  /** The instructions + numbered text runs (prompt.ts). */
  prompt: string;
};

export type SheetCallResult = { reading: SheetReading; json: unknown; usage: AiUsage; truncated: boolean; model: string };

export type SheetCallOptions = {
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  /** Default: the planSet model (Claude Opus 5.5). */
  model?: string;
  system?: string;
  schema?: Record<string, unknown>;
  /** Leave out the server-side fallback routing (beta header and `fallbacks`). */
  plain?: boolean;
};

export async function readSheetWithAi(call: SheetCall, opts: SheetCallOptions = {}): Promise<SheetCallResult> {
  const content: unknown[] = [];
  if (call.pdf) content.push(pdfDocumentBlock(call.pdf));
  content.push({ type: "text", text: call.prompt });
  const reply = await callAnthropic({
    apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
    fetchImpl: opts.fetchImpl,
    headers: opts.plain ? undefined : { "anthropic-beta": "server-side-fallback-2026-07-01" },
    body: {
      model: opts.model ?? aiModel("planSet"),
      max_tokens: 16000,
      system: opts.system ?? SYSTEM_PROMPT,
      ...(opts.plain ? {} : { fallbacks: "default" }),
      output_config: { effort: "high", format: { type: "json_schema", schema: opts.schema ?? SHEET_READING_SCHEMA } },
      messages: [{ role: "user", content }],
    },
    timeoutMs: SHEET_READ_TIMEOUT_MS,
    maxAttempts: 2,
    onTruncated: "return",
  });
  let reading: SheetReading = EMPTY_READING;
  let json: unknown = null;
  if (!reply.truncated) {
    try {
      json = JSON.parse(reply.text);
      reading = { ...EMPTY_READING, ...(json as Partial<SheetReading>) };
    } catch {
      reading = EMPTY_READING;
    }
  }
  return { reading, json, usage: reply.usage, truncated: reply.truncated, model: reply.model };
}
