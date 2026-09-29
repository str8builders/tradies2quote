// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — the materials list from the checked building (pure).
//
// The AI read the plans; the tradie checked the model; THIS is code:
//   - framing: the app's wall calculator (calculateMaterialTakeoff), run
//     per wall so every wall gets its own end studs and its own openings;
//   - wall linings, wall insulation, skirting, architraves: the same
//     calculator over the whole run, outside walls split out (one lined
//     face, insulated) — its tested exterior/interior rule;
//   - joinery and lintels: straight from the schedules and the lintel plan;
//   - ceilings, cladding, roofing, slab: areas from the model, in m² / m³,
//     so they're only priced where the tradie's library prices that unit.
// Nothing is guessed: a missing input is a blocker with a question, and
// every estimating default is listed as an assumption.
// ─────────────────────────────────────────────────────────────────────────

import { calculateMaterialTakeoff, type MaterialTakeoffLine } from "@/lib/materialCalculator";
import { roofAreaFromPitch } from "@/lib/takeoff/normalise";
import type { Evidence } from "../types";
import type { EffectiveModel } from "../model/answers";
import type { Question } from "../model/types";

export type TakeoffGroup = "Framing" | "Linings" | "Insulation" | "Finishing" | "Joinery" | "Lintels" | "Cladding" | "Roofing" | "Slab";

export type PlanTakeoffLine = {
  id: string;
  group: TakeoffGroup;
  name: string;
  quantity: number;
  unit: string;
  /** The working, in words and numbers. */
  formula: string;
  status: "ok" | "assumed" | "needs_review";
  notes?: string;
  priceMatchKey?: string;
  evidence: Evidence[];
};

export type TakeoffBlocker = {
  id: string;
  message: string;
  question?: Question;
  /** Where the answer is saved ("set:stud_mm"); flag answers use "flag:<id>". */
  answerKey?: string;
};

export type PlanTakeoff = {
  lines: PlanTakeoffLine[];
  blockers: TakeoffBlocker[];
  assumptions: string[];
  /** Items the plans say are by others — listed, not priced. */
  byOthers: string[];
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const WASTE = 10;

function specNumber(m: EffectiveModel, topic: string, re: RegExp): { value: number; evidence: Evidence[] } | null {
  for (const f of m.specs[topic] ?? []) {
    const hit = f.value.match(re);
    if (hit) return { value: Number(hit[1]), evidence: f.evidence };
  }
  return null;
}

const specText = (m: EffectiveModel, topic: string) => (m.specs[topic] ?? []).map((f) => f.value);

export type SpacingChoice = { spacingMm: number; note: string | null; covered: boolean };

/**
 * Stud centres from the plans' notes. Notes often give bands — "Studs up to
 * 2.4m 90x45 at 600mm ctrs. Studs up to 3.3m 90x45 at 400mm ctrs." — so the
 * band that covers the actual stud height is the one that applies (a 2,460
 * stud is NOT in the 2.4 m band). No band covers it → say so.
 */
export function studSpacingFor(notes: readonly string[], studMm: number): SpacingChoice | null {
  const bands: Array<{ upToMm: number; spacingMm: number }> = [];
  for (const n of notes) {
    for (const m of n.matchAll(/up to\s*(\d+(?:\.\d+)?)\s*m\b[^.;]*?\bat\s*(\d{3})\s*(?:mm)?/gi)) {
      bands.push({ upToMm: Math.round(Number(m[1]) * 1000), spacingMm: Number(m[2]) });
    }
  }
  if (bands.length) {
    const covering = bands.filter((b) => b.upToMm >= studMm).sort((a, b) => a.upToMm - b.upToMm || b.spacingMm - a.spacingMm)[0];
    const lowest = Math.min(...bands.map((b) => b.upToMm));
    if (!covering) {
      const widest = [...bands].sort((a, b) => b.upToMm - a.upToMm)[0];
      return { spacingMm: widest.spacingMm, note: `The plans' stud-spacing notes only go up to ${widest.upToMm / 1000} m; your studs are ${studMm} mm. Check the spacing against NZS 3604 or the engineer.`, covered: false };
    }
    const note = covering.upToMm > lowest ? `Studs are ${studMm} mm, above the plans' ${lowest / 1000} m band, so the "up to ${covering.upToMm / 1000} m" line applies: ${covering.spacingMm} centres. Check load-bearing walls against NZS 3604 or the engineer.` : null;
    return { spacingMm: covering.spacingMm, note, covered: true };
  }
  for (const n of notes) {
    const hit = n.match(/\b(300|400|450|600)\s*(?:mm)?\s*(?:crs|ctrs|centres|centers|c\/c|max)\b/i);
    if (hit) return { spacingMm: Number(hit[1]), note: null, covered: true };
  }
  return null;
}
const specEvidence = (m: EffectiveModel, topic: string) => (m.specs[topic] ?? []).flatMap((f) => f.evidence);

export function planTakeoff(m: EffectiveModel): PlanTakeoff {
  const lines: PlanTakeoffLine[] = [];
  const blockers: TakeoffBlocker[] = [];
  const assumptions: string[] = [];
  const byOthers = m.byOthers.map((f) => f.value);

  for (const f of m.flags) if (f.level === "blocker" && !f.resolved) blockers.push({ id: f.id, message: f.message, question: f.question, answerKey: `flag:${f.id}` });
  if (!m.walls) {
    blockers.push(
      { id: "enter-external-walls", message: "The walls couldn't be measured off these plans. Enter the total outside wall length.", question: { kind: "number", prompt: "Outside walls", unit: "mm" }, answerKey: "set:external_wall_mm" },
      { id: "enter-internal-walls", message: "And the total inside wall length.", question: { kind: "number", prompt: "Inside walls", unit: "mm" }, answerKey: "set:internal_wall_mm" },
    );
    return { lines, blockers, assumptions, byOthers };
  }
  const stud = m.heights.studMm?.value ?? null;
  if (!stud) {
    blockers.push({ id: "stud-height-missing", message: "I couldn't find the stud height on the plans.", question: { kind: "number", prompt: "What's the stud height?", unit: "mm" }, answerKey: "set:stud_mm" });
  }
  if (m.renovation === "enter") {
    if (m.walls.externalLengthMm.status !== "tradie") {
      blockers.push({ id: "new-external-walls", message: "Enter the length of NEW outside wall (0 if none).", question: { kind: "number", prompt: "New outside wall", unit: "mm" }, answerKey: "set:external_wall_mm" });
    }
    if (m.walls.internalLengthMm.status !== "tradie") {
      blockers.push({ id: "new-internal-walls", message: "Enter the length of NEW inside wall (0 if none).", question: { kind: "number", prompt: "New inside wall", unit: "mm" }, answerKey: "set:internal_wall_mm" });
    }
  }
  if (blockers.length) return { lines, blockers, assumptions, byOthers };

  const wallHeightM = stud! / 1000;
  const spacing = studSpacingFor([...specText(m, "stud_spacing"), ...specText(m, "framing_timber")], stud!);
  const studSpacingMm = spacing?.spacingMm ?? 600;
  if (!spacing) assumptions.push("Studs at 600 centres (the plans didn't say).");
  if (spacing?.note) assumptions.push(spacing.note);
  const wallEvidence: Evidence[] = [...(m.walls.externalLengthMm.evidence ?? []), ...(m.heights.studMm?.evidence ?? [])];

  // ── Framing: wall by wall — unless the tradie typed the wall lengths
  // (an alteration's NEW walls), then over the lengths they gave. ──
  const typed = m.walls.externalLengthMm.status === "tradie" || m.walls.internalLengthMm.status === "tradie";
  const onLine = (id: number, kind: "window" | "door") => m.openings.filter((o) => o.kind === kind && o.wall?.line === id).reduce((n, o) => n + o.count, 0);
  const framing = new Map<string, { line: MaterialTakeoffLine; qty: number; walls: number }>();
  const runs = typed
    ? [
        { lengthMm: m.walls.externalLengthMm.value, external: true, doors: m.openings.filter((o) => o.kind === "door" && o.wall?.external).length, windows: m.openings.filter((o) => o.kind === "window").length },
        { lengthMm: m.walls.internalLengthMm.value, external: false, doors: m.openings.filter((o) => o.kind === "door" && !o.wall?.external).length, windows: 0 },
      ].filter((r) => r.lengthMm > 0)
    : m.walls.lines.map((l) => ({ lengthMm: l.lengthMm, external: l.external, doors: onLine(l.id, "door"), windows: onLine(l.id, "window") }));
  for (const r of runs) {
    const res = calculateMaterialTakeoff({
      wallLengthM: r.lengthMm / 1000,
      wallHeightM,
      studSpacingMm,
      numberOfDoors: r.doors,
      numberOfWindows: r.windows,
      includeInsulation: false,
      gibSides: r.external ? 1 : 2,
    });
    for (const mat of res.materials) {
      if (!["studs-90x45", "plates-90x45", "nogs-90x45"].includes(mat.id)) continue;
      const cur = framing.get(mat.id);
      if (cur) {
        cur.qty += mat.quantity;
        cur.walls++;
      } else framing.set(mat.id, { line: mat, qty: mat.quantity, walls: 1 });
    }
  }
  const framingSpec = specText(m, "framing_timber")[0];
  for (const [id, f] of framing) {
    lines.push({
      id: `framing-${id}`,
      group: "Framing",
      name: framingSpec && id === "studs-90x45" ? `${f.line.name} (plans: ${framingSpec})` : f.line.name,
      quantity: f.qty,
      unit: f.line.unit,
      formula: typed
        ? `${f.line.formula} — over the wall lengths you entered (stud height ${stud} mm, ${studSpacingMm} centres).`
        : `${f.line.formula} — worked out for each of the ${f.walls} walls and added up (stud height ${stud} mm, ${studSpacingMm} centres).`,
      status: m.walls.externalLengthMm.status === "needs_check" || spacing?.note ? "needs_review" : "ok",
      notes: spacing?.note ?? undefined,
      priceMatchKey: f.line.priceMatchKey,
      evidence: wallEvidence,
    });
  }

  // ── Linings, wall insulation, skirting, architraves: whole run ──
  const totalRunM = (m.walls.externalLengthMm.value + m.walls.internalLengthMm.value) / 1000;
  const extRunM = m.walls.externalLengthMm.value / 1000;
  const doors = m.openings.filter((o) => o.kind === "door" && o.widthMm && o.heightMm);
  const windows = m.openings.filter((o) => o.kind === "window" && o.widthMm && o.heightMm);
  const count = (list: typeof doors) => list.reduce((n, o) => n + o.count, 0);
  const area = (list: typeof doors) => list.reduce((s, o) => s + (o.widthMm! / 1000) * (o.heightMm! / 1000) * o.count, 0);
  const avg = (list: typeof doors) => {
    // Average width, with the height chosen so count × w × h = the true total area.
    const n = count(list);
    if (!n) return null;
    const w = list.reduce((s, o) => s + (o.widthMm! / 1000) * o.count, 0) / n;
    return { n, w, h: area(list) / n / w };
  };
  const d = avg(doors), w = avg(windows);
  const whole = calculateMaterialTakeoff({
    wallLengthM: totalRunM,
    exteriorWallLengthM: extRunM,
    wallHeightM,
    studSpacingMm,
    gibSides: 2,
    includeInsulation: true,
    includeSkirting: true,
    includeArchitraves: true,
    wastePercent: WASTE,
    numberOfDoors: d?.n ?? 0,
    ...(d ? { doorWidthM: r2(d.w), doorHeightM: d.h } : {}),
    numberOfWindows: w?.n ?? 0,
    ...(w ? { windowWidthM: r2(w.w), windowHeightM: w.h } : {}),
  });
  const wallInsulation = specText(m, "insulation_walls")[0];
  const lining = specText(m, "lining_walls")[0];
  for (const mat of whole.materials) {
    const group: TakeoffGroup | null =
      mat.id.startsWith("gib") ? "Linings" : mat.id === "pink-batts" ? "Insulation" : mat.id === "skirting" || mat.id === "architraves" ? "Finishing" : mat.id === "framing-nails" ? "Framing" : null;
    if (!group) continue;
    let name = mat.name;
    if (mat.id === "pink-batts" && wallInsulation) name = `Wall insulation — ${wallInsulation} (outside walls)`;
    if (mat.id === "gib-10mm" && lining) name = `${mat.name} (plans: ${lining})`;
    lines.push({
      id: `whole-${mat.id}`,
      group,
      name,
      quantity: mat.quantity,
      unit: mat.unit,
      formula: `${mat.formula} — ${r2(totalRunM)} m of wall, ${r2(extRunM)} m of it outside; ${d?.n ?? 0} doors and ${w?.n ?? 0} windows from the schedules.`,
      status: mat.requiresReview ? "needs_review" : "ok",
      notes: mat.notes,
      priceMatchKey: mat.priceMatchKey,
      evidence: wallEvidence,
    });
  }
  if (whole.warnings.length) assumptions.push(...whole.warnings);
  assumptions.push(`Wall linings and insulation: ${WASTE}% waste, 1.2 × 2.4 m sheets.`);

  // ── Joinery: straight from the schedules ──
  for (const o of m.openings) {
    const size = o.widthMm && o.heightMm ? `${o.widthMm} × ${o.heightMm}` : "size not in the schedule";
    lines.push({
      id: `joinery-${o.mark}`,
      group: "Joinery",
      name: `${o.kind === "window" ? "Window" : "Door"} ${o.mark} — ${size}`,
      quantity: o.count,
      unit: "each",
      formula: `From the ${o.kind} schedule${o.planPage ? `, placed on the plan` : ""}${o.sizeCheck === "ok" ? "; its width matches the gap drawn in the wall" : ""}.`,
      status: o.widthMm && o.heightMm && o.sizeCheck !== "differs" ? "ok" : "needs_review",
      notes: "Joinery supplier to confirm sizes on site.",
      evidence: o.evidence,
    });
  }

  // ── Lintels: as specified on the plans ──
  const bySpec = new Map<string, { n: number; marks: string[]; evidence: Evidence[] }>();
  for (const l of m.lintels) {
    const cur = bySpec.get(l.spec) ?? { n: 0, marks: [], evidence: [] };
    cur.n++;
    cur.marks.push(l.opening ? `${l.mark} over ${l.opening}${l.openingWidthMm ? ` (${l.openingWidthMm.toLocaleString("en-NZ")} wide)` : ""}` : l.mark);
    cur.evidence.push(...l.evidence);
    bySpec.set(l.spec, cur);
  }
  for (const o of m.openings) {
    // A door/window with its lintel printed beside its mark, unless a lintel-plan mark already covers it.
    if (!o.lintel || m.lintels.some((l) => l.opening === o.mark)) continue;
    const cur = bySpec.get(o.lintel) ?? { n: 0, marks: [], evidence: [] };
    cur.n++;
    cur.marks.push(`over ${o.mark}${o.widthMm ? ` (${o.widthMm.toLocaleString("en-NZ")} wide)` : ""}`);
    cur.evidence.push(...o.evidence);
    bySpec.set(o.lintel, cur);
  }
  for (const [spec, v] of bySpec) {
    lines.push({
      id: `lintel-${spec}`,
      group: "Lintels",
      name: `Lintel ${spec}`,
      quantity: v.n,
      unit: "each",
      formula: `Lintels specified as ${spec} on the plans: ${v.marks.join(", ")}.`,
      status: "ok",
      notes: "Cut to suit each opening plus bearing — check lengths against the lintel plan.",
      evidence: v.evidence,
    });
  }

  // ── Ceilings (area) ── In an alteration priced from entered NEW walls,
  // the whole-house area isn't the new work: only an area the tradie gave.
  const onlyTyped = m.renovation === "enter";
  const floorFact = m.walls.enclosedAreaM2;
  const floor = floorFact && (!onlyTyped || floorFact.status === "tradie") ? floorFact.value : null;
  if (onlyTyped && !floor) assumptions.push("Ceilings, slab and roof aren't worked out: enter the NEW floor and roof areas in the summary to include them.");
  if (floor) {
    const ceilingLining = specText(m, "lining_ceilings")[0];
    const ceilingInsul = specText(m, "insulation_ceiling")[0];
    const ev = m.walls.enclosedAreaM2?.evidence ?? [];
    lines.push({
      id: "ceiling-lining",
      group: "Linings",
      name: `Ceiling lining${ceilingLining ? ` — ${ceilingLining}` : ""}`,
      quantity: r2(floor * 1.1),
      unit: "m²",
      formula: `Floor area inside the outside walls ${floor} m² + 10% waste. Includes the garage if it's lined.`,
      status: "assumed",
      evidence: ev,
    });
    lines.push({
      id: "ceiling-insulation",
      group: "Insulation",
      name: `Ceiling insulation${ceilingInsul ? ` — ${ceilingInsul}` : ""}`,
      quantity: r2(floor * 1.05),
      unit: "m²",
      formula: `Floor area ${floor} m² + 5% waste. Leave out any unheated garage.`,
      status: "assumed",
      evidence: [...ev, ...specEvidence(m, "insulation_ceiling")],
    });
  }

  // ── Cladding (outside walls, net of windows and doors) ──
  const cladding = specText(m, "cladding")[0];
  if (cladding) {
    const extOpenings = m.openings.filter((o) => o.wall?.external && o.widthMm && o.heightMm).reduce((s, o) => s + (o.widthMm! / 1000) * (o.heightMm! / 1000) * o.count, 0);
    const net = Math.max(extRunM * wallHeightM - extOpenings, 0);
    lines.push({
      id: "cladding",
      group: "Cladding",
      name: `Cladding — ${cladding}`,
      quantity: r2(net * 1.1),
      unit: "m²",
      formula: `${r2(extRunM)} m of outside wall × ${stud} mm stud − ${r2(extOpenings)} m² of windows and doors, + 10% waste. Gables and anything above the top plate aren't included.`,
      status: "assumed",
      evidence: [...wallEvidence, ...specEvidence(m, "cladding")],
    });
    const wrap = specText(m, "wall_underlay")[0];
    if (wrap) {
      lines.push({ id: "wall-underlay", group: "Cladding", name: `Wall underlay — ${wrap}`, quantity: r2(extRunM * wallHeightM * 1.1), unit: "m²", formula: `${r2(extRunM)} m × ${stud} mm + 10% laps.`, status: "assumed", evidence: specEvidence(m, "wall_underlay") });
    }
  }

  // ── Roofing ──
  const pitch = m.roof.pitchDeg?.value ?? null;
  const roofPlan = m.roof.areaM2 && (!onlyTyped || m.roof.areaM2.status === "tradie") ? m.roof.areaM2.value : null;
  if (roofPlan && pitch) {
    const surface = roofAreaFromPitch(roofPlan, pitch);
    const material = m.roof.material?.value;
    lines.push({
      id: "roofing",
      group: "Roofing",
      name: `Roofing${material ? ` — ${material}` : ""}`,
      quantity: r2(surface * 1.05),
      unit: "m²",
      formula: `Roof plan area ${roofPlan} m² at ${pitch}° = ${r2(surface)} m² of roof, + 5% laps.`,
      status: m.roof.pitchDeg?.status === "needs_check" ? "needs_review" : "ok",
      evidence: [...(m.roof.areaM2?.evidence ?? []), ...(m.roof.pitchDeg?.evidence ?? [])],
    });
    const underlay = specText(m, "roof_underlay")[0];
    if (underlay) lines.push({ id: "roof-underlay", group: "Roofing", name: `Roof underlay — ${underlay}`, quantity: r2(surface * 1.1), unit: "m²", formula: `${r2(surface)} m² of roof + 10% laps.`, status: "ok", evidence: specEvidence(m, "roof_underlay") });
  } else if (roofPlan || pitch || m.roof.material) {
    assumptions.push("Roofing isn't worked out yet: it needs both the roof area and the pitch.");
  }

  // ── Slab ──
  const system = [...specText(m, "floor_system"), ...specText(m, "slab_reinforcing")].join(" ");
  if (floor && /rib\s*raft|x-?pod|pod/i.test(system)) {
    lines.push({ id: "slab-system", group: "Slab", name: `Pod slab — ${specText(m, "floor_system")[0] ?? "RibRaft / pods"}`, quantity: floor, unit: "m²", formula: `Floor area ${floor} m². Pod slabs are designed and quoted by the system supplier.`, status: "needs_review", evidence: specEvidence(m, "floor_system") });
  } else if (floor) {
    const thick = specNumber(m, "slab_thickness", /(\d{2,3})\s*(?:mm)?\s*(?:thick|thk|slab)/i);
    if (thick) {
      lines.push({ id: "slab-concrete", group: "Slab", name: "Concrete for the floor slab", quantity: r2(Math.ceil(floor * (thick.value / 1000) * 1.05 * 10) / 10), unit: "m³", formula: `${floor} m² × ${thick.value} mm + 5% waste. Thickenings and footings not included.`, status: "assumed", evidence: thick.evidence });
    }
  }

  return { lines, blockers, assumptions, byOthers };
}
