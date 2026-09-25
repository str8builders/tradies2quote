/**
 * Material counts the tradie SAYS: "14 sheets of GIB", "2 boxes of screws",
 * "30 lengths", "14 x GIB". A model material line at one of these quantities
 * is the tradie's own takeoff, not a guess — run.ts then doesn't ask for the
 * sizes the calculator would need. Digits only; sizes ("10mm", "90 x 45",
 * "2.4 m") are not counts.
 */
const COUNT_UNITS =
  "sheets?|boards?|box(?:es)?|bags?|tubes?|lengths?|studs?|packs?|packets?|rolls?|tins?|buckets?|pails?|bundles?|pieces?|pcs|posts?|piles?|joists?|bearers?|batts?|bales?|cartons?";

// Not the second half of a size ("90 x 45 studs") or a decimal ("1.5 sheets").
const COUNT_BEFORE_UNIT = new RegExp(
  `(?<!\\d\\s*[x×]\\s*)(?<!\\d[.,])\\b(\\d{1,4})\\s*(?:x\\s*)?(?:${COUNT_UNITS})\\b`,
  "gi",
);
// "14 x GIB", "6 × posts" — but not a size like "90 x 45".
const COUNT_TIMES_ITEM = /\b(\d{1,4})\s*[x×]\s+(?=[a-z])/gi;

export function extractStatedCounts(text: string): number[] {
  const out = new Set<number>();
  for (const re of [COUNT_BEFORE_UNIT, COUNT_TIMES_ITEM]) {
    for (const m of text.matchAll(re)) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n > 0) out.add(n);
    }
  }
  return [...out];
}

/** Whether `quantity` is one of the counts the tradie stated. */
export function isStatedCount(quantity: number, statedCounts: readonly number[]): boolean {
  return quantity > 0 && statedCounts.some((c) => Math.abs(c - quantity) < 1e-9);
}
