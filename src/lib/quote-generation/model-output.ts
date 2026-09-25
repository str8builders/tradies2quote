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

/**
 * A quote holds at most this many model lines. Anything past it is left off
 * — never silently: a review note says how many and where the cut came.
 */
const MAX_LINES = 200;
const MAX_NOTES = 40;

// ── Structured output contract (hosted path) ──────────────────────────────

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] } as const;

/**
 * JSON Schema for the quote reply, sent as `output_config.format` on the
 * Anthropic path so the reply is always parseable JSON of this shape. It is
 * exactly the object the system prompt describes (JSON_INSTRUCTIONS in
 * src/lib/quote-prompt.ts), so the prompt and the constraint never disagree.
 *
 * It constrains SHAPE only. Everything is still untrusted: the sanitiser
 * below whitelists the fields that are read, and the server recomputes every
 * total. Structured-output limits apply: every object closes with
 * `additionalProperties: false`, and there are no numeric / length bounds.
 */
export const QUOTE_MODEL_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "client",
    "job_summary",
    "line_items",
    "materials_subtotal",
    "labour_subtotal",
    "markup_pct",
    "markup_amount",
    "subtotal_before_tax",
    "tax_amount",
    "total",
    "currency",
    "tax_label",
    "tax_rate",
    "terms",
    "notes",
  ],
  properties: {
    client: {
      type: "object",
      additionalProperties: false,
      required: ["name", "address", "email", "phone"],
      properties: {
        name: { type: "string" },
        address: nullableString,
        email: nullableString,
        phone: nullableString,
      },
    },
    job_summary: { type: "string" },
    line_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "description", "quantity", "unit", "unit_price", "line_total"],
        properties: {
          type: { type: "string", enum: ["material", "labour", "other"] },
          description: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          unit_price: { type: "number" },
          line_total: { type: "number" },
        },
      },
    },
    materials_subtotal: { type: "number" },
    labour_subtotal: { type: "number" },
    markup_pct: { type: "number" },
    markup_amount: { type: "number" },
    subtotal_before_tax: { type: "number" },
    tax_amount: { type: "number" },
    total: { type: "number" },
    currency: { type: "string" },
    tax_label: { type: "string" },
    tax_rate: { type: "number" },
    terms: { type: "string" },
    notes: { type: "array", items: { type: "string" } },
  },
} as const;

/**
 * The minimum a reply needs before the pipeline can use it: a JSON object
 * with a `line_items` array. Returns null when usable, else a short reason
 * that the repair retry quotes back to the model. (The self-hosted model has
 * no schema enforcement; on the hosted path this is a belt-and-braces check.)
 */
export function checkModelQuoteShape(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return "the reply was not a single JSON object";
  }
  if (!Array.isArray((raw as { line_items?: unknown }).line_items)) {
    return 'the object had no "line_items" array';
  }
  return null;
}

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

  const rawLines: unknown[] = Array.isArray(obj.line_items) ? obj.line_items : [];
  const line_items: QuoteLineItem[] = rawLines
    .slice(0, MAX_LINES)
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
  // The line cap is never silent (audit item 9). First, so the model's own
  // notes can't push it out.
  if (rawLines.length > MAX_LINES) {
    const dropped = rawLines.length - MAX_LINES;
    const first = rawLines[MAX_LINES] as Record<string, unknown> | null;
    const firstName =
      first && typeof first === "object" ? text(first.description, 80) : "";
    notes.unshift(
      `The AI returned ${rawLines.length} lines but only the first ${MAX_LINES} fit on a quote — ${dropped} ${dropped === 1 ? "was" : "were"} left off${firstName ? `, starting at "${firstName}"` : ""}. Check nothing's missing before sending.`,
    );
  }

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
