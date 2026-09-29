// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — the tradie's answers and corrections (pure).
//
// Answers are stored as a flat map (plan_sets.answers):
//   "flag:<flag id>"            → the answer to that flag's question
//   "set:stud_mm" …             → a value the tradie typed over the reader's
//   "set:opening:<mark>:width_mm" / ":height_mm" / ":count"
//   "building"                  → which building of a multi-building set
// applyAnswers() turns (model + answers) into the model materials are
// worked out from: corrected facts become status "tradie", answered flags
// are resolved, and what's still open is listed.
// ─────────────────────────────────────────────────────────────────────────

import type { BuildingModel, Fact, Flag } from "./types";

export type AnswerValue = string | number | boolean;
export type Answers = Record<string, AnswerValue>;

const KEY = /^(flag:[A-Za-z0-9_.:-]{1,80}|set:[a-z_]{1,40}|set:opening:[A-Za-z0-9]{1,8}:(width_mm|height_mm|count)|building)$/;

/** Keep only well-formed answers (a hostile or stale client can't store junk). */
export function sanitizeAnswers(input: unknown): Answers | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: Answers = {};
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > 300) return null;
  for (const [k, v] of entries) {
    if (!KEY.test(k)) return null;
    if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e7) out[k] = v;
    else if (typeof v === "string" && v.length <= 200) out[k] = v.trim();
    else return null;
  }
  return out;
}

export type ResolvedFlag = Flag & { answer?: AnswerValue; resolved: boolean };
export type EffectiveModel = Omit<BuildingModel, "flags"> & {
  flags: ResolvedFlag[];
  chosenBuilding: string | null;
  /** Alterations: price every wall shown, or only the new lengths the tradie enters. */
  renovation: "all" | "enter" | null;
};

const num = (v: AnswerValue | undefined): number | null => (typeof v === "number" && v > 0 ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v) && Number(v) > 0 ? Number(v) : null);
/** Lengths may be 0 ("no new outside walls"). */
const num0 = (v: AnswerValue | undefined): number | null => (typeof v === "number" && v >= 0 ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
const tradie = <T>(value: T, was: Fact<T> | null): Fact<T> => ({ value, status: "tradie", evidence: was?.evidence ?? [], note: was ? `Was ${String(was.value)} from the plans.` : undefined });

export function applyAnswers(model: BuildingModel, answers: Answers): EffectiveModel {
  const m: EffectiveModel = {
    ...model,
    heights: { ...model.heights },
    roof: { ...model.roof },
    walls: model.walls ? { ...model.walls } : null,
    openings: model.openings.map((o) => ({ ...o })),
    flags: model.flags.map((f) => ({ ...f, resolved: false })),
    chosenBuilding: typeof answers.building === "string" ? answers.building : null,
    renovation: null,
  };
  // Answers to flag questions.
  for (const f of m.flags) {
    const a = answers[`flag:${f.id}`];
    if (a === undefined || a === "") continue;
    f.answer = a;
    f.resolved = true;
    if (f.id === "stud-height" && num(a)) m.heights.studMm = tradie(num(a)!, m.heights.studMm);
    if (f.id === "ceiling-height" && num(a)) m.heights.ceilingMm = tradie(num(a)!, m.heights.ceilingMm);
    if (f.id === "roof-pitch" && num(a)) m.roof.pitchDeg = tradie(num(a)!, m.roof.pitchDeg);
    if (f.id === "buildings" && typeof a === "string") m.chosenBuilding = a;
    if (f.id === "renovation" && typeof a === "string") m.renovation = /enter/i.test(a) ? "enter" : "all";
    if (f.id === "area-mismatch" && num(a) && m.walls) m.walls.enclosedAreaM2 = tradie(num(a)!, m.walls.enclosedAreaM2);
    if (f.id === "declared-scale" && a === false) m.walls = null;
  }
  // A multi-building set: measure the chosen building's own plan.
  if (m.chosenBuilding && model.wallsByBuilding?.[m.chosenBuilding]) m.walls = { ...model.wallsByBuilding[m.chosenBuilding] };

  // Values typed over the reader's.
  const stud = num(answers["set:stud_mm"]);
  if (stud) m.heights.studMm = tradie(stud, m.heights.studMm);
  const ceiling = num(answers["set:ceiling_mm"]);
  if (ceiling) m.heights.ceilingMm = tradie(ceiling, m.heights.ceilingMm);
  const pitch = num(answers["set:pitch_deg"]);
  if (pitch) m.roof.pitchDeg = tradie(pitch, m.roof.pitchDeg);
  const roofArea = num(answers["set:roof_area_m2"]);
  if (roofArea) m.roof.areaM2 = tradie(roofArea, m.roof.areaM2);
  // No measurable walls: the tradie's own lengths stand in for them.
  if (!m.walls && num0(answers["set:external_wall_mm"]) !== null && num0(answers["set:internal_wall_mm"]) !== null) {
    m.walls = {
      page: 0,
      ratio: 0,
      scaleBasis: "tradie",
      externalLengthMm: tradie(num0(answers["set:external_wall_mm"])!, null),
      internalLengthMm: tradie(num0(answers["set:internal_wall_mm"])!, null),
      enclosedAreaM2: null,
      printedAreaM2: null,
      lines: [],
    };
  }
  if (m.walls) {
    const ext = num0(answers["set:external_wall_mm"]);
    if (ext !== null) m.walls.externalLengthMm = tradie(ext, m.walls.externalLengthMm);
    const int = num0(answers["set:internal_wall_mm"]);
    if (int !== null) m.walls.internalLengthMm = tradie(int, m.walls.internalLengthMm);
    const area = num(answers["set:floor_area_m2"]);
    if (area) m.walls.enclosedAreaM2 = tradie(area, m.walls.enclosedAreaM2);
  }
  for (const o of m.openings) {
    const w = num(answers[`set:opening:${o.mark}:width_mm`]);
    const h = num(answers[`set:opening:${o.mark}:height_mm`]);
    const c = num(answers[`set:opening:${o.mark}:count`]);
    if (w) o.widthMm = w;
    if (h) o.heightMm = h;
    if (c) o.count = Math.round(c);
    if (w || h) o.sizeCheck = "ok";
  }
  // A flag about a value the tradie has since typed in is settled too.
  const settledBy: Record<string, string> = { "stud-height": "set:stud_mm", "ceiling-height": "set:ceiling_mm", "roof-pitch": "set:pitch_deg", "area-mismatch": "set:floor_area_m2" };
  for (const f of m.flags) if (!f.resolved && settledBy[f.id] && answers[settledBy[f.id]] !== undefined) f.resolved = true;
  for (const f of m.flags) {
    if (f.resolved) continue;
    const mark = f.id.match(/^opening-size-(.+)$/)?.[1];
    if (mark && answers[`set:opening:${mark}:width_mm`] !== undefined) f.resolved = true;
  }
  return m;
}

/** Blockers still unanswered: materials can't be worked out until these are. */
export function openBlockers(m: EffectiveModel): ResolvedFlag[] {
  return m.flags.filter((f) => f.level === "blocker" && !f.resolved);
}
