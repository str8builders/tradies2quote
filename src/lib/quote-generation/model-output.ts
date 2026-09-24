import { round2 } from "@/lib/quote-defaults";
import type {
  QuoteClient,
  QuoteItemType,
  QuoteLineItem,
} from "@/lib/quote-types";

/**
 * WHITELIST the quote model's JSON. The model's output is untrusted: the
 * transcript it read can come from anyone near the phone or from the public
 * "Request a quote" form, so a prompt-injected response could carry any
 * field — a `price_source: "user_library"` that let a $999 "library" price
 * survive the AI-prices-off pass, a fake `dimension_confirmation`,
 * `supplier_source`, `verification`… Only the fields below are read; every
 * provenance flag, total, tax and currency is set by server code later.
 */

const MAX_LINES = 200;
const MAX_NOTES = 40;

export type SanitisedModelQuote = {
  client: QuoteClient;
  job_summary: string;
  /** type / description / quantity / unit / unit_price only (+ computed line_total). */
  line_items: QuoteLineItem[];
  notes: string[];
  /** The model's own "terms" text — never used as the quote's terms. */
  aiTerms: string;
};

function text(v: unknown, max: number): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function textOrNull(v: unknown, max: number): string | null {
  const s = text(v, max);
  return s ? s : null;
}

/** Non-negative finite number; anything else (negative, NaN, junk) is 0. */
function nonNegative(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function lineType(v: unknown): QuoteItemType {
  const t = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (t === "labour" || t === "labor") return "labour";
  if (t === "other") return "other";
  return "material";
}

export function sanitiseModelQuote(raw: unknown): SanitisedModelQuote {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const c =
    obj.client && typeof obj.client === "object" && !Array.isArray(obj.client)
      ? (obj.client as Record<string, unknown>)
      : {};

  const line_items: QuoteLineItem[] = (
    Array.isArray(obj.line_items) ? obj.line_items.slice(0, MAX_LINES) : []
  )
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((it) => {
      const quantity = nonNegative(it.quantity);
      const unit_price = nonNegative(it.unit_price);
      return {
        type: lineType(it.type),
        description: text(it.description, 500),
        quantity,
        unit: text(it.unit, 40),
        unit_price,
        line_total: round2(quantity * unit_price),
      };
    });

  const notes = (
    Array.isArray(obj.notes)
      ? obj.notes
      : typeof obj.notes === "string"
        ? [obj.notes]
        : []
  )
    .map((n) => text(n, 1000))
    .filter((n) => n.length > 0)
    .slice(0, MAX_NOTES);

  const aiTerms = Array.isArray(obj.terms)
    ? obj.terms.map((t) => text(t, 2000)).filter(Boolean).join("\n")
    : text(obj.terms, 4000);

  return {
    client: {
      name: text(c.name, 200) || "To be confirmed",
      address: textOrNull(c.address, 300),
      email: textOrNull(c.email, 254),
      phone: textOrNull(c.phone, 40),
    },
    job_summary: text(obj.job_summary, 2000),
    line_items,
    notes,
    aiTerms,
  };
}

// ── AI "terms" → tradie-facing notes ───────────────────────────────────────

/**
 * The prompt's standard clauses. The tradie's contract template already
 * covers validity, deposit/payment and variations, so the model restating
 * them adds nothing — and its "50% deposit" line would contradict the
 * template's deposit clause.
 */
const STANDARD_TERM_PATTERNS: RegExp[] = [
  /^(?:this )?quote (?:is )?valid (?:for )?\d+ days(?: from (?:the )?(?:date of )?issue)?$/,
  /^\d+ ?(?:%|percent) deposit (?:is )?required (?:up)?on acceptance(?: (?:for|on) (?:jobs|work) (?:over|above) (?:[a-z]{3} )?\d+)?$/,
  /^(?:the )?(?:final|balance of) payment (?:is )?due (?:up)?on completion$/,
  /^(?:all )?variations (?:are )?to be agreed in writing(?: before (?:the )?work (?:proceeds|commences|starts))?$/,
  /^exclud(?:es|ing) (?:building )?consents? and council fees(?: unless (?:specifically|otherwise) (?:noted|stated|included))?$/,
  /^(?:standard )?terms(?: (?:and|&) conditions)?$/,
];

function normaliseTermLine(line: string): string {
  return line
    .toLowerCase()
    .replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/&/g, " and ")
    .replace(/[$£€]/g, "")
    .replace(/[^a-z0-9%\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_TERM_NOTES = 5;

/**
 * The quote always keeps the tradie's contract terms. Whatever job-specific
 * conditions the model wrote in its "terms" (exclusions, access, staging)
 * become tradie-facing review notes instead — never silently added to the
 * customer's contract, which the public request form could otherwise steer.
 */
export function aiTermsToNotes(aiTerms: string): string[] {
  const lines = aiTerms
    .split(/\r?\n/)
    .flatMap((l) => l.replace(/([.;])\s+(?=[A-Z0-9])/g, "$1\n").split("\n"))
    .map((l) => l.trim().replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 0);
  const out: string[] = [];
  for (const line of lines) {
    const norm = normaliseTermLine(line);
    if (!norm || STANDARD_TERM_PATTERNS.some((re) => re.test(norm))) continue;
    out.push(
      `Suggested job-specific term (not added to your terms — add it under Terms if it applies): ${line.slice(0, 300)}`,
    );
    if (out.length >= MAX_TERM_NOTES) break;
  }
  return out;
}
