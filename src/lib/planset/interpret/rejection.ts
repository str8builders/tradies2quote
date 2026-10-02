// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — why the AI service turned a request down, in the words
// we act on (pure).
//
// A 400 from the API says what was wrong in its `error.message`; the shared
// client keeps that in `AiError.detail`. What to do next depends on it:
// a billing or setup problem fails every sheet the same way (stop and say
// so), a page the service can't open can still be read from its text, and an
// unrecognised 4xx deserves one more try before giving up on the sheet.
// ─────────────────────────────────────────────────────────────────────────

import { isAiError } from "@/lib/ai/errors";

export type Rejection =
  /** Our key, credit or permissions: every sheet fails the same way. */
  | "account"
  /** A setting the API doesn't accept (model, schema, parameters): every sheet fails. */
  | "setup"
  /** The request is bigger than the API takes. */
  | "too_long"
  /** The page's PDF wasn't accepted. */
  | "pdf"
  /** The server-side fallback routing (beta header) wasn't accepted. */
  | "beta"
  /** A 4xx whose reason we don't recognise. */
  | "other";

/** Rejections that will repeat for every remaining sheet. */
export const RUN_ENDING: ReadonlySet<Rejection> = new Set<Rejection>(["account", "setup"]);

const BILLING = /credit balance|purchase credits|plans\s*&\s*billing|billing|quota|spend limit/;
const SCHEMA = /grammar|schema|output_config|json_schema|structured output|response_format/;
const TOO_LONG = /request_too_large|too long|too large|too many (?:tokens|pages)|exceeds? (?:the )?(?:maximum|limit)|maximum (?:context|size|number|of)|context (?:length|window)/;
const BETA = /anthropic-beta|\bbeta\b|fallback/;
const SETUP = /\bmodel\b|effort|thinking|max_tokens|temperature|top_p|top_k|not supported|unsupported|extra inputs|not permitted|unexpected (?:field|keyword)/;
const PDF = /\bpdf\b|\bdocument\b|base64|media[_ ]type|corrupt|encrypt|password|could not process|not valid|invalid (?:pdf|file|document)|\bpages?\b/;

/**
 * Why a failed read was rejected, or null when it wasn't a rejection of the
 * request at all (a timeout, a busy service, a refusal, a bug of ours).
 */
export function classifyRejection(e: unknown): Rejection | null {
  if (!isAiError(e)) return null;
  if (e.kind === "auth") return "account";
  if (e.kind !== "bad_request") return null;
  const text = e.detail.toLowerCase();
  if (BILLING.test(text)) return "account";
  if (SCHEMA.test(text)) return "setup";
  if (e.status === 413 || TOO_LONG.test(text)) return "too_long";
  if (BETA.test(text)) return "beta";
  if (SETUP.test(text)) return "setup";
  if (PDF.test(text)) return "pdf";
  return "other";
}

/** A plain-English phrase for a flag shown to the tradie. */
export function describeRejection(why: Rejection): string {
  switch (why) {
    case "account":
      return "the AI service isn't available on this account right now";
    case "setup":
      return "the AI service turned the request down (a setup problem on our side)";
    case "too_long":
      return "the sheet was too big for the AI service to take";
    case "pdf":
      return "the AI service couldn't open the page";
    case "beta":
      return "the AI service turned down a routing setting";
    default:
      return "the AI service turned the request down";
  }
}
