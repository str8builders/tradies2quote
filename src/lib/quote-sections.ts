// ─────────────────────────────────────────────────────────────────────────
// Trade sections on a quote — Framing, Linings, Joinery… — each with its
// own subtotal. Pure, and shared by the tradie's job page, the client's
// quote page and the PDF, so all three split and add up the same way.
//
// Only lines that carry a `section` (the plan-set reader sets them) are
// split; a quote without any shows exactly as before. A line added by hand
// to a sectioned quote goes last, under "Other materials".
// ─────────────────────────────────────────────────────────────────────────

import { round2 } from "./quote-defaults";

export const OTHER_SECTION = "Other materials";

/** Where a group's lines without a section go, once any line in it has one. */
export function otherSectionTitle(type: "material" | "labour" | "other"): string {
  return type === "material" ? OTHER_SECTION : type === "labour" ? "Other labour" : "Other items";
}

export type LineSection<T> = { title: string; items: T[]; subtotal: number };

type SectionedLine = { section?: string | null; line_total?: number | null };

/** The line's section name, or null when it has none. */
export function sectionOf(line: SectionedLine): string | null {
  const name = typeof line.section === "string" ? line.section.trim() : "";
  return name ? name.slice(0, 60) : null;
}

/**
 * The lines split into their sections, in the order each section first
 * appears, with any lines that have none last under `otherTitle`. Null when
 * no line has a section: show the list as it always was.
 */
export function lineSections<T>(
  items: readonly T[],
  lineOf: (item: T) => SectionedLine,
  otherTitle: string = OTHER_SECTION,
): LineSection<T>[] | null {
  if (!items.some((item) => sectionOf(lineOf(item)))) return null;
  const named = new Map<string, T[]>();
  const rest: T[] = [];
  for (const item of items) {
    const name = sectionOf(lineOf(item));
    if (!name || name === otherTitle) rest.push(item);
    else named.set(name, [...(named.get(name) ?? []), item]);
  }
  const sections = [...named.entries()].map(([title, list]) => ({ title, items: list }));
  if (rest.length) sections.push({ title: otherTitle, items: rest });
  return sections.map((s) => ({
    ...s,
    subtotal: round2(s.items.reduce((sum, item) => sum + (Number(lineOf(item).line_total) || 0), 0)),
  }));
}
