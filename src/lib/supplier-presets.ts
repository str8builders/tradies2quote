/**
 * NZ supplier CSV import presets — Wave 16.
 *
 * Trade-account holders at Mitre 10, Bunnings (PowerPass), ITM and
 * PlaceMakers can export their account pricing as CSV from each
 * merchant's trade portal. Those exports use different column names
 * than our internal `materials` CSV format, so this module owns the
 * column-name mapping per supplier.
 *
 * Why presets instead of asking the user to remap manually each time:
 *   - Most tradies will use one supplier most of the time; a single
 *     tap on "Mitre 10 Trade" is faster than mapping 4 columns by
 *     hand on every import.
 *   - The presets are pure data — no scraping, no API call, no ToS
 *     issue. The tradie owns the CSV they downloaded from their
 *     trade portal; we just translate columns.
 *
 * If a merchant changes their export format, only this file needs to
 * change. No DB migration, no parser change, no server action change.
 *
 * Honest caveat: column candidates below are educated guesses based on
 * common merchant export patterns. The matcher is flexible — case-
 * insensitive, multiple candidates per target — but the first tradie
 * to try each preset may surface a column name we missed. When that
 * happens, add it to the `candidates` array and they'll be unblocked
 * with a code change instead of a feature request.
 */

/**
 * Each supplier preset has, per target field, a prioritised list of
 * candidate source-column names. The first one present in the
 * uploaded CSV wins. Case + whitespace are normalised before matching.
 */
export type PresetFieldKey =
  | "name"
  | "unit"
  | "default_unit_price"
  | "supplier_url"
  | "notes"
  | "code";

export interface SupplierPreset {
  /** Stable id used in client state + URL params if we ever expose one. */
  id: SupplierPresetId;
  /** Long label shown in the picker. */
  label: string;
  /** Short label shown on the active-preset chip after selection. */
  shortLabel: string;
  /** One-line UX hint shown under the picker for this preset. */
  hint: string;
  /**
   * Auto-injected supplier name on every row imported via this preset.
   * `null` means "use whatever the CSV says" (Generic path).
   */
  defaultSupplier: string | null;
  /**
   * Public URL of the merchant's trade portal / website. Rendered as a
   * quick-link below the preset picker so the tradie can hop straight
   * to the source to download their CSV. `null` for the generic preset.
   */
  portalUrl: string | null;
  /**
   * Per-target-field candidate column names. Strings here are matched
   * against the source CSV header row after lowercase + trim.
   *
   * - `name`               → required
   * - `default_unit_price` → required
   * - `unit`               → required
   * - `supplier_url`       → optional, often missing
   * - `notes`              → optional
   * - `code`               → optional; the supplier's product code. The
   *                           price-list import (./materials/priceList.ts)
   *                           saves it to the item's code (`materials.sku`)
   *                           and matches saved items on it first. (The
   *                           older `remapCsvWithPreset` below still folds
   *                           it into `notes`.)
   */
  candidates: Record<PresetFieldKey, ReadonlyArray<string>>;
}

export type SupplierPresetId =
  | "generic"
  | "mitre10-trade"
  | "bunnings-powerpass"
  | "itm-trade"
  | "placemakers-trade";

/* ----------------------------------------------------------------------
 * Presets
 * -------------------------------------------------------------------- */

export const GENERIC_PRESET: SupplierPreset = {
  id: "generic",
  label: "Generic / our template",
  shortLabel: "Generic",
  hint:
    "Any price list: we find the name, price, unit and code columns ourselves (Description, Nett, UOM, Code and the like).",
  defaultSupplier: null,
  portalUrl: null,
  candidates: {
    name: ["name"],
    unit: ["unit"],
    default_unit_price: ["default_unit_price"],
    supplier_url: ["supplier_url"],
    notes: ["notes"],
    code: [],
  },
};

const MITRE_10_TRADE: SupplierPreset = {
  id: "mitre10-trade",
  label: "Mitre 10 Trade",
  shortLabel: "Mitre 10",
  hint:
    "Export from your Mitre 10 Trade account. We map Description → name, Unit → unit, Trade Price → price, Code/SKU → the item's code.",
  defaultSupplier: "Mitre 10",
  portalUrl: "https://www.mitre10.co.nz/trade",
  candidates: {
    name: ["description", "product name", "item", "item description", "product"],
    unit: ["unit", "uom", "pack size", "pack"],
    default_unit_price: [
      "trade price",
      "net price",
      "your price",
      "unit price",
      "price",
    ],
    supplier_url: ["product url", "url"],
    notes: ["notes", "comments"],
    code: ["code", "sku", "stock code", "product code", "mitre 10 code"],
  },
};

const BUNNINGS_POWERPASS: SupplierPreset = {
  id: "bunnings-powerpass",
  label: "Bunnings PowerPass",
  shortLabel: "Bunnings",
  hint:
    "Export from your Bunnings PowerPass account. We map Item Description → name, Unit of Measure → unit, Trade Price → price, Item Code → the item's code.",
  defaultSupplier: "Bunnings",
  portalUrl: "https://www.bunnings.co.nz/trade",
  candidates: {
    name: ["item description", "description", "product", "product name", "item"],
    unit: ["unit of measure", "uom", "unit", "pack size"],
    default_unit_price: [
      "trade price",
      "net price",
      "list price",
      "your price",
      "price",
    ],
    supplier_url: ["product url", "url"],
    notes: ["notes", "comments"],
    code: ["item code", "bunnings code", "code", "sku", "product code"],
  },
};

const ITM_TRADE: SupplierPreset = {
  id: "itm-trade",
  label: "ITM Trade",
  shortLabel: "ITM",
  hint:
    "Export from your ITM trade account. We map Description → name, Unit → unit, Trade Price (or Price) → price, ITM Code → the item's code.",
  defaultSupplier: "ITM",
  portalUrl: "https://www.itm.co.nz",
  candidates: {
    name: ["description", "product description", "product", "item"],
    unit: ["unit", "uom", "pack size"],
    default_unit_price: ["trade price", "price", "net price", "your price"],
    supplier_url: ["product url", "url"],
    notes: ["notes", "comments"],
    code: ["itm code", "item code", "product code", "code", "sku"],
  },
};

const PLACEMAKERS_TRADE: SupplierPreset = {
  id: "placemakers-trade",
  label: "PlaceMakers Trade",
  shortLabel: "PlaceMakers",
  hint:
    "Export from your PlaceMakers trade account. We map Description → name, Unit → unit, Net Price (or Trade Price) → price, Code → the item's code.",
  defaultSupplier: "PlaceMakers",
  portalUrl: "https://www.placemakers.co.nz",
  candidates: {
    name: ["description", "product", "product description", "item"],
    unit: ["unit", "uom", "pack size"],
    default_unit_price: ["net price", "trade price", "price", "your price"],
    supplier_url: ["product url", "url"],
    notes: ["notes", "comments"],
    code: ["placemakers code", "code", "product code", "sku", "item code"],
  },
};

/** Order matters — this is the order the picker renders. Generic first
 *  because it covers people on our own template. */
export const SUPPLIER_PRESETS: ReadonlyArray<SupplierPreset> = [
  GENERIC_PRESET,
  MITRE_10_TRADE,
  BUNNINGS_POWERPASS,
  ITM_TRADE,
  PLACEMAKERS_TRADE,
];

const BY_ID = new Map<SupplierPresetId, SupplierPreset>(
  SUPPLIER_PRESETS.map((p) => [p.id, p]),
);

export function getSupplierPreset(id: SupplierPresetId): SupplierPreset {
  return BY_ID.get(id) ?? GENERIC_PRESET;
}

/* ----------------------------------------------------------------------
 * Pure helpers — exported for tests + the materials parser
 * -------------------------------------------------------------------- */

/** Lower-case + trim + collapse internal whitespace so "Trade Price " and
 *  "trade  price" both compare equal. */
export function normaliseHeader(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Given the source CSV's header row and a preset, return a map from
 * the source-column INDEX to its target field name. Source columns
 * that don't map to any target field are absent from the result —
 * the caller drops them.
 *
 *   sourceHeaders = ["Description", "Code", "Trade Price", "Unit"]
 *   preset        = MITRE_10_TRADE
 *   →  Map { 0 → "name", 1 → "code", 2 → "default_unit_price", 3 → "unit" }
 */
export function buildSourceIndex(
  sourceHeaders: ReadonlyArray<string>,
  preset: SupplierPreset,
): Map<number, PresetFieldKey> {
  const idx = new Map<number, PresetFieldKey>();
  const normalisedSources = sourceHeaders.map(normaliseHeader);
  // Track which target fields are already assigned so the first
  // candidate wins (don't overwrite with a later weaker candidate).
  const taken = new Set<PresetFieldKey>();
  (Object.keys(preset.candidates) as PresetFieldKey[]).forEach((target) => {
    if (taken.has(target)) return;
    for (const candidate of preset.candidates[target]) {
      const norm = normaliseHeader(candidate);
      const matchIndex = normalisedSources.findIndex((h) => h === norm);
      if (matchIndex !== -1) {
        idx.set(matchIndex, target);
        taken.add(target);
        break;
      }
    }
  });
  return idx;
}

/**
 * Re-emit a CSV string in the canonical generic format (the columns
 * `parseMaterialsCsv` expects). Any source column that mapped to
 * `code` is folded into `notes` as `SKU: <value>` so the merchant's
 * code survives the import without a new DB column.
 *
 * The function is intentionally line-by-line + tolerant of quoting
 * because that's what the existing parser uses too — keeping the two
 * in lockstep avoids surprise behavioural diffs between presets and
 * the generic path.
 */
export function remapCsvWithPreset(text: string, preset: SupplierPreset): string {
  // Pass-through for generic — keep the existing exact behaviour.
  if (preset.id === "generic") return text;

  // Split into rows + cells. Use the same minimal logic as the
  // existing parser (split by newline + comma). Empty trailing rows
  // get dropped.
  const rows = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((r) => r.trim().length > 0)
    .map((line) => splitCsvLine(line));
  if (rows.length === 0) return text;

  const sourceHeaders = rows[0];
  const idx = buildSourceIndex(sourceHeaders, preset);

  // Build the target header list. Order matches the existing CSV
  // template so visual diffing is easy.
  const targetHeaders = [
    "name",
    "unit",
    "default_unit_price",
    "supplier",
    "supplier_url",
    "notes",
  ] as const;

  // For each source row, look up each target field by index.
  const out: string[] = [];
  out.push(targetHeaders.join(","));

  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r];
    const values: Record<(typeof targetHeaders)[number], string> = {
      name: "",
      unit: "",
      default_unit_price: "",
      supplier: preset.defaultSupplier ?? "",
      supplier_url: "",
      notes: "",
    };
    let folded_sku: string | null = null;
    for (let c = 0; c < cells.length; c += 1) {
      const target = idx.get(c);
      if (!target) continue;
      const value = (cells[c] ?? "").trim();
      if (!value) continue;
      switch (target) {
        case "name":
          values.name = value;
          break;
        case "unit":
          values.unit = value;
          break;
        case "default_unit_price":
          // Passed through as written: the shared parser (parseCsvPrice)
          // decides decimal comma vs thousands, POA/blank (no price) and
          // accounting negatives. Stripping here turned "12,50" into 1250,
          // "POA" into $0 and "(5.00)" into +$5.
          values.default_unit_price = value;
          break;
        case "supplier_url":
          values.supplier_url = value;
          break;
        case "notes":
          values.notes = value;
          break;
        case "code":
          folded_sku = value;
          break;
      }
    }
    if (folded_sku) {
      values.notes = values.notes
        ? `${values.notes} · SKU: ${folded_sku}`
        : `SKU: ${folded_sku}`;
    }
    out.push(
      targetHeaders.map((h) => csvEscape(values[h] ?? "")).join(","),
    );
  }
  return out.join("\n");
}

/* ----------------------------------------------------------------------
 * Minimal CSV helpers — purposefully simple. The existing parser uses
 * the same patterns, so we keep our behaviour identical and avoid a
 * new CSV-parsing dependency.
 * -------------------------------------------------------------------- */

function splitCsvLine(line: string): string[] {
  // Handle quoted cells with embedded commas. Doesn't handle multi-line
  // quoted cells (rare in merchant trade exports). Same trade-off the
  // existing parser makes.
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          // Escaped double-quote inside a quoted cell.
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else if (ch === '"' && cur.length === 0) {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function csvEscape(value: string): string {
  if (value === "") return "";
  // Quote if it contains a comma, quote or newline.
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
