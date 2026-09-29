// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — keep only what the sheet actually says (pure).
//
// Each AI item cites text-run ids. It survives only if:
//   - every cited id exists on the sheet (or bundle) it was sent;
//   - every NUMBER in its value appears in the cited text (2400 matches
//     "2400", "2,400" or "2.4m"; R2.8 matches "R2.8");
//   - most of its words appear in the cited text (a product name the
//     sheet never printed can't slip in).
// Dropped items are counted, never silently kept.
// ─────────────────────────────────────────────────────────────────────────

import type { TextItem } from "../types";
import type { Cited, SheetReading } from "./schema";

export type VerifyResult = { reading: SheetReading; kept: number; dropped: number; reasons: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ");

/** Numbers as written: "2,400" → 2400, "R2.8" → 2.8, "0.40" → 0.4. */
export function numbersIn(s: string): number[] {
  return [...s.replace(/(\d),(\d{3})\b/g, "$1$2").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

/** Is `n` printed in `source`, allowing mm ↔ m ("2400" vs "2.4 m")? */
export function numberPrinted(n: number, source: string): boolean {
  const printed = numbersIn(source);
  return printed.some((p) => p === n || (n >= 100 && Math.abs(p * 1000 - n) < 0.5) || (n < 100 && Math.abs(p / 1000 - n) < 1e-9));
}

function wordsCovered(value: string, source: string): number {
  const words = norm(value).match(/[a-z][a-z0-9/-]{2,}/g) ?? [];
  if (!words.length) return 1;
  const src = norm(source);
  return words.filter((w) => src.includes(w)).length / words.length;
}

type Check = { values: string[]; numbers?: number[] };

function check(item: Cited, textOf: Map<number, string>, c: Check): string | null {
  if (!item.text_ids.length) return "no text cited";
  const missing = item.text_ids.filter((id) => !textOf.has(id));
  if (missing.length) return `cites text that isn't on the sheet (${missing.join(",")})`;
  const source = item.text_ids.map((id) => textOf.get(id)!).join(" ");
  for (const n of c.numbers ?? []) if (!numberPrinted(n, source)) return `${n} isn't in the cited text`;
  for (const v of c.values) {
    for (const n of numbersIn(v)) if (!numberPrinted(n, source)) return `${n} isn't in the cited text`;
    if (wordsCovered(v, source) < 0.6) return `"${v}" isn't what the cited text says`;
  }
  return null;
}

/** Drop every item the sheet's own text doesn't back up. */
export function verifyReading(reading: SheetReading, text: readonly TextItem[]): VerifyResult {
  const textOf = new Map(text.map((t) => [t.id, t.s] as const));
  const reasons: string[] = [];
  let kept = 0, dropped = 0;
  const keep = <T extends Cited>(items: T[], c: (x: T) => Check, label: (x: T) => string): T[] =>
    items.filter((x) => {
      const why = check(x, textOf, c(x));
      if (why) {
        dropped++;
        reasons.push(`${label(x)}: ${why}`);
        return false;
      }
      kept++;
      return true;
    });
  const out: SheetReading = {
    specs: keep(reading.specs, (x) => ({ values: [x.value] }), (x) => `spec ${x.topic}`),
    heights: keep(reading.heights, (x) => ({ values: [], numbers: [x.mm] }), (x) => `height ${x.kind}`),
    roof: keep(reading.roof, (x) => ({ values: [x.value] }), (x) => `roof ${x.kind}`),
    zones: keep(reading.zones, (x) => ({ values: [x.value] }), (x) => `zone ${x.kind}`),
    rooms: keep(reading.rooms, (x) => ({ values: [x.name, x.finishes] }), (x) => `room ${x.name}`),
    legend: keep(reading.legend, (x) => ({ values: [x.label] }), (x) => `legend ${x.label}`),
    consent: keep(reading.consent, (x) => ({ values: [x.text] }), (x) => `consent ${x.kind}`),
    by_others: keep(reading.by_others, (x) => ({ values: [x.item] }), (x) => `by others ${x.item}`),
    conflicts: keep(reading.conflicts, () => ({ values: [] }), () => "conflict"),
  };
  return { reading: out, kept, dropped, reasons };
}
