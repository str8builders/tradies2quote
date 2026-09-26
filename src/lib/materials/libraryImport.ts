// ─────────────────────────────────────────────────────────────────────────
// Saving imported prices into the tradie's library — the pure part.
//
// Shared by the price-list import (`importMaterials`) and the supplier-scan
// save (`importSupplierQuoteItems`): merge a name listed twice, match saved
// items by their code first and then by name, work out the patch each saved
// item gets (only what the import actually carries), and word the result
// honestly. Client-safe, so the review screen can warn about the same merges
// the server will make.
// ─────────────────────────────────────────────────────────────────────────

import { nameKey, type DuplicateName, type SkippedRow } from "./priceList";

/** One row on its way into the library (prices already ex-GST). */
export type LibraryImportRow = {
  name: string;
  /** Null = not given: a new item is saved as "each", a saved one keeps its unit. */
  unit: string | null;
  /** Null = no price: never overwrites a saved price. */
  default_unit_price: number | null;
  sku: string | null;
  supplier: string | null;
  supplier_url: string | null;
  notes: string | null;
  /** How sure the scanner was of this line (scanned rows only), 0..1. */
  confidence?: number;
};

/** A saved library item, as much of it as matching needs. */
export type SavedItem = { id: string; name: string; sku: string | null; notes: string | null };

/** A row that wasn't saved, and why, in plain words. */
export type ImportProblem = { name: string; reason: string };

/** A name that was listed more than once and saved once. */
export type MergedName = { name: string; count: number };

/**
 * Save a name listed twice once. `pick` chooses between the row kept so far
 * and the next one; the merged row stays where the name first appeared.
 */
export function mergeRepeatedNames<T extends { name: string }>(
  rows: T[],
  pick: (kept: T, next: T) => T,
): { rows: T[]; merged: MergedName[] } {
  const byKey = new Map<string, { row: T; count: number; at: number }>();
  rows.forEach((row, at) => {
    const key = nameKey(row.name);
    const seen = byKey.get(key);
    if (!seen) byKey.set(key, { row, count: 1, at });
    else byKey.set(key, { row: pick(seen.row, row), count: seen.count + 1, at: seen.at });
  });
  const kept = [...byKey.values()].sort((a, b) => a.at - b.at);
  return {
    rows: kept.map((k) => k.row),
    merged: kept.filter((k) => k.count > 1).map((k) => ({ name: k.row.name, count: k.count })),
  };
}

/** Keep the later row (a price list corrected further down). */
export function keepLater<T>(_kept: T, next: T): T {
  return next;
}

/**
 * Two scanned lines with one name: keep the clearer read (higher scanner
 * confidence), then the more complete one (it has a code and a unit), else
 * the first. A code only the other line read is kept too (never its unit:
 * the price is per the kept line's unit).
 */
export function keepMoreReliable<T extends LibraryImportRow>(kept: T, next: T): T {
  const score = (r: T) => [r.confidence ?? 0, (r.sku ? 1 : 0) + (r.unit && r.unit !== "each" ? 1 : 0)];
  const [a, b] = [score(kept), score(next)];
  const winner = b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]) ? next : kept;
  const other = winner === kept ? next : kept;
  return { ...winner, sku: winner.sku ?? other.sku };
}

/**
 * Which rows are new and which update a saved item: a code (SKU) match
 * first, then the same name (any case, any spacing). Two rows that land on
 * the same saved item keep the later one, and the earlier is reported.
 */
export function matchSavedItems<T extends LibraryImportRow>(
  rows: T[],
  saved: SavedItem[],
): { inserts: T[]; updates: Array<{ target: SavedItem; row: T }>; superseded: ImportProblem[] } {
  const bySku = new Map<string, SavedItem>();
  const byName = new Map<string, SavedItem>();
  for (const item of saved) {
    const sku = item.sku?.trim().toLowerCase();
    if (sku && !bySku.has(sku)) bySku.set(sku, item);
    const key = nameKey(item.name);
    if (!byName.has(key)) byName.set(key, item);
  }
  const inserts: T[] = [];
  const updatesById = new Map<string, { target: SavedItem; row: T }>();
  const superseded: ImportProblem[] = [];
  for (const row of rows) {
    const sku = row.sku?.trim().toLowerCase();
    const target = (sku ? bySku.get(sku) : undefined) ?? byName.get(nameKey(row.name));
    if (!target) {
      inserts.push(row);
      continue;
    }
    const earlier = updatesById.get(target.id);
    if (earlier) {
      superseded.push({
        name: earlier.row.name,
        reason: `Matches the same saved item (“${target.name}”) as “${row.name}” — the later row was used`,
      });
    }
    updatesById.set(target.id, { target, row });
  }
  return { inserts, updates: [...updatesById.values()], superseded };
}

/**
 * What a saved item gets from an import: only the fields the import carries
 * (a blank cell never wipes a saved value), and the notes only when the
 * tradie has none of their own. `stamp` rides along with a new price (e.g.
 * "this price came from a scanned quote").
 */
export function libraryPatch(
  row: LibraryImportRow,
  target: SavedItem,
  stamp: Record<string, unknown> = {},
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (row.unit) patch.unit = row.unit;
  if (row.default_unit_price !== null) {
    patch.default_unit_price = row.default_unit_price;
    Object.assign(patch, stamp);
  }
  if (row.supplier) patch.supplier = row.supplier;
  if (row.supplier_url) patch.supplier_url = row.supplier_url;
  if (row.sku) patch.sku = row.sku;
  if (row.notes && !(target.notes ?? "").trim()) patch.notes = row.notes;
  return patch;
}

/** Split a list into chunks of `size` (bulk writes stay under request limits). */
export function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// ── Saying what happened ─────────────────────────────────────────────────

export type SaveCounts = {
  inserted: number;
  updated: number;
  failed: number;
  /** Names that couldn't be saved. */
  failedNames?: string[];
  error?: string;
};

export type SaveOutcome = {
  tone: "ok" | "partial" | "bad";
  title: string;
  detail: string;
};

function nameList(names: string[]): string {
  const shown = names.slice(0, 5).map((n) => `“${n}”`);
  const more = names.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
}

/**
 * The done screen's words for a library save. Nothing saved is never
 * "added": it is an error with what went wrong, so the tradie tries again.
 */
export function librarySaveOutcome(result: SaveCounts): SaveOutcome {
  const saved = result.inserted + result.updated;
  const failedNames = result.failedNames ?? [];
  const counts = [
    result.inserted > 0 ? `${result.inserted} new` : null,
    result.updated > 0 ? `${result.updated} updated` : null,
  ]
    .filter(Boolean)
    .join(", ");
  if (saved === 0) {
    return {
      tone: "bad",
      title: "Nothing was saved to your library",
      detail:
        result.error ??
        (failedNames.length > 0
          ? `These couldn't be saved: ${nameList(failedNames)}. Check the names and prices, then try again.`
          : "Please try again."),
    };
  }
  if (result.failed > 0) {
    return {
      tone: "partial",
      title: `Saved ${saved} of ${saved + result.failed} to your library`,
      detail: `${counts}. ${
        failedNames.length > 0 ? `Not saved: ${nameList(failedNames)}.` : `${result.failed} couldn't be saved.`
      } Add them by hand, or scan again.`,
    };
  }
  return { tone: "ok", title: "Added to your library", detail: `${counts}.` };
}

// ── Price-list imports ───────────────────────────────────────────────────

/** What `importMaterials` answers with. */
export type ImportMaterialsResult = {
  inserted: number;
  updated: number;
  /** Rows not saved because their data was bad or the save failed. */
  failed: number;
  /** Every row not saved, with the reason, for the summary. */
  problems: ImportProblem[];
  /** Names listed more than once in the file: saved once (the last row). */
  merged: MergedName[];
  /** Matched a saved item but carried nothing new for it. */
  unchanged: number;
  error?: string;
};

export type PriceListSummary = {
  tone: "ok" | "partial" | "bad";
  title: string;
  counts: Array<{ label: string; value: number }>;
  /** "Row 12: No name", "“Hinge”: Couldn't be saved — try again". */
  skipped: string[];
  /** "“Pine 90x45” is on rows 2 and 9 — row 9 was used". */
  merged: string[];
};

function rowList(rows: number[]): string {
  if (rows.length <= 2) return rows.join(" and ");
  return `${rows.slice(0, -1).join(", ")} and ${rows[rows.length - 1]}`;
}

/**
 * The summary after a price-list import: added / updated / skipped, with the
 * reason for every row that wasn't saved — rows left out while reading the
 * file (by their spreadsheet row or document line) and rows the save
 * turned down (by name).
 */
export function priceListSummary(
  result: ImportMaterialsResult,
  read: { skipped: SkippedRow[]; duplicates: DuplicateName[]; source: "sheet" | "document" },
): PriceListSummary {
  const where = read.source === "sheet" ? "Row" : "Line";
  const skipped = [
    ...read.skipped.map((s) => `${where} ${s.row}: ${s.reason}`),
    ...result.problems.map((p) => `“${p.name}”: ${p.reason}`),
  ];
  const merged = read.duplicates.map(
    (d) => `“${d.name}” is on ${where.toLowerCase()}s ${rowList(d.rows)} — ${where.toLowerCase()} ${d.kept} was used`,
  );
  const saved = result.inserted + result.updated;
  const counts = [
    { label: "Added", value: result.inserted },
    { label: "Updated", value: result.updated },
    ...(result.unchanged > 0 ? [{ label: "Already up to date", value: result.unchanged }] : []),
    { label: "Skipped", value: skipped.length },
  ];
  if (saved === 0 && result.unchanged === 0) {
    return {
      tone: "bad",
      title: result.error ?? "Nothing was imported",
      counts,
      skipped,
      merged,
    };
  }
  return {
    tone: skipped.length > 0 || result.failed > 0 ? "partial" : "ok",
    title: skipped.length > 0 ? "Imported, with some rows skipped" : "Prices imported",
    counts,
    skipped,
    merged,
  };
}
