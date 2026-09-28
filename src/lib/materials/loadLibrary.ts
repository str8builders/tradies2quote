// ─────────────────────────────────────────────────────────────────────────
// Loading a tradie's WHOLE materials library — every row, not just the
// first 1,000.
//
// The database (PostgREST) caps any single request at 1,000 rows
// (max-rows). A single `.select()` with no `.range()` silently truncates a
// library past that — the Prices screen, quote generation's library
// context, name-dedupe checks and pick lists all read the materials table
// directly, so every one of them was one big price-list import away from
// quietly losing items off the end. This is the one place that reads the
// whole table; every caller in this area should go through it instead of
// its own `.select()`.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

/** One `.order()` clause, applied in the order given (ties broken left to right). */
export type MaterialOrder = { column: string; ascending?: boolean };

export type LoadAllMaterialsOptions = {
  /** Exactly what `.select()` gets — same string every caller already used. */
  select: string;
  /**
   * Defaults to ordering by `id` alone. Whatever is given here, `id asc` is
   * always appended as the final tiebreaker unless it's already present —
   * see the note on `.range()` pagination below.
   */
  order?: MaterialOrder[];
};

/** Rows per page — PostgREST's own hard limit (max-rows), not a choice. */
const PAGE_SIZE = 1000;

/**
 * A hard ceiling so a runaway loop (or a genuinely absurd library) can never
 * page forever. 10,000 materials is far beyond any real tradie's library;
 * hitting this returns what was read rather than looping indefinitely.
 */
const MAX_ROWS = 10_000;

/**
 * Every row of the signed-in tradie's materials library, paged in 1,000-row
 * steps until a short page (or the `MAX_ROWS` cap) says there's no more.
 * Throws on a read error — callers decide how to surface that (a Callout, a
 * caught-and-logged fallback to `[]`, etc.), matching what each already did
 * for a single-page read.
 *
 * `.range()` pagination is only correct when the ORDER BY is unique: with a
 * tied sort key (several items sharing a `usage_count`, say), the database
 * is free to settle ties differently between the two separate requests that
 * fetch page 1 and page 2, so a row can land on both pages or on neither.
 * `id` (the primary key) is always unique, so it's appended as the final
 * tiebreaker whenever the caller's own `order` doesn't already include it —
 * every page then has one exact, stable position for every row.
 */
export async function loadAllMaterials<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  userId: string,
  options: LoadAllMaterialsOptions,
): Promise<T[]> {
  const requested = options.order ?? [];
  const order: MaterialOrder[] = requested.some((o) => o.column === "id")
    ? requested
    : [...requested, { column: "id", ascending: true }];
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    let query = supabase
      .from("materials")
      .select(options.select)
      .eq("user_id", userId);
    for (const o of order) {
      query = query.order(o.column, { ascending: o.ascending ?? true });
    }
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}
