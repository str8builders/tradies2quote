/**
 * Quote video props builder: a quotes row plus the owner's profile in, the
 * `QuoteVideo` composition's props out. Pure and deterministic — no clock, no
 * randomness, no I/O — so the same quote always renders the same video.
 *
 * Privacy and safety rules live here, not in the composition:
 *   - the client appears by FIRST name only (a business keeps its name);
 *   - every string is cleaned (no control characters or emoji, which the
 *     render server has no font for) and capped in length;
 *   - money uses the app's own formatter and the quote's currency, and the
 *     total is the figure the client's quote link shows (quotes.total_amount);
 *   - the logo is only ever our own public `business-logos` storage URL.
 *
 * Loaded by the render worker through Node's TypeScript type stripping: keep
 * runtime imports relative with a `.ts` extension (no `@/`, no server-only).
 */
import {
  formatCurrency,
  formatIssueDate,
  isPlaceholderClientName,
  resolveTaxLabel,
  round2,
} from "../quote-defaults.ts";
import { QUOTE_VIDEO_MAX_ITEMS } from "./constants.ts";

export type QuoteVideoItem = { label: string; amount: string };

export type QuoteVideoProps = {
  businessName: string;
  /** Logo image: our storage URL from the builder; the worker swaps in a data: URI. */
  logoSrc: string | null;
  /** Logo width ÷ height, measured by the worker; null → treated as square. */
  logoAspect: number | null;
  /** Client first name (or a business name); null → "Quote for you". */
  clientName: string | null;
  /** The job in one line; null → no job line. */
  jobLine: string | null;
  /** Up to four priced lines, largest first. */
  items: QuoteVideoItem[];
  /** Priced lines not shown in `items`. */
  moreItems: number;
  total: { value: number; text: string; currency: string };
  /** e.g. "incl. GST"; null when the quote carries no tax. */
  taxNote: string | null;
  /** e.g. "24 Oct 2026"; null until the quote has a valid-until date (set on first send). */
  validUntil: string | null;
};

/** The `quotes` columns the video reads. */
export type QuoteVideoQuoteInput = {
  quote_data: unknown;
  total_amount: number | string | null;
  currency: string | null;
  expires_at: string | null;
};

/** The `profiles` columns the video reads. */
export type QuoteVideoProfileInput = {
  business_name: string | null;
  logo_url: string | null;
  country?: string | null;
  currency?: string | null;
} | null;

export type QuoteVideoBuildOptions = {
  /** NEXT_PUBLIC_SUPABASE_URL: only logos under its public business-logos path are used. */
  supabaseUrl?: string | null;
};

const MAX_BUSINESS = 48;
const MAX_CLIENT = 24;
const MAX_JOB = 52;
const MAX_ITEM = 64;
const FALLBACK_BUSINESS = "Your tradie";

// Built with the RegExp constructor: TypeScript rejects Unicode property escapes
// in literals for the project's ES2017 target, while Node and Chrome support them.
const CONTROL_RE = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F\\u200B\\u2028\\u2029]", "g");
const EMOJI_RE = new RegExp(
  "\\p{Extended_Pictographic}|\\p{Emoji_Modifier}|\\p{Regional_Indicator}|[\\u200D\\uFE0E\\uFE0F\\u20E3]",
  "gu",
);
const LETTER_RE = new RegExp("\\p{L}", "u");
const NAME_WORD_RE = new RegExp("^[\\p{L}\\p{M}'’.\\-]+$", "u");
const WORD_START_RE = new RegExp("(^|[-'’.])(\\p{L})", "gu");

/** Printable, single-line text: NFC, no control characters or emoji, spaces collapsed. */
export function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(EMOJI_RE, "")
    .replace(CONTROL_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cut `text` to at most `max` characters at a word boundary, adding "…" when cut. */
export function truncateWords(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const head = chars.slice(0, max - 1).join("");
  const space = head.lastIndexOf(" ");
  const cut = space >= Math.floor(max * 0.5) ? head.slice(0, space) : head;
  return `${cut.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

function currencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* ─── Client name ─────────────────────────────────────────────────────────── */

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "sir", "dame", "prof", "rev"]);
const JOINERS = new Set(["&", "and", "+"]);
const COMPANY_RE =
  /\b(ltd|limited|pty|inc|llc|plc|company|corp|corporation|trust|council|school|church|club|group|holdings|properties|developments|construction|builders|services|society|association|ministry)\b/i;

function isNameWord(word: string): boolean {
  return NAME_WORD_RE.test(word) && LETTER_RE.test(word);
}

/** "JEAN-LUC" / "jean-luc" → "Jean-Luc"; mixed case ("McKay") is kept as typed. */
function tidyCase(word: string): string {
  const upper = word.toUpperCase();
  const lower = word.toLowerCase();
  if (word !== upper && word !== lower) return word;
  return lower.replace(WORD_START_RE, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * How the video addresses the client: the first name only ("Sam Taylor" →
 * "Sam"), both first names for a couple ("Sam & Alex Taylor" → "Sam & Alex"),
 * the formal form when no first name was given ("Mrs Ngata"), or a business
 * name whole ("Kauri Homes Ltd"). Placeholders ("To be confirmed") → null.
 */
export function clientDisplayName(raw: unknown): string | null {
  const name = cleanText(raw);
  if (!name || isPlaceholderClientName(name)) return null;
  if (COMPANY_RE.test(name)) return truncateWords(name, MAX_CLIENT + 8);

  const tokens = name
    .split(" ")
    .map((t) => t.replace(/^[,;:]+|[,;:]+$/g, ""))
    .filter(Boolean);
  let i = 0;
  let formal = false;
  while (i < tokens.length) {
    const t = tokens[i].toLowerCase().replace(/\.$/, "");
    if (HONORIFICS.has(t)) formal = true;
    else if (!(formal && JOINERS.has(t))) break;
    i++;
  }
  const rest = tokens.slice(i);
  if (rest.length === 0) return null;
  // "Mrs Ngata", "Mr & Mrs Smith": no first name was given, so keep the form they chose.
  if (formal && rest.length === 1) {
    return isNameWord(rest[0]) ? truncateWords(tokens.join(" "), MAX_CLIENT + 8) : null;
  }
  if (
    rest.length >= 3 &&
    JOINERS.has(rest[1].toLowerCase()) &&
    isNameWord(rest[0]) &&
    isNameWord(rest[2])
  ) {
    return truncateWords(`${tidyCase(rest[0])} & ${tidyCase(rest[2])}`, MAX_CLIENT);
  }
  const first = rest[0];
  return isNameWord(first) ? truncateWords(tidyCase(first), MAX_CLIENT) : null;
}

/* ─── Job line ────────────────────────────────────────────────────────────── */

/** The first line / sentence of the job summary, cut to fit one line of the video. */
export function jobLine(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const firstLine = raw.split(/\r?\n/).map(cleanText).find(Boolean) ?? "";
  if (!firstLine) return null;
  const end = /[.!?](\s|$)/.exec(firstLine);
  const sentence = (end ? firstLine.slice(0, end.index) : firstLine).trim();
  if (!sentence) return null;
  return truncateWords(sentence, MAX_JOB);
}

/* ─── Items ───────────────────────────────────────────────────────────────── */

const TYPE_LABEL: Record<string, string> = { labour: "Labour", material: "Materials", other: "Other costs" };

/**
 * The priced lines the client sees, largest first (ties keep quote order).
 * Every line type counts — labour, materials and other costs; lines that come
 * to $0.00 or less are skipped.
 */
export function keyItems(lineItems: unknown, currency: string) {
  const lines = Array.isArray(lineItems) ? lineItems : [];
  const priced = lines
    .map((line, index) => {
      const l = isRecord(line) ? line : {};
      const amount = round2(toNumber(l.line_total));
      const type = typeof l.type === "string" ? l.type : "";
      const label = cleanText(l.description) || TYPE_LABEL[type] || "Item";
      return { index, amount, label };
    })
    .filter((l) => Number.isFinite(l.amount) && l.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.index - b.index);
  const shown = priced.slice(0, QUOTE_VIDEO_MAX_ITEMS);
  return {
    items: shown.map((l) => ({ label: truncateWords(l.label, MAX_ITEM), amount: formatCurrency(l.amount, currency) })),
    moreItems: priced.length - shown.length,
  };
}

/* ─── Logo ────────────────────────────────────────────────────────────────── */

/**
 * `logo_url` only when it is a public object in OUR `business-logos` bucket.
 * The profile field is treated as untrusted (as in src/lib/pdf-logo.ts): a
 * tampered value must not make the render server fetch anything else.
 */
export function allowedLogoUrl(logoUrl: unknown, supabaseUrl: string | null | undefined): string | null {
  if (typeof logoUrl !== "string" || !/^https?:\/\//i.test(logoUrl) || !supabaseUrl) return null;
  let base: URL;
  let target: URL;
  try {
    base = new URL(supabaseUrl);
    target = new URL(logoUrl);
  } catch {
    return null;
  }
  if (target.origin !== base.origin || target.username || target.password) return null;
  const prefix = `${base.pathname.replace(/\/+$/, "")}/storage/v1/object/public/business-logos/`;
  if (!target.pathname.startsWith(prefix) || target.pathname.includes("/../")) return null;
  return target.href;
}

/* ─── Builder ─────────────────────────────────────────────────────────────── */

export function buildQuoteVideoProps(
  quote: QuoteVideoQuoteInput,
  profile: QuoteVideoProfileInput,
  options: QuoteVideoBuildOptions = {},
): QuoteVideoProps {
  const data = isRecord(quote.quote_data) ? quote.quote_data : {};
  const client = isRecord(data.client) ? data.client : {};

  // Same sources as the client's quote link (get_quote_by_token): the currency
  // and total columns first, the quote_data copies as the fallback.
  const currency =
    currencyCode(quote.currency) ?? currencyCode(data.currency) ?? currencyCode(profile?.currency) ?? "NZD";
  const totalColumn = toNumber(quote.total_amount);
  const totalData = toNumber(data.total);
  const totalValue = round2(Number.isFinite(totalColumn) ? totalColumn : Number.isFinite(totalData) ? totalData : 0);

  const taxRate = toNumber(data.tax_rate);
  const taxLabel = cleanText(data.tax_label).slice(0, 16) || resolveTaxLabel(null, profile?.country, currency);

  const expires = quote.expires_at && Number.isFinite(Date.parse(quote.expires_at)) ? quote.expires_at : null;
  const { items, moreItems } = keyItems(data.line_items, currency);

  return {
    businessName: truncateWords(cleanText(profile?.business_name) || FALLBACK_BUSINESS, MAX_BUSINESS),
    logoSrc: allowedLogoUrl(profile?.logo_url, options.supabaseUrl),
    logoAspect: null,
    clientName: clientDisplayName(client.name),
    jobLine: jobLine(data.job_summary),
    items,
    moreItems,
    total: { value: totalValue, text: formatCurrency(totalValue, currency), currency },
    taxNote: Number.isFinite(taxRate) && taxRate > 0 ? `incl. ${taxLabel}` : null,
    validUntil: expires ? formatIssueDate(expires) : null,
  };
}
