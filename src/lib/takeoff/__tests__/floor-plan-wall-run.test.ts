import { describe, expect, it } from "vitest";
import { sanitisePlan } from "@/lib/scan-drawing";
import {
  extractStructuredPlanMarker,
  parseTakeoffDescription,
  canRunCalculator,
  runTakeoff as runLegacyTakeoff,
} from "@/lib/aiTakeoffParser";
import { calculateMaterialTakeoff } from "@/lib/materialCalculator";
import { extractFromText } from "../extraction";
import { runFramingCalculator } from "../calculators/framing";
import { runLiningCalculator } from "../calculators/lining";

// ─────────────────────────────────────────────────────────────────────────
// Wave 44 — whole-drawing multi-room floor plan → TOTAL wall run.
//
// The failure mode this guards: a house floor plan was collapsed to a single
// bounding-box edge (length_m), so the framing/lining takeoff quoted studs,
// plates, nogs and GIB for ONE wall instead of every exterior + interior
// wall summed. The fix carries `wall_run_m` from the vision model through
// sanitisePlan → the [T2Q_PLAN] marker → the parser/calculators.
// ─────────────────────────────────────────────────────────────────────────

// A 2-bedroom plan. Bounding box 8.4 × 6.0. Exterior run = 2*(8.4+6.0) = 28.8m.
// Interior partitions sum to ~14m. Total wall run ≈ 42.8m.
const WALL_RUN_M = 42.8;

const FLOOR_PLAN_TRANSCRIPT = [
  "[T2Q_PLAN] type=wall length_m=8.4 width_m=6 wall_run_m=42.8 height_m=2.4 stud_spacing_mm=600 door_count=5 window_count=4",
  "[T2Q_TIMBER] stock_length_m=6",
  "Job type: Framing.",
  "What is being built: Single-storey house floor plan.",
  "DIMENSIONS (tradie-confirmed):",
  "Overall 8.4m x 6.0m",
  "EXTERIOR WALL RUN = 8.4 + 6.0 + 8.4 + 6.0 = 28.8m",
  "INTERIOR WALL RUN = 3.6 + 3.6 + 2.4 + 4.4 = 14.0m",
  "TOTAL WALL RUN = 42.8m",
  "STRUCTURAL ELEMENTS & FIXINGS:",
  "Studs 90x45 at 600 centres, top + bottom plates, nogs. GIB both sides.",
].join("\n");

describe("sanitisePlan carries the floor-plan wall fields", () => {
  it("reads wall_run_m and counts off the model JSON", () => {
    const plan = sanitisePlan({
      shape: "rect",
      width_m: 6,
      length_m: 8.4,
      wall_run_m: 42.8,
      stud_spacing_mm: 600,
      door_count: 5,
      window_count: 4,
      height_m: 2.4,
    });
    expect(plan).not.toBeNull();
    expect(plan!.wall_run_m).toBe(42.8);
    expect(plan!.stud_spacing_mm).toBe(600);
    expect(plan!.door_count).toBe(5);
    expect(plan!.window_count).toBe(4);
    // The bounding box is preserved untouched.
    expect(plan!.length_m).toBe(8.4);
    expect(plan!.width_m).toBe(6);
  });

  it("sums exterior + interior when the total is omitted", () => {
    const plan = sanitisePlan({
      shape: "rect",
      width_m: 6,
      length_m: 8.4,
      exterior_wall_run_m: 28.8,
      interior_wall_run_m: 14,
    });
    expect(plan!.wall_run_m).toBe(42.8);
  });

  it("rejects an absurd wall run (mm misread) and out-of-range counts", () => {
    const plan = sanitisePlan({
      shape: "rect",
      width_m: 6,
      length_m: 8.4,
      wall_run_m: 42800, // mm written as if metres
      door_count: 999,
    });
    expect(plan!.wall_run_m).toBeNull();
    expect(plan!.door_count).toBeNull();
  });

  it("leaves a plan with no wall fields fully backward-compatible", () => {
    const plan = sanitisePlan({ shape: "rect", width_m: 6, length_m: 8 });
    expect(plan!.wall_run_m).toBeNull();
    expect(plan!.stud_spacing_mm).toBeNull();
    expect(plan!.door_count).toBeNull();
    expect(plan!.window_count).toBeNull();
  });
});

describe("extractStructuredPlanMarker reads the wall run + counts", () => {
  it("pulls wall_run_m, stud_spacing_mm and the opening counts", () => {
    const m = extractStructuredPlanMarker(FLOOR_PLAN_TRANSCRIPT);
    expect(m).toBeDefined();
    expect(m!.wallRunM).toBe(42.8);
    expect(m!.studSpacingMm).toBe(600);
    expect(m!.doorCount).toBe(5);
    expect(m!.windowCount).toBe(4);
    // Bounding-box edge still parsed (and normalised length ≥ width).
    expect(m!.lengthM).toBe(8.4);
    expect(m!.widthM).toBe(6);
  });

  it("drops an out-of-band wall run", () => {
    const m = extractStructuredPlanMarker(
      "[T2Q_PLAN] type=wall length_m=8 width_m=6 wall_run_m=5000",
    );
    expect(m!.wallRunM).toBeUndefined();
  });
});

describe("legacy parser frames off the TOTAL wall run, not one edge", () => {
  it("uses wall_run_m as the wall length for the framing calculator", () => {
    const parsed = parseTakeoffDescription(FLOOR_PLAN_TRANSCRIPT);
    expect(parsed.type).toBe("wall");
    const input = parsed.input as { wallLengthM?: number; studSpacingMm?: number };
    // The whole-house run, NOT the 8.4m bounding-box edge.
    expect(input.wallLengthM).toBe(WALL_RUN_M);
    expect(input.studSpacingMm).toBe(600);
    expect(
      parsed.assumptions.some((a) => /total wall run/i.test(a)),
    ).toBe(true);
  });

  it("produces studs/plates/nogs/GIB scaled to the full run", () => {
    const parsed = parseTakeoffDescription(FLOOR_PLAN_TRANSCRIPT);
    expect(canRunCalculator(parsed)).toBe(true);
    const calc = runLegacyTakeoff(parsed);
    expect(calc).not.toBeNull();

    const byId = Object.fromEntries(
      calc!.materials.map((m) => [m.id, m.quantity]),
    );

    // Studs: ceil(42.8m / 0.6) + 1 + openings(5 doors + 4 windows)*4
    //      = ceil(71.33)+1 + 36 = 72 + 1 + 36 = 109.
    expect(byId["studs-90x45"]).toBe(109);
    // Plates: ceil(42.8*3 / 6) = ceil(21.4) = 22 lengths.
    expect(byId["plates-90x45"]).toBe(22);
    // Nogs: ceil(42.8 / 6) = 8 lengths.
    expect(byId["nogs-90x45"]).toBe(8);
    // GIB sheets are well above what a single 8.4m wall would need.
    expect(byId["gib-10mm"]).toBeGreaterThan(0);
  });

  it("the run-based count is far larger than the bounding-box-edge count (the bug)", () => {
    const runParsed = parseTakeoffDescription(FLOOR_PLAN_TRANSCRIPT);
    const runStuds = runLegacyTakeoff(runParsed)!.materials.find(
      (m) => m.id === "studs-90x45",
    )!.quantity;

    // What the OLD pipeline produced: only the 8.4m edge, no marker openings.
    const edgeOnly = calculateMaterialTakeoff({
      wallLengthM: 8.4,
      wallHeightM: 2.4,
      studSpacingMm: 600,
      gibSides: 1,
    });
    const edgeStuds = edgeOnly.materials.find(
      (m) => m.id === "studs-90x45",
    )!.quantity;

    expect(runStuds).toBeGreaterThan(edgeStuds * 3);
  });
});

describe("orchestrator framing/lining scopes use the wall run", () => {
  it("framing scope length_m = wall run, openings = marker counts", () => {
    const ext = extractFromText(FLOOR_PLAN_TRANSCRIPT, "framing");
    expect(ext.dimensions.length_m).toBe(WALL_RUN_M);
    const doors = ext.openings.find((o) => o.kind === "door");
    const windows = ext.openings.find((o) => o.kind === "window");
    expect(doors?.count).toBe(5);
    expect(windows?.count).toBe(4);

    const result = runFramingCalculator(ext);
    const studLine = result.lines.find((l) => l.id === "studs-90x45");
    expect(studLine).toBeDefined();
    // Same 109 studs as the legacy path.
    expect(studLine!.quantity).toBe(109);
  });

  it("lining scope sizes GIB off the full run × height net of openings", () => {
    const ext = extractFromText(FLOOR_PLAN_TRANSCRIPT, "lining");
    expect(ext.dimensions.length_m).toBe(WALL_RUN_M);
    const result = runLiningCalculator(ext);
    const sheets = result.lines.find((l) => l.id === "lining-sheets");
    expect(sheets).toBeDefined();
    // 42.8m × 2.4m = 102.7m² gross; one side ≈ 36 sheets at 2.88m²/sheet
    // with 10% waste — far more than a single 8.4m wall (~9 sheets).
    expect(sheets!.quantity).toBeGreaterThan(30);
  });

  it("non-wall scopes (deck) ignore wall_run_m and keep the edge length", () => {
    const deckTranscript =
      "[T2Q_PLAN] type=deck length_m=8 width_m=6 wall_run_m=42.8";
    const ext = extractFromText(deckTranscript, "deck");
    // Deck must keep the bounding-box edge, NOT the wall run.
    expect(ext.dimensions.length_m).toBe(8);
  });
});
