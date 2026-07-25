import type { LibraryMaterial, QuoteLineItem } from "./quote-types";
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

function normaliseTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOP_WORDS.has(t)),
  );
}

export function matchToLibrary(
  description: string,
  library: LibraryMaterial[],
): LibraryMaterial | null {
  return matchToLibraryScored(description, library)?.item ?? null;
}

/**
 * Like matchToLibrary, but also reports HOW specific the winning match
 * was (the number of library-name tokens that all appeared in the
 * description). A specificity of 1 is a single generic token ("screws")
 * — fine for linking, too weak to auto-apply the library PRICE.
 */
export function matchToLibraryScored(
  description: string,
  library: LibraryMaterial[],
): { item: LibraryMaterial; specificity: number } | null {
  if (!description || library.length === 0) return null;
  const descTokens = normaliseTokens(description);
  if (descTokens.size === 0) return null;

  let best: LibraryMaterial | null = null;
  let bestSpecificity = 0;

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
    if (allFound && libTokens.size > bestSpecificity) {
      best = item;
      bestSpecificity = libTokens.size;
    }
  }

  return best ? { item: best, specificity: bestSpecificity } : null;
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
    default_unit_price: number;
    supplier: string | null;
    supplier_url: string | null;
    notes: string | null;
  }>;
  invalid: Array<{ row: number; reason: string; raw: string }>;
};

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
    // Strip currency symbols and thousands separators so merchant
    // exports like "1,234.50" or "$12.00" parse instead of being
    // silently rejected. NZ/AU/UK/US/CA all use "." as the decimal.
    const price = Number(priceRaw.replace(/[$£€,\s]/g, ""));
    if (!Number.isFinite(price) || price < 0) {
      invalid.push({
        row: i + 1,
        reason: `Invalid price "${priceRaw}"`,
        raw: lines[i],
      });
      continue;
    }
    valid.push({
      name,
      unit,
      default_unit_price: Math.round(price * 100) / 100,
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
