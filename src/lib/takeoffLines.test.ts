import { describe, expect, it } from "vitest";
import {
  calculateMaterialTakeoff,
  type MaterialTakeoffInput,
  type MaterialTakeoffResult,
} from "@/lib/materialCalculator";
import { matchToLibrary } from "@/lib/materials";
import { computeQuoteTotals } from "@/lib/quote-defaults";
import type { LibraryMaterial, QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { assessQuoteTakeoffSafety } from "@/lib/quote-validation";
import { runFramingCalculator } from "@/lib/takeoff/calculators/framing";
import { evaluateScope } from "@/lib/takeoff/evaluate";
import type { ExtractedExtraction } from "@/lib/takeoff/schemas";
import {
  libraryMaterials,
  measurementsPatch,
  measurementsSave,
  pricedMaterialLines,
  replaceMaterialLines,
  takeoffEvaluation,
  takeoffKind,
  takeoffLinesPreview,
  takeoffMaterialLines,
  wallMeasurements,
  type MeasurementsPatch,
} from "./takeoffLines";

/**
 * QuoteEditor's handleTakeoffResult as it stood before it moved here,
 * verbatim (setItems's updater applied to `prev`): the reference the shared
 * lib must match exactly.
 */
function classicHandleTakeoffResult(
  prev: QuoteLineItem[],
  result: MaterialTakeoffResult,
  library: LibraryMaterial[],
): QuoteLineItem[] {
  const newMaterials: QuoteLineItem[] = result.materials.map((m) => {
    const match = matchToLibrary(m.name, library);
    return {
      type: "material",
      description: m.name,
      quantity: m.quantity,
      unit: m.unit,
      unit_price: 0,
      line_total: 0,
      library_id: match?.id ?? null,
      is_ai_estimated: false,
      is_missing_price: true,
      is_calculated_takeoff: true,
      quantity_source: "calculator",
      formula: m.formula,
      price_match_key: m.priceMatchKey,
      takeoff_status: m.blocked
        ? "blocked"
        : m.requiresReview
          ? "needs_review"
          : undefined,
      takeoff_flags:
        (m.blocked || m.requiresReview) && m.notes ? [m.notes] : [],
    };
  });
  return [...newMaterials, ...prev.filter((it) => it.type !== "material")];
}

const row = (over: Partial<LibraryMaterial> & Pick<LibraryMaterial, "id" | "name">): LibraryMaterial => ({
  unit: null,
  default_unit_price: null,
  supplier: null,
  supplier_url: null,
  notes: null,
  usage_count: 0,
  is_ai_estimated: false,
  last_used_at: null,
  ...over,
});

/** Two equally good "GIB screws" rows: only the use count and date tell them apart. */
const LIBRARY: LibraryMaterial[] = [
  row({ id: "lib-gib", name: "10mm GIB Board", unit: "sheet", default_unit_price: 32.5, usage_count: 4 }),
  row({ id: "lib-screws-old", name: "GIB Screws", unit: "box", default_unit_price: 21, usage_count: 1, last_used_at: "2026-01-02" }),
  row({ id: "lib-screws-new", name: "GIB Screws", unit: "box", default_unit_price: 24, usage_count: 9, last_used_at: "2026-09-01" }),
  row({ id: "lib-studs", name: "90x45 SG8 Studs", unit: "length", default_unit_price: 18.4 }),
];

const line = (over: Partial<QuoteLineItem> & { description: string }): QuoteLineItem => ({
  type: "material",
  quantity: 1,
  unit: "each",
  unit_price: 0,
  line_total: 0,
  ...over,
});

/** A generated deck quote: AI and calculator material lines, a blocked line, labour, an extra. */
const CURRENT: QuoteLineItem[] = [
  line({ description: "Decking boards (90mm)", quantity: 168.96, unit: "m", unit_price: 9.5, line_total: 1605.12, quantity_source: "calculator" }),
  line({ description: "framing takeoff — needs dimensions before it can be quoted", quantity: 0, takeoff_status: "blocked" }),
  line({ type: "labour", description: "Build the wall", quantity: 2, unit: "day", unit_price: 560, line_total: 1120 }),
  line({ description: "10mm gib  board", quantity: 12, unit: "sheets", unit_price: 32.5, line_total: 390, price_match_key: "10mm-gib-board" }),
  line({ type: "other", description: "Skip bin", quantity: 1, unit: "each", unit_price: 300, line_total: 300 }),
  line({ description: "GIB Screws", quantity: 528, unit: "screws", quantity_source: "ai" }),
];

const WALL: MaterialTakeoffInput = {
  wallLengthM: 4.8,
  wallHeightM: 2.4,
  studSpacingMm: 600,
  numberOfDoors: 1,
  numberOfWindows: 1,
  gibSides: 2,
  includeInsulation: false,
  includeSkirting: true,
  includeArchitraves: true,
  wastePercent: 10,
};

/** A short wall with more openings than wall: no GIB at all, and far more studs than centres. */
const CRAMPED: MaterialTakeoffInput = { ...WALL, wallLengthM: 1.2, numberOfDoors: 2, numberOfWindows: 2 };

describe("takeoffMaterialLines + replaceMaterialLines: the classic editor's recalculation", () => {
  const cases: Array<[string, MaterialTakeoffResult]> = [
    ["a wall with every extra", calculateMaterialTakeoff(WALL)],
    ["insulation on, no exterior run (a blocked line)", calculateMaterialTakeoff({ ...WALL, includeInsulation: true })],
    ["a refused calculation (no lines)", calculateMaterialTakeoff({ ...WALL, wallHeightM: 0 })],
    [
      "a line flagged for review",
      {
        summary: { wallAreaM2: 1, openingAreaM2: 0, netWallAreaM2: 1, wastePercent: 10 },
        materials: [
          { id: "x", name: "Pink Batts Insulation", category: "Insulation", quantity: 3, unit: "packs", formula: "f", notes: "Check it.", requiresReview: true },
          { id: "y", name: "Mystery", category: "Other", quantity: 1, unit: "each", formula: "g", notes: "Ignored: not flagged." },
        ],
        warnings: [],
      },
    ],
  ];

  it.each(cases)("%s: identical to the classic handler", (_name, result) => {
    const shared = replaceMaterialLines(CURRENT, takeoffMaterialLines(result, LIBRARY));
    expect(shared).toEqual(classicHandleTakeoffResult(CURRENT, result, LIBRARY));
  });

  it("writes quantities with no price, linked to the library, and blocked insulation as blocked", () => {
    const lines = takeoffMaterialLines(calculateMaterialTakeoff({ ...WALL, includeInsulation: true }), LIBRARY);
    const gib = lines.find((l) => l.description === "10mm GIB Board")!;
    expect(gib).toMatchObject({ unit_price: 0, line_total: 0, is_missing_price: true, library_id: "lib-gib", quantity_source: "calculator" });
    // The busier, more recent of two equal rows, as the classic editor picks.
    expect(lines.find((l) => l.description === "GIB Screws")!.library_id).toBe("lib-screws-new");
    const batts = lines.find((l) => l.description === "Pink Batts Insulation")!;
    expect(batts).toMatchObject({ quantity: 0, takeoff_status: "blocked" });
    expect(batts.takeoff_flags?.[0]).toMatch(/exterior/i);
  });

  it("puts the new materials first and keeps labour and other lines in their order", () => {
    const next = replaceMaterialLines(CURRENT, takeoffMaterialLines(calculateMaterialTakeoff(WALL), LIBRARY));
    const firstOther = next.findIndex((l) => l.type !== "material");
    expect(next.slice(firstOther).map((l) => l.description)).toEqual(["Build the wall", "Skip bin"]);
    expect(next.slice(0, firstOther).every((l) => l.quantity_source === "calculator")).toBe(true);
    // Every old material line is gone, the blocked "needs dimensions" one too.
    expect(next.some((l) => l.takeoff_status === "blocked")).toBe(false);
    expect(next.some((l) => l.description === "Decking boards (90mm)")).toBe(false);
  });
});

describe("libraryMaterials", () => {
  it("fills what the new job page doesn't load, and keeps a full classic row as it is", () => {
    const [pick, full] = libraryMaterials([
      { id: "a", name: "GIB Screws", unit: "box", default_unit_price: 24 },
      LIBRARY[2],
    ]);
    expect(pick).toEqual(row({ id: "a", name: "GIB Screws", unit: "box", default_unit_price: 24 }));
    expect(full).toEqual(LIBRARY[2]);
  });

  it("matches classic rows exactly as the classic editor does", () => {
    const result = calculateMaterialTakeoff(WALL);
    expect(takeoffMaterialLines(result, libraryMaterials(LIBRARY))).toEqual(takeoffMaterialLines(result, LIBRARY));
  });
});

/** The framing scope exactly as generation builds and judges it (orchestrator path). */
function generationFramingVerdict(input: MaterialTakeoffInput) {
  const ext: ExtractedExtraction = {
    confidence: 1,
    project_type: null,
    scope_type: "framing",
    sub_scopes: [],
    dimensions: { length_m: input.wallLengthM, height_m: input.wallHeightM },
    openings: [
      { kind: "door", count: input.numberOfDoors },
      { kind: "window", count: input.numberOfWindows },
    ],
    spacing_mm: input.studSpacingMm,
    waste_percent: input.wastePercent,
    notes: [],
    needs_clarification: [],
    clarification_questions: [],
    source_basis: "manual",
  };
  return evaluateScope(runFramingCalculator(ext), ext);
}

describe("takeoffEvaluation: the takeoff evaluator re-run on the worked-out lines", () => {
  it("passes an ordinary wall", () => {
    expect(takeoffEvaluation(calculateMaterialTakeoff(WALL), WALL)).toEqual({ status: "pass", reasons: [], confidence: 1 });
  });

  it("flags a cramped wall, word for word as the evaluator says it", () => {
    const evaluation = takeoffEvaluation(calculateMaterialTakeoff(CRAMPED), CRAMPED)!;
    expect(evaluation.status).toBe("caution");
    expect(evaluation.reasons).toEqual([
      "Stud count (19) looks off for a 1.2m wall at 600mm centres (expected roughly 3).",
      '"10mm GIB Board" came out as zero — check the inputs.',
      '"GIB Screws" came out as zero — check the inputs.',
      '"GIB Adhesive" came out as zero — check the inputs.',
      '"Skirting" came out as zero — check the inputs.',
    ]);
    expect(evaluation.confidence).toBeLessThan(1);
  });

  it("judges the framing exactly as generation's own framing scope does", () => {
    for (const input of [WALL, CRAMPED, { ...WALL, studSpacingMm: 400, wallLengthM: 2.4, numberOfWindows: 3 }]) {
      const framing = generationFramingVerdict(input).reasons.map((r) => r.message);
      const ours = takeoffEvaluation(calculateMaterialTakeoff(input), input)!.reasons;
      for (const reason of framing) expect(ours).toContain(reason);
    }
    expect(generationFramingVerdict(CRAMPED).status).toBe("caution");
  });

  it("leaves a blocked line to its own status (no zero-quantity reason for it)", () => {
    const input = { ...WALL, includeInsulation: true };
    const evaluation = takeoffEvaluation(calculateMaterialTakeoff(input), input)!;
    expect(evaluation.status).toBe("pass");
    expect(evaluation.reasons.join(" ")).not.toMatch(/Pink Batts/);
  });

  it("fails a line with a broken quantity", () => {
    const broken: MaterialTakeoffResult = {
      ...calculateMaterialTakeoff(WALL),
      materials: calculateMaterialTakeoff(WALL).materials.map((m) =>
        m.id === "studs-90x45" ? { ...m, quantity: Number.NaN } : m,
      ),
    };
    const evaluation = takeoffEvaluation(broken, WALL)!;
    expect(evaluation.status).toBe("fail");
    expect(evaluation.reasons).toContain('"90x45 SG8 Studs" produced an invalid quantity (NaN).');
    expect(evaluation.confidence).toBeLessThanOrEqual(0.25);
  });

  it("judges nothing (null, never a pass) when the calculator refused the measurements", () => {
    const refused = { ...WALL, wallHeightM: 0 };
    expect(calculateMaterialTakeoff(refused).materials).toEqual([]);
    expect(takeoffEvaluation(calculateMaterialTakeoff(refused), refused)).toBeNull();
  });

  it("is deterministic", () => {
    const a = takeoffEvaluation(calculateMaterialTakeoff(CRAMPED), CRAMPED);
    const b = takeoffEvaluation(calculateMaterialTakeoff(CRAMPED), CRAMPED);
    expect(a).toEqual(b);
  });
});

/** A generated wall quote whose frozen quantity check failed. */
function failedQuote(): QuoteData {
  const lines = [
    line({ description: "Decking boards (90mm)", quantity: Number.NaN, unit: "m", quantity_source: "calculator" }),
    line({ type: "labour", description: "Build the wall", quantity: 2, unit: "day", unit_price: 560, line_total: 1120 }),
  ];
  return {
    client: { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: null },
    job_summary: "Frame and GIB a new bedroom wall",
    line_items: lines,
    ...computeQuoteTotals(lines, 0, 15),
    markup_pct: 0,
    tax_rate: 15,
    tax_label: "GST",
    currency: "NZD",
    terms: "",
    notes: [],
    takeoff_evaluation: {
      status: "fail",
      reasons: ['"Decking boards (90mm)" produced an invalid quantity (NaN).'],
      confidence: 0.25,
    },
  } as QuoteData;
}

/** The quote as it saves once the patch is in (the save recomputes the totals). */
function saved(data: QuoteData, patch: Partial<QuoteData>): QuoteData {
  const next = { ...data, ...patch };
  return { ...next, ...computeQuoteTotals(next.line_items, next.markup_pct, next.tax_rate) };
}

describe("measurementsPatch: what applying measurements writes", () => {
  const description = "Frame and GIB a new bedroom wall";

  it("holds exactly the lines and the fresh quantity check", () => {
    const patch = measurementsPatch(CURRENT, calculateMaterialTakeoff(WALL), WALL, LIBRARY)!;
    expect(Object.keys(patch).sort()).toEqual(["line_items", "takeoff_evaluation"]);
    expect(patch.line_items).toEqual(classicHandleTakeoffResult(CURRENT, calculateMaterialTakeoff(WALL), LIBRARY));
    expect(patch.takeoff_evaluation).toEqual(takeoffEvaluation(calculateMaterialTakeoff(WALL), WALL));
  });

  it("replaces a failed verdict with the new one, and the send gate stops blocking on it", () => {
    const quote = failedQuote();
    const before = assessQuoteTakeoffSafety(quote, { description });
    expect(before.can_send).toBe(false);
    expect(before.block_reasons).toContain(quote.takeoff_evaluation!.reasons[0]);

    const patch = measurementsPatch(quote.line_items, calculateMaterialTakeoff(WALL), WALL, LIBRARY)!;
    expect(patch.takeoff_evaluation).toEqual({ status: "pass", reasons: [], confidence: 1 });
    const after = assessQuoteTakeoffSafety(saved(quote, patch), { description });
    expect(after.block_reasons).not.toContain(quote.takeoff_evaluation!.reasons[0]);
    expect(after).toMatchObject({ can_send: true, block_reasons: [] });
  });

  it("a cramped wall's caution replaces the fail: sendable once acknowledged", () => {
    const quote = failedQuote();
    const patch = measurementsPatch(quote.line_items, calculateMaterialTakeoff(CRAMPED), CRAMPED, LIBRARY)!;
    expect(patch.takeoff_evaluation.status).toBe("caution");
    const after = assessQuoteTakeoffSafety(saved(quote, patch), { description });
    expect(after.can_send).toBe(true);
    expect(after.requires_acknowledgement).toBe(true);
  });

  it("a takeoff that still fails the check stays blocked", () => {
    const quote = failedQuote();
    const good = calculateMaterialTakeoff(WALL);
    const broken: MaterialTakeoffResult = {
      ...good,
      materials: good.materials.map((m) => (m.id === "gib-10mm" ? { ...m, quantity: Number.POSITIVE_INFINITY } : m)),
    };
    const patch = measurementsPatch(quote.line_items, broken, WALL, LIBRARY)!;
    expect(patch.takeoff_evaluation.status).toBe("fail");
    const after = assessQuoteTakeoffSafety(saved(quote, patch), { description });
    expect(after.can_send).toBe(false);
    expect(after.block_reasons).toContain('"10mm GIB Board" produced an invalid quantity (Infinity).');
    // The old reason is gone: the verdict is about the new lines.
    expect(after.block_reasons).not.toContain(quote.takeoff_evaluation!.reasons[0]);
  });

  it("a blocked insulation line still blocks sending on its own, whatever the check says", () => {
    const quote = failedQuote();
    const input = { ...WALL, includeInsulation: true };
    const patch = measurementsPatch(quote.line_items, calculateMaterialTakeoff(input), input, LIBRARY)!;
    expect(patch.takeoff_evaluation.status).toBe("pass");
    const after = assessQuoteTakeoffSafety(saved(quote, patch), { description: "Frame, insulate and GIB a wall" });
    expect(after.can_send).toBe(false);
    expect(after.block_reasons.join(" ")).toMatch(/Pink Batts Insulation/);
  });

  it("writes nothing when the calculator refused the measurements", () => {
    const refused = { ...WALL, wallHeightM: 0 };
    expect(measurementsPatch(CURRENT, calculateMaterialTakeoff(refused), refused, LIBRARY)).toBeNull();
  });
});

describe("takeoffLinesPreview", () => {
  const next = takeoffMaterialLines(calculateMaterialTakeoff(WALL), LIBRARY);
  const rows = takeoffLinesPreview(CURRENT, next);
  const find = (description: string) => rows.find((r) => r.line.description === description)!;

  it("sets each new line beside the current line it takes over", () => {
    // By price key, whatever the words' spacing and case.
    const gib = find("10mm GIB Board");
    expect(gib.change).toBe("changed");
    expect(gib.change !== "added" && gib.change !== "removed" && gib.before.description).toBe("10mm gib  board");
    // By the same words when there is no key.
    expect(find("GIB Screws")).toMatchObject({ change: "changed", before: { quantity: 528 } });
    expect(find("90x45 SG8 Studs").change).toBe("added");
  });

  it("lists the material lines that come off, after the new ones, and never labour or other lines", () => {
    const removed = rows.filter((r) => r.change === "removed").map((r) => r.line.description);
    expect(removed).toEqual(["Decking boards (90mm)", "framing takeoff — needs dimensions before it can be quoted"]);
    expect(rows.slice(-2).every((r) => r.change === "removed")).toBe(true);
    expect(rows.some((r) => r.line.type !== "material")).toBe(false);
    expect(rows.filter((r) => r.change !== "removed")).toHaveLength(next.length);
  });

  it("marks a line whose quantity and unit didn't change", () => {
    const same = takeoffLinesPreview(next, next);
    expect(same.every((r) => r.change === "same")).toBe(true);
  });
});

describe("pricedMaterialLines", () => {
  it("counts the material lines a replacement takes prices off", () => {
    expect(pricedMaterialLines(CURRENT)).toBe(2);
    expect(pricedMaterialLines(CURRENT.filter((l) => l.type !== "material"))).toBe(0);
  });
});

/* ── Which calculator, and the measurements as they stand ─────────────── */

describe("takeoffKind: the wall form only ever opens on a wall", () => {
  const q = (extra: Partial<QuoteData>, lines: Partial<QuoteLineItem>[] = []) =>
    ({ line_items: lines as QuoteLineItem[], ...extra }) as QuoteData;
  const calc = (price_match_key: string) => ({ type: "material", is_calculated_takeoff: true, price_match_key }) as Partial<QuoteLineItem>;

  it("a quote that says, or whose drawing check says", () => {
    expect(takeoffKind(q({ takeoff_inputs: { wallLengthM: 12 }, takeoff_type: "cladding" }))).toBe("cladding");
    expect(
      takeoffKind(q({ takeoff_inputs: { wallLengthM: 12 }, dimension_confirmation: { takeoff_type: "deck" } as QuoteData["dimension_confirmation"] })),
    ).toBe("deck");
  });

  it("older quotes by the calculator's own inputs", () => {
    expect(takeoffKind(q({ takeoff_inputs: { deckLengthM: 4.8, deckWidthM: 3 } as QuoteData["takeoff_inputs"] }))).toBe("deck");
    expect(takeoffKind(q({ takeoff_inputs: { floorLengthM: 8, floorWidthM: 6 } as QuoteData["takeoff_inputs"] }))).toBe("subfloor");
    expect(takeoffKind(q({ takeoff_inputs: { wallLengthM: 20, includeBuildingWrap: true } as QuoteData["takeoff_inputs"] }))).toBe("cladding");
    expect(takeoffKind(q({ takeoff_inputs: { wallLengthM: 12, gibSides: 2 } }))).toBe("wall");
  });

  it("length and height only (wall or cladding): told apart by the lines, else left undecided", () => {
    const inputs = { takeoff_inputs: { wallLengthM: 12, wallHeightM: 2.4 } };
    expect(takeoffKind(q(inputs, [calc("90x45-sg8-studs")]))).toBe("wall");
    expect(takeoffKind(q(inputs, [calc("weatherboard-cladding")]))).toBe("cladding");
    expect(takeoffKind(q(inputs))).toBeNull();
  });

  it("no measurements stored: nothing to change", () => {
    expect(takeoffKind(q({}))).toBeNull();
    expect(takeoffKind(q({ takeoff_inputs: {} }))).toBeNull();
  });
});

describe("the measurements as they stand, and what applying them saves", () => {
  const wall = {
    line_items: [],
    takeoff_type: "wall",
    takeoff_inputs: { wallLengthM: 10, wallHeightM: 2.4, gibSides: 2 },
    dimension_confirmation: {
      required: true,
      reasons: ["no_scale"],
      takeoff_type: "wall",
      dimensions: [{ key: "wallLengthM", label: "Wall length", value: 12, unit: "m", confirmed: true }],
    },
  } as unknown as QuoteData;

  it("the form opens on the stored measurements with the checked sizes on top", () => {
    expect(wallMeasurements(wall)).toMatchObject({ wallLengthM: 12, wallHeightM: 2.4, gibSides: 2 });
    expect(wallMeasurements({ ...wall, takeoff_type: "deck" } as QuoteData)).toBeNull();
  });

  it("applying saves the measurements and confirms the sizes typed, so a later size check starts from them", () => {
    const input = { wallLengthM: 14, wallHeightM: 2.7, gibSides: 2 as const, studSpacingMm: 600 } as MaterialTakeoffInput;
    const patch = { line_items: [], takeoff_evaluation: { status: "pass", reasons: [], confidence: 1 } } as unknown as MeasurementsPatch;
    const saved = measurementsSave(wall, patch, input);
    expect(saved.takeoff_type).toBe("wall");
    expect(saved.takeoff_inputs).toMatchObject({ wallLengthM: 14, wallHeightM: 2.7, studSpacingMm: 600 });
    expect(saved.dimension_confirmation?.dimensions[0]).toMatchObject({ key: "wallLengthM", value: 14, confirmed: true });
    expect(saved.takeoff_evaluation).toEqual(patch.takeoff_evaluation);
  });
});
