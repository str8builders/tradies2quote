import "server-only";
// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — one sheet read that doesn't give up on the first 400.
//
// The API answers a request it can't take with a 4xx whose message says why
// (rejection.ts). Rather than lose the sheet, the read steps down, one rung at
// a time, to a request the service can take:
//
//   full   the page as it is in the plan set + its text runs
//   again  the same request once more (a 4xx we don't recognise)
//   plain  without the server-side fallback routing (a beta setting was turned down)
//   clean  a cleaned copy of the page (annotations, thumbnails, extras removed)
//   text   the text runs alone (the service can't open the page, or it's too big)
//
// The text runs carry every printed word and number with its position, and
// every answer is checked against them afterwards, so a words-only read is
// weaker (no line work, hatches or symbols) but never less honest.
//
// Account and setup problems fail every sheet the same way, so they end the
// read at once (the caller stops the whole run). Timeouts, busy services and
// refusals aren't rejections: the shared client already retried those.
// ─────────────────────────────────────────────────────────────────────────

import { AiError, isAiError } from "@/lib/ai/errors";
import { readSheetWithAi, type SheetCallOptions, type SheetCallResult } from "./call";
import { RUN_ENDING, classifyRejection, type Rejection } from "./rejection";

/** The API takes 32 MB a request and base64 adds a third. */
export const MAX_PDF_BYTES = 22 * 1024 * 1024;
/** Wait before repeating a request whose rejection we don't recognise. */
export const AGAIN_DELAY_MS = 1_500;

export type Rung = "full" | "again" | "plain" | "clean" | "text";

export type ResilientCall = {
  /** The page as it is in the plan set; null when it couldn't be cut out (the words alone are sent). */
  pdf: Uint8Array | null;
  /** Builds the cleaned copy of the page for the `clean` rung. */
  clean?: () => Promise<Uint8Array>;
  /** The instructions and text runs, for a read with the page attached. */
  prompt: string;
  /** The same for a words-only read. Omit when there are no words to read (a scan). */
  textPrompt?: string;
};

export type ResilientOptions = SheetCallOptions & {
  sleep?: (ms: number) => Promise<void>;
  /** Told each time the read steps down, for the server log. */
  onStepDown?: (info: { from: Rung; to: Rung; why: Rejection; detail: string }) => void;
};

export type ResilientResult = SheetCallResult & { rung: Rung };

/** Top to bottom: a read only ever steps down. */
const ORDER: readonly Rung[] = ["full", "again", "plain", "clean", "text"];

/** The rungs to try after each kind of rejection, best first. */
const AFTER: Record<Exclude<Rejection, "account" | "setup">, Rung[]> = {
  too_long: ["text"],
  pdf: ["clean", "text"],
  beta: ["plain", "clean", "text"],
  other: ["again", "clean", "text"],
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function readSheetResilient(call: ResilientCall, opts: ResilientOptions = {}): Promise<ResilientResult> {
  const { sleep = defaultSleep, onStepDown, ...callOpts } = opts;
  const canText = call.textPrompt !== undefined;
  const tooBig = call.pdf !== null && call.pdf.length > MAX_PDF_BYTES;
  let rung: Rung = call.pdf === null || tooBig ? "text" : "full";
  if (rung === "text" && !canText) {
    throw new AiError({ kind: "bad_request", provider: "anthropic", status: 400, detail: tooBig ? "The page's PDF is too big to send." : "The page couldn't be cut out of the plan set." });
  }
  const tried = new Set<Rung>();
  let plain = false;
  let cleaned: Uint8Array | null = null;
  let first: AiError | null = null;

  for (;;) {
    tried.add(rung);
    try {
      let pdf: Uint8Array | null;
      if (rung === "text") pdf = null;
      else if (rung === "clean") pdf = cleaned ??= await call.clean!();
      else pdf = call.pdf;
      const prompt = rung === "text" ? call.textPrompt! : call.prompt;
      const res = await readSheetWithAi({ pdf, prompt }, { ...callOpts, plain });
      return { ...res, rung };
    } catch (e) {
      const why = classifyRejection(e);
      if (why === null || RUN_ENDING.has(why) || !isAiError(e)) throw e;
      first ??= e;
      const below = ORDER.indexOf(rung);
      const next = AFTER[why as keyof typeof AFTER].find((r) => ORDER.indexOf(r) > below && (r !== "text" || canText) && (r !== "clean" || (call.clean !== undefined && call.pdf !== null)));
      if (!next) throw tried.size > 1 ? combine(first, e, tried) : e;
      onStepDown?.({ from: rung, to: next, why, detail: e.detail });
      if (next === "again") await sleep(AGAIN_DELAY_MS);
      if (next === "plain") plain = true;
      rung = next;
    }
  }
}

/** One error that carries the first rejection's reason and the last's, so the log shows the whole story. */
function combine(first: AiError, last: AiError, tried: ReadonlySet<Rung>): AiError {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const detail = first === last ? first.detail : `${clip(first.detail, 150)} | after ${[...tried].join(", ")}: ${clip(last.detail, 110)}`;
  return new AiError({ kind: last.kind, provider: last.provider, status: last.status, attempts: last.attempts, detail });
}
