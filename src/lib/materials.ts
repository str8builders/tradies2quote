import type { LibraryMaterial, QuoteLineItem } from "./quote-types";
import {
  convertUnitPrice,
  normaliseLibraryUnit,
  unitsCompatible,
} from "./units";
import type { SupplierPresetId } from "./supplier-presets";
import { parsePriceListText, type PriceListParse } from "./materials/priceList";

// The price-cell reader lives with the price-list pipeline; re-exported here
// for the callers that have always imported it from this module.
export { parseCsvPrice, type CsvPrice } from "./materials/priceList";

export const CSV_HEADERS = [
  "name",
  "unit",
  "default_unit_price",
  "supplier",
  "supplier_url",
  "notes",
] as const;

/** A price list needs a name and a price; the unit defaults to "each". */
export const REQUIRED_CSV_HEADERS = ["name", "default_unit_price"] as const;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "per",
  "each",
  "of",
  "to",
  "from",
  "by",
]);

/** A length written with its unit (5.4m, 2400mm, 90cm) — compared in metres. */
const LENGTH_TOKEN_RE = /^(\d+(?:\.\d+)?)(mm|cm|lm|m)$/;
/** Size/length tokens a description can name: 5.4m (canonical) or 100x100. */
const DIMENSION_TOKEN_RE =
  /^\d+(?:\.\d+)?m$|^\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?$/;

function canonicalLength(value: number, unit: string): string {
  const metres =
    unit === "mm" ? value / 1000 : unit === "cm" ? value / 100 : value;
  return `${Number(metres.toFixed(4))}m`;
}

/**
 * Tokenise a material name for matching. Decimals and dimensions survive as
 * ONE token ("5.4m", "100x100", "h3.2") — splitting on "." used to turn
 * "5.4m" and "2.4m" into the same "4m" token, so a 5.4 m post matched the
 * 2.4 m library row. Lengths are compared in metres so "5400mm" = "5.4m".
 */
function normaliseTokens(s: string): Set<string> {
  const text = s
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    // "100 x 100" → "100x100": a spaced section is still one size.
    .replace(/(\d)\s*x\s*(?=\d)/g, "$1x")
    // "5.4 m" → "5.4m": a length keeps its unit attached.
    .replace(/(\d)\s+(mm|cm|lm|m|m2|m3|kg)\b/g, "$1$2")
    // A "." between digits is a decimal point; every other "." is
    // punctuation. (No look-behind — this also runs in older Safari.)
    .replace(/(\d)\.(?=\d)/g, "$1\u0001")
    .replace(/[^a-z0-9\u0001\s]/g, " ")
    .replace(/\u0001/g, ".");
  const tokens = new Set<string>();
  for (const raw of text.split(/\s+/)) {
    if (raw.length < 2 || STOP_WORDS.has(raw)) continue;
    const len = raw.match(LENGTH_TOKEN_RE);
    tokens.add(len ? canonicalLength(Number(len[1]), len[2]) : raw);
  }
  return tokens;
}

export function matchToLibrary(
  description: string,
  library: LibraryMaterial[],
): LibraryMaterial | null {
  return matchToLibraryScored(description, library)?.item ?? null;
}

export type LibraryMatch = {
  item: LibraryMaterial;
  /** Number of library-name tokens that all appeared in the description. */
  specificity: number;
  /** Every size/length the description names is also in the library name. */
  exactDimensions: boolean;
  /** An equally good candidate carries a different price or unit. */
  ambiguous: boolean;
};

/**
 * Like matchToLibrary, but also reports HOW specific the winning match
 * was (the number of library-name tokens that all appeared in the
 * description). A specificity of 1 is a single generic token ("screws")
 * — fine for linking, too weak to auto-apply the library PRICE.
 *
 * Ranking: more matched tokens, then (when the line's unit is given) a
 * unit-compatible row, then a priced row, then the tradie's most used /
 * most recent row, then name — deterministic whatever the library order.
 * Equally ranked rows that disagree on price or unit mark the match
 * `ambiguous` so no price is auto-applied from it.
 */
export function matchToLibraryScored(
  description: string,
  library: LibraryMaterial[],
  opts: { unit?: string | null } = {},
): LibraryMatch | null {
  if (!description || library.length === 0) return null;
  const descTokens = normaliseTokens(description);
  if (descTokens.size === 0) return null;
  const hasLineUnit = typeof opts.unit === "string" && opts.unit.trim() !== "";

  type Candidate = {
    item: LibraryMaterial;
    tokens: Set<string>;
    specificity: number;
    unitOk: boolean;
    priced: boolean;
  };
  const candidates: Candidate[] = [];
  for (const item of library) {
    const libTokens = normaliseTokens(item.name);
    if (libTokens.size === 0) continue;
    let allFound = true;
    for (const t of libTokens) {
      if (!descTokens.has(t)) {
        allFound = false;
        break;
      }
    }
    if (!allFound) continue;
    candidates.push({
      item,
      tokens: libTokens,
      specificity: libTokens.size,
      unitOk: hasLineUnit && unitsCompatible(item.unit, opts.unit),
      priced:
        item.default_unit_price !== null && Number(item.default_unit_price) > 0,
    });
  }
  if (candidates.length === 0) return null;

  const rankKey = (c: Candidate) =>
    `${c.specificity}|${c.unitOk ? 1 : 0}|${c.priced ? 1 : 0}`;
  candidates.sort(
    (a, b) =>
      b.specificity - a.specificity ||
      Number(b.unitOk) - Number(a.unitOk) ||
      Number(b.priced) - Number(a.priced) ||
      (Number(b.item.usage_count) || 0) - (Number(a.item.usage_count) || 0) ||
      (b.item.last_used_at ?? "").localeCompare(a.item.last_used_at ?? "") ||
      a.item.name.localeCompare(b.item.name) ||
      a.item.id.localeCompare(b.item.id),
  );
  const best = candidates[0];
  const priceOf = (c: Candidate) =>
    c.item.default_unit_price === null ? null : Number(c.item.default_unit_price);
  const unitOf = (c: Candidate) => normaliseLibraryUnit(c.item.unit);
  const bestUnit = unitOf(best);
  const ambiguous = candidates.some((c) => {
    if (c === best || rankKey(c) !== rankKey(best)) return false;
    const u = unitOf(c);
    return (
      priceOf(c) !== priceOf(best) ||
      u?.dimension !== bestUnit?.dimension ||
      u?.factor !== bestUnit?.factor
    );
  });
  const exactDimensions = [...descTokens]
    .filter((t) => DIMENSION_TOKEN_RE.test(t))
    .every((t) => best.tokens.has(t));

  return {
    item: best.item,
    specificity: best.specificity,
    exactDimensions,
    ambiguous,
  };
}

/**
 * The tradie's OWN library price for a line, converted to the line's unit —
 * or `unitPrice: null` when it must not be auto-applied. A price is applied
 * only when the match is specific (≥ 2 tokens), names every size/length the
 * line names, is unambiguous, carries a real price, and the units match or
 * convert exactly ($30/sheet is never applied to m²). The match itself is
 * still returned so the line can keep its library link.
 */
export function libraryPriceForLine(
  line: { description: string; unit: string | null | undefined },
  library: LibraryMaterial[],
): { match: LibraryMatch; unitPrice: number | null } | null {
  const match = matchToLibraryScored(line.description, library, {
    unit: line.unit,
  });
  if (!match) return null;
  const price = match.item.default_unit_price;
  const unitPrice =
    match.specificity >= 2 &&
    match.exactDimensions &&
    !match.ambiguous &&
    price !== null &&
    Number(price) > 0
      ? convertUnitPrice(Number(price), match.item.unit, line.unit)
      : null;
  return { match, unitPrice };
}

/**
 * Re-derive the library price a line claims to carry from the library row
 * it links to. Returns null when the link, the row's price or the unit
 * doesn't hold up — used so a stored "user_library" tag is never trusted on
 * its own.
 */
export function verifiedLibraryUnitPrice(
  line: { library_id?: string | null; unit: string | null | undefined },
  library: LibraryMaterial[],
): number | null {
  if (!line.library_id) return null;
  const row = library.find((m) => m.id === line.library_id);
  if (!row || row.default_unit_price === null) return null;
  const price = Number(row.default_unit_price);
  if (!(price > 0)) return null;
  return convertUnitPrice(price, row.unit, line.unit);
}

export function formatLibraryForPrompt(
  library: LibraryMaterial[],
  currency: string,
): string {
  if (library.length === 0) {
    return "(The tradie has no saved materials yet — generate AI estimates for everything.)";
  }
  const lines = library
    .slice()
    .sort((a, b) => b.usage_count - a.usage_count || a.name.localeCompare(b.name))
    .map((m) => {
      const price =
        m.default_unit_price !== null
          ? `${currency} ${Number(m.default_unit_price).toFixed(2)}`
          : "no price set";
      const unit = m.unit ?? "each";
      const supplier = m.supplier ? ` (${m.supplier})` : "";
      return `- "${m.name}" — ${unit} @ ${price}${supplier}`;
    });
  return lines.join("\n");
}

export type CsvParseResult = {
  valid: Array<{
    /** Spreadsheet row the item came from. */
    row?: number;
    name: string;
    /** Null = the file gave no unit: new items are saved as "each". */
    unit: string | null;
    /** Null = the file gave no price (blank / POA): import without one and
     *  never overwrite an existing library price with nothing. */
    default_unit_price: number | null;
    /** The supplier's product code (saved to the item's code, not its notes). */
    sku?: string | null;
    supplier: string | null;
    supplier_url: string | null;
    notes: string | null;
  }>;
  invalid: Array<{ row: number; reason: string; raw: string }>;
};

/**
 * The review-screen statement of how CSV prices are treated for tax, in the
 * tradie's own tax label ("GST", "VAT", "Tax") — not "GST" for everyone.
 */
export function csvGstStatement(
  pricesIncludeGst: boolean,
  taxRate: number,
  taxLabel = "GST",
): string {
  const pct = Math.round(taxRate * 1000) / 10;
  if (!pricesIncludeGst) {
    return `Prices are treated as excluding ${taxLabel} and saved as written. Tick the box above if the file's prices include ${taxLabel}.`;
  }
  if (!(taxRate > 0)) {
    return `Prices include ${taxLabel} — at 0% there's nothing to take off, so they're saved as written.`;
  }
  return `Prices include ${taxLabel} — each is divided by ${(1 + taxRate).toFixed(pct % 1 === 0 ? 2 : 3)} and saved ex-${taxLabel} (${pct}% ${taxLabel}).`;
}

/** The old two-list shape, from the shared price-list pipeline. */
function toCsvParseResult(parse: PriceListParse): CsvParseResult {
  const invalid: CsvParseResult["invalid"] = [...parse.skipped];
  if (parse.needsMapping) {
    const missing = [
      parse.mapping.name === null ? "name" : null,
      parse.mapping.price === null ? "price" : null,
    ].filter(Boolean);
    invalid.unshift({
      row: 0,
      reason: `No ${missing.join(" or ")} column found — pick the columns by hand`,
      raw: parse.headers.join(","),
    });
  }
  return { valid: parse.valid, invalid };
}

/**
 * Parse a price-list CSV (any separator, title lines allowed above the
 * header, NZ merchant column names). See ./materials/priceList.ts.
 */
export function parseMaterialsCsv(text: string): CsvParseResult {
  return toCsvParseResult(parsePriceListText(text));
}

/**
 * Wave 16 — supplier-preset front-door for `parseMaterialsCsv`.
 *
 * The preset's column names are tried first (every preset's names are
 * understood anyway) and its supplier fills rows that name none. Codes go to
 * the item's code (`sku`), never into its notes. "generic" is plain
 * `parseMaterialsCsv`. Never throws: problems come back as `invalid` rows.
 */
export function parseMaterialsCsvWithPreset(
  text: string,
  presetId: SupplierPresetId,
): CsvParseResult {
  return toCsvParseResult(parsePriceListText(text, { presetId }));
}

export function buildLibrarySnapshot(
  items: QuoteLineItem[],
): Map<string, { unit_price: number; was_ai: boolean }> {
  const map = new Map<string, { unit_price: number; was_ai: boolean }>();
  for (const it of items) {
    if (it.type !== "material") continue;
    const key = it.description.trim().toLowerCase();
    if (!key) continue;
    map.set(key, {
      unit_price: Number(it.unit_price) || 0,
      was_ai: !!it.is_ai_estimated,
    });
  }
  return map;
}
