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
// out-of-band values are refused with a plain reason — never rescaled. A
// cladding run is the building's whole exterior wall run added together, so
// it takes the whole-run band ("wallRun", up to 1000 m — a 101 m re-clad is
// an ordinary house); a deck / floor side is a "footprint" (1–30 m, the
// envelope every plan reader already used).

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

  it("a 25 m × 4 m deck is taken as stated: 57 joists", () => {
    const r = calculateDeckTakeoff({ deckLengthM: 25, deckWidthM: 4 });
    expect(r.summary.wallAreaM2).toBe(100);
    expect(qty(r, "joist-hangers")).toBe(57); // ceil(25000/450) + 1
  });
});

describe("deck / floor sides use the shared footprint band — refused, not shrunk", () => {
  it("a 60 m deck side is refused with a plain reason (was read as 0.06 m → 2 joists)", () => {
    const r = calculateDeckTakeoff({ deckLengthM: 60, deckWidthM: 4 });
    expect(r.materials).toEqual([]);
    expect(r.warnings).toEqual(["Deck length 60 m is more than 30 m — check it."]);
  });

  it("a 55 m floor side is refused with a plain reason (was read as 0.055 m → 2 joists)", () => {
    const r = calculateSubfloorTakeoff({ floorLengthM: 55, floorWidthM: 8 });
    expect(r.materials).toEqual([]);
    expect(r.warnings).toEqual(["Floor length 55 m is more than 30 m — check it."]);
  });
});

describe("out-of-band metres are refused with a plain reason — never divided by 1000", () => {
  it("a 4800 m cladding run gives no materials and says why (was silently 4.8 m, 22 boards)", () => {
    const r = calculateCladdingTakeoff({ wallLengthM: 4800 });
    expect(r.materials).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/Cladding wall length 4800 m is more than 1000 m/);
    expect(r.warnings.join(" ")).toMatch(/If you meant 4800 mm, that's 4\.8 m/);
  });

  it("a 101 m cladding run is a whole-house re-clad, taken as stated (was refused as 'more than 100 m')", () => {
    const r = calculateCladdingTakeoff({ wallLengthM: 101, wallHeightM: 2.4 });
    expect(r.warnings).toEqual([]);
    // 242.4 m² × 1000 / 150 = 1616 lm; ceil(1616 × 1.1 / 4.8) = 371
    expect(qty(r, "cladding-boards")).toBe(371);
    // 170 verticals × 2.4 + 202 = 610 lm; ceil(610 × 1.1 / 4.8) = 140
    expect(qty(r, "cavity-battens")).toBe(140);
    expect(qty(r, "building-wrap")).toBe(10); // ceil(242.4 × 1.1 / 27.5)
    expect(qty(r, "cladding-nails")).toBe(3200); // ceil(242.4 × 12 × 1.1)
  });

  it("a 4800 × 3820 deck gives no materials (was silently 4.8 × 3.82)", () => {
    const r = calculateDeckTakeoff({ deckLengthM: 4800, deckWidthM: 3820 });
    expect(r.materials).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/Deck length 4800 m is more than 30 m — check it\. If you meant 4800 mm, that's 4\.8 m\./);
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

  it("legacy gate: a cladding run takes the whole-run band (62, 101 and 150 m run; 1200 m doesn't)", () => {
    expect(canRunCalculator(cladding(62))).toBe(true);
    expect(qty(runLegacyTakeoff(cladding(62))!, "cladding-boards")).toBe(228);
    expect(canRunCalculator(cladding(101))).toBe(true);
    expect(qty(runLegacyTakeoff(cladding(101))!, "cladding-boards")).toBe(371);
    expect(canRunCalculator(cladding(150))).toBe(true);
    expect(canRunCalculator(cladding(1200))).toBe(false);
  });

  it("legacy gate: deck sides use the same footprint band as the calculator (25 m runs, 40 m doesn't)", () => {
    const deck = (deckLengthM: number): ParsedTakeoffResult => ({
      type: "deck",
      input: { deckLengthM, deckWidthM: 4 },
      missingFields: [],
      assumptions: [],
      confidence: 1,
    });
    expect(canRunCalculator(deck(25))).toBe(true);
    // Was allowed up to 50 m here while the parser capped footprints at 30 m.
    expect(canRunCalculator(deck(40))).toBe(false);
  });

  it("voice: '62m of wall' cladding runs the calculator (was flagged 'more than the 50 m')", () => {
    const r = parseTakeoffDescription("Reclad the house in weatherboards, 62m of wall, 2.4m high");
    expect(r.type).toBe("cladding");
    expect(r.missingFields).toEqual([]);
    expect(canRunCalculator(r)).toBe(true);
    expect(qty(runLegacyTakeoff(r)!, "cladding-boards")).toBe(228);
  });

  it("voice: a 101 m re-clad runs the calculator (was refused as 'more than 100 m')", () => {
    const r = parseTakeoffDescription("Weatherboard cladding for 101m of wall, 2.4 high.");
    expect(r.type).toBe("cladding");
    expect(r.missingFields).toEqual([]);
    expect(canRunCalculator(r)).toBe(true);
    expect(qty(runLegacyTakeoff(r)!, "cladding-boards")).toBe(371);
  });

  it("voice: a 250 m run is inside the whole-run band too (the 200 m single-length reading cap doesn't apply)", () => {
    const r = parseTakeoffDescription("Reclad the building in weatherboards, 250m of wall, 2.4m high");
    expect(r.missingFields).toEqual([]);
    expect(canRunCalculator(r)).toBe(true);
    if (r.type !== "cladding") throw new Error(`expected cladding, got ${r.type}`);
    expect(r.input.wallLengthM).toBe(250);
  });

  it("voice: a 1200 m cladding run is refused with the shared plain reason", () => {
    const r = parseTakeoffDescription("Reclad the house in weatherboards, 1200m of wall, 2.4m high");
    expect(canRunCalculator(r)).toBe(false);
    expect(r.missingFields.join(" ")).toMatch(
      /Cladding wall length 1200 m is more than 1000 m — check it\. If you meant 1200 mm, that's 1\.2 m\./,
    );
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

  it("drawing marker: a 101 m cladding marker reaches both calculators as 101 m (was dropped as over 100 m)", () => {
    const t =
      "[T2Q_PLAN] type=cladding length_m=101 height_m=2.4\n[T2Q_TIMBER] stock_length_m=4.8\n\nJob type: Framing.\n\nWhat is being built: Weatherboard cladding.";
    const legacy = parseTakeoffDescription(t);
    expect(legacy.type).toBe("cladding");
    expect(canRunCalculator(legacy)).toBe(true);
    expect(qty(runLegacyTakeoff(legacy)!, "cladding-boards")).toBe(371);
    const orchestrated = runTakeoff(t).scopes.find((s) => s.scope === "cladding");
    expect(orchestrated?.lines.find((l) => l.id === "cladding-boards")?.quantity).toBe(371);
  });

  it("orchestrator validator: a 62 m cladding run passes and calculates 228 boards (was 1)", () => {
    const e = ext({ dimensions: { ...ext({}).dimensions, length_m: 62, height_m: 2.4 } });
    expect(validateExtractionForScope(e, "cladding").status).not.toBe("blocked");
    const r = runTakeoffWithExtraction(e);
    expect(r.scopes[0].lines.find((l) => l.id === "cladding-boards")?.quantity).toBe(228);
  });

  it("orchestrator validator: a 101 m cladding run passes (371 boards); 1200 m blocks with the plain reason", () => {
    const ok = ext({ dimensions: { ...ext({}).dimensions, length_m: 101, height_m: 2.4 } });
    expect(validateExtractionForScope(ok, "cladding").status).not.toBe("blocked");
    const r = runTakeoffWithExtraction(ok);
    expect(r.scopes[0].lines.find((l) => l.id === "cladding-boards")?.quantity).toBe(371);
    const tooLong = ext({ dimensions: { ...ext({}).dimensions, length_m: 1200, height_m: 2.4 } });
    const v = validateExtractionForScope(tooLong, "cladding");
    expect(v.status).toBe("blocked");
    expect(v.reasons.join(" ")).toMatch(/Cladding wall length 1200 m is more than 1000 m/);
  });

  it("orchestrator validator: a cladding run under 1 m is still soft-flagged as unusually small", () => {
    const e = ext({ dimensions: { ...ext({}).dimensions, length_m: 0.5, height_m: 2.4 } });
    const v = validateExtractionForScope(e, "cladding");
    expect(v.status).toBe("needs_review");
    expect(v.flags.join(" ")).toMatch(/Cladding wall length 0\.5 m is unusually small/);
  });

  it("orchestrator validator: a 150 m deck edge BLOCKS with the plain reason (was a soft flag, then 0.15 m)", () => {
    const e = ext({
      scope_type: "deck",
      dimensions: { ...ext({}).dimensions, length_m: 150, width_m: 4 },
    });
    const v = validateExtractionForScope(e, "deck");
    expect(v.status).toBe("blocked");
    expect(v.reasons.join(" ")).toMatch(/Deck length 150 m is more than 30 m/);
    const r = runTakeoffWithExtraction(e);
    expect(r.status).toBe("blocked");
    expect(r.scopes[0].lines).toEqual([]);
    // The blocked scope asks the tradie about the exact number that's wrong.
    expect(r.clarifications.map((q) => q.question).join(" ")).toMatch(/Deck length 150 m/);
  });
});
