import { describe, expect, it } from "vitest";
import { sanitisePlan } from "./scan-drawing";
import { parseTakeoffDescription } from "./aiTakeoffParser";

// Audit item 5 — the scan prompt asks the model to ADD the wall segments it
// transcribed into `wall_run_m`, and sanitisePlan trusted that sum. The model
// can list 6.0 + 4.8 + 3.6 and still write 15.4. The sum is now computed in
// code from the transcribed "TOTAL / EXTERIOR / INTERIOR WALL RUN = a + b + …"
// lines; a model figure more than 2 % away is replaced and flagged.

const plan = (extra: Record<string, unknown>) => ({ shape: "rect", width_m: 8, length_m: 10, ...extra });

describe("sanitisePlan sums the wall segments in code", () => {
  it("model says 15.4 m for 6.0 + 4.8 + 3.6: uses 14.4 m (was 15.4) and flags it", () => {
    const p = sanitisePlan(plan({ wall_run_m: 15.4 }), {
      dimensionsText: "Overall 10m x 8m\nTOTAL WALL RUN = 6.0 + 4.8 + 3.6 = 15.4m",
    })!;
    expect(p.wall_run_m).toBe(14.4);
    expect(p.review_flags).toEqual([
      "The drawing's total wall run said 15.4 m, but the walls it listed add up to 14.4 m (6.0 + 4.8 + 3.6). Used 14.4 m — check the wall lengths.",
    ]);
  });

  it("millimetre segments are summed in metres (6000 + 4800 + 3600 = 14.4 m, model said 15.4)", () => {
    const p = sanitisePlan(plan({ wall_run_m: 15.4 }), {
      dimensionsText: "TOTAL WALL RUN = 6000 + 4800 + 3600 = 15400mm",
    })!;
    expect(p.wall_run_m).toBe(14.4);
    expect(p.review_flags?.length).toBe(1);
  });

  it("within 2 %, the exact sum of the listed walls is used without a flag (14.5 → 14.4)", () => {
    const p = sanitisePlan(plan({ wall_run_m: 14.5 }), {
      dimensionsText: "TOTAL WALL RUN = 6.0 + 4.8 + 3.6 = 14.5m",
    })!;
    expect(p.wall_run_m).toBe(14.4);
    expect(p.review_flags ?? []).toEqual([]);
  });

  it("checks the exterior run the same way (insulation is sized off it): 30 → 28.8", () => {
    const p = sanitisePlan(plan({ wall_run_m: 49.2, exterior_wall_run_m: 30, interior_wall_run_m: 20.4 }), {
      dimensionsText: [
        "EXTERIOR WALL RUN = 8.4 + 6.0 + 8.4 + 6.0 = 30m",
        "INTERIOR WALL RUN = 6.0 + 4.8 + 3.6 + 6.0 = 20.4m",
      ].join("\n"),
    })!;
    expect(p.exterior_wall_run_m).toBe(28.8);
    expect(p.interior_wall_run_m).toBe(20.4);
    // No TOTAL line: the total is the exterior + interior sums (28.8 + 20.4).
    expect(p.wall_run_m).toBe(49.2);
    expect(p.review_flags?.join(" ")).toMatch(/exterior wall run said 30 m, but the walls it listed add up to 28\.8 m/);
  });

  it("with no segment list to check against, the model's figure is kept as before", () => {
    const p = sanitisePlan(plan({ wall_run_m: 52 }), { dimensionsText: "TOTAL WALL RUN: 52m" })!;
    expect(p.wall_run_m).toBe(52);
    expect(p.review_flags ?? []).toEqual([]);
    expect(sanitisePlan(plan({ wall_run_m: 52 }))!.wall_run_m).toBe(52);
  });

  it("the corrected sum reaches the wall calculator unchanged (no plan/text disagreement)", () => {
    const text = "TOTAL WALL RUN = 6.0 + 4.8 + 3.6 = 15.4m";
    const p = sanitisePlan(plan({ wall_run_m: 15.4 }), { dimensionsText: text })!;
    const parsed = parseTakeoffDescription(
      `[T2Q_PLAN] type=wall wall_run_m=${p.wall_run_m} height_m=2.4\n\nDIMENSIONS (tradie-confirmed):\n${text}\n\nGIB both sides`,
    );
    if (parsed.type !== "wall") throw new Error("not wall");
    expect(parsed.input.wallLengthM).toBe(14.4);
    expect(parsed.assumptions.join(" ")).not.toMatch(/disagreed/);
  });
});
