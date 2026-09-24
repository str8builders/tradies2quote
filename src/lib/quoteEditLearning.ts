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

  // Match prior↔new by identity: library_id first, then description.
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

  let learned = 0;
  let failed = 0;

  for (let i = 0; i < newItems.length; i++) {
    const item = newItems[i];
    if (item.type !== "material") continue;

    const description = (item.description ?? "").trim();
    if (!description) continue;
    const unitPrice = Number(item.unit_price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

    const priorByLib = item.library_id
      ? priorByLibraryId.get(item.library_id)
      : undefined;
    const priorByDesc = priorByLib
      ? undefined
      : (priorByDescription.get(descriptionKey(item)) ?? []).find((p) => !used.has(p));
    const prior: QuoteLineItem | null = priorByLib ?? priorByDesc ?? null;
    if (prior) used.add(prior);

    if (prior && lineItemMaterialFieldsEquivalent(prior, item)) continue;

    // An alias is only recorded for a rename we can prove (same library row).
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
