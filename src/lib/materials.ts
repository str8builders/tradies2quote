import type { LibraryMaterial, QuoteLineItem } from "./quote-types";
import {
  convertUnitPrice,
  normaliseLibraryUnit,
  unitsCompatible,
} from "./units";
import {
  GENERIC_PRESET,
  getSupplierPreset,
  remapCsvWithPreset,
  type SupplierPresetId,
} from "./supplier-presets";

export const CSV_HEADERS = [
  "name",
  "unit",
  "default_unit_price",
  "supplier",
  "supplier_url",
  "notes",
] as const;

export const REQUIRED_CSV_HEADERS = [
  "name",
  "unit",
  "default_unit_price",
] as const;

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
    name: string;
    unit: string;
    /** Null = the file gave no price (blank / POA): import without one and
     *  never overwrite an existing library price with nothing. */
    default_unit_price: number | null;
    supplier: string | null;
    supplier_url: string | null;
    notes: string | null;
  }>;
  invalid: Array<{ row: number; reason: string; raw: string }>;
};

/** The review-screen statement of how CSV prices are treated for GST. */
export function csvGstStatement(pricesIncludeGst: boolean, taxRate: number): string {
  const pct = Math.round(taxRate * 1000) / 10;
  return pricesIncludeGst
    ? `Prices include GST — each is divided by ${(1 + taxRate).toFixed(pct % 1 === 0 ? 2 : 3)} and saved ex-GST (${pct}% GST).`
    : "Prices are treated as excluding GST and saved as written. Tick the box above if the file's prices include GST.";
}

export type CsvPrice =
  | { kind: "price"; value: number }
  | { kind: "missing" }
  | { kind: "invalid"; reason: string };

// Cells that mean "no price here" rather than a misread.
const NO_PRICE_MARKERS = new Set([
  "",
  "-",
  "—",
  "–",
  "poa",
  "p.o.a.",
  "por",
  "tbc",
  "tba",
  "n/a",
  "na",
  "call",
  "ask",
  "price on application",
  "price on request",
]);

/** "1,234,567" / "1.234.567" — separators every 3 digits. */
function groupedEvery3(digits: string, sep: string): boolean {
  const parts = digits.split(sep);
  return (
    parts.length > 1 &&
    /^\d{1,3}$/.test(parts[0]) &&
    parts.slice(1).every((p) => /^\d{3}$/.test(p))
  );
}

/**
 * Read one price cell from a CSV export.
 *
 *   "12.50", "$1,234.50", "NZ$ 12"  → the number
 *   "12,50", "1.234,50"             → decimal comma → 12.50 / 1234.50
 *   "1,250"                         → NZ thousands separator → 1250
 *   "", "POA", "TBC", "-"           → missing (import with no price)
 *   "(5.00)", "-5"                  → invalid (a negative price)
 *   "12,5000", "12.4O"              → invalid (ambiguous / unreadable)
 *
 * Prices keep full precision — 0.125 stays 0.125.
 */
export function parseCsvPrice(raw: string): CsvPrice {
  const text = (raw ?? "").replace(/\u00a0/g, " ").trim();
  if (NO_PRICE_MARKERS.has(text.toLowerCase())) return { kind: "missing" };
  let cleaned = text
    .replace(/\b(?:nzd|aud|usd|cad|gbp|eur)\b/gi, "")
    .replace(/(?:nz|au|us|ca|a|c)?\$/gi, "")
    .replace(/[£€\s']/g, "");
  if (cleaned === "") return { kind: "missing" };
  if (/^\(.*\)$/.test(cleaned) || /^-|-$/.test(cleaned)) {
    return { kind: "invalid", reason: `Negative price "${text}" — a price can't be below zero` };
  }
  cleaned = cleaned.replace(/^\+/, "");
  if (!/^[\d.,]+$/.test(cleaned) || !/\d/.test(cleaned)) {
    return { kind: "invalid", reason: `Invalid price "${text}"` };
  }
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalised: string | null;
  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: whichever comes last is the decimal separator.
    normalised =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
    if ((normalised.match(/\./g) ?? []).length > 1) normalised = null;
  } else if (lastComma >= 0) {
    const decimals = cleaned.length - lastComma - 1;
    if (groupedEvery3(cleaned, ",")) normalised = cleaned.replace(/,/g, "");
    else if (cleaned.indexOf(",") === lastComma && decimals >= 1 && decimals <= 2) {
      normalised = cleaned.replace(",", "."); // "12,50" → 12.50
    } else normalised = null;
  } else if (cleaned.indexOf(".") !== lastDot) {
    normalised = groupedEvery3(cleaned, ".") ? cleaned.replace(/\./g, "") : null;
  } else {
    normalised = cleaned;
  }
  const value = normalised === null ? Number.NaN : Number(normalised);
  if (!Number.isFinite(value)) {
    return { kind: "invalid", reason: `Invalid price "${text}"` };
  }
  return { kind: "price", value: Number(value.toPrecision(12)) };
}

export function parseMaterialsCsv(text: string): CsvParseResult {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  const valid: CsvParseResult["valid"] = [];
  const invalid: CsvParseResult["invalid"] = [];
  if (lines.length === 0) return { valid, invalid };

  const headerCells = splitCsvLine(lines[0]).map((c) => c.toLowerCase().trim());
  const idx = (h: string) => headerCells.indexOf(h);
  const iName = idx("name");
  const iUnit = idx("unit");
  const iPrice = idx("default_unit_price");
  const iSupplier = idx("supplier");
  const iUrl = idx("supplier_url");
  const iNotes = idx("notes");

  for (const required of REQUIRED_CSV_HEADERS) {
    if (idx(required) === -1) {
      invalid.push({
        row: 0,
        reason: `Missing required column "${required}"`,
        raw: lines[0],
      });
      return { valid, invalid };
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const name = (cells[iName] ?? "").trim();
    const unit = (cells[iUnit] ?? "").trim();
    const priceRaw = (cells[iPrice] ?? "").trim();
    const supplier = iSupplier >= 0 ? (cells[iSupplier] ?? "").trim() : "";
    const supplier_url = iUrl >= 0 ? (cells[iUrl] ?? "").trim() : "";
    const notes = iNotes >= 0 ? (cells[iNotes] ?? "").trim() : "";

    if (!name) {
      invalid.push({ row: i + 1, reason: "Missing name", raw: lines[i] });
      continue;
    }
    if (!unit) {
      invalid.push({ row: i + 1, reason: "Missing unit", raw: lines[i] });
      continue;
    }
    // Currency symbols, thousands separators and decimal commas are
    // understood; a blank / POA cell imports with no price (never $0) and
    // a negative or unreadable one is rejected with the reason shown.
    const price = parseCsvPrice(priceRaw);
    if (price.kind === "invalid") {
      invalid.push({ row: i + 1, reason: price.reason, raw: lines[i] });
      continue;
    }
    valid.push({
      name,
      unit,
      default_unit_price: price.kind === "price" ? price.value : null,
      supplier: supplier || null,
      supplier_url: supplier_url || null,
      notes: notes || null,
    });
  }

  return { valid, invalid };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"' && cur.length === 0) {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

/**
 * Wave 16 — supplier-preset front-door for `parseMaterialsCsv`.
 *
 * Picks the named preset, rewrites the source CSV's header row + cells
 * into the canonical generic format (with the merchant's SKU folded
 * into the `notes` column), then hands off to the existing parser so
 * validation + numeric coercion stay identical to the generic path.
 *
 * The "generic" preset short-circuits to the existing parser — same
 * behaviour as before this wave for anyone uploading our template.
 *
 * Never throws. CSV-parsing failures surface as `invalid` rows the
 * existing ReviewTable in ImportClient already handles.
 */
export function parseMaterialsCsvWithPreset(
  text: string,
  presetId: SupplierPresetId,
): CsvParseResult {
  const preset = getSupplierPreset(presetId);
  if (preset.id === GENERIC_PRESET.id) {
    return parseMaterialsCsv(text);
  }
  try {
    const remapped = remapCsvWithPreset(text, preset);
    return parseMaterialsCsv(remapped);
  } catch {
    // Defensive — remapCsvWithPreset is pure but if a future iteration
    // hits an edge we don't want to crash the import UI. Fall back to
    // the existing parser so the user at least sees row-level errors.
    return parseMaterialsCsv(text);
  }
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
