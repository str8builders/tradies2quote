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
  /** The page(s) as a small PDF (pdf-lib split). */
  pdf: Uint8Array;
  /** The instructions + numbered text runs (prompt.ts). */
  prompt: string;
};

export type SheetCallResult = { reading: SheetReading; usage: AiUsage; truncated: boolean; model: string };

export async function readSheetWithAi(call: SheetCall, opts: { apiKey?: string | null; fetchImpl?: typeof fetch } = {}): Promise<SheetCallResult> {
  const reply = await callAnthropic({
    apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
    fetchImpl: opts.fetchImpl,
    headers: { "anthropic-beta": "server-side-fallback-2026-07-01" },
    body: {
      model: aiModel("planSet"),
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema", schema: SHEET_READING_SCHEMA } },
      messages: [{ role: "user", content: [pdfDocumentBlock(call.pdf), { type: "text", text: call.prompt }] }],
    },
    timeoutMs: SHEET_READ_TIMEOUT_MS,
    maxAttempts: 2,
    onTruncated: "return",
  });
  let reading: SheetReading = EMPTY_READING;
  if (!reply.truncated) {
    try {
      reading = { ...EMPTY_READING, ...(JSON.parse(reply.text) as Partial<SheetReading>) };
    } catch {
      reading = EMPTY_READING;
    }
  }
  return { reading, usage: reply.usage, truncated: reply.truncated, model: reply.model };
}
