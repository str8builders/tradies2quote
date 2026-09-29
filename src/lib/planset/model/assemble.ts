// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — put the building together from every sheet (pure).
//
// Deterministic facts only (the AI reading of notes, sections and consent
// papers is merged in afterwards by interpret/merge.ts). Every cross-check
// that fails becomes a flag in plain words, with the sheets it came from.
// ─────────────────────────────────────────────────────────────────────────

import type { Evidence, TextItem } from "../types";
import { PLAN_KINDS, type SheetFacts } from "../sheetFacts";
import type { Register } from "../sheet/register";
import { readOpenings } from "./openings";
import type { BuildingModel, Fact, Flag, ModelLintel, ModelScheduleRow, ModelWalls, ProjectKind } from "./types";

export const PRICE_ALL_WALLS = "Price all the walls shown";
export const ENTER_NEW_WALLS = "I'll enter the new wall lengths";

/** Which plan sheet the walls are measured on: the one with the most proof. */
export function mainPlanSheet(facts: readonly SheetFacts[]): SheetFacts | null {
  const withWalls = facts.filter((f) => f.walls && f.walls.lines.length >= 4 && (f.kind === "dimension_plan" || f.kind === "floor_plan"));
  if (!withWalls.length) return null;
  const score = (f: SheetFacts) => (f.scale.basis === "declared" ? 0 : 100_000) + (f.kind === "dimension_plan" ? 2 : 1) * 1000 + (f.scale.proofs[0]?.count ?? 0) + (f.walls?.lines.length ?? 0);
  return [...withWalls].sort((a, b) => score(b) - score(a))[0];
}

/** Floor areas printed on the plans: "Ground Floor (O/Frame) = 193.3m²", "170m² floor area". */
export function printedFloorAreas(sheet: Pick<SheetFacts, "page" | "text">): Array<{ m2: number; label: string; evidence: Evidence }> {
  const out: Array<{ m2: number; label: string; evidence: Evidence }> = [];
  const items = sheet.text;
  for (const t of items) {
    const m = t.s.match(/(\d{2,4}(?:\.\d{1,2})?)\s*m(?:²|2)(?![A-Za-z0-9])/i);
    if (!m) continue;
    const m2 = Number(m[1]);
    if (!(m2 >= 10 && m2 <= 5000)) continue;
    // The label is in the same run ("Floor area 170m²") or the nearest run to
    // its left on the same line ("Ground Floor" | "= 193.3m²").
    const own = t.s.replace(m[0], "").replace(/[=:()\s]/g, "");
    const left = items
      .filter((o) => o !== t && Math.abs(o.y - t.y) <= Math.max(t.h, 2) && o.x < t.x && t.x - o.x < 80)
      .sort((a, b) => b.x - a.x)[0];
    const near = own.length >= 3 || !left ? [] : [left];
    const label = `${near.map((o) => o.s).join(" ")} ${t.s}`.trim();
    if (/roof|site|deck|lot\b|section|landscap|garage only|catchment|coverage|imperv|paved|drive|hard surface|storm|soak/i.test(label)) continue;
    if (!/floor|dwelling|gfa|gross|building area|house area/i.test(label)) continue;
    out.push({ m2, label, evidence: { page: sheet.page, text: [t.id, ...near.map((o) => o.id)], method: "text" } });
  }
  return out;
}

/** A roof area printed on the plans: "Roof Plan = 227.1m²". */
export function printedRoofArea(sheet: Pick<SheetFacts, "page" | "text">): { m2: number; label: string; evidence: Evidence } | null {
  for (const t of sheet.text) {
    const m = t.s.match(/roof[^=:]{0,20}[=:]\s*(\d{2,4}(?:\.\d{1,2})?)\s*m(?:²|2)(?![A-Za-z0-9])/i);
    if (m) return { m2: Number(m[1]), label: t.s, evidence: { page: sheet.page, text: [t.id], method: "text" } };
  }
  return null;
}

/** The walls of one plan sheet as a model fact set (printed area checked when given). */
function wallsFrom(main: SheetFacts, printed: ReturnType<typeof printedFloorAreas>, flags: Flag[] | null): ModelWalls | null {
  if (!main.walls) return null;
  const ev: Evidence[] = [{ page: main.page, box: main.walls.extent ?? undefined, method: "geometry" }];
  // The area printed on the sheet that was measured beats one from another
  // sheet (an alteration prints the existing and the new floor areas).
  const printedMain = printed.find((p) => p.evidence.page === main.page) ?? printed[0] ?? null;
  let areaStatus: "checked" | "needs_check" | "read" = "read";
  if (printedMain && main.walls.enclosedAreaM2) {
    const diff = Math.abs(printedMain.m2 - main.walls.enclosedAreaM2) / printedMain.m2;
    areaStatus = diff <= 0.015 ? "checked" : "needs_check";
    if (areaStatus === "needs_check" && flags) {
      flags.push({
        id: "area-mismatch",
        level: "check",
        topic: "area",
        message: `The walls enclose ${main.walls.enclosedAreaM2} m², but the plans print ${printedMain.m2} m² ("${printedMain.label}"). Check which areas the printed figure includes.`,
        evidence: [...ev, printedMain.evidence],
        question: { kind: "number", prompt: "Floor area to price from", unit: "m²" },
      });
    }
  }
  return {
    page: main.page,
    ratio: main.walls.ratio,
    scaleBasis: main.scale.basis ?? "dimensions",
    externalLengthMm: fact(main.walls.externalLengthMm, "read", ev),
    internalLengthMm: fact(main.walls.internalLengthMm, "read", ev),
    enclosedAreaM2: main.walls.enclosedAreaM2 == null ? null : fact(main.walls.enclosedAreaM2, areaStatus, printedMain ? [...ev, printedMain.evidence] : ev),
    printedAreaM2: printedMain ? fact(printedMain.m2, "read", [printedMain.evidence], printedMain.label) : null,
    lines: main.walls.lines,
  };
}

function fact<T>(value: T, status: Fact<T>["status"], evidence: Evidence[], note?: string): Fact<T> {
  return note ? { value, status, evidence, note } : { value, status, evidence };
}

/**
 * New build, alteration or addition — from how the set NAMES the project
 * (big text: title blocks, sheet titles), never from notes, where "existing
 * ground" and "in addition" are everywhere.
 */
export function projectKind(facts: readonly Pick<SheetFacts, "document" | "title" | "text">[]): ProjectKind {
  const drawings = facts.filter((f) => !f.document);
  // Title-sized text: clearly bigger than the sheet's body text, and short
  // (an A1 sheet's notes are 3.5 mm high and say "in addition to this clause").
  const titles = drawings.flatMap((f) => {
    const heights = f.text.map((t: TextItem) => t.h).sort((a, b) => a - b);
    const median = heights[heights.length >> 1] ?? 0;
    return [f.title.title ?? "", ...f.text.filter((t: TextItem) => t.h >= median * 1.6 && t.s.length <= 80).map((t) => t.s)];
  });
  const count = (re: RegExp) => titles.filter((t) => re.test(t)).length;
  const newBuild = count(/\bnew (build|dwelling|house|home|residence)\b|\bproposed (new )?dwelling\b/i);
  const alteration = count(/\balteration(s)?\b|\brenovation\b|\brefurbishment\b/i);
  const addition = count(/\baddition(s)?\b|\bextension\b|\bnew addition\b/i);
  if (!newBuild && !alteration && !addition) return "unknown";
  if (newBuild >= alteration && newBuild >= addition) return "new_build";
  return addition > alteration ? "addition" : "alteration";
}

export function assembleModel(facts: readonly SheetFacts[], register: Register): BuildingModel {
  const flags: Flag[] = [];
  const drawings = facts.filter((f) => !f.document);
  // Council stamps are usually pictures, not text: the consent number comes
  // from a stamp that happens to be text, else from the consent papers (Form 5).
  const approvedPages = drawings.filter((f) => f.title.consent.approved);
  const consentNumber = approvedPages.find((f) => f.title.consent.number)?.title.consent.number ?? register.consent?.number ?? null;
  const authority = approvedPages.find((f) => f.title.consent.authority)?.title.consent.authority ?? register.consent?.authority ?? null;
  const consentSource: BuildingModel["project"]["consentSource"] = approvedPages.length ? "stamp" : register.consent?.number ? "papers" : null;

  // ── walls and floor area ──
  const printed = facts.flatMap((f) => (f.document ? [] : printedFloorAreas(f)));
  const main = mainPlanSheet(facts);
  const walls: ModelWalls | null = main ? wallsFrom(main, printed, flags) : null;
  if (main && walls && main.scale.basis === "declared") {
    const name = main.title.sheetId ?? `page ${main.page}`;
    flags.push({
      id: "declared-scale",
      level: "blocker",
      topic: "scale",
      message: `No sheet in this set proves its scale (${name} has no dimensions or scale bar to check against). It prints 1:${main.scale.ratio}; measured at that, the walls come to ${(walls.externalLengthMm.value / 1000).toFixed(1)} m outside and ${(walls.internalLengthMm.value / 1000).toFixed(1)} m inside.`,
      evidence: [{ page: main.page, text: main.title.textIds, method: "text" }],
      question: { kind: "confirm", prompt: `Measure at the printed 1:${main.scale.ratio}? (No = type the wall lengths yourself.)` },
    });
  }
  if (!walls && drawings.length) {
    flags.push({
      id: "no-walls",
      level: "info",
      topic: "scale",
      message: "I couldn't measure the walls: no floor plan in this set has a scale I could prove or a printed scale to offer. Type the wall lengths in instead.",
      evidence: [],
    });
  }
  const wallsByBuilding: Record<string, ModelWalls> = {};
  for (const b of register.buildings) {
    const own = mainPlanSheet(facts.filter((f) => f.building === b));
    const w = own ? wallsFrom(own, [], null) : null;
    if (w) wallsByBuilding[b] = w;
  }

  // ── openings, lintels, other schedules ──
  const schedules = facts.flatMap((f) => f.schedules.map((s) => ({ ...s, page: f.page })));
  const openingSheets = facts
    .filter((f) => !f.document)
    .map((f) => ({ page: f.page, marks: f.marks, text: f.text, walls: f.walls ? { ratio: f.walls.ratio, lines: f.walls.lines } : null }));
  const { openings, flags: openingFlags } = readOpenings(schedules, openingSheets);
  flags.push(...openingFlags);

  const lintels: ModelLintel[] = [];
  const seenLintel = new Set<string>();
  for (const f of facts) {
    for (const m of f.marks) {
      if (m.family !== "lintel" || !m.spec || seenLintel.has(m.id)) continue;
      seenLintel.add(m.id);
      lintels.push({ mark: m.id, spec: m.spec, page: f.page, evidence: [{ page: f.page, text: [m.textId], method: "text" }] });
    }
  }
  lintels.sort((a, b) => Number(a.mark.slice(1)) - Number(b.mark.slice(1)));

  const other: Record<string, ModelScheduleRow[]> = {};
  for (const s of schedules) {
    if (s.kind === "windows" || s.kind === "doors" || s.kind === "drawing_list" || s.kind === "reference_standard") continue;
    for (const r of s.records) (other[s.kind] ??= []).push({ mark: r.mark, fields: r.fields, page: s.page, title: s.title });
  }

  // ── sheet-level checks ──
  for (const f of drawings) {
    const name = f.title.sheetId ?? `page ${f.page}`;
    for (const c of f.dimensions.chains.filter((c) => !c.ok)) {
      flags.push({
        id: `chain-${f.page}-${c.textIds[0]}`,
        level: "check",
        topic: "dimensions",
        message: `On ${name}, a row of dimensions adds up to ${c.sumMm.toLocaleString("en-NZ")} but the overall says ${c.overallMm.toLocaleString("en-NZ")}.`,
        evidence: [{ page: f.page, text: c.textIds, method: "text" }],
        rfi: `${name}: dimension string totals ${c.sumMm} mm but the overall dimension is ${c.overallMm} mm — which is correct?`,
      });
    }
    for (const note of PLAN_KINDS.has(f.kind) ? f.scale.conflicts : []) {
      flags.push({
        id: `scale-${f.page}`,
        level: "info",
        topic: "scale",
        message: `${name} prints "${note}", but its own dimensions measure 1:${f.scale.ratio}. I used 1:${f.scale.ratio}.`,
        evidence: [{ page: f.page, text: f.title.textIds, method: "text" }],
      });
    }
    if (f.title.draft) {
      flags.push({ id: `draft-${f.page}`, level: "check", topic: "draft", message: `${name} is marked as a draft. Make sure you're pricing the consented version.`, evidence: [{ page: f.page, method: "text" }] });
    }
    if (f.unreadable) {
      flags.push({
        id: `unreadable-${f.page}`,
        level: "info",
        topic: "unreadable",
        message: `${name} is a scan or photo (no text to read directly). Two AIs read it separately and only what both read the same way is kept; nothing is measured off it.`,
        evidence: [{ page: f.page, method: "text" }],
      });
    }
    if (f.dimensions.approx > 0 && (f.kind === "floor_plan" || f.kind === "dimension_plan")) {
      flags.push({ id: `approx-${f.page}`, level: "info", topic: "approximate", message: `${name} marks ${f.dimensions.approx} dimension${f.dimensions.approx === 1 ? "" : "s"} as approximate (±). Check those on site.`, evidence: [{ page: f.page, method: "text" }] });
    }
  }
  for (const m of register.missing) {
    flags.push({ id: `missing-${m.sheetId}`, level: "check", topic: "missing_sheet", message: `The drawing list includes ${m.sheetId} (${m.name}), but it isn't in this PDF.`, evidence: [], rfi: `Sheet ${m.sheetId} (${m.name}) is listed but wasn't supplied — please send it.` });
  }
  if (register.mixedRevisions) {
    flags.push({ id: "revisions", level: "info", topic: "revision", message: `Sheets carry different revisions (${register.revisions.join(", ")}). Normal for a consented set, but check the one you price from is the latest.`, evidence: [] });
  }
  const kind = projectKind(facts);
  if (kind === "alteration" || kind === "addition") {
    flags.push({
      id: "renovation",
      level: "blocker",
      topic: "renovation",
      message: "This is an alteration or addition, so the plans show existing walls as well as new ones. Only new work gets priced.",
      evidence: [],
      question: { kind: "choice", prompt: "How should I price the walls?", options: [PRICE_ALL_WALLS, ENTER_NEW_WALLS] },
    });
  }
  if (register.buildings.length > 1) {
    flags.push({
      id: "buildings",
      level: "blocker",
      topic: "building",
      message: `This set covers ${register.buildings.length} buildings: ${register.buildings.join(", ")}.`,
      evidence: [],
      question: { kind: "choice", prompt: "Which building are you quoting?", options: [...register.buildings, "All of them"] },
    });
  }

  return {
    version: 1,
    project: { kind, buildings: register.buildings, consentNumber, authority, approved: consentSource !== null, consentSource },
    sheets: {
      total: facts.length,
      drawings: drawings.length,
      documents: facts.length - drawings.length,
      provenScale: drawings.filter((f) => f.scale.ratio).length,
      unreadable: drawings.filter((f) => f.unreadable).length,
    },
    walls,
    wallsByBuilding,
    openings,
    lintels,
    schedules: other,
    specs: {},
    heights: { studMm: null, ceilingMm: null },
    roof: {
      pitchDeg: null,
      areaM2: (() => {
        const r = facts.map((f) => (f.document ? null : printedRoofArea(f))).find((x) => x);
        return r ? fact(r.m2, "read", [r.evidence], `Printed on the plans: "${r.label}" (read as the roof's plan area).`) : null;
      })(),
      material: null,
    },
    zones: { wind: null, earthquake: null, exposure: null, snow: null },
    consent: { inspections: [], documents: [], conditions: [] },
    rooms: [],
    legend: [],
    byOthers: [],
    ai: { sheetsRead: 0, itemsKept: 0, itemsDropped: 0, skipped: null },
    flags,
  };
}
