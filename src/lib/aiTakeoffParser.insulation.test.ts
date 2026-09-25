import { describe, expect, it } from "vitest";
import { parseTakeoffDescription, runTakeoff } from "./aiTakeoffParser";
import type { MaterialTakeoffInput, MaterialTakeoffResult } from "./materialCalculator";

// Golden W01 / W06. Insulation is quoted for EXTERIOR walls only, so the
// parser switches it on only when the tradie asks for it or the job clearly
// includes exterior walls. It used to default it on for every wall: a wall
// GIB-lined both sides (an interior wall) with no batts mentioned got a
// BLOCKED 0-pack batts line, and any blocked line stops the quote being sent.

function wall(text: string): Partial<MaterialTakeoffInput> {
  const r = parseTakeoffDescription(text);
  if (r.type !== "wall") throw new Error(`expected wall, got ${r.type}`);
  return r.input;
}

const batts = (r: MaterialTakeoffResult | null) => r?.materials.find((m) => m.id === "pink-batts");

describe("insulation only when asked for or clearly exterior (golden W01)", () => {
  it("a wall lined both sides with no batts mentioned gets no insulation line (was a blocked 0-pack line)", () => {
    const text = "GIB both sides for a 10m wall, 2400 high. Two days labour at $600 a day.";
    const parsed = parseTakeoffDescription(text);
    expect(wall(text).includeInsulation).toBe(false);
    expect(batts(runTakeoff(parsed))).toBeUndefined();
    expect(parsed.assumptions.join(" ")).toMatch(/no insulation line/i);
  });

  it("a single wall lined one side, not said to be exterior, gets no insulation line either", () => {
    expect(wall("Frame and GIB one side a 4.8m wall, 2.4 high").includeInsulation).toBe(false);
  });

  it("asking for batts still adds them (blocked until the exterior run is known — the exterior-only rule)", () => {
    const parsed = parseTakeoffDescription("GIB one side on a 4m wall, 2.4 high, pink batts");
    expect(wall("GIB one side on a 4m wall, 2.4 high, pink batts").includeInsulation).toBe(true);
    expect(batts(runTakeoff(parsed))).toMatchObject({ blocked: true, quantity: 0 });
  });

  it("'no insulation' still wins", () => {
    expect(wall("Exterior wall 6m long, 2.4 high, GIB one side, no insulation").includeInsulation).toBe(false);
  });

  it("a wall the tradie calls exterior defaults insulation on", () => {
    expect(wall("GIB one side on the inside of an exterior wall, 6m long, 2.4 high").includeInsulation).toBe(true);
  });

  it("a whole-plan wall run (a house, which has exterior walls) defaults insulation on", () => {
    expect(wall("[T2Q_PLAN] type=wall wall_run_m=40 height_m=2.4\ngib both sides").includeInsulation).toBe(true);
    expect(wall("Total wall run: 40m\n2.4 high, GIB both sides").includeInsulation).toBe(true);
  });

  it("an exterior wall run given defaults insulation on and sizes it", () => {
    const text = "[T2Q_PLAN] type=wall wall_run_m=40 exterior_wall_run_m=20 height_m=2.4\ngib both sides";
    expect(wall(text).includeInsulation).toBe(true);
    const line = batts(runTakeoff(parseTakeoffDescription(text)));
    expect(line?.blocked).toBeFalsy();
    expect(line?.quantity).toBeGreaterThan(0);
  });
});

describe("a typed 'Exterior wall run: 12m' line is read without a scan marker (golden W06)", () => {
  const W06 =
    "Exterior wall 12m long, 2.4 high, 2 windows, GIB one side, pink batts, studs at 600 centres. A day and a half at $640 a day.\nExterior wall run: 12m";

  it("the stated exterior run reaches the calculator and sizes the batts: 4 packs (was a blocked 0-pack line)", () => {
    expect(wall(W06).exteriorWallLengthM).toBe(12);
    const line = batts(runTakeoff(parseTakeoffDescription(W06)));
    // (12 × 2.4 − 2 × 1.44) = 25.92 m² × 1.1 = 28.512 ÷ 8.8 = 3.24 → 4
    expect(line).toMatchObject({ quantity: 4 });
    expect(line?.blocked).toBeFalsy();
  });

  it("a typed exterior run longer than the wall run is clamped to it (no over-insulation)", () => {
    expect(wall("Total wall run: 30m\nExterior wall run: 45m\n2.4 high, GIB both sides").exteriorWallLengthM).toBe(30);
  });

  it("a typed exterior run that can't be right is flagged, not used", () => {
    const parsed = parseTakeoffDescription("Wall 12m long, 2.4 high, GIB one side, pink batts\nExterior wall run: 5000m");
    if (parsed.type !== "wall") throw new Error("expected wall");
    expect(parsed.input.exteriorWallLengthM).toBeUndefined();
    expect(parsed.reviewFlags?.join(" ")).toMatch(/exterior wall run/i);
  });
});
