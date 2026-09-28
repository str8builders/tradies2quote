import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveMaterialCorrection } from "./materialLearning";
import type { QuoteLineItem } from "./quote-types";

/**
 * Stage 4.6 — wire user corrections from the QuoteEditor save flow into
 * the user-scoped material library.
 *
 * Called from `saveQuoteChanges` (server action) right after the quote +
 * line items are persisted. NEVER throws — failures are logged and
 * counted, but propagate to the caller as a soft `failed` count rather
 * than an exception. This preserves the Stage 3 invariant: a successful
 * quote save must never be undone by a learning failure.
 *
 * Per-line decision matrix:
 *
 *   - skip non-material lines (labour / other never become catalogue rows)
 *   - skip empty descriptions
 *   - skip prices that are not finite or are <= 0
 *   - find the line's PRIOR version by identity, never by position:
 *       1. the prior line with the same library_id, else
 *       2. the prior line with the same description (trimmed,
 *          case-insensitive), each prior line used at most once.
 *     Position is NOT identity: deleting or adding a line shifts every line
 *     after it, which paired unrelated materials and saved one as an alias
 *     of the other (e.g. "GIB Standard 13mm" learned as "Pine 90x45").
 *   - skip lines whose (description, unit, unit_price) match that prior
 *     version — a no-op edit, no correction needed
 *   - otherwise:
 *       canonicalName = trimmed description
 *       originalText  = the prior description IFF the line was matched by
 *                       library_id and its description changed — the only
 *                       case where a rename is known, not guessed
 *       unit          = item.unit (default 'each')
 *       unitPrice     = item.unit_price
 *
 *   The correction goes through `saveMaterialCorrection`, which guarantees
 *   the new row is user-scoped and never touches global catalogue rows.
 */

export type ApplyCorrectionsResult = {
  /** Number of corrections that successfully ran through saveMaterialCorrection. */
  materialsLearned: number;
  /** Number of corrections that threw — never propagated to the caller. */
  failed: number;
};

export async function applyMaterialCorrections(
  supabase: SupabaseClient,
  userId: string,
  newItems: QuoteLineItem[],
  priorItems: QuoteLineItem[],
): Promise<ApplyCorrectionsResult> {
  if (!userId) return { materialsLearned: 0, failed: 0 };

  // Match prior↔new by identity: library_id first, then description. Done
  // as its own pass (rather than inline in the loop below) so we know,
  // BEFORE touching the database, exactly which lines have no prior at all
  // — that set is all the library lookup below needs.
  const priorByLibraryId = new Map<string, QuoteLineItem>();
  const priorByDescription = new Map<string, QuoteLineItem[]>();
  for (const p of priorItems) {
    if (p.library_id) priorByLibraryId.set(p.library_id, p);
    const key = descriptionKey(p);
    if (!key) continue;
    const list = priorByDescription.get(key) ?? [];
    list.push(p);
    priorByDescription.set(key, list);
  }
  const used = new Set<QuoteLineItem>();
  const priorFor: Array<QuoteLineItem | null> = newItems.map((item) => {
    // Non-material lines never participate in matching (labour/other are
    // skipped outright below) — exactly the original behaviour, so a
    // labour/other line can never "use up" a material prior.
    if (item.type !== "material") return null;
    const priorByLib = item.library_id ? priorByLibraryId.get(item.library_id) : undefined;
    const priorByDesc = priorByLib
      ? undefined
      : (priorByDescription.get(descriptionKey(item)) ?? []).find((p) => !used.has(p));
    const prior = priorByLib ?? priorByDesc ?? null;
    if (prior) used.add(prior);
    return prior;
  });

  // A brand-new line (no prior on this quote at all — just added this save)
  // that references an existing library item is only a correction when it
  // DIFFERS from that item. Added from the library unchanged, it's a pick,
  // not a fix — learning it anyway logged every "add a kit" / "add from
  // library" line as if the tradie had corrected the AI, when nothing was
  // touched. Batch-fetch only the rows a no-prior line actually needs.
  const libraryIds = [
    ...new Set(
      newItems
        .filter((item, i) => item.type === "material" && item.library_id && !priorFor[i])
        .map((item) => item.library_id as string),
    ),
  ];
  const libraryById = new Map<
    string,
    { name: string; unit: string | null; default_unit_price: number | null }
  >();
  if (libraryIds.length > 0) {
    const { data, error } = await supabase
      .from("materials")
      .select("id, name, unit, default_unit_price")
      .eq("user_id", userId)
      .in("id", libraryIds);
    if (error) {
      console.warn("[material-learning] library lookup failed", { userId, message: error.message });
    } else {
      for (const row of (data ?? []) as Array<{
        id: string;
        name: string | null;
        unit: string | null;
        default_unit_price: number | string | null;
      }>) {
        libraryById.set(row.id, {
          name: row.name ?? "",
          unit: row.unit,
          default_unit_price: row.default_unit_price == null ? null : Number(row.default_unit_price),
        });
      }
    }
  }

  let learned = 0;
  let failed = 0;

  for (let i = 0; i < newItems.length; i++) {
    const item = newItems[i];
    if (item.type !== "material") continue;

    const description = (item.description ?? "").trim();
    if (!description) continue;
    const unitPrice = Number(item.unit_price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

    const prior = priorFor[i];

    if (prior) {
      if (lineItemMaterialFieldsEquivalent(prior, item)) continue;
    } else if (item.library_id) {
      const libRow = libraryById.get(item.library_id);
      if (libRow && libraryFieldsEquivalent(libRow, item)) continue;
    }

    // An alias is only recorded for a rename we can prove (same library row).
    const priorByLib = item.library_id ? priorByLibraryId.get(item.library_id) : undefined;
    const priorDesc = (priorByLib?.description ?? "").trim();
    const originalText =
      priorDesc && priorDesc.toLowerCase() !== description.toLowerCase()
        ? priorDesc
        : undefined;

    try {
      await saveMaterialCorrection(supabase, userId, {
        canonicalName: description,
        originalText,
        unit: item.unit || "each",
        unitPrice,
      });
      learned++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[material-learning] correction failed", {
        userId,
        line: i,
        description,
        message,
      });
      failed++;
    }
  }

  return { materialsLearned: learned, failed };
}

function descriptionKey(item: QuoteLineItem): string {
  return (item.description ?? "").trim().toLowerCase();
}

/**
 * Two material lines are "equivalent for learning" when their description
 * (trimmed, case-insensitive), unit, and unit_price all match. Other
 * fields like quantity and line_total are not relevant for whether the
 * material itself changed.
 */
function lineItemMaterialFieldsEquivalent(
  a: QuoteLineItem,
  b: QuoteLineItem,
): boolean {
  return (
    (a.description ?? "").trim().toLowerCase() ===
      (b.description ?? "").trim().toLowerCase() &&
    (a.unit ?? "") === (b.unit ?? "") &&
    Number(a.unit_price) === Number(b.unit_price)
  );
}

/**
 * A brand-new line (no prior on the quote) is "equivalent for learning" to
 * the library row it references when its name, unit and price all still
 * match what the library already has — added unchanged, not corrected.
 * Unit compares with the same "each" default the rest of the library uses
 * for a blank unit.
 */
function libraryFieldsEquivalent(
  lib: { name: string; unit: string | null; default_unit_price: number | null },
  item: QuoteLineItem,
): boolean {
  return (
    lib.name.trim().toLowerCase() === (item.description ?? "").trim().toLowerCase() &&
    (lib.unit || "each") === (item.unit || "each") &&
    lib.default_unit_price != null &&
    Number(lib.default_unit_price) === Number(item.unit_price)
  );
}
