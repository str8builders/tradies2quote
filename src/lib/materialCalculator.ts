export type MaterialTakeoffInput = {
  wallLengthM: number;
  wallHeightM?: number;
  /**
   * Length of EXTERIOR walls only (perimeter walls), in metres. Insulation is
   * sized off this — never off interior walls. When omitted (the common scan
   * case, which only carries a single total wall run), insulation falls back to
   * the total wall area and the line is flagged for review rather than silently
   * insulating interior walls. See materials hardening pass.
   */
  exteriorWallLengthM?: number;
  studSpacingMm?: number;
  numberOfDoors?: number;
  numberOfWindows?: number;
  gibSides?: 1 | 2;
  includeInsulation?: boolean;
  includeSkirting?: boolean;
  includeArchitraves?: boolean;
  wastePercent?: number;
  timberStockLengthM?: number;
  gibSheetWidthM?: number;
  gibSheetHeightM?: number;
  insulationPackCoverageM2?: number;
  doorWidthM?: number;
  doorHeightM?: number;
  windowWidthM?: number;
  windowHeightM?: number;
};

export type MaterialTakeoffLine = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  formula: string;
  notes?: string;
  priceMatchKey?: string;
  /**
   * True when this line's quantity is provisional and the tradie must review it.
   * Consumers map this to takeoff_status="needs_review" so the Review Quote
   * UI flags it.
   */
  requiresReview?: boolean;
  /**
   * STRICT exterior-only rule: true when the line CANNOT be calculated from
   * the available evidence (insulation with no exterior wall length — we
   * never size insulation off interior walls, not even flagged). quantity is
   * 0; consumers map this to takeoff_status="blocked", the standard
   * zero-quantity recovery state (the tradie supplies the exterior length or
   * types the quantity themselves, which makes it user-confirmed).
   */
  blocked?: boolean;
};

export type MaterialTakeoffResult = {
  summary: {
    wallAreaM2: number;
    openingAreaM2: number;
    netWallAreaM2: number;
    wastePercent: number;
  };
  materials: MaterialTakeoffLine[];
  warnings: string[];
};

export const DEFAULTS = {
  wallHeightM: 2.4,
  studSpacingMm: 600,
  numberOfDoors: 0,
  numberOfWindows: 0,
  gibSides: 2 as 1 | 2,
  includeInsulation: true,
  includeSkirting: false,
  includeArchitraves: false,
  wastePercent: 10,
  timberStockLengthM: 4.8,
  gibSheetWidthM: 1.2,
  gibSheetHeightM: 2.4,
  insulationPackCoverageM2: 8.8,
  doorWidthM: 0.82,
  doorHeightM: 2.04,
  windowWidthM: 1.2,
  windowHeightM: 1.2,
};

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * Math.ceil with a 6-decimal-place precision guard. Plain Math.ceil on a
 * floating-point computation can push a value like 22.0000000004 (which
 * is mathematically 22 but suffers from IEEE-754 noise) over the integer
 * boundary to 23. safeCeil rounds to 6dp first so only meaningful
 * fractions trigger the ceiling. Used by every formula in the deck,
 * cladding and subfloor calculators that mixes multiplication and
 * division of decimal metres.
 */
function safeCeil(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(Math.round(n * 1e6) / 1e6);
}

/** Reject invalid dimensions before any count is produced. An invalid divisor
 * must never masquerade as zero material required. */
function invalidTakeoff(input: Record<string, unknown>, required: string[], positive: string[]): MaterialTakeoffResult | null {
  const warnings: string[] = [];
  for (const key of required) {
    if (input[key] === undefined || input[key] === null) warnings.push(`${key} is required.`);
  }
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || typeof value === "boolean") continue;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 1e9) warnings.push(`${key} must be a finite non-negative number within range.`);
    else if (positive.includes(key) && number === 0) warnings.push(`${key} must be greater than 0.`);
    else if (key.startsWith("numberOf") && !Number.isInteger(number)) warnings.push(`${key} must be a whole number.`);
  }
  return warnings.length ? {
    summary: { wallAreaM2: 0, openingAreaM2: 0, netWallAreaM2: 0, wastePercent: 0 },
    materials: [], warnings,
  } : null;
}

export function calculateMaterialTakeoff(
  input: MaterialTakeoffInput,
): MaterialTakeoffResult {
  const invalid = invalidTakeoff(input, ["wallLengthM"], ["wallLengthM", "wallHeightM", "studSpacingMm", "timberStockLengthM", "gibSheetWidthM", "gibSheetHeightM", "insulationPackCoverageM2", "doorWidthM", "doorHeightM", "windowWidthM", "windowHeightM"]);
  if (invalid) return invalid;
  const wallLengthM = Number(input.wallLengthM);
  const wallHeightM = input.wallHeightM ?? DEFAULTS.wallHeightM;
  const studSpacingMm = input.studSpacingMm ?? DEFAULTS.studSpacingMm;
  const numberOfDoors = input.numberOfDoors ?? DEFAULTS.numberOfDoors;
  const numberOfWindows = input.numberOfWindows ?? DEFAULTS.numberOfWindows;
  const gibSides = (input.gibSides ?? DEFAULTS.gibSides) as 1 | 2;
  const includeInsulation =
    input.includeInsulation ?? DEFAULTS.includeInsulation;
  const includeSkirting = input.includeSkirting ?? DEFAULTS.includeSkirting;
  const includeArchitraves =
    input.includeArchitraves ?? DEFAULTS.includeArchitraves;
  const wastePercent = input.wastePercent ?? DEFAULTS.wastePercent;
  const timberStockLengthM =
    input.timberStockLengthM ?? DEFAULTS.timberStockLengthM;
  const gibSheetWidthM = input.gibSheetWidthM ?? DEFAULTS.gibSheetWidthM;
  const gibSheetHeightM = input.gibSheetHeightM ?? DEFAULTS.gibSheetHeightM;
  const insulationPackCoverageM2 =
    input.insulationPackCoverageM2 ?? DEFAULTS.insulationPackCoverageM2;
  const doorWidthM = input.doorWidthM ?? DEFAULTS.doorWidthM;
  const doorHeightM = input.doorHeightM ?? DEFAULTS.doorHeightM;
  const windowWidthM = input.windowWidthM ?? DEFAULTS.windowWidthM;
  const windowHeightM = input.windowHeightM ?? DEFAULTS.windowHeightM;

  const warnings: string[] = [];
  if (!Number.isFinite(wallLengthM) || wallLengthM <= 0) {
    warnings.push("wallLengthM must be greater than 0.");
  }
  if (!Number.isFinite(wallHeightM) || wallHeightM <= 0) {
    warnings.push("wallHeightM must be greater than 0.");
  }
  if (gibSides !== 1 && gibSides !== 2) {
    warnings.push("gibSides must be 1 or 2.");
  }
  if (studSpacingMm !== 400 && studSpacingMm !== 600) {
    warnings.push("studSpacingMm must be 400 or 600.");
  }
  if (wastePercent < 0) {
    warnings.push("wastePercent cannot be negative.");
  }

  const safeWallLength = Math.max(wallLengthM, 0);
  const safeWallHeight = Math.max(wallHeightM, 0);

  const rawWallAreaM2 = safeWallLength * safeWallHeight;
  const wallAreaM2 = round2(rawWallAreaM2);
  const doorAreaM2 = numberOfDoors * doorWidthM * doorHeightM;
  const windowAreaM2 = numberOfWindows * windowWidthM * windowHeightM;
  const openingAreaM2 = round2(doorAreaM2 + windowAreaM2);
  const netWallAreaM2 = round2(Math.max(wallAreaM2 - openingAreaM2, 0));

  if (netWallAreaM2 === 0) {
    warnings.push("netWallAreaM2 is 0 — check wall dimensions or openings.");
  }

  const wasteMultiplier = 1 + Math.max(wastePercent, 0) / 100;
  const sheetAreaM2 = gibSheetWidthM * gibSheetHeightM;

  const baseStuds =
    studSpacingMm > 0
      ? Math.ceil((safeWallLength * 1000) / studSpacingMm) + 1
      : 0;
  const openingStuds = numberOfDoors * 4 + numberOfWindows * 4;
  const studCount = baseStuds + openingStuds;

  const plateLengths =
    timberStockLengthM > 0
      ? Math.ceil((safeWallLength * 3) / timberStockLengthM)
      : 0;
  const nogLengths =
    timberStockLengthM > 0
      ? Math.ceil(safeWallLength / timberStockLengthM)
      : 0;

  const gibAreaM2 = Math.max(rawWallAreaM2 - doorAreaM2 - windowAreaM2, 0) * gibSides;
  const gibAreaWithWaste = gibAreaM2 * wasteMultiplier;
  const gibSheets =
    sheetAreaM2 > 0 ? safeCeil(gibAreaWithWaste / sheetAreaM2) : 0;
  const gibScrews = Math.ceil(gibSheets * 40 * 1.1);
  const adhesiveTubes = Math.ceil(gibSheets / 4);

  const materials: MaterialTakeoffLine[] = [
    {
      id: "studs-90x45",
      name: "90x45 SG8 Studs",
      category: "Framing",
      quantity: studCount,
      unit: "lengths",
      formula:
        "ceil((wallLengthM * 1000) / studSpacingMm) + 1 + opening studs",
      priceMatchKey: "90x45-sg8-studs",
    },
    {
      id: "plates-90x45",
      name: "90x45 SG8 Plates",
      category: "Framing",
      quantity: plateLengths,
      unit: "lengths",
      formula: "ceil((wallLengthM * 3) / timberStockLengthM)",
      priceMatchKey: "90x45-sg8-plates",
    },
    {
      id: "nogs-90x45",
      name: "90x45 SG8 Nogs",
      category: "Framing",
      quantity: nogLengths,
      unit: "lengths",
      formula: "ceil(wallLengthM / timberStockLengthM)",
      priceMatchKey: "90x45-sg8-nogs",
    },
    {
      id: "gib-10mm",
      name: "10mm GIB Board",
      category: "Lining",
      quantity: gibSheets,
      unit: "sheets",
      formula:
        "ceil((netWallAreaM2 * gibSides * wasteMultiplier) / sheetAreaM2)",
      priceMatchKey: "10mm-gib-board",
    },
    {
      id: "gib-screws",
      name: "GIB Screws",
      category: "Fixings",
      quantity: gibScrews,
      unit: "screws",
      formula: "ceil(gibSheets * 40 * 1.1)",
      notes: "Estimate only. Round to nearest box in pricing.",
      priceMatchKey: "gib-screws",
    },
    {
      id: "gib-adhesive",
      name: "GIB Adhesive",
      category: "Fixings",
      quantity: adhesiveTubes,
      unit: "tubes",
      formula: "ceil(gibSheets / 4)",
      priceMatchKey: "gib-adhesive",
    },
  ];

  if (includeInsulation) {
    // STRICT RULE: insulation applies to EXTERIOR walls only — and without
    // an exterior wall length it is IMPOSSIBLE, not estimated. When the
    // exterior run is known, size insulation off the exterior net area
    // exactly. When it isn't (only a total wall run — the marker-less scan
    // case), we never size off the total run any more: the line is emitted
    // BLOCKED with quantity 0. Recovery: supply the exterior wall length and
    // recalculate, or type the pack count manually (user-confirmed).
    const rawExterior = input.exteriorWallLengthM;
    const exteriorKnown =
      typeof rawExterior === "number" && Number.isFinite(rawExterior) && rawExterior >= 0;
    const exteriorWallLengthM = exteriorKnown ? Math.max(rawExterior, 0) : null;

    if (exteriorWallLengthM !== null) {
      // Exterior gross area, less the share of openings on exterior walls
      // (proportional to exterior wall run when total openings are known).
      const exteriorGrossArea = round2(exteriorWallLengthM * safeWallHeight);
      const exteriorOpeningArea =
        safeWallLength > 0
          ? round2(openingAreaM2 * Math.min(exteriorWallLengthM / safeWallLength, 1))
          : 0;
      const insulationNetAreaM2 = round2(
        Math.max(exteriorGrossArea - exteriorOpeningArea, 0),
      );
      const insulationAreaWithWaste = insulationNetAreaM2 * wasteMultiplier;
      const insulationPacks =
        insulationPackCoverageM2 > 0
          ? Math.ceil(insulationAreaWithWaste / insulationPackCoverageM2)
          : 0;
      materials.push({
        id: "pink-batts",
        name: "Pink Batts Insulation",
        category: "Insulation",
        quantity: insulationPacks,
        unit: "packs",
        formula:
          "ceil((exteriorWallLengthM * wallHeightM − exterior openings) * wasteMultiplier / insulationPackCoverageM2)",
        notes: "Exterior walls only.",
        priceMatchKey: "pink-batts",
      });
    } else {
      // No exterior evidence → blocked zero-quantity line (never a flagged
      // estimate off the total run — that silently included interior walls).
      materials.push({
        id: "pink-batts",
        name: "Pink Batts Insulation",
        category: "Insulation",
        quantity: 0,
        unit: "packs",
        formula:
          "blocked — exterior-only: needs the exterior wall length before it can be calculated",
        notes:
          "Exterior walls only — no exterior wall length was given, so this can't be calculated. Enter the exterior wall run and recalculate, or type the pack count yourself.",
        blocked: true,
        priceMatchKey: "pink-batts",
      });
    }
  }

  if (includeSkirting) {
    const skirtingLinearM = safeWallLength * gibSides;
    const skirtingWithWaste = skirtingLinearM * wasteMultiplier;
    const skirtingLengths =
      timberStockLengthM > 0
        ? Math.ceil(skirtingWithWaste / timberStockLengthM)
        : 0;
    materials.push({
      id: "skirting",
      name: "Skirting",
      category: "Finishing",
      quantity: skirtingLengths,
      unit: "lengths",
      formula:
        "ceil((wallLengthM * gibSides * wasteMultiplier) / timberStockLengthM)",
      priceMatchKey: "skirting",
    });
  }

  if (includeArchitraves) {
    const architraveLinearM =
      numberOfDoors * (doorHeightM * 2 + doorWidthM);
    const architraveWithWaste = architraveLinearM * wasteMultiplier;
    const architraveLengths =
      timberStockLengthM > 0
        ? Math.ceil(architraveWithWaste / timberStockLengthM)
        : 0;
    materials.push({
      id: "architraves",
      name: "Architraves",
      category: "Finishing",
      quantity: architraveLengths,
      unit: "lengths",
      formula:
        "ceil((doors * ((doorHeightM * 2) + doorWidthM) * wasteMultiplier) / timberStockLengthM)",
      priceMatchKey: "architraves",
    });
  }

  materials.push({
    id: "framing-nails",
    name: "Framing Nails",
    category: "Fixings",
    quantity: 1,
    unit: "box",
    formula: "1 box allowance per small wall",
    priceMatchKey: "framing-nails",
  });

  return {
    summary: {
      wallAreaM2,
      openingAreaM2,
      netWallAreaM2,
      wastePercent,
    },
    materials,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Chunk 1 — Deck takeoff
//
// NZS 3604 framing rules + standard NZ residential deck practice. Joists
// run perpendicular to decking direction; bearers run parallel to it.
// Default profile is 90×19 H3.2 decking on 200×50 H3.2 SG8 joists at
// 450mm centres, sitting on 200×100 H4 SG8 bearers at 1.8m spans, on
// concrete piles at 1.8m centres. Boards have a 5mm gap so coverage =
// boardWidth + 5mm.
//
// Validation: numbers should match blocklayer.com's deck calculator for
// the same dimensions. The operator (qualified builder) is the final
// arbiter — formulas are pure geometry, no AI, so the numbers are
// reproducible and easy to compare.
// ─────────────────────────────────────────────────────────────────────────

export type DeckTakeoffInput = {
  deckLengthM: number;
  deckWidthM: number;
  joistSpacingMm?: number;
  bearerSpacingM?: number;
  pileSpacingM?: number;
  boardWidthMm?: number;
  boardGapMm?: number;
  wastePercent?: number;
  timberStockLengthM?: number;
  includePiles?: boolean;
};

export const DECK_DEFAULTS = {
  joistSpacingMm: 450,
  bearerSpacingM: 1.8,
  pileSpacingM: 1.8,
  boardWidthMm: 90,
  boardGapMm: 5,
  wastePercent: 10,
  timberStockLengthM: 4.8,
  includePiles: true,
};

/**
 * Defence-in-depth clamp: any dimension above 50 m almost certainly
 * means the caller passed millimetres in a metres-named field (NZ
 * residential trade drawings are written in mm with the suffix
 * dropped). A 4800-something value should be 4.8 m. Divide by 1000.
 *
 * The parser in aiTakeoffParser also disambiguates units, but a
 * downstream clamp here means no future caller — AI, manual API, or
 * a refactor — can ever drive a million-dollar runaway quote off
 * unit confusion alone.
 */
function sanitiseMeters(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return value;
  return value > 50 ? value / 1000 : value;
}

// ─────────────────────────────────────────────────────────────────────────
// Wave 43 — Geometric ratio guard (deck)
//
// Third defence layer behind (a) the unit-aware regex in
// aiTakeoffParser.extractRectangle and (b) sanitiseMeters above. Both
// of those operate on INPUTS. The ratio guard operates on OUTPUTS: it
// recomputes each per-m² ratio after the calculator runs and clamps
// anything wildly outside the band that NZ residential practice
// produces. If clamping triggers, a warning is added and the formula
// string is annotated so the operator sees what happened.
//
// The ceilings below are upper bounds for SANE inputs — they were
// chosen by computing the worst-case (smallest deck, tightest joist
// spacing, narrowest boards) and rounding up. A legitimate quote will
// never hit these; only a unit/regex bug will. That's the point.
// ─────────────────────────────────────────────────────────────────────────
const DECK_RATIO_CAPS = {
  // Joist lengths per m² of deck area. Tightest sane case: 300mm
  // joist centres on a 1m-wide deck with 4.8m stock = ~1.3/m². Round
  // up to 1.5 as the alarm threshold.
  joistLengthsPerM2: 1.5,
  // Bearer lengths per m². Worst case at 1.8m spans, narrow deck,
  // 4.8m stock = ~0.4/m². Cap at 0.6.
  bearerLengthsPerM2: 0.6,
  // Decking lineal m per m². 30mm board with 5mm gap = ~28 lm/m²
  // (extreme), 90mm board ≈ 11.7 lm/m². Cap at 30 so anything past
  // "tiny board" gets caught.
  deckingLinealMPerM2: 30,
  // Decking screw PACKS per m². 33 screws/m² ÷ 500 per pack ≈
  // 0.07/m². Cap at 0.5 — a 10 m² deck shouldn't need 5 packs.
  screwPacksPerM2: 0.5,
  // Joist hangers per m². On a 1m-wide deck at 300mm centres ≈
  // 4.3/m² but that's not residential. Cap at 5.
  joistHangersPerM2: 5,
  // Concrete piles per m². 1.8m × 1.8m grid = 0.31/m² typical.
  // Small decks dominate by the 4-corner-pile minimum. Cap at 2.
  pilesPerM2: 2,
};

interface RatioCheck {
  id: string;
  cap: number; // per m² ceiling
  minAllowed?: number; // absolute floor regardless of m²
}

function applyRatioGuard(
  materials: MaterialTakeoffLine[],
  areaM2: number,
  checks: RatioCheck[],
): string[] {
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return [];
  const warnings: string[] = [];
  for (const check of checks) {
    const m = materials.find((mat) => mat.id === check.id);
    if (!m) continue;
    const ceiling = Math.max(
      check.minAllowed ?? 0,
      Math.ceil(check.cap * areaM2),
    );
    if (m.quantity > ceiling) {
      const wasQty = m.quantity;
      m.quantity = ceiling;
      m.formula =
        `${m.formula} [ratio_guard: was ${wasQty} ${m.unit}, capped to ${ceiling} (${check.cap}/m² ceiling for ${areaM2}m² area)]`;
      warnings.push(
        `${m.name}: ratio guard clamped ${wasQty} ${m.unit} → ${ceiling} ${m.unit} (area ${areaM2}m²). Check input dimensions.`,
      );
    }
  }
  return warnings;
}

/**
 * Apply per-line ratio caps in place for a deck takeoff. Any quantity
 * exceeding its cap × deck area is clamped, the formula gets a
 * `[ratio_guard: was N → M]` annotation, and a warning is appended.
 * Sane inputs never trigger this; it's a smoke alarm for future
 * parser/unit regressions.
 */
function applyDeckRatioGuard(
  materials: MaterialTakeoffLine[],
  deckAreaM2: number,
): string[] {
  return applyRatioGuard(materials, deckAreaM2, [
    { id: "deck-joists", cap: DECK_RATIO_CAPS.joistLengthsPerM2 },
    { id: "deck-bearers", cap: DECK_RATIO_CAPS.bearerLengthsPerM2 },
    { id: "decking-boards", cap: DECK_RATIO_CAPS.deckingLinealMPerM2 },
    { id: "deck-screws", cap: DECK_RATIO_CAPS.screwPacksPerM2, minAllowed: 1 },
    { id: "joist-hangers", cap: DECK_RATIO_CAPS.joistHangersPerM2 },
    { id: "deck-piles", cap: DECK_RATIO_CAPS.pilesPerM2, minAllowed: 4 },
  ]);
}

/** Parallel guard for subfloor takeoffs (same geometry, different IDs). */
function applySubfloorRatioGuard(
  materials: MaterialTakeoffLine[],
  floorAreaM2: number,
): string[] {
  return applyRatioGuard(materials, floorAreaM2, [
    { id: "subfloor-joists", cap: DECK_RATIO_CAPS.joistLengthsPerM2 },
    { id: "subfloor-bearers", cap: DECK_RATIO_CAPS.bearerLengthsPerM2 },
    {
      id: "subfloor-joist-hangers",
      cap: DECK_RATIO_CAPS.joistHangersPerM2,
    },
    { id: "subfloor-piles", cap: DECK_RATIO_CAPS.pilesPerM2, minAllowed: 4 },
    // Plywood sheets: sheet area 2.88 m² → ~0.39 sheets/m² with 10%
    // waste, ~0.5/m² with bigger waste. Cap at 1.0/m² (catches a
    // doubled-up dim).
    { id: "subfloor-plywood", cap: 1.0 },
    // Subfloor screws are per-each, ~9 per m². Cap at 25/m².
    { id: "subfloor-screws", cap: 25 },
  ]);
}

export function calculateDeckTakeoff(
  input: DeckTakeoffInput,
): MaterialTakeoffResult {
  const invalid = invalidTakeoff(input, ["deckLengthM", "deckWidthM"], ["deckLengthM", "deckWidthM", "joistSpacingMm", "bearerSpacingM", "pileSpacingM", "boardWidthMm", "timberStockLengthM"]);
  if (invalid) return invalid;
  const deckLengthM = sanitiseMeters(Number(input.deckLengthM));
  const deckWidthM = sanitiseMeters(Number(input.deckWidthM));
  const joistSpacingMm =
    input.joistSpacingMm ?? DECK_DEFAULTS.joistSpacingMm;
  const bearerSpacingM =
    input.bearerSpacingM ?? DECK_DEFAULTS.bearerSpacingM;
  const pileSpacingM = input.pileSpacingM ?? DECK_DEFAULTS.pileSpacingM;
  const boardWidthMm = input.boardWidthMm ?? DECK_DEFAULTS.boardWidthMm;
  const boardGapMm = input.boardGapMm ?? DECK_DEFAULTS.boardGapMm;
  const wastePercent = input.wastePercent ?? DECK_DEFAULTS.wastePercent;
  const timberStockLengthM =
    input.timberStockLengthM ?? DECK_DEFAULTS.timberStockLengthM;
  const includePiles = input.includePiles ?? DECK_DEFAULTS.includePiles;

  const warnings: string[] = [];
  if (!Number.isFinite(deckLengthM) || deckLengthM <= 0) {
    warnings.push("Deck length is missing or invalid.");
  }
  if (!Number.isFinite(deckWidthM) || deckWidthM <= 0) {
    warnings.push("Deck width is missing or invalid.");
  }
  if (![300, 400, 450, 600].includes(joistSpacingMm)) {
    warnings.push(
      `Unusual joist spacing ${joistSpacingMm}mm; NZ residential decks normally use 450mm.`,
    );
  }
  if (wastePercent < 0) warnings.push("Waste percent cannot be negative.");

  const deckAreaM2 = round2(deckLengthM * deckWidthM);
  const wasteMultiplier = 1 + wastePercent / 100;
  const materials: MaterialTakeoffLine[] = [];

  // Joists — run across the deck width, spaced along the deck length.
  const joistCount = safeCeil((deckLengthM * 1000) / joistSpacingMm) + 1;
  const joistLinearM = round2(joistCount * deckWidthM);
  const joistLengths = safeCeil(
    (joistLinearM * wasteMultiplier) / timberStockLengthM,
  );
  materials.push({
    id: "deck-joists",
    name: `Deck joists (${joistLengths} × ${timberStockLengthM}m stock)`,
    category: "Joists",
    quantity: joistLengths,
    unit: "lengths",
    formula: `ceil(joistCount=${joistCount} × widthM=${deckWidthM} × (1+${wastePercent}/100) / ${timberStockLengthM}m) = ${joistLengths}`,
    priceMatchKey: "deck-joists",
    notes: `200×50 H3.2 SG8, ${joistSpacingMm}mm centres`,
  });

  // Bearers — run along the deck length, spaced across the deck width.
  // Outer bearers are set in from each deck edge by SET_IN_M, so the
  // clear span between the two outer bearers is (width - 2 × setIn).
  // Intermediates are only added if that clear span exceeds the max
  // bearer spacing. Matches blocklayer.com's bearer convention.
  const SET_IN_M = 0.1;
  const effectiveBearerSpanM = Math.max(deckWidthM - 2 * SET_IN_M, 0);
  const intermediateBearerCount = Math.max(
    safeCeil(effectiveBearerSpanM / bearerSpacingM) - 1,
    0,
  );
  const bearerRows = 2 + intermediateBearerCount;
  const bearerLinearM = round2(bearerRows * deckLengthM);
  const bearerLengths = safeCeil(
    (bearerLinearM * wasteMultiplier) / timberStockLengthM,
  );
  materials.push({
    id: "deck-bearers",
    name: `Deck bearers (${bearerLengths} × ${timberStockLengthM}m stock)`,
    category: "Bearers",
    quantity: bearerLengths,
    unit: "lengths",
    formula: `ceil(bearerRows=${bearerRows} × lengthM=${deckLengthM} × (1+${wastePercent}/100) / ${timberStockLengthM}m) = ${bearerLengths}`,
    priceMatchKey: "deck-bearers",
    notes: `200×100 H4 SG8, ${bearerSpacingM}m spans`,
  });

  // Decking boards — coverage = boardWidth + gap.
  const coverageMm = boardWidthMm + boardGapMm;
  const boardRows = safeCeil((deckWidthM * 1000) / coverageMm);
  const boardLinearM = round2(boardRows * deckLengthM * wasteMultiplier);
  materials.push({
    id: "decking-boards",
    name: `Decking boards (${boardWidthMm}mm)`,
    category: "Decking",
    quantity: boardLinearM,
    unit: "m",
    formula: `boardRows=ceil(widthMm=${deckWidthM * 1000} / coverage=${coverageMm}) × lengthM=${deckLengthM} × (1+${wastePercent}/100) = ${boardLinearM}m`,
    priceMatchKey: "decking-boards",
    notes: `${boardWidthMm}×19 H3.2 decking, ${boardGapMm}mm gap`,
  });

  // Joist hangers — one per joist at the ledger end (the other end sits
  // on top of the outer bearer with skew nails, not a hanger).
  materials.push({
    id: "joist-hangers",
    name: "Joist hangers",
    category: "Hardware",
    quantity: joistCount,
    unit: "each",
    formula: `joistCount=${joistCount} (one per joist at ledger end)`,
    priceMatchKey: "joist-hangers",
  });

  // Piles — bearer rows × pile points along each bearer. Same set-in
  // logic as bearers: outer piles inset from each end, intermediates
  // only where the clear span exceeds max pile spacing.
  if (includePiles) {
    const effectivePileSpanM = Math.max(deckLengthM - 2 * SET_IN_M, 0);
    const intermediatePileCount = Math.max(
      safeCeil(effectivePileSpanM / pileSpacingM) - 1,
      0,
    );
    const pilesPerRow = 2 + intermediatePileCount;
    const piles = bearerRows * pilesPerRow;
    materials.push({
      id: "deck-piles",
      name: "Concrete piles",
      category: "Piles",
      quantity: piles,
      unit: "each",
      formula: `bearerRows=${bearerRows} × pilesPerRow=${pilesPerRow} = ${piles}`,
      priceMatchKey: "concrete-piles",
    });
  }

  // Decking screws — ~30 per m² industry standard for 90mm boards on
  // 450mm joist centres (2 screws per board per joist). NZ tradies
  // buy stainless decking screws in boxes of 500, so we output the
  // PACK count, not the individual screw count. Outputting "each"
  // here used to collide with library matches priced per pack —
  // resulting in qty 594 × $45/pack = $26K for a 20m² deck.
  const screwsPerPack = 500;
  const screwsTotal = safeCeil(deckAreaM2 * 30 * wasteMultiplier);
  const screwPacks = Math.max(1, Math.ceil(screwsTotal / screwsPerPack));
  materials.push({
    id: "deck-screws",
    name: "Decking screws (stainless)",
    category: "Fixings",
    quantity: screwPacks,
    unit: "pack",
    formula: `ceil(${deckAreaM2}m² × 30 screws/m² × (1+${wastePercent}/100)) = ${screwsTotal} screws → ${screwPacks} pack of ${screwsPerPack}`,
    priceMatchKey: "decking-screws",
  });

  // Joist hanger nails — fixed box allowance.
  materials.push({
    id: "joist-hanger-nails",
    name: "Joist hanger nails",
    category: "Fixings",
    quantity: 1,
    unit: "box",
    formula: "1 box allowance",
    priceMatchKey: "joist-hanger-nails",
  });

  // Wave 43 — ratio guard. Clamps any per-line quantity that exceeds
  // sane per-m² ceilings (defense in depth against future parser
  // regressions). Sane inputs never trigger this; it's a smoke alarm.
  const guardWarnings = applyDeckRatioGuard(materials, deckAreaM2);
  warnings.push(...guardWarnings);

  return {
    summary: {
      wallAreaM2: deckAreaM2,
      openingAreaM2: 0,
      netWallAreaM2: deckAreaM2,
      wastePercent,
    },
    materials,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Chunk 1 — Cladding takeoff
//
// Default profile is 180mm bevel-back weatherboard with 150mm visible
// coverage (30mm lap), on a cavity-batten system per E2/AS1. Includes
// building wrap, cavity battens, cladding fixings. Flashings are
// estimated per opening; complex flashings (parapet, raked head, etc.)
// fall to the operator to adjust manually.
// ─────────────────────────────────────────────────────────────────────────

export type CladdingTakeoffInput = {
  wallLengthM: number;
  wallHeightM?: number;
  openingAreaM2?: number;
  claddingCoverageMm?: number;
  battenSpacingMm?: number;
  wastePercent?: number;
  timberStockLengthM?: number;
  numberOfOpenings?: number;
  buildingPerimeterM?: number;
  includeCavityBattens?: boolean;
  includeBuildingWrap?: boolean;
  includeFlashings?: boolean;
};

export const CLADDING_DEFAULTS = {
  wallHeightM: 2.4,
  openingAreaM2: 0,
  claddingCoverageMm: 150,
  battenSpacingMm: 600,
  wastePercent: 10,
  timberStockLengthM: 4.8,
  numberOfOpenings: 0,
  buildingPerimeterM: 0,
  includeCavityBattens: true,
  includeBuildingWrap: true,
  includeFlashings: true,
  buildingWrapCoverageM2: 27.5, // Standard 1.4m × 20m roll
};

export function calculateCladdingTakeoff(
  input: CladdingTakeoffInput,
): MaterialTakeoffResult {
  const invalid = invalidTakeoff(input, ["wallLengthM"], ["wallLengthM", "wallHeightM", "claddingCoverageMm", "battenSpacingMm", "timberStockLengthM"]);
  if (invalid) return invalid;
  const wallLengthM = sanitiseMeters(Number(input.wallLengthM));
  const wallHeightM = sanitiseMeters(
    input.wallHeightM ?? CLADDING_DEFAULTS.wallHeightM,
  );
  const openingAreaM2 =
    input.openingAreaM2 ?? CLADDING_DEFAULTS.openingAreaM2;
  const claddingCoverageMm =
    input.claddingCoverageMm ?? CLADDING_DEFAULTS.claddingCoverageMm;
  const battenSpacingMm =
    input.battenSpacingMm ?? CLADDING_DEFAULTS.battenSpacingMm;
  const wastePercent = input.wastePercent ?? CLADDING_DEFAULTS.wastePercent;
  const timberStockLengthM =
    input.timberStockLengthM ?? CLADDING_DEFAULTS.timberStockLengthM;
  const numberOfOpenings =
    input.numberOfOpenings ?? CLADDING_DEFAULTS.numberOfOpenings;
  const buildingPerimeterM =
    input.buildingPerimeterM ?? CLADDING_DEFAULTS.buildingPerimeterM;
  const includeCavityBattens =
    input.includeCavityBattens ?? CLADDING_DEFAULTS.includeCavityBattens;
  const includeBuildingWrap =
    input.includeBuildingWrap ?? CLADDING_DEFAULTS.includeBuildingWrap;
  const includeFlashings =
    input.includeFlashings ?? CLADDING_DEFAULTS.includeFlashings;

  const warnings: string[] = [];
  if (!Number.isFinite(wallLengthM) || wallLengthM <= 0) {
    warnings.push("Wall length is missing or invalid.");
  }
  if (wallHeightM <= 0) warnings.push("Wall height is missing or invalid.");
  if (wastePercent < 0) warnings.push("Waste percent cannot be negative.");

  const wallAreaM2 = round2(wallLengthM * wallHeightM);
  const netCladdingAreaM2 = round2(Math.max(wallAreaM2 - openingAreaM2, 0));
  const wasteMultiplier = 1 + wastePercent / 100;
  const materials: MaterialTakeoffLine[] = [];

  // Cladding boards — linear m needed = area / coverage band.
  const claddingLinearM = round2(
    (netCladdingAreaM2 * 1000) / claddingCoverageMm,
  );
  const claddingStock = safeCeil(
    (claddingLinearM * wasteMultiplier) / timberStockLengthM,
  );
  materials.push({
    id: "cladding-boards",
    name: `Weatherboards (${claddingStock} × ${timberStockLengthM}m stock)`,
    category: "Cladding",
    quantity: claddingStock,
    unit: "lengths",
    formula: `ceil(claddingLinearM=${claddingLinearM} × (1+${wastePercent}/100) / ${timberStockLengthM}m) = ${claddingStock}`,
    priceMatchKey: "weatherboard-cladding",
    notes: `180mm bevel-back, ${claddingCoverageMm}mm coverage`,
  });

  // Cavity battens — vertical 20×45 battens at batten spacing, plus
  // horizontal head/sill closures.
  if (includeCavityBattens) {
    const verticalCount =
      safeCeil((wallLengthM * 1000) / battenSpacingMm) + 1;
    const battenLinearM = round2(
      verticalCount * wallHeightM + wallLengthM * 2,
    );
    const battenStock = safeCeil(
      (battenLinearM * wasteMultiplier) / timberStockLengthM,
    );
    materials.push({
      id: "cavity-battens",
      name: `Cavity battens (${battenStock} × ${timberStockLengthM}m stock)`,
      category: "Battens",
      quantity: battenStock,
      unit: "lengths",
      formula: `verticals=${verticalCount} × heightM=${wallHeightM} + horiz=${wallLengthM * 2}m, ceil(× (1+${wastePercent}/100) / ${timberStockLengthM}m) = ${battenStock}`,
      priceMatchKey: "cavity-battens",
      notes: `20×45 H3.1 cavity batten, ${battenSpacingMm}mm centres`,
    });
  }

  // Building wrap — 27.5m² per standard roll, includes wall area plus
  // 100mm lap allowance built into the waste %.
  if (includeBuildingWrap) {
    const wrapRolls = safeCeil(
      (netCladdingAreaM2 * wasteMultiplier) /
        CLADDING_DEFAULTS.buildingWrapCoverageM2,
    );
    materials.push({
      id: "building-wrap",
      name: "Building wrap",
      category: "Weatherproofing",
      quantity: wrapRolls,
      unit: "rolls",
      formula: `ceil(netAreaM2=${netCladdingAreaM2} × (1+${wastePercent}/100) / ${CLADDING_DEFAULTS.buildingWrapCoverageM2}m² per roll) = ${wrapRolls}`,
      priceMatchKey: "building-wrap",
    });
  }

  // Flashings — corner flashings = perimeter; opening flashings = head
  // + jamb + sill per opening (approx 4m linear m per opening).
  if (includeFlashings) {
    const cornerFlashingM = buildingPerimeterM;
    const openingFlashingM = numberOfOpenings * 4;
    const flashingLinearM = round2(cornerFlashingM + openingFlashingM);
    materials.push({
      id: "flashings",
      name: "Aluminium flashings",
      category: "Flashings",
      quantity: flashingLinearM,
      unit: "m",
      formula: `perimeter=${cornerFlashingM}m + openings=${numberOfOpenings} × 4m = ${flashingLinearM}m`,
      priceMatchKey: "aluminium-flashing",
      notes: "Corner + head/jamb/sill flashings",
    });
  }

  // Cladding fixings — galvanised cladding nails, ~12 per m².
  const claddingNails = safeCeil(netCladdingAreaM2 * 12 * wasteMultiplier);
  materials.push({
    id: "cladding-nails",
    name: "Cladding nails (galvanised)",
    category: "Fixings",
    quantity: claddingNails,
    unit: "each",
    formula: `ceil(netAreaM2=${netCladdingAreaM2} × 12 × (1+${wastePercent}/100)) = ${claddingNails}`,
    priceMatchKey: "cladding-nails",
  });

  return {
    summary: {
      wallAreaM2,
      openingAreaM2,
      netWallAreaM2: netCladdingAreaM2,
      wastePercent,
    },
    materials,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Chunk 1 — Subfloor takeoff
//
// Structurally identical to a deck (piles + bearers + joists), but with
// a plywood/strandfloor flooring deck instead of spaced decking boards.
// Default joist centres are 450mm for residential per NZS 3604. Plywood
// is structural 17mm tongue-and-groove, 2.4m × 1.2m sheets.
// ─────────────────────────────────────────────────────────────────────────

export type SubfloorTakeoffInput = {
  floorLengthM: number;
  floorWidthM: number;
  joistSpacingMm?: number;
  bearerSpacingM?: number;
  pileSpacingM?: number;
  wastePercent?: number;
  timberStockLengthM?: number;
  plywoodSheetWidthM?: number;
  plywoodSheetHeightM?: number;
  includePiles?: boolean;
  includePlywoodFloor?: boolean;
};

export const SUBFLOOR_DEFAULTS = {
  joistSpacingMm: 450,
  bearerSpacingM: 1.8,
  pileSpacingM: 1.8,
  wastePercent: 10,
  timberStockLengthM: 4.8,
  plywoodSheetWidthM: 2.4,
  plywoodSheetHeightM: 1.2,
  includePiles: true,
  includePlywoodFloor: true,
};

export function calculateSubfloorTakeoff(
  input: SubfloorTakeoffInput,
): MaterialTakeoffResult {
  const invalid = invalidTakeoff(input, ["floorLengthM", "floorWidthM"], ["floorLengthM", "floorWidthM", "joistSpacingMm", "bearerSpacingM", "pileSpacingM", "timberStockLengthM", "plywoodSheetWidthM", "plywoodSheetHeightM"]);
  if (invalid) return invalid;
  const floorLengthM = sanitiseMeters(Number(input.floorLengthM));
  const floorWidthM = sanitiseMeters(Number(input.floorWidthM));
  const joistSpacingMm =
    input.joistSpacingMm ?? SUBFLOOR_DEFAULTS.joistSpacingMm;
  const bearerSpacingM =
    input.bearerSpacingM ?? SUBFLOOR_DEFAULTS.bearerSpacingM;
  const pileSpacingM =
    input.pileSpacingM ?? SUBFLOOR_DEFAULTS.pileSpacingM;
  const wastePercent =
    input.wastePercent ?? SUBFLOOR_DEFAULTS.wastePercent;
  const timberStockLengthM =
    input.timberStockLengthM ?? SUBFLOOR_DEFAULTS.timberStockLengthM;
  const plywoodSheetWidthM =
    input.plywoodSheetWidthM ?? SUBFLOOR_DEFAULTS.plywoodSheetWidthM;
  const plywoodSheetHeightM =
    input.plywoodSheetHeightM ?? SUBFLOOR_DEFAULTS.plywoodSheetHeightM;
  const includePiles =
    input.includePiles ?? SUBFLOOR_DEFAULTS.includePiles;
  const includePlywoodFloor =
    input.includePlywoodFloor ?? SUBFLOOR_DEFAULTS.includePlywoodFloor;

  const warnings: string[] = [];
  if (!Number.isFinite(floorLengthM) || floorLengthM <= 0) {
    warnings.push("Floor length is missing or invalid.");
  }
  if (!Number.isFinite(floorWidthM) || floorWidthM <= 0) {
    warnings.push("Floor width is missing or invalid.");
  }
  if (![300, 400, 450, 600].includes(joistSpacingMm)) {
    warnings.push(
      `Unusual joist spacing ${joistSpacingMm}mm; NZ residential floors use 400 or 450mm.`,
    );
  }
  if (wastePercent < 0) warnings.push("Waste percent cannot be negative.");

  const floorAreaM2 = round2(floorLengthM * floorWidthM);
  const wasteMultiplier = 1 + wastePercent / 100;
  const materials: MaterialTakeoffLine[] = [];

  // Joists — same geometry as deck.
  const joistCount = safeCeil((floorLengthM * 1000) / joistSpacingMm) + 1;
  const joistLinearM = round2(joistCount * floorWidthM);
  const joistLengths = safeCeil(
    (joistLinearM * wasteMultiplier) / timberStockLengthM,
  );
  materials.push({
    id: "subfloor-joists",
    name: `Subfloor joists (${joistLengths} × ${timberStockLengthM}m stock)`,
    category: "Joists",
    quantity: joistLengths,
    unit: "lengths",
    formula: `ceil(joistCount=${joistCount} × widthM=${floorWidthM} × (1+${wastePercent}/100) / ${timberStockLengthM}m) = ${joistLengths}`,
    priceMatchKey: "subfloor-joists",
    notes: `200×50 H1.2 SG8, ${joistSpacingMm}mm centres`,
  });

  // Bearers — same set-in logic as deck: outer bearers inset from each
  // edge by SET_IN_M, intermediates only where clear span exceeds max.
  const SET_IN_M = 0.1;
  const effectiveBearerSpanM = Math.max(floorWidthM - 2 * SET_IN_M, 0);
  const intermediateBearerCount = Math.max(
    safeCeil(effectiveBearerSpanM / bearerSpacingM) - 1,
    0,
  );
  const bearerRows = 2 + intermediateBearerCount;
  const bearerLinearM = round2(bearerRows * floorLengthM);
  const bearerLengths = safeCeil(
    (bearerLinearM * wasteMultiplier) / timberStockLengthM,
  );
  materials.push({
    id: "subfloor-bearers",
    name: `Subfloor bearers (${bearerLengths} × ${timberStockLengthM}m stock)`,
    category: "Bearers",
    quantity: bearerLengths,
    unit: "lengths",
    formula: `ceil(bearerRows=${bearerRows} × lengthM=${floorLengthM} × (1+${wastePercent}/100) / ${timberStockLengthM}m) = ${bearerLengths}`,
    priceMatchKey: "subfloor-bearers",
    notes: `200×100 H4 SG8, ${bearerSpacingM}m spans`,
  });

  // Piles — same set-in logic.
  if (includePiles) {
    const effectivePileSpanM = Math.max(floorLengthM - 2 * SET_IN_M, 0);
    const intermediatePileCount = Math.max(
      safeCeil(effectivePileSpanM / pileSpacingM) - 1,
      0,
    );
    const pilesPerRow = 2 + intermediatePileCount;
    const piles = bearerRows * pilesPerRow;
    materials.push({
      id: "subfloor-piles",
      name: "Concrete piles",
      category: "Piles",
      quantity: piles,
      unit: "each",
      formula: `bearerRows=${bearerRows} × pilesPerRow=${pilesPerRow} = ${piles}`,
      priceMatchKey: "concrete-piles",
    });
  }

  // Plywood floor sheets — 17mm structural T&G.
  if (includePlywoodFloor) {
    const sheetCoverageM2 = plywoodSheetWidthM * plywoodSheetHeightM;
    const plywoodSheets = safeCeil(
      (floorAreaM2 * wasteMultiplier) / sheetCoverageM2,
    );
    materials.push({
      id: "subfloor-plywood",
      name: "Structural plywood floor (17mm T&G)",
      category: "Flooring",
      quantity: plywoodSheets,
      unit: "sheets",
      formula: `ceil(floorAreaM2=${floorAreaM2} × (1+${wastePercent}/100) / (${plywoodSheetWidthM}×${plywoodSheetHeightM})) = ${plywoodSheets}`,
      priceMatchKey: "structural-plywood",
    });
  }

  // Joist hangers (ledger end only, same as deck).
  materials.push({
    id: "subfloor-joist-hangers",
    name: "Joist hangers",
    category: "Hardware",
    quantity: joistCount,
    unit: "each",
    formula: `joistCount=${joistCount} (one per joist at ledger end)`,
    priceMatchKey: "joist-hangers",
  });

  // Subfloor screws — typical 8 per m² for plywood fixing on joists.
  const screws = safeCeil(floorAreaM2 * 8 * wasteMultiplier);
  materials.push({
    id: "subfloor-screws",
    name: "Subfloor screws",
    category: "Fixings",
    quantity: screws,
    unit: "each",
    formula: `ceil(floorAreaM2=${floorAreaM2} × 8 × (1+${wastePercent}/100)) = ${screws}`,
    priceMatchKey: "subfloor-screws",
  });

  // Wave 43 — subfloor ratio guard. Same defense-in-depth role as the
  // deck guard.
  const guardWarnings = applySubfloorRatioGuard(materials, floorAreaM2);
  warnings.push(...guardWarnings);

  return {
    summary: {
      wallAreaM2: floorAreaM2,
      openingAreaM2: 0,
      netWallAreaM2: floorAreaM2,
      wastePercent,
    },
    materials,
    warnings,
  };
}
