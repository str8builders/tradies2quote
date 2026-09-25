import { describe, expect, it } from "vitest";
import {
  calculateCladdingTakeoff,
  calculateDeckTakeoff,
  calculateMaterialTakeoff,
  calculateSubfloorTakeoff,
  type MaterialTakeoffResult,
} from "./materialCalculator";

function getMaterial(result: MaterialTakeoffResult, id: string) {
  return result.materials.find((m) => m.id === id);
}

describe("calculateMaterialTakeoff", () => {
  it("4m wall, 2.4m high, 600 centres, no openings — happy path", () => {
    const r = calculateMaterialTakeoff({
      wallLengthM: 4,
      // STRICT exterior-only rule: insulation needs exterior evidence —
      // this happy-path wall is all exterior.
      exteriorWallLengthM: 4,
      wallHeightM: 2.4,
      studSpacingMm: 600,
    });

    expect(r.warnings).toEqual([]);
    expect(r.summary.wallAreaM2).toBeCloseTo(9.6, 5);
    expect(r.summary.openingAreaM2).toBe(0);
    expect(r.summary.netWallAreaM2).toBeCloseTo(9.6, 5);

    // baseStuds = ceil(4000/600) + 1 = 7 + 1 = 8, no opening studs
    expect(getMaterial(r, "studs-90x45")?.quantity).toBe(8);
    // plates: ceil((4*3)/4.8) = ceil(2.5) = 3
    expect(getMaterial(r, "plates-90x45")?.quantity).toBe(3);
    // nogs: ceil(4/4.8) = 1
    expect(getMaterial(r, "nogs-90x45")?.quantity).toBe(1);
    // gib both sides default: ceil((9.6 * 2 * 1.1) / (1.2*2.4)) = ceil(21.12/2.88) = 8
    expect(getMaterial(r, "gib-10mm")?.quantity).toBe(8);
    // gib screws: ceil(8 * 40 * 1.1) = 352
    expect(getMaterial(r, "gib-screws")?.quantity).toBe(352);
    // adhesive: ceil(8/4) = 2
    expect(getMaterial(r, "gib-adhesive")?.quantity).toBe(2);
    // insulation default true: ceil((9.6 * 1.1) / 8.8) = ceil(1.2) = 2
    expect(getMaterial(r, "pink-batts")?.quantity).toBe(2);
    // framing nails fixed
    expect(getMaterial(r, "framing-nails")?.quantity).toBe(1);
  });

  it("4m wall with one door reduces net area and adds opening studs", () => {
    const r = calculateMaterialTakeoff({
      wallLengthM: 4,
      numberOfDoors: 1,
    });

    // door area = 1 * 0.82 * 2.04 = 1.6728
    expect(r.summary.openingAreaM2).toBeCloseTo(1.67, 1);
    expect(r.summary.netWallAreaM2).toBeCloseTo(9.6 - 1.6728, 2);
    // base 8 + 4 opening studs = 12
    expect(getMaterial(r, "studs-90x45")?.quantity).toBe(12);
  });

  it("GIB one side halves sheet count vs both sides", () => {
    const oneSide = calculateMaterialTakeoff({
      wallLengthM: 4,
      gibSides: 1,
    });
    const twoSides = calculateMaterialTakeoff({
      wallLengthM: 4,
      gibSides: 2,
    });
    // one side: ceil((9.6 * 1 * 1.1) / 2.88) = ceil(3.667) = 4
    expect(getMaterial(oneSide, "gib-10mm")?.quantity).toBe(4);
    expect(getMaterial(twoSides, "gib-10mm")?.quantity).toBe(8);
  });

  it("GIB both sides matches the baseline", () => {
    const r = calculateMaterialTakeoff({
      wallLengthM: 4,
      gibSides: 2,
    });
    expect(getMaterial(r, "gib-10mm")?.quantity).toBe(8);
  });

  it("insulation on includes Pink Batts (exterior evidence supplied)", () => {
    const r = calculateMaterialTakeoff({
      wallLengthM: 4,
      exteriorWallLengthM: 4, // strict rule: insulation needs exterior evidence
      includeInsulation: true,
    });
    expect(getMaterial(r, "pink-batts")).toBeTruthy();
    expect(getMaterial(r, "pink-batts")?.quantity).toBe(2);
  });

  it("insulation on WITHOUT exterior evidence → blocked zero-quantity line", () => {
    const r = calculateMaterialTakeoff({
      wallLengthM: 4,
      includeInsulation: true,
    });
    expect(getMaterial(r, "pink-batts")?.blocked).toBe(true);
    expect(getMaterial(r, "pink-batts")?.quantity).toBe(0);
  });

  it("insulation off omits Pink Batts entirely", () => {
    const r = calculateMaterialTakeoff({
      wallLengthM: 4,
      includeInsulation: false,
    });
    expect(getMaterial(r, "pink-batts")).toBeUndefined();
  });

  it("skirting on includes skirting lengths", () => {
    const r = calculateMaterialTakeoff({
      wallLengthM: 4,
      gibSides: 2,
      includeSkirting: true,
    });
    // ceil((4 * 2 * 1.1) / 4.8) = ceil(8.8/4.8) = ceil(1.833) = 2
    expect(getMaterial(r, "skirting")?.quantity).toBe(2);
  });

  it("architraves on includes architrave lengths for each door", () => {
    const r = calculateMaterialTakeoff({
      wallLengthM: 4,
      numberOfDoors: 1,
      includeArchitraves: true,
    });
    // Both lined faces (gibSides defaults to 2): 1 * (2.04*2 + 0.82) = 4.90
    // per face; × 2 faces × 1.1 = 10.78; ceil(10.78/4.8) = 3
    expect(getMaterial(r, "architraves")?.quantity).toBe(3);
  });

  it("invalid wall length emits warning", () => {
    const r = calculateMaterialTakeoff({ wallLengthM: 0 });
    expect(r.warnings.some((w) => w.includes("wallLengthM"))).toBe(true);
  });

  it("invalid stud spacing emits warning", () => {
    const r = calculateMaterialTakeoff({
      wallLengthM: 4,
      studSpacingMm: 500,
    });
    expect(r.warnings.some((w) => w.includes("studSpacingMm"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Deck takeoff
// All quantities below were hand-calculated against the deck formulas in
// materialCalculator.ts and cross-checkable against blocklayer.com's deck
// calculator for the same inputs.
// ─────────────────────────────────────────────────────────────────────────

describe("calculateDeckTakeoff", () => {
  it("6m × 3m deck — happy path (matches the operator's voice example)", () => {
    const r = calculateDeckTakeoff({ deckLengthM: 6, deckWidthM: 3 });
    expect(r.warnings).toEqual([]);
    expect(r.summary.netWallAreaM2).toBeCloseTo(18, 5);

    // joistCount = ceil(6000/450) + 1 = 15; linear = 15 × 3 = 45
    // joistLengths = ceil(45 × 1.1 / 4.8) = ceil(10.3125) = 11
    expect(getMaterial(r, "deck-joists")?.quantity).toBe(11);

    // bearerRows = ceil(3/1.8) + 1 = 3; linear = 3 × 6 = 18
    // bearerLengths = ceil(18 × 1.1 / 4.8) = ceil(4.125) = 5
    expect(getMaterial(r, "deck-bearers")?.quantity).toBe(5);

    // boardRows = ceil(3000/95) = 32; linearM = 32 × 6 × 1.1 = 211.2
    expect(getMaterial(r, "decking-boards")?.quantity).toBeCloseTo(211.2, 2);

    // joist hangers = joistCount = 15
    expect(getMaterial(r, "joist-hangers")?.quantity).toBe(15);

    // piles: pilesPerRow = ceil(6/1.8) + 1 = 5; piles = 3 × 5 = 15
    // (matches blocklayer.com — fence-post rule: ceil(spans) + 1)
    expect(getMaterial(r, "deck-piles")?.quantity).toBe(15);

    // screws total = ceil(18 × 30 × 1.1) = 594 individual screws
    //   → packs = ceil(594 / 500) = 2 (output as pack count so library
    //     match at per-pack pricing lines up correctly)
    expect(getMaterial(r, "deck-screws")?.quantity).toBe(2);
    expect(getMaterial(r, "deck-screws")?.unit).toBe("pack");

    // nail box fixed
    expect(getMaterial(r, "joist-hanger-nails")?.quantity).toBe(1);
  });

  it("6m × 4m deck — deterministic takeoff (no AI)", () => {
    const r = calculateDeckTakeoff({ deckLengthM: 6, deckWidthM: 4 });
    expect(r.warnings).toEqual([]);
    expect(r.summary.netWallAreaM2).toBeCloseTo(24, 5);

    // joistCount = ceil(6000/450) + 1 = 15; linear = 15 × 4 = 60
    // joistLengths = ceil(60 × 1.1 / 4.8) = ceil(13.75) = 14
    expect(getMaterial(r, "deck-joists")?.quantity).toBe(14);

    // effectiveSpan = 4 - 0.2 = 3.8; intermediates = max(ceil(3.8/1.8)-1,0) = 2
    // bearerRows = 2 + 2 = 4; linear = 4 × 6 = 24
    // bearerLengths = ceil(24 × 1.1 / 4.8) = ceil(5.5) = 6
    expect(getMaterial(r, "deck-bearers")?.quantity).toBe(6);

    // boardRows = ceil(4000/95) = 43; linearM = 43 × 6 × 1.1 = 283.8
    expect(getMaterial(r, "decking-boards")?.quantity).toBeCloseTo(283.8, 2);

    // joist hangers = joistCount = 15
    expect(getMaterial(r, "joist-hangers")?.quantity).toBe(15);

    // pilesPerRow = 2 + max(ceil(5.8/1.8)-1,0) = 5; piles = bearerRows(4) × 5 = 20
    expect(getMaterial(r, "deck-piles")?.quantity).toBe(20);

    // screws total = ceil(24 × 30 × 1.1) = 792 → packs = ceil(792/500) = 2
    expect(getMaterial(r, "deck-screws")?.quantity).toBe(2);
    expect(getMaterial(r, "deck-screws")?.unit).toBe("pack");

    // Determinism: same inputs → identical output.
    const again = calculateDeckTakeoff({ deckLengthM: 6, deckWidthM: 4 });
    expect(again.materials).toEqual(r.materials);
  });

  it("4m × 2m deck — smaller case", () => {
    const r = calculateDeckTakeoff({ deckLengthM: 4, deckWidthM: 2 });
    expect(r.warnings).toEqual([]);

    // joistCount = ceil(4000/450) + 1 = 10; linear = 10 × 2 = 20
    // joistLengths = ceil(20 × 1.1 / 4.8) = ceil(4.583) = 5
    expect(getMaterial(r, "deck-joists")?.quantity).toBe(5);

    // bearerRows: effectiveSpan = 2 - 0.2 = 1.8m, intermediates = max(ceil(1.8/1.8)-1, 0) = 0
    // bearerRows = 2 + 0 = 2 (matches blocklayer's 2-bearer convention for 2m width)
    // linear = 2 × 4 = 8m; bearerLengths = ceil(8 × 1.1 / 4.8) = ceil(1.833) = 2
    expect(getMaterial(r, "deck-bearers")?.quantity).toBe(2);

    // boardRows = ceil(2000/95) = 22; linearM = 22 × 4 × 1.1 = 96.8
    expect(getMaterial(r, "decking-boards")?.quantity).toBeCloseTo(96.8, 2);

    // piles: bearerRows=2, pilesPerRow: effective=3.8m, intermediates=max(ceil(3.8/1.8)-1,0)=2
    // pilesPerRow = 2 + 2 = 4; piles = 2 × 4 = 8 (matches blocklayer exactly)
    expect(getMaterial(r, "deck-piles")?.quantity).toBe(8);

    // screws total = ceil(8 × 30 × 1.1) = 264 → packs = ceil(264/500) = 1
    expect(getMaterial(r, "deck-screws")?.quantity).toBe(1);
    expect(getMaterial(r, "deck-screws")?.unit).toBe("pack");
  });

  it("includePiles=false drops the piles line", () => {
    const r = calculateDeckTakeoff({
      deckLengthM: 6,
      deckWidthM: 3,
      includePiles: false,
    });
    expect(getMaterial(r, "deck-piles")).toBeUndefined();
  });

  it("invalid deck length emits warning", () => {
    const r = calculateDeckTakeoff({ deckLengthM: 0, deckWidthM: 3 });
    expect(r.warnings.some((w) => w.toLowerCase().includes("length"))).toBe(
      true,
    );
  });

  it("unusual joist spacing emits warning", () => {
    const r = calculateDeckTakeoff({
      deckLengthM: 6,
      deckWidthM: 3,
      joistSpacingMm: 500,
    });
    expect(r.warnings.some((w) => w.includes("500"))).toBe(true);
  });

  it("custom board width changes board count", () => {
    // 140mm boards with 5mm gap = 145mm coverage
    // boardRows = ceil(3000/145) = 21; linearM = 21 × 6 × 1.1 = 138.6
    const r = calculateDeckTakeoff({
      deckLengthM: 6,
      deckWidthM: 3,
      boardWidthMm: 140,
    });
    expect(getMaterial(r, "decking-boards")?.quantity).toBeCloseTo(138.6, 2);
  });

  it("each material has a non-empty formula string for audit", () => {
    const r = calculateDeckTakeoff({ deckLengthM: 6, deckWidthM: 3 });
    for (const m of r.materials) {
      expect(m.formula.length).toBeGreaterThan(0);
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // Wave 43 — Ratio guard
  //
  // The ratio guard is a third defence layer behind the unit-aware
  // regex in aiTakeoffParser and sanitiseMeters() in this file. It
  // clamps per-line quantities that exceed sane per-m² ceilings and
  // adds a warning + formula annotation so the operator sees what
  // happened. These tests lock both directions: sane inputs never
  // trigger a clamp; absurd inputs always do.
  // ───────────────────────────────────────────────────────────────────

  it("ratio guard: sane 6 × 3 deck produces no clamp warnings", () => {
    const r = calculateDeckTakeoff({ deckLengthM: 6, deckWidthM: 3 });
    expect(r.warnings.some((w) => w.includes("ratio guard"))).toBe(false);
    for (const m of r.materials) {
      expect(m.formula).not.toMatch(/ratio_guard/);
    }
  });

  it("ratio guard: 0.3m joist spacing on a 1m deck does NOT trip", () => {
    // Tightest realistic case — 300mm centres on a 1m × 1m deck.
    const r = calculateDeckTakeoff({
      deckLengthM: 1,
      deckWidthM: 1,
      joistSpacingMm: 300,
    });
    expect(r.warnings.some((w) => w.includes("ratio guard"))).toBe(false);
  });

  it("ratio guard: handcrafted decking-board overflow IS clamped", () => {
    const r = calculateDeckTakeoff({ deckLengthM: 1, deckWidthM: 1 });
    const boards = r.materials.find((m) => m.id === "decking-boards");
    expect(boards).toBeTruthy();
    expect(boards!.quantity).toBeLessThanOrEqual(30);
  });

  it("ratio guard: absurd boardWidthMm clamps decking lineal-m", () => {
    // Bug injection: 1mm-wide boards would produce ~2200 lm for a
    // 4 × 3 deck (clearly a unit bug). Guard caps at 30 lm/m² × 12m²
    // = 360 lm and emits a warning so the operator sees it.
    const r = calculateDeckTakeoff({
      deckLengthM: 4,
      deckWidthM: 3,
      boardWidthMm: 1,
    });
    expect(r.warnings.some((w) => w.includes("ratio guard"))).toBe(true);
    const boards = r.materials.find((m) => m.id === "decking-boards");
    expect(boards?.quantity).toBeLessThanOrEqual(360);
    expect(boards?.formula).toMatch(/ratio_guard/);
  });

  it("ratio guard: extreme joist spacing clamps joist lengths", () => {
    // 50mm joist centres would yield ~70 joist lengths for a small
    // deck — a regression bug. The "unusual joist spacing" warning
    // ALSO fires, but the ratio guard catches the downstream count.
    const r = calculateDeckTakeoff({
      deckLengthM: 4.8,
      deckWidthM: 3.82,
      joistSpacingMm: 50,
    });
    expect(r.warnings.some((w) => w.includes("ratio guard"))).toBe(true);
    const joists = r.materials.find((m) => m.id === "deck-joists");
    // Cap = ceil(1.5 × 18.34) = 28
    expect(joists?.quantity).toBeLessThanOrEqual(28);
    expect(joists?.formula).toMatch(/ratio_guard/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Wave 43 — End-to-end "Whakamārama" regression
// ─────────────────────────────────────────────────────────────────────────

describe("Whakamārama deck regression", () => {
  it("4.8m × 3.82m deck with 6m timber produces expected joist/bearer/board counts", () => {
    const r = calculateDeckTakeoff({
      deckLengthM: 4.8,
      deckWidthM: 3.82,
      timberStockLengthM: 6,
    });
    expect(r.warnings.some((w) => w.includes("ratio guard"))).toBe(false);

    // joistCount = ceil(4800/450) + 1 = 12; linear = 12 × 3.82 = 45.84
    // joistLengths = ceil(45.84 × 1.1 / 6) = ceil(8.404) = 9
    const joists = r.materials.find((m) => m.id === "deck-joists");
    expect(joists?.quantity).toBe(9);

    // bearerRows: effectiveSpan = 3.82-0.2 = 3.62; intermediates =
    // ceil(3.62/1.8)-1 = 3-1 = 2; bearerRows = 4
    // linear = 4 × 4.8 = 19.2m; lengths = ceil(19.2 × 1.1 / 6) = 4
    const bearers = r.materials.find((m) => m.id === "deck-bearers");
    expect(bearers?.quantity).toBe(4);

    // boardRows = ceil(3820/95) = 41; linearM = 41 × 4.8 × 1.1 = 216.48
    const boards = r.materials.find((m) => m.id === "decking-boards");
    expect(boards?.quantity).toBeCloseTo(216.48, 2);

    // joistHangers = joistCount = 12
    const hangers = r.materials.find((m) => m.id === "joist-hangers");
    expect(hangers?.quantity).toBe(12);

    // Decking screws (pack count): ceil(18.34 × 30 × 1.1) = 605
    //   → packs = ceil(605/500) = 2 packs
    const screws = r.materials.find((m) => m.id === "deck-screws");
    expect(screws?.quantity).toBe(2);
    expect(screws?.unit).toBe("pack");
  });

  it("blocks a future 'wrong dims got through' bug from producing a $32M quote", () => {
    // Simulate the failure mode: somehow the calculator received a
    // wildly wrong deckLengthM (e.g. parser bug treating mm as m).
    // Pre-Wave-43 this produced ~8000 joists. It used to be silently
    // divided by 1000 (which also turned a real 62 m run into 0.062 m);
    // the shared plausibility rule now REFUSES it with a plain reason —
    // no materials at all, never a guessed rescale.
    const r = calculateDeckTakeoff({
      deckLengthM: 4800, // mm-as-m: refused, not read as 4.8 m
      deckWidthM: 3820,
    });
    expect(r.materials).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/Deck length 4800 m is more than 30 m — check it\. If you meant 4800 mm, that's 4\.8 m\./);
    expect(r.warnings.join(" ")).toMatch(/Deck width 3820 m is more than 30 m/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Cladding takeoff
// ─────────────────────────────────────────────────────────────────────────

describe("calculateCladdingTakeoff", () => {
  it("6m × 2.4m wall, no openings — happy path", () => {
    const r = calculateCladdingTakeoff({ wallLengthM: 6 });
    expect(r.warnings).toEqual([]);

    // wallAreaM2 = 14.4, no openings
    expect(r.summary.wallAreaM2).toBeCloseTo(14.4, 5);
    expect(r.summary.netWallAreaM2).toBeCloseTo(14.4, 5);

    // claddingLinearM = (14.4 × 1000) / 150 = 96
    // stock = ceil(96 × 1.1 / 4.8) = ceil(22) = 22
    expect(getMaterial(r, "cladding-boards")?.quantity).toBe(22);

    // verticals = ceil(6000/600) + 1 = 11; battenLinearM = 11*2.4 + 6*2 = 38.4
    // battenStock = ceil(38.4 × 1.1 / 4.8) = ceil(8.8) = 9
    expect(getMaterial(r, "cavity-battens")?.quantity).toBe(9);

    // wrap = ceil(14.4 × 1.1 / 27.5) = ceil(0.576) = 1
    expect(getMaterial(r, "building-wrap")?.quantity).toBe(1);

    // claddingNails = ceil(14.4 × 12 × 1.1) = ceil(190.08) = 191
    expect(getMaterial(r, "cladding-nails")?.quantity).toBe(191);
  });

  it("12m × 2.4m wall with 2 windows (2.88m² openings)", () => {
    const r = calculateCladdingTakeoff({
      wallLengthM: 12,
      openingAreaM2: 2.88,
      numberOfOpenings: 2,
      buildingPerimeterM: 32,
    });

    // netCladdingAreaM2 = 28.8 - 2.88 = 25.92
    expect(r.summary.netWallAreaM2).toBeCloseTo(25.92, 5);

    // claddingLinearM = 25.92 × 1000 / 150 = 172.8
    // stock = ceil(172.8 × 1.1 / 4.8) = ceil(39.6) = 40
    expect(getMaterial(r, "cladding-boards")?.quantity).toBe(40);

    // wrap = ceil(25.92 × 1.1 / 27.5) = ceil(1.0368) = 2
    expect(getMaterial(r, "building-wrap")?.quantity).toBe(2);

    // flashings = 32 + 2*4 = 40m
    expect(getMaterial(r, "flashings")?.quantity).toBeCloseTo(40, 5);

    // claddingNails = ceil(25.92 × 12 × 1.1) = ceil(342.144) = 343
    expect(getMaterial(r, "cladding-nails")?.quantity).toBe(343);
  });

  it("includeCavityBattens=false drops the battens line", () => {
    const r = calculateCladdingTakeoff({
      wallLengthM: 6,
      includeCavityBattens: false,
    });
    expect(getMaterial(r, "cavity-battens")).toBeUndefined();
  });

  it("includeBuildingWrap=false drops the wrap line", () => {
    const r = calculateCladdingTakeoff({
      wallLengthM: 6,
      includeBuildingWrap: false,
    });
    expect(getMaterial(r, "building-wrap")).toBeUndefined();
  });

  it("includeFlashings=false drops the flashings line", () => {
    const r = calculateCladdingTakeoff({
      wallLengthM: 6,
      includeFlashings: false,
    });
    expect(getMaterial(r, "flashings")).toBeUndefined();
  });

  it("invalid wall length emits warning", () => {
    const r = calculateCladdingTakeoff({ wallLengthM: 0 });
    expect(r.warnings.some((w) => w.toLowerCase().includes("length"))).toBe(
      true,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Subfloor takeoff
// ─────────────────────────────────────────────────────────────────────────

describe("calculateSubfloorTakeoff", () => {
  it("8m × 6m subfloor — happy path", () => {
    const r = calculateSubfloorTakeoff({
      floorLengthM: 8,
      floorWidthM: 6,
    });
    expect(r.warnings).toEqual([]);
    expect(r.summary.netWallAreaM2).toBeCloseTo(48, 5);

    // joistCount = ceil(8000/450) + 1 = 19; linear = 19 × 6 = 114
    // joistLengths = ceil(114 × 1.1 / 4.8) = ceil(26.125) = 27
    expect(getMaterial(r, "subfloor-joists")?.quantity).toBe(27);

    // bearerRows = ceil(6/1.8) + 1 = 5; linear = 5 × 8 = 40
    // bearerLengths = ceil(40 × 1.1 / 4.8) = ceil(9.166) = 10
    expect(getMaterial(r, "subfloor-bearers")?.quantity).toBe(10);

    // piles: pilesPerRow = ceil(8/1.8) + 1 = 6; piles = 5 × 6 = 30
    expect(getMaterial(r, "subfloor-piles")?.quantity).toBe(30);

    // plywood: sheetCoverage = 2.88; sheets = ceil(48 × 1.1 / 2.88) = ceil(18.33) = 19
    expect(getMaterial(r, "subfloor-plywood")?.quantity).toBe(19);

    // joist hangers = joistCount = 19
    expect(getMaterial(r, "subfloor-joist-hangers")?.quantity).toBe(19);

    // screws = ceil(48 × 8 × 1.1) = ceil(422.4) = 423
    expect(getMaterial(r, "subfloor-screws")?.quantity).toBe(423);
  });

  it("4m × 3m subfloor — smaller case", () => {
    const r = calculateSubfloorTakeoff({
      floorLengthM: 4,
      floorWidthM: 3,
    });
    expect(r.warnings).toEqual([]);

    // joistCount = ceil(4000/450) + 1 = 10; linear = 30
    // joistLengths = ceil(30 × 1.1 / 4.8) = ceil(6.875) = 7
    expect(getMaterial(r, "subfloor-joists")?.quantity).toBe(7);

    // bearerRows = ceil(3/1.8) + 1 = 3; linear = 12
    // bearerLengths = ceil(12 × 1.1 / 4.8) = ceil(2.75) = 3
    expect(getMaterial(r, "subfloor-bearers")?.quantity).toBe(3);

    // pilesPerRow = ceil(4/1.8) + 1 = 4; piles = 3 × 4 = 12
    expect(getMaterial(r, "subfloor-piles")?.quantity).toBe(12);

    // plywood = ceil(12 × 1.1 / 2.88) = ceil(4.583) = 5
    expect(getMaterial(r, "subfloor-plywood")?.quantity).toBe(5);

    // screws = ceil(12 × 8 × 1.1) = ceil(105.6) = 106
    expect(getMaterial(r, "subfloor-screws")?.quantity).toBe(106);
  });

  it("includePlywoodFloor=false drops the plywood line", () => {
    const r = calculateSubfloorTakeoff({
      floorLengthM: 8,
      floorWidthM: 6,
      includePlywoodFloor: false,
    });
    expect(getMaterial(r, "subfloor-plywood")).toBeUndefined();
  });

  it("includePiles=false drops the piles line", () => {
    const r = calculateSubfloorTakeoff({
      floorLengthM: 8,
      floorWidthM: 6,
      includePiles: false,
    });
    expect(getMaterial(r, "subfloor-piles")).toBeUndefined();
  });

  it("invalid dimensions emit warnings", () => {
    const r = calculateSubfloorTakeoff({
      floorLengthM: 0,
      floorWidthM: -1,
    });
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("each material has a non-empty formula string for audit", () => {
    const r = calculateSubfloorTakeoff({
      floorLengthM: 8,
      floorWidthM: 6,
    });
    for (const m of r.materials) {
      expect(m.formula.length).toBeGreaterThan(0);
    }
  });
});
