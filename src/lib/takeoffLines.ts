/**
 * Measurements → material lines, for both job page looks. Pure: tested in node.
 *
 * The classic editor's "Takeoff assumptions" panel and the new job page's
 * measurements sheet work the materials out with calculateMaterialTakeoff and
 * write them the same way (this module is the classic editor's own rules,
 * moved out of QuoteEditor so both call them):
 *
 *   - Count-first: a deterministic recalculation produces QUANTITIES only,
 *     never an auto price (matches the server takeoff and PRICES_OFF). The
 *     library link is kept so a manual "use my price" can apply it later.
 *   - The new lines REPLACE every material line; labour and other lines stay,
 *     after them. That also clears blocked "needs dimensions" lines.
 *   - A calculator line that blocked itself (insulation with no exterior
 *     wall length) stays a zero-quantity blocked line, with the standard
 *     recovery (type the count, which makes it the tradie's own number).
 *
 * The quantity check. quote_data.takeoff_evaluation is the takeoff
 * evaluator's verdict (lib/takeoff/evaluate.ts), frozen at generation over the
 * generated takeoff, and the send gate hard-blocks on "fail". Replacing every
 * material line leaves that verdict describing lines the quote no longer has,
 * so the measurements patch carries a FRESH verdict: the same pure evaluator
 * run over the new lines, shaped the way generation shapes them (the framing
 * wrapper's scope for the studs, plates, nogs and nails; the legacy-line
 * adapter every orchestrator wrapper uses). It is never dropped and never set
 * by hand: a takeoff that still fails the check still fails it.
 */

import { matchToLibrary } from "@/lib/materials";
import {
  DEFAULTS,
  type MaterialTakeoffInput,
  type MaterialTakeoffLine,
  type MaterialTakeoffResult,
} from "@/lib/materialCalculator";
import type {
  LibraryMaterial,
  QuoteData,
  QuoteLineItem,
  TakeoffEvaluationSummary,
} from "@/lib/quote-types";
import { legacyToTakeoffLine } from "@/lib/takeoff/calculators/deck";
import { evaluateScope, evaluateTakeoff } from "@/lib/takeoff/evaluate";
import {
  worstStatus,
  type ExtractedExtraction,
  type ScopeResult,
  type ScopeType,
} from "@/lib/takeoff/schemas";

/**
 * The calculator's lines as quote lines: quantities, units and the working;
 * no price; linked to the tradie's library where a row matches.
 */
export function takeoffMaterialLines(
  result: MaterialTakeoffResult,
  library: LibraryMaterial[],
): QuoteLineItem[] {
  return result.materials.map((m): QuoteLineItem => {
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
      // Carry the exterior-only insulation flags through. STRICT: a
      // blocked calculator line (no exterior wall length) stays a
      // zero-quantity blocked line with the standard recovery UX.
      takeoff_status: m.blocked
        ? "blocked"
        : m.requiresReview
          ? "needs_review"
          : undefined,
      takeoff_flags:
        (m.blocked || m.requiresReview) && m.notes ? [m.notes] : [],
    };
  });
}

/** The quote's lines with every material line swapped for `materials` (which go first). */
export function replaceMaterialLines(
  items: readonly QuoteLineItem[],
  materials: readonly QuoteLineItem[],
): QuoteLineItem[] {
  return [...materials, ...items.filter((it) => it.type !== "material")];
}

/** A library row as the new job page loads it: id, name, unit and price. */
export type LibraryRow = Pick<LibraryMaterial, "id" | "name" | "unit" | "default_unit_price"> &
  Partial<LibraryMaterial>;

/**
 * Library rows as the matcher takes them. A row without a use count or a
 * last-used date ranks like an unused one; a full classic row keeps its own,
 * so it matches exactly as the classic editor's library does.
 */
export function libraryMaterials(rows: readonly LibraryRow[]): LibraryMaterial[] {
  return rows.map((row) => ({
    supplier: null,
    supplier_url: null,
    notes: null,
    usage_count: 0,
    is_ai_estimated: false,
    last_used_at: null,
    ...row,
  }));
}

/** The framing wrapper's own lines (lib/takeoff/calculators/framing.ts). */
const FRAMING_LINE_IDS = new Set(["studs-90x45", "plates-90x45", "nogs-90x45", "framing-nails"]);

/** The orchestrator scope a wall-calculator line belongs to, as generation splits a wall. */
function scopeOf(line: MaterialTakeoffLine): ScopeType {
  if (FRAMING_LINE_IDS.has(line.id)) return "framing";
  switch (line.category) {
    case "Lining":
      return "lining";
    case "Insulation":
      return "insulation";
    case "Fixings":
      return "fixing";
    default:
      return "generic";
  }
}

/**
 * The takeoff evaluator's verdict on a worked-out wall, summarised exactly as
 * generation stores it (quote-generation/run.ts): status, the reasons' words,
 * confidence. Null when the calculator refused the measurements: nothing was
 * worked out, so there is nothing to judge (and never a vacuous pass).
 *
 * Each scope is judged on its own, as the orchestrator does: framing with the
 * framing wrapper's summary (wall area; length, height, stud centres, doors,
 * windows, waste), which drives the stud-count check. A line that blocked
 * itself is left out, like a blocked scope: its status already hard-blocks
 * the send gate.
 */
export function takeoffEvaluation(
  result: MaterialTakeoffResult,
  input: MaterialTakeoffInput,
): TakeoffEvaluationSummary | null {
  if (result.materials.length === 0) return null;
  const length_m = Number(input.wallLengthM);
  const height_m = input.wallHeightM ?? DEFAULTS.wallHeightM;
  const spacing_mm = input.studSpacingMm ?? DEFAULTS.studSpacingMm;
  const doors = input.numberOfDoors ?? DEFAULTS.numberOfDoors;
  const windows = input.numberOfWindows ?? DEFAULTS.numberOfWindows;
  const waste_percent = input.wastePercent ?? DEFAULTS.wastePercent;

  const byScope = new Map<ScopeType, MaterialTakeoffLine[]>();
  for (const line of result.materials) {
    if (line.blocked) continue;
    const scope = scopeOf(line);
    byScope.set(scope, [...(byScope.get(scope) ?? []), line]);
  }

  const verdicts = [...byScope].map(([scope, materials]) => {
    const lines = materials.map((m) => legacyToTakeoffLine(m, [], result.warnings));
    const scopeResult: ScopeResult = {
      scope,
      status: worstStatus(lines.map((l) => l.status)),
      summary: {
        primary_metric: "wall area",
        primary_value: result.summary.wallAreaM2,
        unit: "m²",
        inputs: {
          length_m,
          height_m,
          stud_spacing_mm: spacing_mm,
          doors,
          windows,
          waste_percent,
        },
      },
      lines,
      warnings: result.warnings,
      assumptions: [],
      clarifications: [],
      explanation: "",
    };
    // The measurements as the tradie typed them (a manual form, not a guess).
    const extraction: ExtractedExtraction = {
      confidence: 1,
      project_type: null,
      scope_type: scope,
      sub_scopes: [],
      dimensions: { length_m, height_m },
      openings: [
        ...(doors > 0 ? [{ kind: "door" as const, count: doors }] : []),
        ...(windows > 0 ? [{ kind: "window" as const, count: windows }] : []),
      ],
      spacing_mm,
      waste_percent,
      notes: [],
      needs_clarification: [],
      clarification_questions: [],
      source_basis: "manual",
    };
    return evaluateScope(scopeResult, extraction);
  });

  const verdict = evaluateTakeoff(verdicts);
  return {
    status: verdict.status,
    reasons: verdict.reasons.map((r) => r.message),
    confidence: verdict.confidence,
  };
}

export type TakeoffKind = NonNullable<QuoteData["takeoff_type"]>;

const DECK_KEYS = ["deckLengthM", "deckWidthM"];
const FLOOR_KEYS = ["floorLengthM", "floorWidthM", "plywoodSheetWidthM", "includePlywoodFloor"];
const CLADDING_KEYS = [
  "openingAreaM2",
  "claddingCoverageMm",
  "battenSpacingMm",
  "numberOfOpenings",
  "buildingPerimeterM",
  "includeCavityBattens",
  "includeBuildingWrap",
  "includeFlashings",
];
const WALL_KEYS = [
  "exteriorWallLengthM",
  "studSpacingMm",
  "numberOfDoors",
  "numberOfWindows",
  "gibSides",
  "includeInsulation",
  "includeSkirting",
  "includeArchitraves",
];

/** The wall calculator's own lines (materialCalculator.ts), and the cladding calculator's. */
const WALL_LINE_KEYS = new Set([
  "90x45-sg8-studs",
  "90x45-sg8-plates",
  "90x45-sg8-nogs",
  "10mm-gib-board",
  "gib-screws",
  "gib-adhesive",
  "pink-batts",
  "skirting",
  "architraves",
  "framing-nails",
]);
const CLADDING_LINE_KEYS = new Set([
  "weatherboard-cladding",
  "building-wrap",
  "cavity-battens",
  "cladding-nails",
  "aluminium-flashing",
]);

/**
 * Which calculator a quote's stored measurements are for. New quotes say
 * (takeoff_type), a drawing's size check says, and older ones are told apart
 * by the calculator's own input names, then by its own lines (a wall and
 * cladding share length and height). Anything still unclear is left
 * undecided (null) rather than guessed — the wall form must never rewrite a
 * deck, a subfloor or cladding.
 */
export function takeoffKind(data: QuoteData): TakeoffKind | null {
  const inputs = data?.takeoff_inputs as Record<string, unknown> | undefined;
  if (!inputs || typeof inputs !== "object" || Object.keys(inputs).length === 0) return null;
  const stated = data.takeoff_type ?? data.dimension_confirmation?.takeoff_type ?? null;
  if (stated) return stated;
  const has = (keys: string[]) => keys.some((key) => inputs[key] !== undefined && inputs[key] !== null);
  if (has(DECK_KEYS)) return "deck";
  if (has(FLOOR_KEYS)) return "subfloor";
  if (has(CLADDING_KEYS)) return "cladding";
  if (has(WALL_KEYS)) return "wall";
  const keys = (data.line_items ?? []).flatMap((line) =>
    line.is_calculated_takeoff && line.price_match_key ? [line.price_match_key] : [],
  );
  const wall = keys.some((key) => WALL_LINE_KEYS.has(key));
  const cladding = keys.some((key) => CLADDING_LINE_KEYS.has(key));
  if (wall !== cladding) return wall ? "wall" : "cladding";
  return null;
}

/**
 * A wall quote's measurements as they stand: the stored inputs with the
 * drawing's checked sizes on top (the size check keeps its corrections there,
 * and works the materials out from both). Null when it isn't a wall.
 */
export function wallMeasurements(data: QuoteData): Partial<MaterialTakeoffInput> | null {
  if (takeoffKind(data) !== "wall") return null;
  const checked = data.dimension_confirmation?.takeoff_type === "wall" ? data.dimension_confirmation.dimensions : [];
  return {
    ...(data.takeoff_inputs as Partial<MaterialTakeoffInput>),
    ...Object.fromEntries(checked.map((size) => [size.key, size.value])),
  };
}

/**
 * Everything a measurements apply saves: the patch (lines, fresh check), the
 * measurements themselves (so the form and the size check start from them
 * next time), and the drawing's sizes the tradie just typed, now confirmed.
 */
export function measurementsSave(
  data: QuoteData,
  patch: MeasurementsPatch,
  input: MaterialTakeoffInput,
): Partial<QuoteData> {
  const typed = input as unknown as Record<string, unknown>;
  const dc = data.dimension_confirmation;
  return {
    ...patch,
    takeoff_type: "wall",
    takeoff_inputs: { ...(data.takeoff_inputs ?? {}), ...input } as QuoteData["takeoff_inputs"],
    ...(dc && dc.takeoff_type === "wall"
      ? {
          dimension_confirmation: {
            ...dc,
            dimensions: dc.dimensions.map((size) => {
              const value = Number(typed[size.key]);
              return Number.isFinite(value) && value > 0 ? { ...size, value, confirmed: true } : size;
            }),
          },
        }
      : {}),
  };
}

/** What applying measurements changes in quote_data: the lines, and the check that judges them. */
export type MeasurementsPatch = Required<Pick<QuoteData, "line_items" | "takeoff_evaluation">>;

/**
 * The quote_data change a measurements apply makes: every material line
 * replaced by the worked-out ones (what the classic editor's Recalculate does
 * to the lines) plus the fresh quantity check on them. Null when the
 * calculator refused the measurements, so nothing is written.
 */
export function measurementsPatch(
  lines: readonly QuoteLineItem[],
  result: MaterialTakeoffResult,
  input: MaterialTakeoffInput,
  library: LibraryMaterial[],
): MeasurementsPatch | null {
  const evaluation = takeoffEvaluation(result, input);
  if (!evaluation) return null;
  return {
    line_items: replaceMaterialLines(lines, takeoffMaterialLines(result, library)),
    takeoff_evaluation: evaluation,
  };
}

export type TakeoffPreviewRow =
  | { change: "added"; line: QuoteLineItem }
  | { change: "same" | "changed"; line: QuoteLineItem; before: QuoteLineItem }
  | { change: "removed"; line: QuoteLineItem };

const words = (text: string | null | undefined) => (text ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * What swapping in `next` (the new material lines) does, line by line. Each
 * new line sits beside the current material line it takes over (the same
 * price key, else the same words; each current line once), or is new; the
 * current material lines nothing takes over come off. New lines in the
 * calculator's order, then the ones that come off in the quote's order.
 */
export function takeoffLinesPreview(
  current: readonly QuoteLineItem[],
  next: readonly QuoteLineItem[],
): TakeoffPreviewRow[] {
  const materials = current.filter((it) => it.type === "material");
  const taken = new Set<number>();
  const free = (i: number) => !taken.has(i);
  const rows: TakeoffPreviewRow[] = next.map((line): TakeoffPreviewRow => {
    const key = line.price_match_key;
    let at = key ? materials.findIndex((it, i) => free(i) && it.price_match_key === key) : -1;
    if (at === -1) at = materials.findIndex((it, i) => free(i) && words(it.description) === words(line.description));
    if (at === -1) return { change: "added", line };
    taken.add(at);
    const before = materials[at];
    const same = Number(before.quantity) === Number(line.quantity) && words(before.unit) === words(line.unit);
    return { change: same ? "same" : "changed", line, before };
  });
  materials.forEach((line, i) => {
    if (free(i)) rows.push({ change: "removed", line });
  });
  return rows;
}

/** Material lines carrying a price: replacing the materials takes those prices off the quote. */
export function pricedMaterialLines(items: readonly QuoteLineItem[]): number {
  return items.filter((it) => it.type === "material" && (Number(it.unit_price) || 0) > 0).length;
}
