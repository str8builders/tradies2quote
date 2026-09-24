import { describe, expect, it } from "vitest";
import {
  canRunCalculator,
  parseTakeoffDescription,
  runTakeoff,
  type ParsedTakeoffResult,
} from "./aiTakeoffParser";
import type {
  DeckTakeoffInput,
  MaterialTakeoffInput,
  MaterialTakeoffResult,
} from "./materialCalculator";
import { applyDeterministicCorrections } from "./transcriptCleanup";

// ─────────────────────────────────────────────────────────────────────────
// Unit inference + plausibility bounds.
//
// Bug: "GIB both sides for a 10m wall, 2400 high" read the bare 2400 as
// METRES and the calculator produced 18,334 GIB sheets and 806,697 screws —
// and the send gate trusts calculator quantities. NZ plans and tradies say
// "2400 high" meaning 2.4 m. Rule: an explicit mm/cm/m suffix is honoured;
// a bare value ≥ 100 in a length/height/width context is millimetres; a
// value that is still implausible after conversion is NOT computed — it is
// flagged for review instead.
// ─────────────────────────────────────────────────────────────────────────

function wall(r: ParsedTakeoffResult): Partial<MaterialTakeoffInput> {
  if (r.type !== "wall") throw new Error(`expected wall, got ${r.type}`);
  return r.input;
}

function deck(r: ParsedTakeoffResult): Partial<DeckTakeoffInput> {
  if (r.type !== "deck") throw new Error(`expected deck, got ${r.type}`);
  return r.input;
}

function qty(r: MaterialTakeoffResult | null, id: string): number | undefined {
  return r?.materials.find((m) => m.id === id)?.quantity;
}

describe("the 10 m × 2400 GIB case", () => {
  const TEXT = "GIB both sides for a 10m wall, 2400 high";

  it("reads the bare 2400 as 2400 mm = 2.4 m", () => {
    const r = parseTakeoffDescription(TEXT);
    expect(wall(r).wallLengthM).toBe(10);
    expect(wall(r).wallHeightM).toBe(2.4);
    expect(wall(r).gibSides).toBe(2);
  });

  it("produces hand-calculated quantities, not 18,334 sheets / 806,697 screws", () => {
    const calc = runTakeoff(parseTakeoffDescription(TEXT));
    expect(calc).not.toBeNull();
    // 10 m × 2.4 m = 24 m² per side; both sides 48 m² × 1.1 waste = 52.8 m²
    // ÷ 2.88 m² per 2400×1200 sheet = 18.33 → 19 sheets.
    expect(qty(calc, "gib-10mm")).toBe(19);
    // 19 sheets × 40 screws × 1.1 = 836.
    expect(qty(calc, "gib-screws")).toBe(836);
    // Studs at 600 centres incl. both ends: ceil(10000 / 600) + 1 = 18.
    expect(qty(calc, "studs-90x45")).toBe(18);
    // Plates: 3 rows × 10 m = 30 m ÷ 4.8 m stock = 6.25 → 7.
    expect(qty(calc, "plates-90x45")).toBe(7);
  });
});

describe("explicit unit suffixes are honoured", () => {
  it.each([
    ["4m wall, 2400mm high, GIB both sides", 2.4],
    ["4m wall, 240cm high, GIB both sides", 2.4],
    ["4m wall, 2.4m high, GIB both sides", 2.4],
    ["4m wall, 2.7 metres high, GIB both sides", 2.7],
    ["4m wall, wall height 2700, GIB both sides", 2.7],
    ["4m wall, stud height 2.7m, GIB both sides", 2.7],
    ["4m wall, 2.4 high, GIB both sides", 2.4],
  ])("height: %s → %s m", (text, expected) => {
    expect(wall(parseTakeoffDescription(text)).wallHeightM).toBe(expected);
  });

  it.each([
    ["wall length 4800, 2.4m high, GIB both sides", 4.8],
    ["a 4800mm wall, 2.4m high, GIB both sides", 4.8],
    ["the wall is 3600 long, 2.4m high, GIB both sides", 3.6],
    ["a 10 metre wall, 2.4m high, GIB both sides", 10],
    ["a 4.2 meter wall, 2.4m high, GIB both sides", 4.2],
    ["wall length 2,400mm, 2.4m high, GIB both sides", 2.4],
  ])("length: %s → %s m", (text, expected) => {
    expect(wall(parseTakeoffDescription(text)).wallLengthM).toBe(expected);
  });

  it("a wall THICKNESS (90mm / 140mm) is never read as the wall length", () => {
    const r = parseTakeoffDescription(
      "Frame a 140mm wall, 5m long, 2.4m high, GIB both sides",
    );
    expect(wall(r).wallLengthM).toBe(5);
    const r2 = parseTakeoffDescription("90mm wall, GIB both sides, 2.4m high");
    expect(wall(r2).wallLengthM).toBeUndefined();
    expect(r2.missingFields).toContain("Wall length.");
  });

  it("a treatment class ('H3.2 high-grade') is never read as a height", () => {
    const r = parseTakeoffDescription(
      "4m wall, GIB both sides, H3.2 high-grade framing",
    );
    expect(wall(r).wallHeightM).toBe(2.4);
    expect(r.assumptions).toContain("Used default wall height of 2.4m.");
  });

  it("widths: a deck given as '4800 long and 3600 wide' is 4.8 m × 3.6 m", () => {
    const r = parseTakeoffDescription("deck 4800 long and 3600 wide");
    expect(deck(r).deckLengthM).toBe(4.8);
    expect(deck(r).deckWidthM).toBe(3.6);
  });

  it("widths: mixed units '6m long, 4200 wide'", () => {
    const r = parseTakeoffDescription("new deck, 6m long, 4200 wide");
    expect(deck(r).deckLengthM).toBe(6);
    expect(deck(r).deckWidthM).toBe(4.2);
  });
});

describe("spacings: '600 centres' = 600 mm", () => {
  it.each([
    ["4m wall, 2.4m high, 600 centres, GIB both sides", 600],
    ["4m wall, 2.4m high, studs at 400, GIB both sides", 400],
    ["4m wall, 2.4m high, 0.6m centres, GIB both sides", 600],
    ["4m wall, 2.4m high, stud spacing 400mm, GIB both sides", 400],
    ["4m wall, 2.4m high, 60cm centres, GIB both sides", 600],
  ])("stud spacing: %s → %s mm", (text, expected) => {
    expect(wall(parseTakeoffDescription(text)).studSpacingMm).toBe(expected);
  });

  it.each([
    ["6 by 4 deck, joists at 450 centres", 450],
    ["6 by 4 deck, joist spacing 0.6m", 600],
    ["6 by 4 deck, joists at 400", 400],
  ])("joist spacing: %s → %s mm", (text, expected) => {
    expect(deck(parseTakeoffDescription(text)).joistSpacingMm).toBe(expected);
  });

  it("a stated stud spacing the wall calculator can't model is surfaced, not silently replaced", () => {
    const r = parseTakeoffDescription(
      "4m wall, 2.4m high, studs at 450 centres, GIB both sides",
    );
    expect(wall(r).studSpacingMm).toBe(600);
    expect(r.assumptions.join(" ")).toMatch(/450mm/);
  });
});

describe("plausibility bounds → flag for review, never compute", () => {
  it("a height still out of range after conversion (24 m) is not computed", () => {
    const r = parseTakeoffDescription("GIB both sides for a 10m wall, 24 high");
    expect(wall(r).wallHeightM).toBeUndefined();
    expect(r.missingFields.join(" ")).toMatch(/height/i);
    expect(r.missingFields.join(" ")).toMatch(/1\.8.*6 ?m/);
    expect(canRunCalculator(r)).toBe(false);
    expect(runTakeoff(r)).toBeNull();
  });

  it("an explicit '2400m high' is taken at its word — and flagged, not computed", () => {
    const r = parseTakeoffDescription("GIB both sides, 10m wall, 2400m high");
    expect(wall(r).wallHeightM).toBeUndefined();
    expect(canRunCalculator(r)).toBe(false);
  });

  it("a wall length outside 0.1–200 m is flagged, not computed", () => {
    const r = parseTakeoffDescription("wall length 450m, 2.4m high, GIB both sides");
    expect(wall(r).wallLengthM).toBeUndefined();
    expect(r.missingFields.join(" ")).toMatch(/length/i);
    expect(runTakeoff(r)).toBeNull();
  });

  it("a mm height on the drawing marker (height_m=2400) is flagged, not framed 2400 m high", () => {
    const r = parseTakeoffDescription(
      "[T2Q_PLAN] type=wall wall_run_m=40 height_m=2400\nGIB both sides",
    );
    expect(wall(r).wallLengthM).toBe(40);
    expect(wall(r).wallHeightM).toBeUndefined();
    expect(r.missingFields.join(" ")).toMatch(/height/i);
    expect(runTakeoff(r)).toBeNull();
  });

  it("defence in depth: canRunCalculator refuses absurd inputs however they were built", () => {
    const absurd: ParsedTakeoffResult = {
      type: "wall",
      input: { wallLengthM: 10, wallHeightM: 2400, gibSides: 2 },
      missingFields: [],
      assumptions: [],
      confidence: 1,
    };
    expect(canRunCalculator(absurd)).toBe(false);
    expect(runTakeoff(absurd)).toBeNull();

    const hugeDeck: ParsedTakeoffResult = {
      type: "deck",
      input: { deckLengthM: 4800, deckWidthM: 3.6 },
      missingFields: [],
      assumptions: [],
      confidence: 1,
    };
    expect(canRunCalculator(hugeDeck)).toBe(false);
  });

  it("sane inputs still run (no false alarms)", () => {
    const r = parseTakeoffDescription("4m wall, 2.4m high, GIB both sides");
    expect(canRunCalculator(r)).toBe(true);
    expect(r.missingFields).toEqual([]);
  });
});

describe("cleaned transcripts (numbers spoken as words)", () => {
  const RAW =
    "GIB both sides on a four point eight metre wall, twenty four hundred high, six hundred centres";

  it("the raw spoken transcript parses to digits", () => {
    const r = parseTakeoffDescription(RAW);
    expect(wall(r).wallLengthM).toBe(4.8);
    expect(wall(r).wallHeightM).toBe(2.4);
    expect(wall(r).studSpacingMm).toBe(600);
  });

  it("the deterministic cleaned transcript parses to the same inputs", () => {
    const cleaned = applyDeterministicCorrections(RAW).cleanedTranscript;
    expect(cleaned).toMatch(/4\.8 metre wall/);
    const a = parseTakeoffDescription(RAW);
    const b = parseTakeoffDescription(cleaned);
    expect(b.input).toEqual(a.input);
    expect(wall(b).wallHeightM).toBe(2.4);
  });

  it("'ten metres by two point four' style deck dims", () => {
    const cleaned = applyDeterministicCorrections(
      "deck four point eight metres by three point six metres",
    ).cleanedTranscript;
    const r = parseTakeoffDescription(cleaned);
    expect(deck(r).deckLengthM).toBe(4.8);
    expect(deck(r).deckWidthM).toBe(3.6);
  });
});

describe("opening counts in the scan's 'Doors: 4' layout", () => {
  it("reads each count from its own line (never '4\\nWindows' as 4 windows)", () => {
    const r = parseTakeoffDescription(
      "4m wall, 2.4m high, GIB both sides\nDoors: 4\nWindows: 6",
    );
    expect(wall(r).numberOfDoors).toBe(4);
    expect(wall(r).numberOfWindows).toBe(6);
  });

  it("a door SIZE is not a count", () => {
    const r = parseTakeoffDescription("4m wall, 2.4m high, GIB both sides\nDoor: 820 x 1980");
    expect(wall(r).numberOfDoors).toBe(0);
  });
});

describe("areas: a stated opening area (m²) is used for cladding", () => {
  it("'openings 3.5m2' → 3.5 m² instead of the per-opening estimate", () => {
    const r = parseTakeoffDescription(
      "Cladding a 6m wall, 2.4m high, two windows, openings 3.5m2",
    );
    if (r.type !== "cladding") throw new Error(`expected cladding, got ${r.type}`);
    expect(r.input.openingAreaM2).toBe(3.5);
    expect(r.input.numberOfOpenings).toBe(2);
  });

  it("'4,200,000 mm² of openings' → 4.2 m²", () => {
    const r = parseTakeoffDescription(
      "Cladding a 6m wall, 2.4m high, 4,200,000 mm² of openings",
    );
    if (r.type !== "cladding") throw new Error(`expected cladding, got ${r.type}`);
    expect(r.input.openingAreaM2).toBe(4.2);
  });
});

describe("wall runs written in the DIMENSIONS text", () => {
  it("a plan-less framing scan frames off its TOTAL WALL RUN line", () => {
    const r = parseTakeoffDescription(
      "[T2Q_PLAN] type=wall\nJob type: Framing.\nDIMENSIONS (tradie-confirmed):\nTOTAL WALL RUN = 6.0 + 4.8 + 3.6 = 14.4m\nGIB both sides",
    );
    expect(wall(r).wallLengthM).toBe(14.4);
    expect(canRunCalculator(r)).toBe(true);
  });

  it("text edited after the marker was built wins, and is recorded as a disagreement", () => {
    const r = parseTakeoffDescription(
      "[T2Q_PLAN] type=wall wall_run_m=40 height_m=2.4\nDIMENSIONS (tradie-confirmed):\nTOTAL WALL RUN = 52m\nGIB both sides",
    );
    expect(wall(r).wallLengthM).toBe(52);
    expect(r.assumptions.join(" ")).toMatch(/disagreed with the dimensions text/);
  });

  it("marker and text that agree (incl. via the addends) keep the marker, no disagreement", () => {
    const r = parseTakeoffDescription(
      "[T2Q_PLAN] type=wall wall_run_m=52 height_m=2.4\nDIMENSIONS (tradie-confirmed):\nTOTAL WALL RUN = 40.0 + 12.0 = 40.0m\nGIB both sides",
    );
    expect(wall(r).wallLengthM).toBe(52);
    expect(r.assumptions.join(" ")).not.toMatch(/disagreed/);
  });

  it("an absurd wall run in the text is flagged, not framed", () => {
    const r = parseTakeoffDescription(
      "[T2Q_PLAN] type=wall height_m=2.4\nTOTAL WALL RUN = 4200m\nGIB both sides",
    );
    expect(wall(r).wallLengthM).toBeUndefined();
    expect(runTakeoff(r)).toBeNull();
  });

  it("on a drawing, a loose 'N long' in the notes never replaces the plan edge", () => {
    const r = parseTakeoffDescription(
      "[T2Q_PLAN] type=wall length_m=8.4 width_m=6 height_m=2.4\nBed 1 robe 1.8m long\nGIB both sides",
    );
    expect(wall(r).wallLengthM).toBe(8.4);
  });
});
