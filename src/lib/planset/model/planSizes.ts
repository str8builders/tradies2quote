// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — window and door sizes printed on the plan itself (pure).
//
// Small additions and alterations often have no window or door schedule:
// the plan prints each new window's size beside it — "800h x 600w" — with
// its lintel ("140 x 90 sg8 lintel") and glazing ("Safety Glass") next to
// it. When a set has no scheduled windows or doors at all, these labels are
// read off the plan the walls were measured on (that one sheet, so a window
// labelled on two sheets is counted once).
//
// Checked before it counts:
//   - a size that says which number is the height ("800h x 600w", "H800 x
//     W600") is read, and its width checked against a gap drawn in the wall
//     beside it. With no gap there (a window where new work meets the
//     existing house) it's kept, marked for checking, when it sits by an
//     outside wall or has a lintel printed beside it;
//   - a bare "2100 x 810" only counts when one of its numbers matches a gap
//     it sits beside, and that number is the width;
//   - a size beside words like mirror, cabinet or hatch isn't joinery.
// ─────────────────────────────────────────────────────────────────────────

import type { Evidence, TextItem } from "../types";
import type { Mark } from "../link/marks";
import type { WallLine } from "../measure/walls";
import type { SheetFacts } from "../sheetFacts";
import { textCentre } from "../sheet/text";
import type { BuildingModel, Flag, ModelOpening } from "./types";

/** `fields.source` of an opening read from a size printed on the plan. */
export const PLAN_SIZE_SOURCE = "size printed on the plan";

export type PlanSize = {
  /** Width and height when the label says which is which; null for a bare pair. */
  widthMm: number | null;
  heightMm: number | null;
  /** A bare "A x B": the gap it sits beside decides which is the width. */
  pair: [number, number] | null;
  /** Said in the label itself ("slider", "window"), or null. */
  kind: "window" | "door" | null;
};

const NUM = String.raw`(\d,\d{3}|\d{3,4})`;
const HIGH = String.raw`(?:h|ht|hgt|high)`;
const WIDE = String.raw`(?:w|wd|wide)`;
const BY = String.raw`\s*[x×*]\s*`;
const DOOR_WORDS = /\b(door|dr|slider|sliding|ranch|bi-?fold|cavity|french|entry|garage|stacker)\b/;
const WINDOW_WORDS = /\b(window|win|awning|casement|fixed|louvre|hung)\b/;
/** What may follow a size in the same run and still be a window or door. */
const TAIL =
  /^[\s,.:;()–-]*(?:(?:window|win|awning|casement|fixed|louvre|hung|door|dr|slider|sliding|ranch|bi-?fold|cavity|french|entry|garage|stacker|safety|glass|glazing|toughened|laminated|obscure|frosted|opaque|double|glazed|low-?e|alum|aluminium|timber|new|mm)[\s,.:;()–-]*)*$/;
const FORMS: ReadonlyArray<{ re: RegExp; heightFirst: boolean }> = [
  { re: new RegExp(`^${NUM}\\s*${HIGH}${BY}${NUM}\\s*${WIDE}(?![a-z])(.*)$`), heightFirst: true },
  { re: new RegExp(`^${NUM}\\s*${WIDE}${BY}${NUM}\\s*${HIGH}(?![a-z])(.*)$`), heightFirst: false },
  { re: new RegExp(`^${HIGH}\\s*${NUM}${BY}${WIDE}\\s*${NUM}(?![0-9])(.*)$`), heightFirst: true },
  { re: new RegExp(`^${WIDE}\\s*${NUM}${BY}${HIGH}\\s*${NUM}(?![0-9])(.*)$`), heightFirst: false },
];
const BARE = new RegExp(`^${NUM}${BY}${NUM}(?![0-9])(.*)$`);

const num = (s: string) => Number(s.replace(",", ""));
const plausible = (w: number, h: number) => w >= 300 && w <= 6000 && h >= 300 && h <= 2800;
const kindIn = (tail: string): PlanSize["kind"] => (DOOR_WORDS.test(tail) ? "door" : WINDOW_WORDS.test(tail) ? "window" : null);

/** A window or door size as printed on a plan, or null for anything else. */
export function parsePlanSize(raw: string): PlanSize | null {
  const s = raw.trim().toLowerCase().replace(/×/g, "x");
  for (const { re, heightFirst } of FORMS) {
    const m = s.match(re);
    if (!m || !TAIL.test(m[3])) continue;
    const [a, b] = [num(m[1]), num(m[2])];
    const [heightMm, widthMm] = heightFirst ? [a, b] : [b, a];
    return plausible(widthMm, heightMm) ? { widthMm, heightMm, pair: null, kind: kindIn(m[3]) } : null;
  }
  const bare = s.match(BARE);
  if (bare && TAIL.test(bare[3])) {
    const [a, b] = [num(bare[1]), num(bare[2])];
    if (plausible(a, b) || plausible(b, a)) return { widthMm: null, heightMm: null, pair: [a, b], kind: kindIn(bare[3]) };
  }
  return null;
}

/** "140 x 90 sg8 lintel" → "140 x 90 SG8"; null unless it names a lintel and a timber size. */
export function lintelSpecOf(raw: string): string | null {
  if (!/\blintels?\b/i.test(raw) || !/\d{2,3}\s*[x×]\s*\d{2,3}/.test(raw)) return null;
  const spec = raw
    .replace(/\blintels?\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s:;,.–-]+|[\s:;,.–-]+$/g, "")
    .replace(/\b(sg|msg|lvl|gl)(\d+)\b/gi, (_, g: string, d: string) => `${g.toUpperCase()}${d}`)
    .replace(/\bh(\d(?:\.\d)?)\b/gi, "H$1");
  return spec || null;
}

const GLAZING = /\b(safety glass|safety glazing|toughened|laminated|obscure|frosted|opaque|double glazed|grade a)\b/i;
/**
 * Things sized like joinery that aren't: a size printed right beside one of
 * these words ("Mirror", "Access hatch") is that thing, not a window.
 */
const NOT_JOINERY = /\b(mirror|cabinet|hatch|vanity|robe|wardrobe|shel(f|ves)|meter ?box|heat ?pump|cylinder|hwc|switchboard|skylight)\b/i;
/** "Right beside": within this many of the label's own text heights (page mm). */
const BESIDE_HEIGHTS = 3;

/** How far a size may sit from the gap it names, real mm. */
const GAP_REACH_MM = 1500;
/** A bare size only counts by matching a gap: it must sit closer. */
const BARE_REACH_MM = 1000;
/** Lintel, glazing and not-joinery words count this close to a size, real mm. */
const WORDS_REACH_MM = 1200;
/** A plan mark this close is the opening's own mark, real mm. */
const MARK_REACH_MM = 800;
/** Printed width vs the gap drawn: within this, the same opening. */
const WINDOW_TOLERANCE_MM = 60;
const DOOR_TOLERANCE_MM = 120;
/** Gaps narrower than this are wall junctions, not openings (real mm). */
const MIN_GAP_MM = 400;
/** A printed height from this up is a door or a slider. */
const DOOR_HEIGHT_MM = 1950;

export type PlanSizeSheet = {
  page: number;
  text: readonly TextItem[];
  marks: readonly Mark[];
  walls: { ratio: number; lines: readonly WallLine[] };
};

type Label = { t: TextItem; size: PlanSize; x: number; y: number };
type GapPick = { label: Label; line: WallLine; gap: WallLine["gaps"][number]; widthMm: number; heightMm: number; score: number };

/** Distance from a point to a wall line's segment (or one gap of it), real mm. */
function toSegment(line: WallLine, from: number, to: number, x: number, y: number, k: number): number {
  const along = line.orientation === "h" ? x : y;
  const across = line.orientation === "h" ? y : x;
  const nearest = Math.min(Math.max(along, from), to);
  return Math.hypot(nearest - along, line.at - across) * k;
}

/** Windows and doors whose sizes are printed on one plan sheet. */
export function readPlanSizes(sheet: PlanSizeSheet): { openings: ModelOpening[]; flags: Flag[] } {
  const k = sheet.walls.ratio;
  const at = (t: TextItem) => textCentre(t);
  const apart = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) * k;

  // 1. Size labels, less any sitting by words that make them something else.
  const labels: Label[] = [];
  for (const t of sheet.text) {
    const size = parsePlanSize(t.s);
    if (!size) continue;
    const [x, y] = at(t);
    const [ux, uy] = [x, y];
    const beside = sheet.text.some((u) => {
      if (u.id === t.id || !NOT_JOINERY.test(u.s)) return false;
      const [vx, vy] = at(u);
      return Math.hypot(vx - ux, vy - uy) <= BESIDE_HEIGHTS * t.h;
    });
    if (!beside) labels.push({ t, size, x, y });
  }
  if (!labels.length) return { openings: [], flags: [] };

  // 2. Pair labels with gaps in the walls: best pairs first, one label per gap.
  const picks: GapPick[] = [];
  for (const label of labels) {
    const reach = label.size.pair ? BARE_REACH_MM : GAP_REACH_MM;
    for (const line of sheet.walls.lines) {
      for (const gap of line.gaps) {
        if (gap.widthMm < MIN_GAP_MM) continue;
        const dist = toSegment(line, gap.from, gap.to, label.x, label.y, k);
        if (dist > reach) continue;
        const sizes: Array<[number, number]> = label.size.pair
          ? [label.size.pair, [label.size.pair[1], label.size.pair[0]]]
          : [[label.size.widthMm!, label.size.heightMm!]];
        for (const [w, h] of sizes) {
          if (!plausible(w, h)) continue;
          const door = (label.size.kind ?? (h >= DOOR_HEIGHT_MM ? "door" : "window")) === "door";
          const tolerance = label.size.pair ? WINDOW_TOLERANCE_MM : door ? DOOR_TOLERANCE_MM : WINDOW_TOLERANCE_MM;
          const off = Math.abs(gap.widthMm - w);
          if (off <= tolerance) picks.push({ label, line, gap, widthMm: w, heightMm: h, score: dist + off * 2 });
        }
      }
    }
  }
  const placed = new Map<Label, GapPick>();
  const usedGaps = new Set<WallLine["gaps"][number]>();
  for (const p of picks.sort((a, b) => a.score - b.score)) {
    if (placed.has(p.label) || usedGaps.has(p.gap)) continue;
    placed.set(p.label, p);
    usedGaps.add(p.gap);
  }

  // 3. Lintels printed beside the sizes: nearest first, one each.
  const lintelTexts = sheet.text.flatMap((t) => {
    const spec = lintelSpecOf(t.s);
    return spec ? [{ t, spec, c: at(t) }] : [];
  });
  const lintelOf = new Map<Label, { t: TextItem; spec: string }>();
  const lintelPairs = labels.flatMap((label) => lintelTexts.map((l) => ({ label, l, d: apart(l.c, [label.x, label.y]) }))).filter((p) => p.d <= WORDS_REACH_MM);
  const usedLintels = new Set<number>();
  for (const p of lintelPairs.sort((a, b) => a.d - b.d)) {
    if (lintelOf.has(p.label) || usedLintels.has(p.l.t.id)) continue;
    lintelOf.set(p.label, p.l);
    usedLintels.add(p.l.t.id);
  }

  // 4. Keep what's checked: a matched gap; or, for a size that says which
  //    number is the height, an outside wall or a lintel right beside it.
  const byOutsideWall = (label: Label) =>
    sheet.walls.lines.some((line) => line.external && toSegment(line, line.from, line.to, label.x, label.y, k) <= GAP_REACH_MM);
  const kept = labels.filter((label) => placed.has(label) || (!label.size.pair && (byOutsideWall(label) || lintelOf.has(label))));
  // Reading order: down the sheet, then across.
  kept.sort((a, b) => a.y - b.y || a.x - b.x);

  // 5. Marks: the plan's own mark when one sits beside it, else numbered.
  const taken = new Set(sheet.marks.map((m) => m.id));
  const next = { window: 1, door: 1 };
  const freshMark = (kind: "window" | "door") => {
    const letter = kind === "window" ? "W" : "D";
    while (taken.has(`${letter}${next[kind]}`)) next[kind]++;
    const id = `${letter}${next[kind]++}`;
    taken.add(id);
    return id;
  };
  const usedMarks = new Set<string>();

  const openings: ModelOpening[] = [];
  const flags: Flag[] = [];
  for (const label of kept) {
    const pick = placed.get(label) ?? null;
    const widthMm = pick ? pick.widthMm : label.size.widthMm!;
    const heightMm = pick ? pick.heightMm : label.size.heightMm!;
    const kind = label.size.kind ?? (heightMm >= DOOR_HEIGHT_MM ? "door" : "window");
    const own = sheet.marks
      .filter((m) => m.family === kind && !usedMarks.has(m.id) && apart([m.x, m.y], [label.x, label.y]) <= MARK_REACH_MM)
      .sort((a, b) => apart([a.x, a.y], [label.x, label.y]) - apart([b.x, b.y], [label.x, label.y]))[0];
    const mark = own?.id ?? freshMark(kind);
    usedMarks.add(mark);
    const lintel = lintelOf.get(label) ?? null;
    const glazing = sheet.text
      .filter((u) => GLAZING.test(u.s) && apart(at(u), [label.x, label.y]) <= WORDS_REACH_MM)
      .sort((a, b) => apart(at(a), [label.x, label.y]) - apart(at(b), [label.x, label.y]))[0];
    const ids = [label.t.id, ...(own ? [own.textId] : []), ...(lintel ? [lintel.t.id] : []), ...(glazing ? [glazing.id] : [])];
    const evidence: Evidence[] = [{ page: sheet.page, text: ids, method: "text" }];
    const fields: Record<string, string> = { source: PLAN_SIZE_SOURCE, size: label.t.s.trim() };
    if (glazing) fields.glazing = glazing.s.trim();
    const mid = pick ? (pick.gap.from + pick.gap.to) / 2 : 0;
    openings.push({
      mark,
      kind,
      widthMm,
      heightMm,
      sillMm: null,
      headMm: null,
      count: 1,
      fields,
      schedulePage: null,
      planPage: sheet.page,
      wall: pick
        ? {
            line: pick.line.id,
            external: pick.line.external,
            gapWidthMm: pick.gap.widthMm,
            x: Math.round((pick.line.orientation === "h" ? mid : pick.line.at) * 100) / 100,
            y: Math.round((pick.line.orientation === "h" ? pick.line.at : mid) * 100) / 100,
          }
        : null,
      lintel: lintel?.spec ?? null,
      sizeCheck: pick ? "ok" : "unchecked",
      evidence,
    });
    if (!pick) {
      flags.push({
        id: `plan-size-unchecked-${mark}`,
        level: "check",
        topic: "opening",
        message: `${mark} (${widthMm} wide × ${heightMm} high) is printed on the plan, but I couldn't find its gap in the walls I measured, so its width isn't double-checked. Check it on the plan.`,
        evidence,
      });
    }
  }
  if (openings.length) {
    const windows = openings.filter((o) => o.kind === "window").length;
    const doors = openings.length - windows;
    const said = [windows ? `${windows} window${windows === 1 ? "" : "s"}` : "", doors ? `${doors} door${doors === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
    flags.unshift({
      id: "plan-sizes",
      level: "info",
      topic: "opening",
      message: `These plans have no window or door schedule, so the sizes printed on the plan were used: ${said}. Numbers like W1 are the app's where the plan has none.`,
      evidence: [{ page: sheet.page, text: kept.map((l) => l.t.id), method: "text" }],
    });
  }
  return { openings, flags };
}

/**
 * The set has no scheduled windows or doors: read the sizes printed on the
 * plan the walls were measured on. Anything else is left as it is.
 */
export function withPlanSizes(model: BuildingModel, facts: readonly Pick<SheetFacts, "page" | "text" | "marks" | "walls">[]): BuildingModel {
  if (model.openings.length || !model.walls) return model;
  const sheet = facts.find((f) => f.page === model.walls!.page);
  if (!sheet?.walls) return model;
  const { openings, flags } = readPlanSizes({ page: sheet.page, text: sheet.text, marks: sheet.marks, walls: { ratio: sheet.walls.ratio, lines: sheet.walls.lines } });
  if (!openings.length) return model;
  return { ...model, openings, flags: [...model.flags, ...flags] };
}
