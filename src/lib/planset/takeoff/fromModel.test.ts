import { describe, expect, it } from "vitest";
import type { BuildingModel, Fact } from "../model/types";
import type { WallLine } from "../measure/walls";
import { applyAnswers } from "../model/answers";
import { PLAN_SIZE_SOURCE } from "../model/planSizes";
import { planTakeoff, studSpacingFor } from "./fromModel";

const f = <T>(value: T): Fact<T> => ({ value, status: "read", evidence: [{ page: 13, method: "geometry" }] });
const line = (id: number, lengthMm: number, external: boolean): WallLine => ({
  id, orientation: "h", at: 10 + id, from: 0, to: lengthMm / 100, thicknessMm: 90, colour: "#3f3f3f", pieceIds: [id], gaps: [], lengthMm, external,
});

/** A 10 × 8 m box (36 m outside) with one 6 m inside wall, a window and a door. */
function model(): BuildingModel {
  return {
    version: 1,
    project: { kind: "new_build", buildings: [], consentNumber: null, authority: null, approved: true, consentSource: "papers" },
    sheets: { total: 1, drawings: 1, documents: 0, provenScale: 1, unreadable: 0 },
    walls: {
      page: 13, ratio: 100, scaleBasis: "dimensions",
      externalLengthMm: f(36000), internalLengthMm: f(6000), enclosedAreaM2: f(80), printedAreaM2: null,
      lines: [line(0, 10000, true), line(1, 8000, true), line(2, 10000, true), line(3, 8000, true), line(4, 6000, false)],
    },
    wallsByBuilding: {},
    openings: [
      { mark: "W01", kind: "window", widthMm: 1200, heightMm: 1000, sillMm: 900, headMm: 2100, count: 1, fields: {}, schedulePage: 37, planPage: 12, wall: { line: 0, external: true, gapWidthMm: 1200, x: 45, y: 10 }, lintel: null, sizeCheck: "ok", evidence: [] },
      { mark: "D01", kind: "door", widthMm: 810, heightMm: 1980, sillMm: 0, headMm: 1980, count: 1, fields: {}, schedulePage: 36, planPage: 12, wall: { line: 4, external: false, gapWidthMm: 810, x: 30, y: 14 }, lintel: "2/240x45 SG8", sizeCheck: "ok", evidence: [] },
    ],
    lintels: [{ mark: "L2", spec: "150x90 hy90 H1.2", page: 16, evidence: [] }, { mark: "L3", spec: "150x90 hy90 H1.2", page: 16, evidence: [] }],
    schedules: {},
    specs: { stud_spacing: [f("studs @ 600 crs")], insulation_walls: [f("R2.8 Ecoinsulation")], cladding: [f("Linea weatherboard")] },
    heights: { studMm: f(2400), ceilingMm: null },
    roof: { pitchDeg: f(25), areaM2: f(120), material: f("Colorsteel Endura") },
    zones: { wind: null, earthquake: null, exposure: null, snow: null },
    consent: { inspections: [], documents: [], conditions: [] },
    rooms: [], legend: [], byOthers: [f("Trusses by supplier")],
    ai: { sheetsRead: 0, itemsKept: 0, itemsDropped: 0, skipped: null },
    flags: [],
  };
}

describe("planTakeoff", () => {
  it("works out framing wall by wall, and linings over the whole run", () => {
    const t = planTakeoff(applyAnswers(model(), {}));
    expect(t.blockers).toEqual([]);
    const studs = t.lines.find((l) => l.id === "framing-studs-90x45")!;
    // Per wall ceil(len/0.6)+1: 18+15+18+15+11 = 77, + 4 for the window + 4 for the door.
    expect(studs.quantity).toBe(85);
    expect(studs.formula).toMatch(/each of the 5 walls/);
    const gib = t.lines.find((l) => l.id === "whole-gib-10mm")!;
    expect(gib.group).toBe("Linings");
    expect(t.lines.find((l) => l.id === "whole-pink-batts")!.name).toMatch(/R2.8/);
  });

  it("lists joinery from the schedules and groups lintels by spec", () => {
    const t = planTakeoff(applyAnswers(model(), {}));
    expect(t.lines.find((l) => l.id === "joinery-W01")).toMatchObject({ name: "Window W01 — 1200 × 1000", quantity: 1, unit: "each", status: "ok" });
    expect(t.lines.find((l) => l.id === "lintel-150x90 hy90 H1.2")).toMatchObject({ quantity: 2 });
    expect(t.lines.find((l) => l.id === "lintel-2/240x45 SG8")).toMatchObject({ quantity: 1 });
    expect(t.byOthers).toEqual(["Trusses by supplier"]);
  });

  it("a window read from the size printed on the plan: its size, glazing and lintel, marked for checking when no gap confirms it", () => {
    const m = model();
    m.openings = [
      {
        mark: "W1", kind: "window", widthMm: 600, heightMm: 800, sillMm: null, headMm: null, count: 1,
        fields: { source: PLAN_SIZE_SOURCE, size: "800h x 600w", glazing: "Safety Glass" },
        schedulePage: null, planPage: 15, wall: null, lintel: "140 x 90 SG8", sizeCheck: "unchecked", evidence: [],
      },
    ];
    m.lintels = [];
    const t = planTakeoff(applyAnswers(m, {}));
    const joinery = t.lines.find((l) => l.group === "Joinery")!;
    expect(joinery).toMatchObject({ name: "Window W1 — 600 × 800 (Safety Glass)", quantity: 1, status: "needs_review" });
    expect(joinery.formula).toBe('Size printed on the plan beside it: "800h x 600w" (these plans have no window schedule); there\'s no gap in the measured walls to check the width against.');
    expect(t.lines.find((l) => l.group === "Lintels")).toMatchObject({ name: "Lintel 140 x 90 SG8", quantity: 1, formula: "Lintels specified as 140 x 90 SG8 on the plans: over W1 (600 wide)." });
    // Matched to a gap, the same window is "from the plans".
    m.openings[0] = { ...m.openings[0], sizeCheck: "ok", wall: { line: 0, external: true, gapWidthMm: 600, x: 1, y: 10 } };
    expect(planTakeoff(applyAnswers(m, {})).lines.find((l) => l.group === "Joinery")).toMatchObject({ status: "ok" });
  });

  it("with no lintel plan, a size-to-confirm lintel for each window and outside door the plans leave unsized", () => {
    const m = model();
    m.lintels = [];
    m.openings = [
      m.openings[0], // W01, outside wall, no lintel given
      m.openings[1], // D01, inside wall — left out even without its printed lintel
      { ...m.openings[1], mark: "D02", widthMm: 2400, lintel: null, wall: { line: 1, external: true, gapWidthMm: 2400, x: 1, y: 11 } },
      { ...m.openings[0], mark: "W02", widthMm: 600, wall: null, sizeCheck: "unchecked" },
      { ...m.openings[0], mark: "W03", lintel: "140 x 90 SG8" },
    ];
    m.openings[1] = { ...m.openings[1], lintel: null };
    const t = planTakeoff(applyAnswers(m, {}));
    const toSize = t.lines.filter((l) => l.id.startsWith("lintel-to-size-"));
    expect(toSize.map((l) => [l.name, l.quantity, l.status])).toEqual([
      ["Lintel over W01 (1,200 wide) — size to confirm", 1, "needs_review"],
      ["Lintel over D02 (2,400 wide) — size to confirm", 1, "needs_review"],
      ["Lintel over W02 (600 wide) — size to confirm", 1, "needs_review"],
    ]);
    expect(toSize[0].formula).toBe("The plans don't give a lintel for window W01 (1,200 wide). Size it from NZS 3604 or the engineer's design, then price it.");
    expect(t.lines.find((l) => l.name === "Lintel 140 x 90 SG8")).toMatchObject({ quantity: 1 });
    expect(t.assumptions.some((a) => a.includes('"size to confirm" line for each window and outside door'))).toBe(true);
  });

  it("a set with a lintel plan gets no size-to-confirm lintels", () => {
    const t = planTakeoff(applyAnswers(model(), {}));
    expect(t.lines.some((l) => l.id.startsWith("lintel-to-size-"))).toBe(false);
  });

  it("works out areas for ceilings, cladding and roofing, in m²", () => {
    const t = planTakeoff(applyAnswers(model(), {}));
    expect(t.lines.find((l) => l.id === "ceiling-lining")).toMatchObject({ quantity: 88, unit: "m²" });
    // 36 m × 2.4 m − 1.2 m² window = 85.2 m² + 10%.
    expect(t.lines.find((l) => l.id === "cladding")!.quantity).toBeCloseTo(93.72, 2);
    // 120 m² plan at 25° = 132.41 m² + 5%.
    expect(t.lines.find((l) => l.id === "roofing")!.quantity).toBeCloseTo(139.03, 1);
  });

  it("stops and asks when the stud height is missing", () => {
    const m = model();
    m.heights.studMm = null;
    const t = planTakeoff(applyAnswers(m, {}));
    expect(t.lines).toEqual([]);
    expect(t.blockers[0]).toMatchObject({ id: "stud-height-missing", question: { kind: "number" } });
    const answered = planTakeoff(applyAnswers(m, { "set:stud_mm": 2400 }));
    expect(answered.blockers).toEqual([]);
    expect(answered.lines.length).toBeGreaterThan(5);
  });

  it("alterations: prices only the NEW walls the tradie enters", () => {
    const m = model();
    m.project.kind = "alteration";
    m.flags.push({ id: "renovation", level: "blocker", topic: "renovation", message: "alteration", evidence: [], question: { kind: "choice", prompt: "How?", options: ["Price all the walls shown", "I'll enter the new wall lengths"] } });
    expect(planTakeoff(applyAnswers(m, {})).lines).toEqual([]);
    const asked = planTakeoff(applyAnswers(m, { "flag:renovation": "I'll enter the new wall lengths" }));
    expect(asked.blockers.map((b) => b.answerKey)).toEqual(["set:external_wall_mm", "set:internal_wall_mm"]);
    const t = planTakeoff(applyAnswers(m, { "flag:renovation": "I'll enter the new wall lengths", "set:external_wall_mm": 4800, "set:internal_wall_mm": 0 }));
    expect(t.blockers).toEqual([]);
    // 4.8 m of new outside wall: ceil(4.8/0.6)+1 = 9 studs + 4 for the window.
    expect(t.lines.find((l) => l.id === "framing-studs-90x45")!.quantity).toBe(13);
    expect(t.lines.find((l) => l.id === "ceiling-lining")).toBeUndefined();
    expect(t.assumptions.join(" ")).toMatch(/enter the NEW floor and roof areas/);
  });

  it("won't work anything out while a blocker is unanswered", () => {
    const m = model();
    m.flags.push({ id: "buildings", level: "blocker", topic: "building", message: "3 buildings", evidence: [], question: { kind: "choice", prompt: "Which?", options: ["A", "B"] } });
    expect(planTakeoff(applyAnswers(m, {})).lines).toEqual([]);
    expect(planTakeoff(applyAnswers(m, { "flag:buildings": "A" })).lines.length).toBeGreaterThan(0);
  });
});

describe("studSpacingFor", () => {
  const notes = [
    "Loadbearing walls (External/Internal): Studs up to 2.4m 90x45 at 600mm ctrs.",
    "Non loadbearing walls (Internal): Studs up to 2.4m 90x45 at 600mm ctrs. Studs up to 3.3m 90x45 at 400mm ctrs. Studs up to 3.6m 90x45 at 300mm ctrs.",
  ];
  it("uses the band that covers the stud height", () => {
    expect(studSpacingFor(notes, 2400)).toMatchObject({ spacingMm: 600, note: null, covered: true });
    const tall = studSpacingFor(notes, 2460)!;
    expect(tall.spacingMm).toBe(400);
    expect(tall.note).toMatch(/above the plans' 2.4 m band/);
  });
  it("says so when no band covers the studs", () => {
    expect(studSpacingFor(notes, 3900)).toMatchObject({ covered: false });
  });
  it("reads a plain spacing note, or nothing", () => {
    expect(studSpacingFor(["Studs @ 400 crs"], 2400)).toMatchObject({ spacingMm: 400 });
    expect(studSpacingFor(["No spacing here"], 2400)).toBeNull();
  });
});
