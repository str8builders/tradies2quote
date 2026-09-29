import "server-only";
// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — the set-level steps after every sheet has been read:
//   1. the sheet register (drawing list vs sheets found, revisions, drafts);
//   2. borrowed scales: a floor plan with too few dimensions of its own gets
//      its dimension-plan sibling's proven scale when their walls line up;
//   3. the building model (walls, openings, lintels, schedules, flags);
//   4. the AI reading of notes, sections and consent papers (cited).
// ─────────────────────────────────────────────────────────────────────────

import type { SheetRaw } from "./types";
import { openPlanPdf, type OpenPlanPdf } from "./pdf/read";
import { alignSheets } from "./measure/align";

import { buildRegister, type Register } from "./sheet/register";
import { PLAN_KINDS, readSheetWalls, type SheetFacts } from "./sheetFacts";
import { assembleModel } from "./model/assemble";
import type { BuildingModel } from "./model/types";
import { interpretPlanSet } from "./interpret/run";

export type SheetUpdate = { page: number; kind: string; building: string | null; scaleRatio: number | null; scaleBasis: string | null; facts: SheetFacts };

export type FinishResult = {
  register: Register;
  model: BuildingModel;
  sheetUpdates: SheetUpdate[];
  aiUsage: Record<string, unknown>;
};

export type FinishInput = {
  setId: string;
  userId: string;
  facts: SheetFacts[];
  pdf: Uint8Array;
  progress: (step: string) => Promise<void>;
};

/** The one plan scale a sheet prints ("1:100 @ A3", "Scale: 1:100"), or null if none or several. */
export function declaredRatio(notes: readonly string[]): number | null {
  const found = new Set<number>();
  for (const n of notes) for (const m of n.matchAll(/1\s*:\s*(\d+(?:\.\d+)?)/g)) {
    const v = Number(m[1]);
    if (v >= 20 && v <= 500) found.add(v);
  }
  return found.size === 1 ? [...found][0] : null;
}

/** Lintel labels further than this from an opening aren't paired with it (real mm). */
const LINTEL_REACH_MM = 2000;

export async function linkLintels(model: BuildingModel, facts: readonly SheetFacts[], raw: (page: number) => Promise<SheetRaw>): Promise<void> {
  const lintelPages = [...new Set(model.lintels.map((l) => l.page))];
  const planPages = [...new Set(model.openings.filter((o) => o.wall && o.planPage).map((o) => o.planPage!))];
  if (!lintelPages.length || !planPages.length) return;
  for (const lp of lintelPages) {
    const L = facts.find((f) => f.page === lp);
    if (!L) continue;
    for (const pp of planPages) {
      const align = alignSheets((await raw(lp)).fills, (await raw(pp)).fills);
      if (!align) continue;
      const k = facts.find((f) => f.page === pp)?.walls?.ratio ?? L.scale.ratio ?? 100;
      const pairs: Array<{ lintel: (typeof model.lintels)[number]; opening: (typeof model.openings)[number]; d: number }> = [];
      for (const lintel of model.lintels.filter((l) => l.page === lp)) {
        const mk = L.marks.find((m) => m.id === lintel.mark);
        if (!mk) continue;
        for (const opening of model.openings.filter((o) => o.planPage === pp && o.wall)) {
          const d = Math.hypot(opening.wall!.x - (mk.x + align.dx), opening.wall!.y - (mk.y + align.dy)) * k;
          if (d <= LINTEL_REACH_MM) pairs.push({ lintel, opening, d });
        }
      }
      const usedL = new Set<string>(), usedO = new Set<string>();
      for (const p of pairs.sort((a, b) => a.d - b.d)) {
        if (usedL.has(p.lintel.mark) || usedO.has(p.opening.mark)) continue;
        usedL.add(p.lintel.mark);
        usedO.add(p.opening.mark);
        p.lintel.opening = p.opening.mark;
        p.lintel.openingWidthMm = p.opening.widthMm ?? p.opening.wall!.gapWidthMm;
      }
      break;
    }
  }
}

/** The parts of a sheet the register needs (it doesn't use lines or fills). */
function asRaw(f: SheetFacts): SheetRaw {
  return { page: f.page, widthMm: f.widthMm, heightMm: f.heightMm, rotate: f.rotate, text: f.text, segs: [], fills: [], images: 0, imageCover: 0 };
}

export async function finishPlanSet(input: FinishInput): Promise<FinishResult> {
  const facts = input.facts.map((f) => ({ ...f }));
  const changed = new Set<number>();

  // 1. Register, and the kinds refined with the drawing list's names.
  const register = buildRegister(facts.map((f) => ({ page: f.page, sheet: asRaw(f), title: f.title })));
  for (const e of register.entries) {
    const f = facts.find((x) => x.page === e.page);
    if (f && (f.kind !== e.kind || f.building !== e.building)) {
      f.kind = e.kind;
      f.building = e.building;
      f.level = e.level;
      changed.add(f.page);
    }
  }

  // The PDF is opened again only if a step needs lines or fills.
  let pdf: OpenPlanPdf | null = null;
  const raws = new Map<number, SheetRaw>();
  const raw = async (page: number) => {
    pdf ??= await openPlanPdf(input.pdf);
    if (!raws.has(page)) raws.set(page, await pdf.readPage(page));
    return raws.get(page)!;
  };
  let model: BuildingModel;
  try {
    // 2. Borrowed scales for plan sheets that couldn't prove their own.
    await input.progress("Checking the scale on every plan");
    const unproven = facts.filter((f) => !f.document && !f.scale.ratio && PLAN_KINDS.has(f.kind));
    const proven = facts.filter((f) => !f.document && f.scale.ratio && PLAN_KINDS.has(f.kind));
    for (const f of proven.length ? unproven : []) {
      const mine = await raw(f.page);
      for (const p of proven) {
        const align = alignSheets(mine.fills, (await raw(p.page)).fills);
        if (!align) continue;
        const ratio = p.scale.ratio!;
        f.scale = { ...f.scale, ratio, basis: "sibling", conflicts: f.scale.conflicts };
        f.walls = readSheetWalls(mine, ratio);
        changed.add(f.page);
        break;
      }
    }

    // 2b. Still nothing proves a plan's scale: take the scale it PRINTS, but
    // only as an offer — the model asks the tradie before anything is priced.
    for (const f of facts.filter((x) => !x.document && !x.scale.ratio && PLAN_KINDS.has(x.kind))) {
      const declared = declaredRatio(f.title.scaleNotes);
      if (!declared) continue;
      f.scale = { ...f.scale, ratio: declared, basis: "declared" };
      f.walls = readSheetWalls(await raw(f.page), declared);
      changed.add(f.page);
    }

    // 3. The model from what the sheets say.
    await input.progress("Linking windows, doors and schedules");
    model = assembleModel(facts, register);

    // 3b. Which window or door each lintel sits over: line the lintel plan up
    // with the plan the openings were found on, and pair nearest first.
    await linkLintels(model, facts, raw);
  } finally {
    if (pdf) await (pdf as OpenPlanPdf).close();
  }

  // 4. The AI reading of the words on the plans (notes, sections, papers).
  await input.progress("Reading the notes, sections and consent papers");
  const ai = await interpretPlanSet({ facts, pdf: input.pdf, model, register });
  model = ai.model;

  const sheetUpdates: SheetUpdate[] = facts
    .filter((f) => changed.has(f.page))
    .map((f) => ({ page: f.page, kind: f.kind, building: f.building, scaleRatio: f.scale.ratio, scaleBasis: f.scale.basis, facts: f }));
  return { register, model, sheetUpdates, aiUsage: ai.usage };
}
