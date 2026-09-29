// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — marks on a drawing (pure).
//
// Plans label things with short marks that point into a schedule: W03 → the
// window schedule, D12 → the door schedule, G49h → the engineer's column
// schedule. Some carry their spec right on the plan: "L16:300x90 hy90 H1.2"
// (a lintel), "D04 - 2/240x45 SG8" (a door and its lintel).
//
// A mark's MEANING comes from the schedule that lists it, never from its
// letter alone: on the owner's marae set "W1" is a wall type, on the house
// set "W01" is a window. The family here is only a first guess.
// ─────────────────────────────────────────────────────────────────────────

import type { SheetRaw } from "../types";
import { textCentre } from "../sheet/text";

export type MarkFamily = "window" | "door" | "lintel" | "fixing" | "beam" | "other";

export type Mark = {
  /** Normalised: upper-case letters, number as printed ("W01", "L16", "G49h"). */
  id: string;
  textId: number;
  /** Centre of the text, page mm. */
  x: number;
  y: number;
  /** Text printed with the mark ("300x90 hy90 H1.2"), or null. */
  spec: string | null;
  family: MarkFamily;
};

const MARK = /^([A-Z]{1,3})[-\s]?(\d{1,3})([a-z])?$/;
const MARK_WITH_SPEC = /^([A-Z]{1,3})[-\s]?(\d{1,3})([a-z])?\s*(?::|\s[-–]\s)\s*(.+)$/;

/**
 * Prefixes that print like marks but are grades, sizes or references:
 * SG8 / GL10 / LVL11 timber grades, M12 bolts, H3 treatment, F8 plywood,
 * PS1 producer statements, NZS / AS standards. Left out unless printed
 * with a spec ("F1: …").
 */
const NOT_MARKS = new Set(["SG", "MSG", "GL", "LVL", "M", "H", "F", "R", "PS", "NZS", "AS", "BC", "MM", "KN", "KPA", "PFC", "UB", "UC", "SHS", "RHS", "CHS", "PG", "REV", "RL"]);

export function familyOf(prefix: string): MarkFamily {
  if (/^(W|WN|WIN)$/.test(prefix)) return "window";
  if (/^(D|ED|ID|DR|GD|SD)$/.test(prefix)) return "door";
  if (/^(L|LN)$/.test(prefix)) return "lintel";
  if (/^(B|BM|SB|RB)$/.test(prefix)) return "beam";
  if (/^(F|FX)$/.test(prefix)) return "fixing";
  return "other";
}

/** Read every mark on a sheet. Grid bubbles and units are left out. */
export function readMarks(sheet: Pick<SheetRaw, "text">): Mark[] {
  const out: Mark[] = [];
  for (const t of sheet.text) {
    const s = t.s.trim();
    const withSpec = s.match(MARK_WITH_SPEC);
    const bare = withSpec ? null : s.match(MARK);
    const m = withSpec ?? bare;
    if (!m) continue;
    const prefix = m[1];
    if (NOT_MARKS.has(prefix) && !withSpec) continue;
    // "S1" alone is a section/slab mark only if a schedule says so; still keep it.
    const id = `${prefix}${m[2]}${m[3] ?? ""}`;
    const [x, y] = textCentre(t);
    out.push({ id, textId: t.id, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, spec: withSpec ? withSpec[4].trim() : null, family: familyOf(prefix) });
  }
  return out;
}

/** How many times each mark id appears. */
export function countMarks(marks: readonly Mark[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of marks) counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
  return counts;
}
