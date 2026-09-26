// ─────────────────────────────────────────────────────────────────────────
// Price-list import — the one pipeline every file type ends in.
//
// A supplier price list arrives as CSV / TXT (comma, semicolon or tab, often
// with a title and account lines above the real header), an Excel sheet
// (read by ./xlsx.ts) or a PDF / photo read by the AI in "price list" mode.
// Each becomes rows that keep their spreadsheet row numbers, then:
//
//   find the header row → map the columns (NZ merchant names plus the
//   supplier presets) → build import rows, with the reason every skipped row
//   was skipped → merge names listed twice → the review screen.
//
// Pure and client-safe. The server re-checks every row on save.
// ─────────────────────────────────────────────────────────────────────────

import {
  GENERIC_PRESET,
  SUPPLIER_PRESETS,
  getSupplierPreset,
  type SupplierPresetId,
} from "../supplier-presets";

/** One import at a time holds at most this many rows. */
export const MAX_PRICE_LIST_ROWS = 5000;
/** Largest CSV / TXT file read in the browser. */
export const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;
/** Largest .xlsx file read in the browser. */
export const MAX_XLSX_FILE_BYTES = 10 * 1024 * 1024;

/** A spreadsheet row: its 1-based row number (as Excel shows it) and cells. */
export type TableRow = { row: number; cells: string[] };

export type Delimiter = "," | ";" | "\t";

export type ColumnKey = "name" | "price" | "unit" | "code" | "supplier" | "url" | "notes";

/** Column index per field (0-based), or null when the file has no such column. */
export type ColumnMapping = Record<ColumnKey, number | null>;

export const EMPTY_MAPPING: ColumnMapping = {
  name: null,
  price: null,
  unit: null,
  code: null,
  supplier: null,
  url: null,
  notes: null,
};

/** One product row ready for review and `importMaterials`. */
export type PriceListRow = {
  /** Spreadsheet row (1-based), or the line on a scanned document. */
  row: number;
  name: string;
  /** Null = no unit given: a new item is saved as "each", an existing one keeps its unit. */
  unit: string | null;
  /** Null = no price (blank / POA): imported without one, never overwrites a price. */
  default_unit_price: number | null;
  /** Supplier's product code — saved to the item's code (`materials.sku`). */
  sku: string | null;
  supplier: string | null;
  supplier_url: string | null;
  notes: string | null;
};

export type SkippedRow = { row: number; reason: string; raw: string };

/** A name listed more than once: the last row wins. */
export type DuplicateName = { name: string; rows: number[]; kept: number };

export type PriceListParse = {
  /** "sheet": rows are spreadsheet rows. "document": lines read off a PDF or photo. */
  source: "sheet" | "document";
  /** Index into the table of the header row, or -1 when the file has none. */
  headerIndex: number;
  /** Header cell per column ("" when blank); empty for documents. */
  headers: string[];
  mapping: ColumnMapping;
  /** The name or price column couldn't be found: the tradie picks them. */
  needsMapping: boolean;
  /** What the file says about GST, and why (shown next to the tick box). */
  gst: { inclusive: boolean | null; reason: string | null };
  /** A supplier named in the file (document read), else null. */
  supplier: string | null;
  valid: PriceListRow[];
  skipped: SkippedRow[];
  duplicates: DuplicateName[];
  /** More rows than one import takes. */
  tooMany: boolean;
};

// ── Price cells ──────────────────────────────────────────────────────────

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

// ── Reading the bytes ────────────────────────────────────────────────────

/**
 * Text from a CSV / TXT file. UTF-8 first; when that turns up replacement
 * characters (a Windows export: "m²" saved as windows-1252) the bytes are
 * read again as windows-1252. Excel's "Unicode text" (UTF-16) is read by its
 * byte-order mark.
 */
export function decodeTextBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  const utf8 = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  if (!utf8.includes("�")) return utf8;
  try {
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    return utf8;
  }
}

const CELL_BOUNDARY = new Set([",", ";", "\t", "\n", "\r"]);

/**
 * The separator a delimited file uses: the one that splits the most lines
 * into the same number of cells (title lines have none and don't count), a
 * tie going to the one making more cells. Quoted text is ignored, so a
 * decimal comma inside quotes never counts.
 */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.slice(0, 64 * 1024);
  const candidates: Delimiter[] = [",", ";", "\t"];
  const perLine: Array<Record<Delimiter, number>> = [];
  let current: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (let i = 0; i < sample.length && perLine.length < 60; i++) {
    const ch = sample[i];
    if (inQuotes) {
      if (ch === '"') {
        if (sample[i + 1] === '"') i++;
        else inQuotes = false;
      }
      continue;
    }
    if (ch === '"' && (i === 0 || CELL_BOUNDARY.has(sample[i - 1]))) {
      inQuotes = true;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && sample[i + 1] === "\n") i++;
      perLine.push(current);
      current = { ",": 0, ";": 0, "\t": 0 };
      continue;
    }
    if (ch === "," || ch === ";" || ch === "\t") current[ch]++;
  }
  perLine.push(current);

  let best: Delimiter = ",";
  let bestScore: [number, number] = [0, 0];
  for (const d of candidates) {
    const counts = perLine.map((l) => l[d]).filter((c) => c > 0);
    if (counts.length === 0) continue;
    const frequency = new Map<number, number>();
    for (const c of counts) frequency.set(c, (frequency.get(c) ?? 0) + 1);
    let mode = 0;
    let lines = 0;
    for (const [count, times] of frequency) {
      if (times > lines || (times === lines && count > mode)) {
        mode = count;
        lines = times;
      }
    }
    if (lines > bestScore[0] || (lines === bestScore[0] && mode > bestScore[1])) {
      best = d;
      bestScore = [lines, mode];
    }
  }
  return best;
}

/**
 * Split delimited text into rows. Quoted cells may hold the separator, quotes
 * ("") and line breaks; a cell with a line break stays in one row, so row
 * numbers match the spreadsheet the tradie opens. Blank lines are kept (as
 * blank rows) for the same reason.
 */
export function parseDelimitedText(text: string, delimiter: Delimiter = detectDelimiter(text)): TableRow[] {
  const src = text.replace(/^﻿/, "");
  const rows: TableRow[] = [];
  let cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  let quoted = false;
  let rowNumber = 1;
  const endCell = () => {
    cells.push(quoted ? cur : cur.trim());
    cur = "";
    quoted = false;
  };
  const endRow = () => {
    endCell();
    rows.push({ row: rowNumber, cells });
    cells = [];
    rowNumber++;
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"' && cur.trim() === "" && !quoted) {
      cur = "";
      inQuotes = true;
      quoted = true;
      continue;
    }
    if (ch === delimiter) {
      endCell();
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      endRow();
      continue;
    }
    cur += ch;
  }
  if (cur !== "" || cells.length > 0 || quoted) endRow();
  return rows;
}

// ── Finding the columns ──────────────────────────────────────────────────

/** "Price (excl. GST) $" → "price excl gst"; "U.O.M." → "uom"; "default_unit_price" → "default unit price". */
export function normaliseHeaderCell(s: string): string {
  return (s ?? "")
    .replace(/^﻿/, "")
    .toLowerCase()
    .replace(/_+/g, " ")
    .replace(/\./g, "")
    .replace(/[:*#$()[\]{}"'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NAME_WORDS = [
  "name",
  "description",
  "product description",
  "item description",
  "product name",
  "item name",
  "product",
  "item",
  "material",
  "materials",
  "details",
  "desc",
];
const UNIT_WORDS = [
  "unit",
  "uom",
  "u/m",
  "unit of measure",
  "units",
  "sell unit",
  "selling unit",
  "pack size",
  "pack",
  "per",
  "measure",
];
const CODE_WORDS = [
  "code",
  "sku",
  "item code",
  "product code",
  "stock code",
  "supplier code",
  "part number",
  "part no",
  "item number",
  "item no",
  "product number",
  "product no",
  "product id",
  "item id",
  "article number",
  // "Item" beside a "Description" column holds the code.
  "item",
];
const SUPPLIER_WORDS = ["supplier", "supplier name", "vendor", "merchant"];
const URL_WORDS = ["supplier url", "product url", "url", "link", "product link", "web link", "website"];
const NOTES_WORDS = ["notes", "note", "comments", "comment", "remarks"];

/** Net / trade / ex-GST prices: what the tradie pays. Tried first. */
const NET_PRICE_WORDS = [
  "nett",
  "nett price",
  "net",
  "net price",
  "trade",
  "trade price",
  "your price",
  "account price",
  "contract price",
  "default unit price",
];
/** Plain price words. */
const PLAIN_PRICE_WORDS = [
  "unit price",
  "price",
  "each",
  "sell",
  "sell price",
  "selling price",
  "cost",
  "cost price",
  "unit cost",
  "rate",
];
/** Before-discount prices: only when nothing better is there. */
const LIST_PRICE_WORDS = ["list", "list price", "retail", "retail price", "rrp"];

const INCL_GST =
  /\b(?:incl?|including|inclusive)\b.*\bgst\b|\bgst\b.*\b(?:incl?|including|inclusive)\b|\b(?:inc|incl|inclusive)$/;
const EXCL_GST =
  /\b(?:ex|excl|excluding|exclusive)\b.*\bgst\b|\bgst\b.*\b(?:ex|excl|excluding|exclusive)\b|\+ ?gst\b|\bplus gst\b|\b(?:excl|exclusive)$/;
const PRICE_LIKE = /\b(?:price|prices|nett?|trade|cost|sell|rate|rrp)\b/;
const NOT_A_UNIT_PRICE = /\b(?:total|totals|amount|extended|ext|qty|quantity|code)\b|^(?:disc|discount)(?: ?%| pct| percent)?$/;

/** "incl" / "excl" when a header says whether its prices include GST. */
export function headerGstKind(header: string): "incl" | "excl" | null {
  const h = normaliseHeaderCell(header);
  if (INCL_GST.test(h)) return "incl";
  if (EXCL_GST.test(h)) return "excl";
  return null;
}

function unique(words: ReadonlyArray<string>): string[] {
  return [...new Set(words.map(normaliseHeaderCell).filter(Boolean))];
}

/** Every preset's column names are extra synonyms, whichever preset is picked. */
function presetWords(field: "name" | "unit" | "default_unit_price" | "supplier_url" | "notes" | "code"): string[] {
  return unique(SUPPLIER_PRESETS.flatMap((p) => p.candidates[field]));
}

function firstUnused(headers: string[], words: string[], taken: Set<number>): number | null {
  for (const word of words) {
    const index = headers.findIndex((h, i) => !taken.has(i) && h === word);
    if (index !== -1) return index;
  }
  return null;
}

/**
 * How good a header is as the unit-price column (lower is better), or null
 * when it isn't one. The picked preset's names come first; then net / trade
 * / ex-GST prices; then plain prices; then list / retail; a GST-inclusive
 * price last. Totals, amounts, quantities, codes and discount % never count.
 */
function priceTier(header: string, rawHeader: string, preferred: string[]): number | null {
  const gst = headerGstKind(rawHeader);
  const presetRank = preferred.indexOf(header);
  if (presetRank !== -1) return gst === "incl" ? 400 + presetRank : presetRank;
  if (!header || NOT_A_UNIT_PRICE.test(header)) return null;
  const known =
    NET_PRICE_WORDS.includes(header) || PLAIN_PRICE_WORDS.includes(header) || LIST_PRICE_WORDS.includes(header);
  if (!known && !PRICE_LIKE.test(header) && !(gst !== null && /\bgst\b/.test(header))) return null;
  if (gst === "incl") return 400;
  if (gst === "excl" || NET_PRICE_WORDS.includes(header)) return 100;
  if (LIST_PRICE_WORDS.includes(header) || /\b(?:list|retail|rrp)\b/.test(header)) return 300;
  return 200;
}

function pickPrice(
  headers: string[],
  raw: string[],
  preferred: string[],
  taken: Set<number>,
): { index: number | null; gst: "incl" | "excl" | null } {
  let best: { index: number; tier: number } | null = null;
  headers.forEach((header, index) => {
    if (taken.has(index)) return;
    const tier = priceTier(header, raw[index] ?? "", preferred);
    if (tier !== null && (best === null || tier < best.tier)) best = { index, tier };
  });
  const picked = best as { index: number; tier: number } | null;
  if (!picked) return { index: null, gst: null };
  return { index: picked.index, gst: headerGstKind(raw[picked.index] ?? "") };
}

export type DetectedColumns = {
  mapping: ColumnMapping;
  /** true / false when the price column's header says so, else null. */
  gstInclusive: boolean | null;
  gstReason: string | null;
};

/**
 * Map a header row onto the fields. The picked supplier preset's names are
 * tried first, then NZ merchant names (Description / Item / Product; Nett /
 * Net / Trade / Price ex GST / Unit Price / Sell / Cost; Price incl GST;
 * Unit / UOM; Code / SKU / Item code / Product code) and every preset's.
 * An ex-GST or trade price beats a plain one; a GST-inclusive price is used
 * only when there is no other, and then says so.
 */
export function detectColumns(headerCells: string[], presetId: SupplierPresetId = "generic"): DetectedColumns {
  const preset = getSupplierPreset(presetId);
  const usePreset = preset.id !== GENERIC_PRESET.id;
  const headers = headerCells.map(normaliseHeaderCell);
  const taken = new Set<number>();
  const mapping: ColumnMapping = { ...EMPTY_MAPPING };
  const take = (key: ColumnKey, index: number | null) => {
    mapping[key] = index;
    if (index !== null) taken.add(index);
  };
  const withPreset = (field: Parameters<typeof presetWords>[0], words: string[]) =>
    unique([...(usePreset ? preset.candidates[field] : []), ...words, ...presetWords(field)]);

  take("name", firstUnused(headers, withPreset("name", NAME_WORDS), taken));
  const price = pickPrice(
    headers,
    headerCells,
    unique([...(usePreset ? preset.candidates.default_unit_price : []), "default unit price"]),
    taken,
  );
  take("price", price.index);
  take("code", firstUnused(headers, withPreset("code", CODE_WORDS), taken));
  take("unit", firstUnused(headers, withPreset("unit", UNIT_WORDS), taken));
  take("supplier", firstUnused(headers, unique(SUPPLIER_WORDS), taken));
  take("url", firstUnused(headers, withPreset("supplier_url", URL_WORDS), taken));
  take("notes", firstUnused(headers, withPreset("notes", NOTES_WORDS), taken));

  const priceHeader = price.index !== null ? headerCells[price.index]?.trim() : "";
  return {
    mapping,
    gstInclusive: price.gst === "incl" ? true : price.gst === "excl" ? false : null,
    gstReason:
      price.gst === "incl"
        ? `The price column is headed “${priceHeader}”, so the prices are taken as including GST.`
        : price.gst === "excl"
          ? `The price column is headed “${priceHeader}”, so the prices are taken as excluding GST.`
          : null,
  };
}

/** Rows looked at when hunting for the header (title and account lines sit above it). */
const HEADER_SEARCH_ROWS = 40;

function isBlank(row: TableRow): boolean {
  return row.cells.every((c) => c.trim() === "");
}

/**
 * The header row: the first row (among the first 40 with anything in them)
 * that has both a name-like and a price-like column. -1 when there is none.
 */
export function findHeaderIndex(rows: TableRow[], presetId: SupplierPresetId = "generic"): number {
  let looked = 0;
  for (let i = 0; i < rows.length && looked < HEADER_SEARCH_ROWS; i++) {
    if (isBlank(rows[i])) continue;
    looked++;
    const { mapping } = detectColumns(rows[i].cells, presetId);
    if (mapping.name !== null && mapping.price !== null) return i;
  }
  return -1;
}

/** A best guess at the header when none was recognised: the first row with two or more cells filled. */
function guessHeaderIndex(rows: TableRow[]): number {
  for (let i = 0; i < rows.length && i < HEADER_SEARCH_ROWS; i++) {
    if (rows[i].cells.filter((c) => c.trim() !== "").length >= 2) return i;
  }
  return rows.findIndex((r) => !isBlank(r));
}

const TITLE_INCL = /\b(?:incl?|including|inclusive of)\b\.? ?gst\b|\bgst\b (?:incl|inclusive|included)\b/i;
const TITLE_EXCL = /\b(?:ex|excl|excluding|exclusive of)\b\.? ?gst\b|\bgst\b (?:excl|exclusive|extra)\b|\+ ?gst\b|\bplus gst\b/i;

/** "All prices include GST" on a title line above the header. */
function gstFromTitleLines(rows: TableRow[], headerIndex: number): { inclusive: boolean; reason: string } | null {
  for (let i = 0; i < headerIndex; i++) {
    const line = rows[i].cells.filter((c) => c.trim()).join(" ").trim();
    if (!line) continue;
    const short = line.length > 80 ? `${line.slice(0, 77)}…` : line;
    if (TITLE_INCL.test(line) || /\bprices? (?:include|includes|including) gst\b/i.test(line)) {
      return { inclusive: true, reason: `The file says “${short}”, so the prices are taken as including GST.` };
    }
    if (TITLE_EXCL.test(line) || /\bprices? (?:exclude|excludes|excluding) gst\b/i.test(line)) {
      return { inclusive: false, reason: `The file says “${short}”, so the prices are taken as excluding GST.` };
    }
  }
  return null;
}

// ── Building the rows ────────────────────────────────────────────────────

const TOTAL_ROW = /^(?:sub[\s-]?total|total|totals|grand total|total (?:ex|excl|incl?)\b.*|gst|tax|freight|delivery|cartage|balance|amount due|page \d+(?: of \d+)?)\b/i;

function cell(row: TableRow, index: number | null): string {
  if (index === null) return "";
  return (row.cells[index] ?? "").trim();
}

function rawText(row: TableRow): string {
  return row.cells.map((c) => c.trim()).filter(Boolean).join(", ");
}

export type BuildOptions = {
  /** Filled in on rows whose own supplier cell is blank. */
  defaultSupplier?: string | null;
};

/** Build import rows from the rows below the header, with the reason for every row left out. */
export function buildPriceListRows(
  rows: TableRow[],
  headerIndex: number,
  mapping: ColumnMapping,
  options: BuildOptions = {},
): { valid: PriceListRow[]; skipped: SkippedRow[] } {
  const valid: PriceListRow[] = [];
  const skipped: SkippedRow[] = [];
  if (mapping.name === null || mapping.price === null) return { valid, skipped };
  const defaultSupplier = options.defaultSupplier?.trim() || null;
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (isBlank(row)) continue;
    const name = cell(row, mapping.name).replace(/\s+/g, " ");
    const priceCell = cell(row, mapping.price);
    const unit = cell(row, mapping.unit);
    const code = cell(row, mapping.code);
    if (!name) {
      skipped.push({ row: row.row, reason: "No name", raw: rawText(row) });
      continue;
    }
    if (TOTAL_ROW.test(name)) {
      skipped.push({ row: row.row, reason: "Looks like a total or a charge, not a product", raw: rawText(row) });
      continue;
    }
    if (!priceCell && !unit && !code) {
      skipped.push({ row: row.row, reason: "Looks like a heading (no price, unit or code)", raw: rawText(row) });
      continue;
    }
    const price = parseCsvPrice(priceCell);
    if (price.kind === "invalid") {
      skipped.push({ row: row.row, reason: price.reason, raw: rawText(row) });
      continue;
    }
    valid.push({
      row: row.row,
      name,
      unit: unit || null,
      default_unit_price: price.kind === "price" ? price.value : null,
      sku: code || null,
      supplier: cell(row, mapping.supplier) || defaultSupplier,
      supplier_url: cell(row, mapping.url) || null,
      notes: cell(row, mapping.notes) || null,
    });
  }
  return { valid, skipped };
}

/** Lower-cased, trimmed, single-spaced: how names are compared everywhere in an import. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * A name listed twice in one file is saved once: the last row wins (a later
 * row is usually the corrected one), and the review lists every repeat.
 */
export function dedupeByName<T extends { name: string; row: number }>(
  rows: T[],
): { rows: T[]; duplicates: DuplicateName[] } {
  const last = new Map<string, T>();
  const seen = new Map<string, number[]>();
  for (const r of rows) {
    const key = nameKey(r.name);
    last.set(key, r);
    seen.set(key, [...(seen.get(key) ?? []), r.row]);
  }
  const duplicates: DuplicateName[] = [];
  for (const [key, list] of seen) {
    if (list.length > 1) {
      const kept = last.get(key) as T;
      duplicates.push({ name: kept.name, rows: list, kept: kept.row });
    }
  }
  return { rows: rows.filter((r) => last.get(nameKey(r.name)) === r), duplicates };
}

export type AnalyseOptions = BuildOptions & {
  presetId?: SupplierPresetId;
  /** The tradie's own column choices (the mapping step). */
  mapping?: ColumnMapping;
  /** False when the tradie says the first row is a product, not headings. */
  hasHeader?: boolean;
  /** Header row picked by the tradie (index into the table). */
  headerIndex?: number;
};

/**
 * Everything the review needs from a table (CSV, TXT or Excel): the header,
 * the column mapping (found or chosen), the GST basis the file states, the
 * rows to import, the rows left out and why, and names listed twice.
 */
export function analysePriceTable(rows: TableRow[], options: AnalyseOptions = {}): PriceListParse {
  const presetId = options.presetId ?? "generic";
  const hasHeader = options.hasHeader !== false;
  const found = hasHeader ? (options.headerIndex ?? findHeaderIndex(rows, presetId)) : -1;
  const headerIndex = hasHeader ? (found >= 0 ? found : guessHeaderIndex(rows)) : -1;
  const headers = headerIndex >= 0 ? rows[headerIndex].cells.map((c) => c.trim()) : [];
  const detected = headerIndex >= 0 ? detectColumns(headers, presetId) : null;
  const mapping = options.mapping ?? detected?.mapping ?? { ...EMPTY_MAPPING };
  const needsMapping = mapping.name === null || mapping.price === null;

  // GST basis: the chosen price column's header, else a title line.
  let gst: PriceListParse["gst"] = { inclusive: null, reason: null };
  if (mapping.price !== null && headers[mapping.price]) {
    const kind = headerGstKind(headers[mapping.price]);
    if (kind) {
      const header = headers[mapping.price];
      gst = {
        inclusive: kind === "incl",
        reason:
          kind === "incl"
            ? `The price column is headed “${header}”, so the prices are taken as including GST.`
            : `The price column is headed “${header}”, so the prices are taken as excluding GST.`,
      };
    }
  }
  if (gst.inclusive === null && headerIndex > 0) {
    const title = gstFromTitleLines(rows, headerIndex);
    if (title) gst = title;
  }

  const defaultSupplier =
    options.defaultSupplier ?? (presetId !== "generic" ? getSupplierPreset(presetId).defaultSupplier : null);
  const built = needsMapping
    ? { valid: [], skipped: [] }
    : buildPriceListRows(rows, headerIndex, mapping, { defaultSupplier });
  const deduped = dedupeByName(built.valid);

  return {
    source: "sheet",
    headerIndex,
    headers,
    mapping,
    needsMapping,
    gst,
    supplier: null,
    valid: deduped.rows,
    skipped: built.skipped,
    duplicates: deduped.duplicates,
    tooMany: deduped.rows.length > MAX_PRICE_LIST_ROWS,
  };
}

/** A CSV / TXT price list, end to end. */
export function parsePriceListText(text: string, options: AnalyseOptions = {}): PriceListParse {
  return analysePriceTable(parseDelimitedText(text), options);
}

/** "A", "B", … "Z", "AA" — how a spreadsheet names column `index` (0-based). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export type ColumnChoice = { index: number; label: string; sample: string };

/**
 * The choices for the mapping step: each column's header (or its letter),
 * with the first value under it so the tradie can see what's in it.
 */
export function columnChoices(rows: TableRow[], headerIndex: number): ColumnChoice[] {
  const width = rows.reduce((w, r) => Math.max(w, r.cells.length), 0);
  const header = headerIndex >= 0 ? rows[headerIndex]?.cells ?? [] : [];
  const choices: ColumnChoice[] = [];
  for (let index = 0; index < width; index++) {
    let sample = "";
    for (let i = headerIndex + 1; i < rows.length && !sample; i++) {
      sample = (rows[i].cells[index] ?? "").trim();
    }
    const heading = (header[index] ?? "").trim();
    choices.push({
      index,
      label: heading ? `${heading} (column ${columnLetter(index)})` : `Column ${columnLetter(index)}`,
      sample: sample.length > 40 ? `${sample.slice(0, 37)}…` : sample,
    });
  }
  return choices;
}

// ── Documents read by the AI (PDF, photos) ───────────────────────────────

/** One line as `/api/materials/extract-quote` returns it in price-list mode. */
export type ScannedPriceItem = {
  name: string;
  unit: string;
  price: number | null;
  sku: string | null;
};

/**
 * A price list read off a PDF or photo into the same review as a spreadsheet.
 * Lines are numbered in reading order. A unit of "each" is how the reader
 * fills a blank one, so it counts as "not given" (an existing item keeps its
 * unit); a negative price is a discount line, not a product.
 */
export function priceListFromScan(
  scan: { supplier: string | null; gst_inclusive: boolean | null; items: ScannedPriceItem[] },
  options: BuildOptions = {},
): PriceListParse {
  const supplier = options.defaultSupplier?.trim() || scan.supplier?.trim() || null;
  const valid: PriceListRow[] = [];
  const skipped: SkippedRow[] = [];
  scan.items.forEach((item, i) => {
    const line = i + 1;
    const name = (item.name ?? "").trim().replace(/\s+/g, " ");
    const raw = [name, item.unit, item.price ?? "", item.sku ?? ""].filter((v) => v !== "").join(", ");
    if (!name) {
      skipped.push({ row: line, reason: "No name", raw });
      return;
    }
    if (item.price !== null && !(item.price >= 0)) {
      skipped.push({ row: line, reason: "A discount or credit, not a product price", raw });
      return;
    }
    const unit = (item.unit ?? "").trim();
    valid.push({
      row: line,
      name,
      unit: unit && unit.toLowerCase() !== "each" ? unit : null,
      default_unit_price: item.price,
      sku: item.sku?.trim() || null,
      supplier,
      supplier_url: null,
      notes: null,
    });
  });
  const deduped = dedupeByName(valid);
  return {
    source: "document",
    headerIndex: -1,
    headers: [],
    mapping: { ...EMPTY_MAPPING },
    needsMapping: false,
    gst: {
      inclusive: scan.gst_inclusive,
      reason:
        scan.gst_inclusive === true
          ? "The document shows prices including GST."
          : scan.gst_inclusive === false
            ? "The document shows prices excluding GST."
            : null,
    },
    supplier,
    valid: deduped.rows,
    skipped,
    duplicates: deduped.duplicates,
    tooMany: deduped.rows.length > MAX_PRICE_LIST_ROWS,
  };
}

// ── What kind of file is this? ───────────────────────────────────────────

export type PriceListFileKind = "text" | "xlsx" | "pdf" | "image" | "old-excel" | "unsupported";

const IMAGE_EXT = /\.(?:jpe?g|png|webp|gif|heic|heif)$/i;

/** Sort a picked file by its type and name (the reader checks the bytes again). */
export function priceListFileKind(file: { name: string; type: string }): PriceListFileKind {
  const name = (file.name ?? "").toLowerCase();
  const type = (file.type ?? "").toLowerCase();
  if (name.endsWith(".xlsx") || type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return "xlsx";
  }
  if (name.endsWith(".xls") || name.endsWith(".xlsm") || name.endsWith(".xlsb") || name.endsWith(".ods")) {
    return "old-excel";
  }
  if (name.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (type.startsWith("image/") || IMAGE_EXT.test(name)) return "image";
  if (/\.(?:csv|tsv|txt|tab)$/.test(name) || type.startsWith("text/") || type === "application/csv") {
    return "text";
  }
  // Windows labels a CSV "application/vnd.ms-excel".
  if (type === "application/vnd.ms-excel") return name.endsWith(".xls") ? "old-excel" : "text";
  return "unsupported";
}

/** The file picker's accept list for the price-list import. */
export const PRICE_LIST_ACCEPT =
  ".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values,application/vnd.ms-excel," +
  ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  ".pdf,application/pdf,image/*,.heic,.heif";
