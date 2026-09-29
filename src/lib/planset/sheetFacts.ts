// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — everything read off ONE sheet (pure).
//
// Deterministic only: sheet number and title, what kind of sheet it is,
// the dimensions and the scale they prove, the walls (plan sheets with a
// proven scale), the marks, the schedules and the drawing list. Stored per
// page (plan_set_sheets.facts); the set-level steps (sibling scales, the
// register, the AI reading of notes, the building model) work from these.
// ─────────────────────────────────────────────────────────────────────────

import type { SheetRaw, TextItem } from "./types";
import { readTitleBlock, type SheetTitle } from "./sheet/titleBlock";
import { classifySheet, type SheetKind } from "./sheet/classify";
import { readDrawingIndex, type IndexEntry } from "./sheet/register";
import { buildChains, checkChains, proveScaleBar, proveScales, readDimensions, type ScaleProof } from "./measure/dimensions";
import { readWalls, type WallLine } from "./measure/walls";
import { REMOVE_COLOUR, wallStripsFromLines } from "./measure/lineWalls";
import { readMarks, type Mark } from "./link/marks";
import { readSchedules, type Schedule } from "./link/tables";

/** Sheet kinds that draw the building's walls in plan. */
export const PLAN_KINDS: ReadonlySet<SheetKind> = new Set<SheetKind>(["floor_plan", "dimension_plan", "bracing_plan", "lintel_plan", "framing_plan", "structural_plan"]);

export type ChainSummary = { orientation: "h" | "v"; sumMm: number; overallMm: number; ok: boolean; textIds: number[] };

export type SheetWalls = {
  ratio: number;
  /** "fills" (filled strips) or "lines" (parallel line pairs). */
  source: "fills" | "lines";
  lines: WallLine[];
  /** Dashed pairs: walls to be removed (renovations). Never priced. */
  removed: WallLine[];
  externalLengthMm: number;
  internalLengthMm: number;
  enclosedAreaM2: number | null;
  extent: [number, number, number, number] | null;
};

export type SheetFacts = {
  page: number;
  widthMm: number;
  heightMm: number;
  rotate: number;
  title: SheetTitle;
  kind: SheetKind;
  building: string | null;
  level: string | null;
  kindConfidence: number;
  document: boolean;
  /** Nothing readable as text: a scan, or text drawn as shapes. */
  unreadable: boolean;
  scale: {
    proofs: ScaleProof[];
    /** The sheet's working scale (real mm per page mm), when proven. */
    ratio: number | null;
    basis: "dimensions" | "scale_bar" | "sibling" | "declared" | null;
    /** A printed scale that disagrees with the proof, e.g. "1:84.8036 @ A3". */
    conflicts: string[];
  };
  dimensions: { count: number; withLine: number; approx: number; chains: ChainSummary[] };
  walls: SheetWalls | null;
  marks: Mark[];
  schedules: Schedule[];
  index: IndexEntry[] | null;
  /** Every text run, for evidence and for the AI reading. */
  text: TextItem[];
};

/**
 * The walls on a plan sheet at its proven scale: filled strips first; if
 * the drafter drew walls as line pairs instead, those.
 */
export function readSheetWalls(raw: Pick<SheetRaw, "fills" | "segs">, ratio: number): SheetWalls | null {
  const filled = readWalls(raw.fills, { ratio });
  if (filled.lines.length >= 4) {
    return { ratio, source: "fills", lines: filled.lines, removed: [], externalLengthMm: filled.externalLengthMm, internalLengthMm: filled.internalLengthMm, enclosedAreaM2: filled.enclosedAreaM2, extent: filled.extent };
  }
  const strips = wallStripsFromLines(raw.segs, ratio);
  const keep = readWalls(strips.filter((s) => s.c !== REMOVE_COLOUR), { ratio });
  if (keep.lines.length < 4) return null;
  const removed = readWalls(strips.filter((s) => s.c === REMOVE_COLOUR), { ratio }).lines;
  return { ratio, source: "lines", lines: keep.lines, removed, externalLengthMm: keep.externalLengthMm, internalLengthMm: keep.internalLengthMm, enclosedAreaM2: keep.enclosedAreaM2, extent: keep.extent };
}

/** Is this page paperwork rather than a drawing? */
export function isDocumentPage(raw: Pick<SheetRaw, "widthMm" | "heightMm" | "text">): boolean {
  const portraitA4 = raw.widthMm < 230 && raw.heightMm > 280 && raw.heightMm < 310;
  if (!portraitA4) return false;
  const words = raw.text.reduce((n, t) => n + t.s.split(/\s+/).length, 0);
  return words > 80;
}

/** A printed "1:N" that the proven ratio contradicts. */
export function scaleConflicts(notes: readonly string[], ratio: number | null): string[] {
  if (!ratio) return [];
  const out: string[] = [];
  for (const note of notes) {
    // "1:1" is how schedules and not-to-scale sheets are labelled — not a claim about a drawing.
    const printed = [...note.matchAll(/1\s*:\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])).filter((p) => p > 1);
    // "1:100, 1:10" (plan + details) is fine when one of them is the proven scale.
    if (printed.length && !printed.some((p) => Math.abs(p - ratio) / ratio <= 0.01)) out.push(note);
  }
  return out;
}

export function readSheetFacts(raw: SheetRaw): SheetFacts {
  const title = readTitleBlock(raw);
  const document = isDocumentPage(raw);
  const cls = classifySheet({ title: title.title, indexName: null, sheet: raw, document });
  const unreadable = raw.text.length < 30 && (raw.imageCover > 0.6 || raw.segs.length > 2000);

  const dims = readDimensions(raw);
  const proofs = document ? [] : proveScales(dims, (id) => raw.text[id]);
  const byDims = proofs[0] && proofs[0].share >= 0.3 ? proofs[0] : null;
  const bar = byDims || document ? null : proveScaleBar(raw.text);
  const main = byDims ?? bar;
  const chains = buildChains(dims);
  const checks = checkChains(chains, dims);

  const walls = main && PLAN_KINDS.has(cls.kind) && main.ratio >= 20 && main.ratio <= 500 ? readSheetWalls(raw, main.ratio) : null;

  return {
    page: raw.page,
    widthMm: raw.widthMm,
    heightMm: raw.heightMm,
    rotate: raw.rotate,
    title,
    kind: cls.kind,
    building: cls.building,
    level: cls.level,
    kindConfidence: cls.confidence,
    document,
    unreadable,
    scale: { proofs: bar ? [bar] : proofs, ratio: main?.ratio ?? null, basis: byDims ? "dimensions" : bar ? "scale_bar" : null, conflicts: scaleConflicts(title.scaleNotes, main?.ratio ?? null) },
    dimensions: {
      count: dims.length,
      withLine: dims.filter((d) => d.line).length,
      approx: dims.filter((d) => d.approx).length,
      chains: checks.map((c) => ({
        orientation: c.chain.orientation,
        sumMm: c.chain.sumMm,
        overallMm: c.overall.mm,
        ok: c.ok,
        textIds: [...c.chain.parts.map((p) => p.textId), c.overall.textId],
      })),
    },
    walls,
    marks: document ? [] : readMarks(raw),
    schedules: document ? [] : readSchedules(raw),
    index: readDrawingIndex(raw),
    text: raw.text,
  };
}
