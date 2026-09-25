import { describe, expect, it } from "vitest";
import {
  calculateCladdingTakeoff,
  calculateDeckTakeoff,
  calculateSubfloorTakeoff,
  type MaterialTakeoffResult,
} from "../../materialCalculator";
import {
  canRunCalculator,
  parseTakeoffDescription,
  runTakeoff as runLegacyTakeoff,
  type ParsedTakeoffResult,
} from "../../aiTakeoffParser";
import { toMetres } from "../normalise";
import { validateExtractionForScope } from "../validate";
import { runTakeoff, runTakeoffWithExtraction } from "../orchestrator";
import type { ExtractedExtraction } from "../schemas";

// Audit item 1 — a metres value between 50 and 100 used to be divided by 1000
// "because it looks like millimetres" (materialCalculator.sanitiseMeters and
// normalise.toMetres), while the orchestrator's validator let 50–100 m through
// without a flag. A real 62 m cladding run became 0.062 m → 1 weatherboard.
// Now ONE rule (takeoff/plausibility.ts): in-band values are taken as stated,
// out-of-band values are refused with a plain reason — never rescaled.

const qty = (r: MaterialTakeoffResult, id: string) =>
  r.materials.find((m) => m.id === id)?.quantity;

function ext(partial: Partial<ExtractedExtraction>): ExtractedExtraction {
  return {
    confidence: 0.9,
    project_type: null,
    scope_type: "cladding",
    sub_scopes: [],
    dimensions: {
      length_m: null,
      width_m: null,
      height_m: null,
      area_m2: null,
      perimeter_m: null,
      pitch_deg: null,
      volume_m3: null,
    },
    openings: [],
    spacing_mm: null,
    material_spec: null,
    stock_length_m: null,
    coverage_mm: null,
    waste_percent: null,
    wall_kind: null,
    exterior_wall_run_m: null,
    notes: [],
    needs_clarification: [],
    clarification_questions: [],
    source_basis: "llm",
    ...partial,
  };
}

describe("calculators take a 50–100 m edge as stated", () => {
  it("62 m × 2.4 m of cladding is 228 weatherboards (was 1 — read as 0.062 m)", () => {
    const r = calculateCladdingTakeoff({ wallLengthM: 62, wallHeightM: 2.4 });
    expect(r.summary.wallAreaM2).toBe(148.8); // was 0.15
    // 148.8 m² × 1000 / 150 = 992 lm; ceil(992 × 1.1 / 4.8) = 228
    expect(qty(r, "cladding-boards")).toBe(228);
    // verticals ceil(62000/600)+1 = 105; 105 × 2.4 + 124 = 376 lm; ceil(376 × 1.1 / 4.8) = 87
    expect(qty(r, "cavity-battens")).toBe(87);
    expect(qty(r, "building-wrap")).toBe(6); // ceil(148.8 × 1.1 / 27.5)
    expect(qty(r, "cladding-nails")).toBe(1965); // ceil(148.8 × 12 × 1.1)
  });

  it("a 60 m × 4 m deck has 135 joists (was 2 — read as 0.06 m)", () => {
    const r = calculateDeckTakeoff({ deckLengthM: 60, deckWidthM: 4 });
    expect(r.summary.wallAreaM2).toBe(240);
    expect(qty(r, "joist-hangers")).toBe(135); // ceil(60000/450) + 1
  });

  it("a 55 m × 8 m subfloor has 124 joists (was 2 — read as 0.055 m)", () => {
    const r = calculateSubfloorTakeoff({ floorLengthM: 55, floorWidthM: 8 });
    expect(r.summary.wallAreaM2).toBe(440);
    expect(qty(r, "subfloor-joist-hangers")).toBe(124); // ceil(55000/450) + 1
  });
});

describe("out-of-band metres are refused with a plain reason — never divided by 1000", () => {
  it("a 4800 m cladding run gives no materials and says why (was silently 4.8 m, 22 boards)", () => {
    const r = calculateCladdingTakeoff({ wallLengthM: 4800 });
    expect(r.materials).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/Cladding wall length 4800 m is more than 100 m/);
    expect(r.warnings.join(" ")).toMatch(/If you meant 4800 mm, that's 4\.8 m/);
  });

  it("a 4800 × 3820 deck gives no materials (was silently 4.8 × 3.82)", () => {
    const r = calculateDeckTakeoff({ deckLengthM: 4800, deckWidthM: 3820 });
    expect(r.materials).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/Deck length 4800 m is more than 100 m/);
  });

  it("a 2400 m cladding height is refused, not read as 2.4 m", () => {
    const r = calculateCladdingTakeoff({ wallLengthM: 12, wallHeightM: 2400 });
    expect(r.materials).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/Wall height 2400 m is more than 6 m/);
  });

  it("normalise.toMetres: a bare 62 is 62 m (was 0.062 m); explicit units are honoured", () => {
    expect(toMetres(62)).toBe(62);
    expect(toMetres(62, "m")).toBe(62);
    expect(toMetres(4800)).toBe(4.8); // bare ≥ 100 is the NZ mm convention
    expect(toMetres(4800, "m")).toBe(4800); // a stated unit is never second-guessed
    expect(toMetres(4800, "mm")).toBe(4.8);
  });
});

describe("every path gates on the same bands", () => {
  const cladding = (wallLengthM: number): ParsedTakeoffResult => ({
    type: "cladding",
    input: { wallLengthM, wallHeightM: 2.4 },
    missingFields: [],
    assumptions: [],
    confidence: 1,
  });

  it("legacy gate: a 62 m cladding run can be calculated (CALC_MAX_EDGE_M was 50)", () => {
    expect(canRunCalculator(cladding(62))).toBe(true);
    expect(qty(runLegacyTakeoff(cladding(62))!, "cladding-boards")).toBe(228);
    expect(canRunCalculator(cladding(150))).toBe(false);
  });

  it("legacy gate: a 60 m deck edge can be calculated (was refused over 50 m)", () => {
    const deck: ParsedTakeoffResult = {
      type: "deck",
      input: { deckLengthM: 60, deckWidthM: 4 },
      missingFields: [],
      assumptions: [],
      confidence: 1,
    };
    expect(canRunCalculator(deck)).toBe(true);
  });

  it("voice: '62m of wall' cladding runs the calculator (was flagged 'more than the 50 m')", () => {
    const r = parseTakeoffDescription("Reclad the house in weatherboards, 62m of wall, 2.4m high");
    expect(r.type).toBe("cladding");
    expect(r.missingFields).toEqual([]);
    expect(canRunCalculator(r)).toBe(true);
    expect(qty(runLegacyTakeoff(r)!, "cladding-boards")).toBe(228);
  });

  it("voice: a 150 m cladding run is refused with the shared plain reason", () => {
    const r = parseTakeoffDescription("Reclad the house in weatherboards, 150m of wall, 2.4m high");
    expect(canRunCalculator(r)).toBe(false);
    expect(r.missingFields.join(" ")).toMatch(/Cladding wall length 150 m is more than 100 m/);
  });

  it("drawing marker: a 62 m cladding marker reaches both calculators as 62 m (orchestrator gave 1 board)", () => {
    const t =
      "[T2Q_PLAN] type=cladding length_m=62 height_m=2.4\n[T2Q_TIMBER] stock_length_m=4.8\n\nJob type: Framing.\n\nWhat is being built: Weatherboard cladding.";
    const legacy = parseTakeoffDescription(t);
    expect(legacy.type).toBe("cladding");
    expect(canRunCalculator(legacy)).toBe(true);
    expect(qty(runLegacyTakeoff(legacy)!, "cladding-boards")).toBe(228);
    const orchestrated = runTakeoff(t).scopes.find((s) => s.scope === "cladding");
    expect(orchestrated?.lines.find((l) => l.id === "cladding-boards")?.quantity).toBe(228);
  });

  it("orchestrator validator: a 62 m cladding run passes and calculates 228 boards (was 1)", () => {
    const e = ext({ dimensions: { ...ext({}).dimensions, length_m: 62, height_m: 2.4 } });
    expect(validateExtractionForScope(e, "cladding").status).not.toBe("blocked");
    const r = runTakeoffWithExtraction(e);
    expect(r.scopes[0].lines.find((l) => l.id === "cladding-boards")?.quantity).toBe(228);
  });

  it("orchestrator validator: a 150 m deck edge BLOCKS with the plain reason (was a soft flag, then 0.15 m)", () => {
    const e = ext({
      scope_type: "deck",
      dimensions: { ...ext({}).dimensions, length_m: 150, width_m: 4 },
    });
    const v = validateExtractionForScope(e, "deck");
    expect(v.status).toBe("blocked");
    expect(v.reasons.join(" ")).toMatch(/Deck length 150 m is more than 100 m/);
    const r = runTakeoffWithExtraction(e);
    expect(r.status).toBe("blocked");
    expect(r.scopes[0].lines).toEqual([]);
    // The blocked scope asks the tradie about the exact number that's wrong.
    expect(r.clarifications.map((q) => q.question).join(" ")).toMatch(/Deck length 150 m/);
  });
});
