// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — windows and doors, linked three ways (pure).
//
// Each opening is linked three ways:
//   schedule row (W03: 1,415 × 1,115, sill 1,050)
//     ↔ its mark on the floor plan (where it is)
//     ↔ the gap in the wall next to that mark (what the plan actually draws).
// The schedule's width is checked against the measured gap — the second way.
// A schedule row with no mark on any plan is double-checked with a looser
// text search before it's reported, so a mark printed inside a longer
// label ("D04 - 2/240x45 SG8") is never reported missing.
// ─────────────────────────────────────────────────────────────────────────

import type { Evidence, TextItem } from "../types";
import type { Mark } from "../link/marks";
import type { Schedule } from "../link/tables";
import type { WallLine } from "../measure/walls";
import { parseDimensionLabel, parseSizePair } from "../sheet/text";
import type { Flag, ModelOpening } from "./types";

export type OpeningSheet = {
  page: number;
  marks: Mark[];
  text: TextItem[];
  /** Walls on this page with its proven scale, if read. */
  walls: { ratio: number; lines: WallLine[] } | null;
};

/** How far from its gap a mark may sit, real mm. */
const MARK_REACH_MM = 3000;
/** Schedule size vs measured gap: within this, it's the same opening. */
const SIZE_TOLERANCE_MM = 60;

const field = (fields: Record<string, string>, ...names: RegExp[]): string | null => {
  for (const [k, v] of Object.entries(fields)) if (names.some((n) => n.test(k)) && v.trim()) return v.trim();
  return null;
};

/** Width × height from a schedule row, whichever way it prints them. */
export function scheduleSize(fields: Record<string, string>): { widthMm: number | null; heightMm: number | null } {
  const pair = field(fields, /w\s*x\s*h/, /^size/, /opening size/, /dimensions?/);
  const parsed = pair ? parseSizePair(pair.replace(/\s*mm$/i, "")) : null;
  if (parsed) return parsed;
  const w = field(fields, /^width/, /^w$/);
  const h = field(fields, /^height/, /^h$/);
  return { widthMm: w ? parseDimensionLabel(w)?.mm ?? null : null, heightMm: h ? parseDimensionLabel(h)?.mm ?? null : null };
}

type Candidate = { idx: number; line: WallLine; gap: WallLine["gaps"][number]; widthMm: number; x: number; y: number; score: number };

export function readOpenings(schedules: readonly (Schedule & { page: number })[], sheets: readonly OpeningSheet[]): { openings: ModelOpening[]; flags: Flag[] } {
  const openings: ModelOpening[] = [];
  const flags: Flag[] = [];
  const planSheets = sheets.filter((s) => s.walls);
  const placedAt: Array<{ sheet: OpeningSheet; mark: Mark } | null> = [];

  // 1. Every scheduled window and door once (a schedule split over two tables
  //    can repeat a row; a repeat with a different size is worth a look).
  for (const sch of schedules) {
    if (sch.kind !== "windows" && sch.kind !== "doors") continue;
    for (const rec of sch.records) {
      const { widthMm, heightMm } = scheduleSize(rec.fields);
      const seen = openings.find((o) => o.mark === rec.mark);
      if (seen) {
        if (seen.widthMm !== widthMm || seen.heightMm !== heightMm) {
          flags.push({
            id: `opening-twice-${rec.mark}`,
            level: "check",
            topic: "opening",
            message: `${rec.mark} is scheduled twice with different sizes (${seen.widthMm} × ${seen.heightMm} and ${widthMm} × ${heightMm}).`,
            evidence: [...seen.evidence, { page: sch.page, text: rec.textIds, method: "table" }],
            rfi: `${rec.mark} appears twice in the schedules with different sizes — which is right?`,
          });
        }
        continue;
      }
      const sill = field(rec.fields, /sill/);
      const head = field(rec.fields, /head/);
      const qty = Number(field(rec.fields, /^qty/, /quantity/) ?? "1");
      const evidence: Evidence[] = [{ page: sch.page, text: rec.textIds, method: "table" }];
      let placed: { sheet: OpeningSheet; mark: Mark } | null = null;
      for (const s of planSheets.length ? planSheets : sheets) {
        const m = s.marks.find((mk) => mk.id === rec.mark);
        if (m) {
          placed = { sheet: s, mark: m };
          break;
        }
      }
      if (placed) evidence.push({ page: placed.sheet.page, text: [placed.mark.textId], method: "text" });
      else {
        const re = new RegExp(`(^|[^A-Za-z0-9])${escape(rec.mark)}([^0-9]|$)`);
        const loose = sheets.find((s) => s.text.some((t) => re.test(t.s)));
        if (loose) evidence.push({ page: loose.page, text: [loose.text.find((x) => re.test(x.s))!.id], method: "text" });
        else {
          flags.push({
            id: `opening-unplaced-${rec.mark}`,
            level: "check",
            topic: "opening",
            message: `${rec.mark} is in the ${sch.kind === "windows" ? "window" : "door"} schedule, but I couldn't find it on any plan.`,
            evidence,
            rfi: `${rec.mark} is scheduled but not shown on the plans — where does it go?`,
          });
        }
      }
      placedAt.push(placed);
      openings.push({
        mark: rec.mark,
        kind: sch.kind === "windows" ? "window" : "door",
        widthMm,
        heightMm,
        sillMm: sill ? parseDimensionLabel(sill)?.mm ?? (sill === "0" ? 0 : null) : null,
        headMm: head ? parseDimensionLabel(head)?.mm ?? null : null,
        count: Number.isFinite(qty) && qty > 0 ? qty : 1,
        fields: rec.fields,
        schedulePage: sch.page,
        planPage: placed?.sheet.page ?? null,
        wall: null,
        lintel: placed?.mark.spec ?? null,
        sizeCheck: "unchecked",
        evidence,
      });
    }
  }

  // 2. Pair marks with wall gaps, best pairs first, one opening per gap, so a
  //    door next to a wider door doesn't take its neighbour's gap.
  const candidates: Candidate[] = [];
  openings.forEach((o, idx) => {
    const p = placedAt[idx];
    if (p) candidates.push(...gapCandidates(idx, p.mark, p.sheet, o.widthMm));
  });
  const takenGap = new Set<WallLine["gaps"][number]>();
  const done = new Set<number>();
  for (const c of candidates.sort((a, b) => a.score - b.score)) {
    if (done.has(c.idx) || takenGap.has(c.gap)) continue;
    done.add(c.idx);
    takenGap.add(c.gap);
    const o = openings[c.idx];
    o.wall = { line: c.line.id, external: c.line.external, gapWidthMm: c.widthMm, x: c.x, y: c.y };
    const tolerance = o.kind === "door" ? DOOR_TOLERANCE_MM : SIZE_TOLERANCE_MM;
    o.sizeCheck = o.widthMm == null ? "unchecked" : Math.abs(c.widthMm - o.widthMm) <= tolerance ? "ok" : "differs";
    if (o.sizeCheck === "differs") {
      flags.push({
        id: `opening-size-${o.mark}`,
        level: "check",
        topic: "opening",
        message: `${o.mark}: the schedule says ${o.widthMm} wide, the gap drawn in the wall measures ${c.widthMm}.`,
        evidence: o.evidence,
        rfi: `${o.mark}: schedule width ${o.widthMm} mm vs ${c.widthMm} mm drawn — which is right?`,
      });
    }
  }
  return { openings, flags };
}

/**
 * Openings added later (read off a scanned schedule) get the same treatment:
 * find their marks on the plan sheets, pair them with wall gaps (best pairs
 * first, gaps already used by other openings excluded) and check the width.
 */
export function placeOpenings(openings: ModelOpening[], sheets: readonly OpeningSheet[]): Flag[] {
  const flags: Flag[] = [];
  const planSheets = sheets.filter((s) => s.walls);
  const taken = new Set<string>(openings.filter((o) => o.wall).map((o) => `${o.planPage}:${o.wall!.line}:${o.wall!.x}:${o.wall!.y}`));
  const candidates: Array<Candidate & { sheet: OpeningSheet }> = [];
  openings.forEach((o, idx) => {
    if (o.wall || o.planPage) return;
    for (const s of planSheets) {
      const m = s.marks.find((mk) => mk.id === o.mark);
      if (!m) continue;
      o.planPage = s.page;
      o.evidence.push({ page: s.page, text: [m.textId], method: "text" });
      if (m.spec && !o.lintel) o.lintel = m.spec;
      for (const c of gapCandidates(idx, m, s, o.widthMm)) candidates.push({ ...c, sheet: s });
      break;
    }
  });
  const done = new Set<number>();
  for (const c of candidates.sort((a, b) => a.score - b.score)) {
    const key = `${c.sheet.page}:${c.line.id}:${c.x}:${c.y}`;
    if (done.has(c.idx) || taken.has(key)) continue;
    done.add(c.idx);
    taken.add(key);
    const o = openings[c.idx];
    o.wall = { line: c.line.id, external: c.line.external, gapWidthMm: c.widthMm, x: c.x, y: c.y };
    const tolerance = o.kind === "door" ? DOOR_TOLERANCE_MM : SIZE_TOLERANCE_MM;
    o.sizeCheck = o.widthMm == null ? "unchecked" : Math.abs(c.widthMm - o.widthMm) <= tolerance ? "ok" : "differs";
    if (o.sizeCheck === "differs") {
      flags.push({ id: `opening-size-${o.mark}`, level: "check", topic: "opening", message: `${o.mark}: the schedule says ${o.widthMm} wide, the gap drawn in the wall measures ${c.widthMm}.`, evidence: o.evidence, rfi: `${o.mark}: schedule width ${o.widthMm} mm vs ${c.widthMm} mm drawn — which is right?` });
    }
  }
  return flags;
}

/** Gaps narrower than this are wall junctions, not openings (real mm). */
const MIN_OPENING_MM = 400;
/** A door schedule often gives the frame and the plan the leaf: allow more. */
const DOOR_TOLERANCE_MM = 120;

function gapCandidates(idx: number, mark: Mark, sheet: OpeningSheet, widthMm: number | null): Candidate[] {
  if (!sheet.walls) return [];
  const k = sheet.walls.ratio;
  const out: Candidate[] = [];
  for (const line of sheet.walls.lines) {
    for (const g of line.gaps) {
      if (g.widthMm < MIN_OPENING_MM) continue;
      // Distance from the mark to the gap itself (a wide garage door's mark
      // sits over one end, not the middle).
      const along = line.orientation === "h" ? mark.x : mark.y;
      const across = line.orientation === "h" ? mark.y : mark.x;
      const nearest = Math.min(Math.max(along, g.from), g.to);
      const dist = Math.hypot(nearest - along, line.at - across) * k;
      if (dist > MARK_REACH_MM) continue;
      // A gap 40% off the scheduled width is some other opening (a cavity
      // slider has no gap at all) — don't pair it and then cry "mismatch".
      if (widthMm != null && Math.abs(g.widthMm - widthMm) / widthMm > 0.4) continue;
      const sizePenalty = widthMm == null ? 0 : Math.min(Math.abs(g.widthMm - widthMm), 2000);
      const mid = (g.from + g.to) / 2;
      const [x, y] = line.orientation === "h" ? [mid, line.at] : [line.at, mid];
      out.push({ idx, line, gap: g, widthMm: g.widthMm, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, score: dist + sizePenalty * 2 });
    }
  }
  return out;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
