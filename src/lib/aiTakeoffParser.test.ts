import { describe, expect, it } from "vitest";
import {
  canRunCalculator,
  parseTakeoffDescription,
  type ParsedTakeoffResult,
} from "./aiTakeoffParser";
import {
  calculateMaterialTakeoff,
  type MaterialTakeoffInput,
} from "./materialCalculator";

/**
 * The parsed result is a discriminated union — TS needs the `type`
 * field to narrow `input`. These tests all hit the wall-framing path,
 * so this helper does the narrowing in one place.
 */
function wallInput(
  r: ParsedTakeoffResult,
): Partial<MaterialTakeoffInput> {
  if (r.type !== "wall") {
    throw new Error(`expected type="wall", got "${r.type}"`);
  }
  return r.input;
}

describe("parseTakeoffDescription", () => {
  it("extracts the canonical example", () => {
    const r = parseTakeoffDescription(
      "Replace GIB in a 4m wall, 2.4m high, GIB both sides, one door, pink batts, skirting.",
    );
    expect(wallInput(r).wallLengthM).toBe(4);
    expect(wallInput(r).wallHeightM).toBe(2.4);
    expect(wallInput(r).gibSides).toBe(2);
    expect(wallInput(r).numberOfDoors).toBe(1);
    expect(wallInput(r).includeInsulation).toBe(true);
    expect(wallInput(r).includeSkirting).toBe(true);
    expect(r.missingFields).toEqual([]);
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it('extracts wall length from "wall length 5m"', () => {
    const r = parseTakeoffDescription("wall length 5m");
    expect(wallInput(r).wallLengthM).toBe(5);
  });

  it('extracts wall length from "5 metre wall"', () => {
    const r = parseTakeoffDescription("5 metre wall, GIB both sides");
    expect(wallInput(r).wallLengthM).toBe(5);
  });

  it("extracts stud spacing 600mm centres", () => {
    const r = parseTakeoffDescription(
      "4m wall, 2.4m high, 600mm centres, both sides",
    );
    expect(wallInput(r).studSpacingMm).toBe(600);
  });

  it("extracts stud spacing 400 centres", () => {
    const r = parseTakeoffDescription(
      "3m wall, 2.4m high, 400 centres, both sides",
    );
    expect(wallInput(r).studSpacingMm).toBe(400);
  });

  it('extracts windows from "two windows"', () => {
    const r = parseTakeoffDescription(
      "4m wall, 2.4m high, two windows, both sides",
    );
    expect(wallInput(r).numberOfWindows).toBe(2);
  });

  it('extracts gibSides=1 from "GIB one side"', () => {
    const r = parseTakeoffDescription(
      "4m wall, 2.4m high, GIB one side only",
    );
    expect(wallInput(r).gibSides).toBe(1);
  });

  it('extracts gibSides=2 from "two sides"', () => {
    const r = parseTakeoffDescription("4m wall, 2.4m high, two sides");
    expect(wallInput(r).gibSides).toBe(2);
  });

  it('handles "no insulation" → false', () => {
    const r = parseTakeoffDescription(
      "4m wall, 2.4m high, both sides, no insulation",
    );
    expect(wallInput(r).includeInsulation).toBe(false);
  });

  it("flags wallLength as missing when absent", () => {
    const r = parseTakeoffDescription("Just a quote with both sides GIB");
    expect(r.missingFields).toContain("Wall length.");
  });

  it("flags gibSides as missing when absent", () => {
    const r = parseTakeoffDescription("4m wall, 2.4m high");
    expect(r.missingFields).toContain("GIB one side or both sides?");
  });

  it("uses default wall height with assumption when missing", () => {
    const r = parseTakeoffDescription("4m wall, both sides");
    expect(wallInput(r).wallHeightM).toBe(2.4);
    expect(r.assumptions).toContain("Used default wall height of 2.4m.");
    expect(r.missingFields).not.toContain("Wall height.");
  });

  it("does NOT default when applyDefaults is false", () => {
    const r = parseTakeoffDescription("4m wall, both sides", {
      applyDefaults: false,
    });
    expect(wallInput(r).wallHeightM).toBeUndefined();
    expect(r.missingFields).toContain("Wall height.");
  });

  it("extracts waste percent from various phrasings", () => {
    expect(
      parseTakeoffDescription("4m wall, 2.4m high, both sides, 15% waste").input
        .wastePercent,
    ).toBe(15);
    expect(
      parseTakeoffDescription("4m wall, 2.4m high, both sides, waste 12%").input
        .wastePercent,
    ).toBe(12);
  });

  it("parsed inputs feed calculator and produce materials", () => {
    const r = parseTakeoffDescription(
      "Replace GIB in a 4m wall, 2.4m high, GIB both sides, one door, pink batts, skirting.",
    );
    expect(canRunCalculator(r)).toBe(true);
    const calc = calculateMaterialTakeoff(r.input as never);
    expect(calc.materials.find((m) => m.id === "studs-90x45")?.quantity).toBe(
      12,
    );
    // 4m wall with 1 door: net area 7.9272 m², GIB both sides with 10% waste ⇒ 7 sheets
    expect(calc.materials.find((m) => m.id === "gib-10mm")?.quantity).toBe(7);
    expect(
      calc.materials.find((m) => m.id === "skirting"),
    ).toBeTruthy();
    expect(
      calc.materials.find((m) => m.id === "pink-batts"),
    ).toBeTruthy();
  });
});

describe("detectTakeoffType + per-type parsers", () => {
  it("voice 'I'm doing a 6 by 3 deck' → deck, 6×3", async () => {
    const { detectTakeoffType } = await import("./aiTakeoffParser");
    expect(detectTakeoffType("I'm doing a 6 by 3 deck")).toBe("deck");
    const r = parseTakeoffDescription("I'm doing a 6 by 3 deck");
    expect(r.type).toBe("deck");
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBe(6);
    expect(r.input.deckWidthM).toBe(3);
    expect(canRunCalculator(r)).toBe(true);
  });

  // Scan-drawing bug (house layout → wrong deck quote). The scan flow
  // emits a `[T2Q_PLAN] type=…` marker carrying the structure type the AI
  // read off the DRAWING. That marker must win over loose keyword matching
  // in the prose, so a stray "deck"/"Job type: Deck" mention can't force the
  // deck calculator when the drawing is actually something else.
  it("[T2Q_PLAN] marker type wins over a 'deck' mention in the prose", async () => {
    const { detectTakeoffType } = await import("./aiTakeoffParser");
    const transcript = [
      "[T2Q_PLAN] type=wall length_m=6 width_m=3 height_m=2.4",
      "Job type: Framing.",
      "What is being built: Single-storey house floor plan.",
      "NOTES: client also wants a deck quoted later.",
    ].join("\n\n");
    expect(detectTakeoffType(transcript)).toBe("wall");
  });

  it("marker with a non-calculator-only signal still routes by marker, not prose", async () => {
    const { detectTakeoffType } = await import("./aiTakeoffParser");
    // No deck dims, no deck marker — a house plan classified as Framing
    // (→ wall) must not fall through to the 'deck' loose match in the notes.
    const transcript =
      "[T2Q_PLAN] type=wall length_m=8 width_m=4\nFloor plan. Possible deck out back, not drawn.";
    expect(detectTakeoffType(transcript)).toBe("wall");
  });

  it("'build a 4m × 2m deck' → deck, 4×2", () => {
    const r = parseTakeoffDescription("build a 4m × 2m deck");
    expect(r.type).toBe("deck");
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBe(4);
    expect(r.input.deckWidthM).toBe(2);
  });

  it("'decking 6 x 3' uses 'x' separator", () => {
    const r = parseTakeoffDescription("decking 6 x 3");
    expect(r.type).toBe("deck");
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBe(6);
    expect(r.input.deckWidthM).toBe(3);
  });

  // Regression — Wave 42. The Whakamārama scan came back with
  // dimensions "4800 x 3820" (mm with the suffix dropped, the NZ
  // trade-drawing default). The old unit-optional regex treated
  // those bare numbers as metres and the calculator emitted ~8000
  // joists for a 4.8 m × 3.82 m deck. These cases lock the
  // unit-aware behaviour so it can't silently regress.
  it("'4800 x 3820' (NZ trade-drawing mm, no suffix) → 4.8 m × 3.82 m", () => {
    const r = parseTakeoffDescription("deck 4800 x 3820");
    expect(r.type).toBe("deck");
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBeCloseTo(4.8, 3);
    expect(r.input.deckWidthM).toBeCloseTo(3.82, 3);
  });

  it("'4800mm x 3820mm' (explicit mm) → 4.8 m × 3.82 m", () => {
    const r = parseTakeoffDescription("deck 4800mm x 3820mm");
    expect(r.type).toBe("deck");
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBeCloseTo(4.8, 3);
    expect(r.input.deckWidthM).toBeCloseTo(3.82, 3);
  });

  // Regression — Wave 42b. Once the parser was unit-aware it started
  // picking up timber-size notation ("125x125 posts", "140x45 joists")
  // as the deck shape, producing 1 joist / 0.28 m of decking. The
  // parser must skip any X-by-Y match where both sides come out
  // under 1 m — those are material sizes, not plan footprints.
  it("skips '125x125' (post timber size) and finds the real deck dims", () => {
    const r = parseTakeoffDescription(
      "Deck job. Posts 125x125 H5. Joists 140x45 H3.2. Plan: 4800 x 3820.",
    );
    expect(r.type).toBe("deck");
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBeCloseTo(4.8, 3);
    expect(r.input.deckWidthM).toBeCloseTo(3.82, 3);
  });

  it("skips '140x45' (joist timber size) before the deck dims", () => {
    const r = parseTakeoffDescription(
      "Joists 140x45 H3.2 at 450mm centres. Deck 6 x 3 m.",
    );
    expect(r.type).toBe("deck");
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBe(6);
    expect(r.input.deckWidthM).toBe(3);
  });

  it("returns undefined when only timber sizes are present (no real plan)", () => {
    const r = parseTakeoffDescription(
      "Posts 125x125 H5. Joists 140x45 H3.2. Decking 140x19.",
    );
    expect(r.type).toBe("deck");
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBeUndefined();
    expect(r.input.deckWidthM).toBeUndefined();
  });

  it("orders dimensions so length ≥ width regardless of input order", () => {
    const r = parseTakeoffDescription("3 by 6 deck");
    expect(r.type).toBe("deck");
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBe(6);
    expect(r.input.deckWidthM).toBe(3);
  });

  it("'no piles' sets includePiles=false", () => {
    const r = parseTakeoffDescription("6 by 3 deck, ground level, no piles");
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.includePiles).toBe(false);
  });

  it("'cladding a 6m wall, 2.4m high' → cladding", () => {
    const r = parseTakeoffDescription(
      "Cladding a 6m wall, 2.4m high, no openings",
    );
    expect(r.type).toBe("cladding");
    if (r.type !== "cladding") throw new Error("not cladding");
    expect(r.input.wallLengthM).toBe(6);
    expect(r.input.wallHeightM).toBe(2.4);
    expect(canRunCalculator(r)).toBe(true);
  });

  it("'weatherboards on 12m wall, 2 windows' → cladding with openings", () => {
    const r = parseTakeoffDescription(
      "Weatherboards on 12m wall, 2.4m high, two windows",
    );
    expect(r.type).toBe("cladding");
    if (r.type !== "cladding") throw new Error("not cladding");
    expect(r.input.wallLengthM).toBe(12);
    expect(r.input.numberOfOpenings).toBe(2);
    // 2 windows × 1.44 m² = 2.88
    expect(r.input.openingAreaM2).toBeCloseTo(2.88, 2);
  });

  it("'8 by 6 subfloor' → subfloor 8×6", () => {
    const r = parseTakeoffDescription("8 by 6 subfloor");
    expect(r.type).toBe("subfloor");
    if (r.type !== "subfloor") throw new Error("not subfloor");
    expect(r.input.floorLengthM).toBe(8);
    expect(r.input.floorWidthM).toBe(6);
    expect(canRunCalculator(r)).toBe(true);
  });

  it("'floor framing 4×3' also detects subfloor", () => {
    const r = parseTakeoffDescription("Floor framing 4 × 3");
    expect(r.type).toBe("subfloor");
    if (r.type !== "subfloor") throw new Error("not subfloor");
    expect(r.input.floorLengthM).toBe(4);
    expect(r.input.floorWidthM).toBe(3);
  });

  it("ambiguous description with no clear job type → wall (legacy)", () => {
    const r = parseTakeoffDescription("4m of GIB, both sides");
    expect(r.type).toBe("wall");
  });

  it("'deck' wins over 'wall' when both keywords appear", () => {
    const r = parseTakeoffDescription("6 by 3 deck against the back wall");
    expect(r.type).toBe("deck");
  });

  it("'subfloor' wins over 'deck' when both appear", () => {
    const r = parseTakeoffDescription(
      "8 by 6 subfloor — same as a deck structure",
    );
    expect(r.type).toBe("subfloor");
  });

  it("'cladding' wins over 'wall' when both appear", () => {
    const r = parseTakeoffDescription("cladding the 6m wall");
    expect(r.type).toBe("cladding");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Wave 43 — Structured marker support
//
// The ScanPanel now embeds machine-readable markers at the top of the
// transcript so the calculator gets the AI's structured plan dims
// directly instead of guessing them out of prose. These tests lock
// the marker priority, the cross-check against user-edited prose, and
// the timber-stock-length forwarding.
// ─────────────────────────────────────────────────────────────────────────
describe("structured [T2Q_PLAN] marker", () => {
  it("uses marker dims for deck even when prose has no rectangle", () => {
    const t =
      "[T2Q_PLAN] type=deck length_m=4.8 width_m=3.82\n\n" +
      "Job type: Deck.\nWhat is being built: Timber deck.\n" +
      "DIMENSIONS (tradie-confirmed):\nPost depth: 600mm\n";
    const r = parseTakeoffDescription(t);
    expect(r.type).toBe("deck");
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBeCloseTo(4.8, 3);
    expect(r.input.deckWidthM).toBeCloseTo(3.82, 3);
  });

  it("marker takes priority over an unrelated loose rectangle", () => {
    // Real failure mode: AI's structured plan correctly says 4.8 ×
    // 3.82 m but the structural section mentions a 7m × 6m site
    // outline. Without the marker, the loose scanner used to grab
    // 7×6 and the calculator emitted a 42m² deck takeoff.
    const t =
      "[T2Q_PLAN] type=deck length_m=4.8 width_m=3.82\n" +
      "Deck job. Site outline 7m × 6m. Joists 140x45.";
    const r = parseTakeoffDescription(t);
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBeCloseTo(4.8, 3);
    expect(r.input.deckWidthM).toBeCloseTo(3.82, 3);
  });

  it("standalone dimensions override marker when they disagree > 25%", () => {
    // Failure mode: AI's plan says 7×6 (wrong) but the dimensions
    // section (which the tradie can edit) says 4.8m and 3.82m. The
    // cross-check rule says the user-visible text wins.
    const t =
      "[T2Q_PLAN] type=deck length_m=7 width_m=6\n\n" +
      "Job type: Deck.\n" +
      "DIMENSIONS (tradie-confirmed):\n4800mm = 4.8m\n3820mm = 3.82m\n" +
      "STRUCTURAL ELEMENTS:\nJoists 140x45 H3.2";
    const r = parseTakeoffDescription(t);
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBeCloseTo(4.8, 3);
    expect(r.input.deckWidthM).toBeCloseTo(3.82, 3);
    expect(r.assumptions.some((a) => a.includes("disagreed"))).toBe(true);
  });

  it("marker AND standalone agree within 25% → marker wins, no warning", () => {
    const t =
      "[T2Q_PLAN] type=deck length_m=4.8 width_m=3.82\n\n" +
      "DIMENSIONS:\n4800mm = 4.8m\n3820mm = 3.82m\n" +
      "STRUCTURAL ELEMENTS:\nJoists 140x45";
    const r = parseTakeoffDescription(t);
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBeCloseTo(4.8, 3);
    expect(r.assumptions.some((a) => a.includes("disagreed"))).toBe(false);
  });

  // Regression — Wave 43b. AI prose mentioned "deck area 28.8m²" and
  // the standalone-dim extractor picked up "28.8m" as a candidate
  // (because `\b` treats `²` as a word boundary). The cross-check
  // then ran with 28.8 as `lengthM`, overrode the correct 6×4.8
  // marker, and the calculator produced 72 joists / 2027m of decking
  // — a 30+ × 6 deck. This locks the m² guard.
  it("rejects a standalone side that ≈ the plan's AREA (area-vs-length guard)", () => {
    // Defence-in-depth for the m² extractor hole seen in production: the
    // text offered 28.8 (= 6 × 4.8, the area) as a side length with no `²`
    // symbol to filter on. Even though 28.8 'disagrees' >25% with the
    // 6×4.8 plan, it's an area mistaken for a length, so the AI plan must
    // win — otherwise the calculator builds a 28.8×6 monster (72 joists).
    const t =
      "[T2Q_PLAN] type=deck length_m=6 width_m=4.8\n\n" +
      "Job type: Deck.\n" +
      "DIMENSIONS (tradie-confirmed):\n28.8m\n6.0m\n" +
      "STRUCTURAL ELEMENTS:\nJoists 140x45 H3.2";
    const r = parseTakeoffDescription(t);
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBeCloseTo(6, 3);
    expect(r.input.deckWidthM).toBeCloseTo(4.8, 3);
    expect(
      r.assumptions.some((a) => a.includes("looked like an area")),
    ).toBe(true);
  });

  it("ignores `28.8m²` (area mention) — does not treat as plan dim", () => {
    const t =
      "[T2Q_PLAN] type=deck length_m=6 width_m=4.8\n\n" +
      "Job type: Deck.\n" +
      "DIMENSIONS (tradie-confirmed):\n" +
      "6.0m (top edge)\n" +
      "4800mm = 4.8m\n" +
      "STRUCTURAL ELEMENTS:\nDeck area: 28.8m². Concrete volume 0.45m³ × 12 posts.\n";
    const r = parseTakeoffDescription(t);
    if (r.type !== "deck") throw new Error("not deck");
    // Marker wins — no rogue 28.8 dragged in from the structural
    // section.
    expect(r.input.deckLengthM).toBeCloseTo(6, 3);
    expect(r.input.deckWidthM).toBeCloseTo(4.8, 3);
  });

  it("standalone scan is scoped to the DIMENSIONS section when present", () => {
    // Pile depth `1.8m` and rail length `12m` mentioned in prose
    // shouldn't override DIMENSIONS-section values.
    const t =
      "[T2Q_PLAN] type=deck length_m=4.8 width_m=3.82\n\n" +
      "DIMENSIONS (tradie-confirmed):\n4800mm = 4.8m\n3820mm = 3.82m\n" +
      "STRUCTURAL ELEMENTS:\nFence rail 12m, pile depth 1.8m.\n";
    const r = parseTakeoffDescription(t);
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBeCloseTo(4.8, 3);
    expect(r.input.deckWidthM).toBeCloseTo(3.82, 3);
  });

  it("subfloor marker carries dimensions", () => {
    const t =
      "[T2Q_PLAN] type=subfloor length_m=8 width_m=6\n\n" +
      "Subfloor framing job.";
    const r = parseTakeoffDescription(t);
    expect(r.type).toBe("subfloor");
    if (r.type !== "subfloor") throw new Error("not subfloor");
    expect(r.input.floorLengthM).toBe(8);
    expect(r.input.floorWidthM).toBe(6);
  });

  it("malformed marker is ignored (falls through to text scan)", () => {
    const t =
      "[T2Q_PLAN] type=deck length_m=garbage width_m=3.82\n\n" +
      "Deck 6 by 3";
    const r = parseTakeoffDescription(t);
    if (r.type !== "deck") throw new Error("not deck");
    // Loose scanner kicks in.
    expect(r.input.deckLengthM).toBe(6);
    expect(r.input.deckWidthM).toBe(3);
  });

  it("out-of-band marker (300 m × 200 m, over the shared 100 m edge band) is ignored", () => {
    const t =
      "[T2Q_PLAN] type=deck length_m=300 width_m=200\n\n" +
      "Deck 6 by 3";
    const r = parseTakeoffDescription(t);
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBe(6);
    expect(r.input.deckWidthM).toBe(3);
  });

  it("marker enforces length ≥ width regardless of axis order", () => {
    // AI returned axes reversed — marker should normalise so the
    // calculator gets the deck the same way around either way.
    const t = "[T2Q_PLAN] type=deck length_m=3.82 width_m=4.8\n\nDeck job.";
    const r = parseTakeoffDescription(t);
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBeCloseTo(4.8, 3);
    expect(r.input.deckWidthM).toBeCloseTo(3.82, 3);
  });

  it("[T2Q_TIMBER] sets timberStockLengthM for deck", () => {
    const t =
      "[T2Q_PLAN] type=deck length_m=4.8 width_m=3.82\n" +
      "[T2Q_TIMBER] stock_length_m=6\n\nDeck job.";
    const r = parseTakeoffDescription(t);
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.timberStockLengthM).toBe(6);
  });

  it("prose 'buys timber in 6m lengths' also sets stock length", () => {
    const t =
      "[T2Q_PLAN] type=deck length_m=4.8 width_m=3.82\n\n" +
      "Tradie buys timber in 6m lengths. 10% waste.";
    const r = parseTakeoffDescription(t);
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.timberStockLengthM).toBe(6);
  });

  it("timber stock length is clamped to 2.4 – 7.2 m", () => {
    const tooLong =
      "[T2Q_PLAN] type=deck length_m=4.8 width_m=3.82\n" +
      "[T2Q_TIMBER] stock_length_m=20";
    const r1 = parseTakeoffDescription(tooLong);
    if (r1.type !== "deck") throw new Error("not deck");
    // Out-of-band → no override.
    expect(r1.input.timberStockLengthM).toBeUndefined();

    const tooShort =
      "[T2Q_PLAN] type=deck length_m=4.8 width_m=3.82\n" +
      "[T2Q_TIMBER] stock_length_m=1";
    const r2 = parseTakeoffDescription(tooShort);
    if (r2.type !== "deck") throw new Error("not deck");
    expect(r2.input.timberStockLengthM).toBeUndefined();
  });
});

describe("standalone dimensions fallback", () => {
  it("picks the two largest unit-bearing values when no rectangle is present", () => {
    const t =
      "Job type: Deck.\n" +
      "DIMENSIONS:\n4800mm = 4.8m (length)\n3820mm = 3.82m (width)\n" +
      "Post depth 600mm\n12 posts at 1800mm spacing\n";
    const r = parseTakeoffDescription(t);
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBeCloseTo(4.8, 3);
    expect(r.input.deckWidthM).toBeCloseTo(3.82, 3);
  });

  it("ignores numbers below 1m (timber sizes, fastener spacings)", () => {
    const t = "Deck. Posts 125mm. Joists 140mm. Decking 90mm boards.";
    const r = parseTakeoffDescription(t);
    if (r.type !== "deck") throw new Error("not deck");
    expect(r.input.deckLengthM).toBeUndefined();
    expect(r.input.deckWidthM).toBeUndefined();
  });
});

describe("runTakeoff", () => {
  it("dispatches deck → deck calculator", async () => {
    const { runTakeoff } = await import("./aiTakeoffParser");
    const r = parseTakeoffDescription("6 by 3 deck");
    const result = runTakeoff(r);
    expect(result).not.toBeNull();
    // The deck calculator's specific signature: includes joist-hangers
    expect(
      result?.materials.some((m) => m.id === "joist-hangers"),
    ).toBe(true);
  });

  it("dispatches cladding → cladding calculator", async () => {
    const { runTakeoff } = await import("./aiTakeoffParser");
    const r = parseTakeoffDescription("cladding 6m wall, 2.4m high");
    const result = runTakeoff(r);
    expect(result).not.toBeNull();
    expect(
      result?.materials.some((m) => m.id === "cladding-boards"),
    ).toBe(true);
  });

  it("dispatches subfloor → subfloor calculator", async () => {
    const { runTakeoff } = await import("./aiTakeoffParser");
    const r = parseTakeoffDescription("8 by 6 subfloor");
    const result = runTakeoff(r);
    expect(result).not.toBeNull();
    expect(
      result?.materials.some((m) => m.id === "subfloor-joists"),
    ).toBe(true);
  });

  it("dispatches wall → wall calculator", async () => {
    const { runTakeoff } = await import("./aiTakeoffParser");
    const r = parseTakeoffDescription(
      "4m wall, 2.4m high, both sides GIB",
    );
    const result = runTakeoff(r);
    expect(result).not.toBeNull();
    expect(result?.materials.some((m) => m.id === "studs-90x45")).toBe(
      true,
    );
  });

  it("returns null when there's not enough to run", async () => {
    const { runTakeoff } = await import("./aiTakeoffParser");
    const r = parseTakeoffDescription("doing a deck job");
    expect(runTakeoff(r)).toBeNull();
  });
});

describe("canRunCalculator", () => {
  it("requires wallLengthM, wallHeightM, gibSides", () => {
    expect(
      canRunCalculator({
        type: "wall",
        input: {},
        missingFields: [],
        assumptions: [],
        confidence: 0,
      }),
    ).toBe(false);
    expect(
      canRunCalculator({
        type: "wall",
        input: { wallLengthM: 4, wallHeightM: 2.4 },
        missingFields: [],
        assumptions: [],
        confidence: 0,
      }),
    ).toBe(false);
    expect(
      canRunCalculator({
        type: "wall",
        input: { wallLengthM: 4, wallHeightM: 2.4, gibSides: 2 },
        missingFields: [],
        assumptions: [],
        confidence: 0,
      }),
    ).toBe(true);
  });
});

describe("missing-dimension drawing → blocks (phase 7)", () => {
  it("a deck drawing with NO dimensions can't run the calculator", () => {
    // This is what the generate route turns into a BLOCKED line (instead of
    // an AI-guessed quantity): canRunCalculator=false + populated reasons.
    const r = parseTakeoffDescription(
      "[T2Q_PLAN] type=deck\n[T2Q_TIMBER] stock_length_m=6\nJob type: Deck. Build a deck.",
    );
    expect(r.type).toBe("deck");
    expect(canRunCalculator(r)).toBe(false);
    expect(r.missingFields.length).toBeGreaterThan(0);
  });

  it("a deck drawing WITH dimensions can run the calculator", () => {
    const r = parseTakeoffDescription(
      "[T2Q_PLAN] type=deck length_m=6 width_m=4\n[T2Q_TIMBER] stock_length_m=6\nJob type: Deck.",
    );
    expect(r.type).toBe("deck");
    expect(canRunCalculator(r)).toBe(true);
  });
});
