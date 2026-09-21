// ─────────────────────────────────────────────────────────────────────────
// #1 — Drawing key-dimension confirmation.
//
// A drawing scan can mis-read the numbers that DRIVE a takeoff (deck length,
// floor width, wall height). For RISKY drawings we freeze the exact key
// dimensions the deterministic calculator used and require the tradie to
// confirm (or correct) them before the quote can be sent.
//
//   buildDimensionConfirmation — decide IF a drawing is risky and, if so,
//   which key dimensions need confirming and why. Returns null for
//   voice/typed inputs and safe drawings (zero friction).
//
//   confirmAndRecalc — apply the tradie's confirmations/corrections.
//   Confirming alone keeps the numbers; correcting a dimension re-runs the
//   SAME deterministic calculator (never the AI) so the quantities update
//   from concrete inputs. Prices from the prior calculator lines are
//   preserved. Pure — safe to call client-side (live preview) and from the
//   server action (authoritative persist).
//
// Pure, no I/O. Server-side only data — never exposed via PublicQuotePayload.
// ─────────────────────────────────────────────────────────────────────────

import { runTakeoff, type ParsedTakeoffResult } from "./aiTakeoffParser";
import { round2 } from "./quote-defaults";
import type {
  ConfirmableDimension,
  DimensionConfirmation,
  DimensionConfirmationReason,
  QuoteData,
  QuoteLineItem,
} from "./quote-types";

/** Confidence below this → the AI's read of the drawing is treated as risky. */
export const DIM_CONFIRM_LOW_CONFIDENCE = 0.7;
/** Plan footprint (m²) at/above which the high $ impact warrants confirming. */
export const DIM_CONFIRM_LARGE_AREA_M2 = 40;

/** Canonical reason ordering so the stored list is deterministic. */
const REASON_ORDER: DimensionConfirmationReason[] = [
  "no_scale",
  "low_confidence",
  "plan_text_disagree",
  "large_quantity",
];

type SupportedTakeoffType = "deck" | "subfloor" | "cladding" | "wall";

/**
 * The key dimensions that drive each calculator, in the order shown. `key`
 * is the calculator INPUT FIELD NAME so a correction maps straight back onto
 * the calculator with no translation layer. The plan footprint (for the
 * large-quantity check) is the product of the two.
 */
const KEY_DIMENSIONS: Record<
  SupportedTakeoffType,
  ReadonlyArray<{ key: string; label: string }>
> = {
  deck: [
    { key: "deckLengthM", label: "Deck length" },
    { key: "deckWidthM", label: "Deck width" },
  ],
  subfloor: [
    { key: "floorLengthM", label: "Floor length" },
    { key: "floorWidthM", label: "Floor width" },
  ],
  cladding: [
    { key: "wallLengthM", label: "Wall length" },
    { key: "wallHeightM", label: "Wall height" },
  ],
  wall: [
    { key: "wallLengthM", label: "Wall length" },
    { key: "wallHeightM", label: "Wall height" },
  ],
};

function isSupportedType(t: string): t is SupportedTakeoffType {
  return t === "deck" || t === "subfloor" || t === "cladding" || t === "wall";
}

/**
 * Read the present, positive key-dimension values for a parsed takeoff.
 * Returns null when the type has no key dimensions (e.g. "unknown") or a key
 * dimension is missing — a missing dimension is handled by the blocked-line
 * path in generate, not by confirmation.
 */
function readKeyDimensions(parsed: ParsedTakeoffResult):
  | {
      type: SupportedTakeoffType;
      defs: ReadonlyArray<{ key: string; label: string }>;
      values: Record<string, number>;
    }
  | null {
  if (!isSupportedType(parsed.type)) return null;
  const defs = KEY_DIMENSIONS[parsed.type];
  const input = parsed.input as Record<string, unknown>;
  const values: Record<string, number> = {};
  for (const d of defs) {
    const v = Number(input[d.key]);
    if (!Number.isFinite(v) || v <= 0) return null;
    values[d.key] = v;
  }
  return { type: parsed.type, defs, values };
}

/**
 * Decide whether a drawing's key dimensions need confirming before send.
 * Returns null for non-drawings and safe drawings — confirmation friction is
 * only ever produced for genuinely risky drawings.
 */
export function buildDimensionConfirmation(args: {
  isDrawing: boolean;
  parsed: ParsedTakeoffResult;
  /** True when the drawing carried no usable scale. */
  noScale?: boolean;
}): DimensionConfirmation | null {
  const { isDrawing, parsed, noScale } = args;
  if (!isDrawing) return null;

  const kd = readKeyDimensions(parsed);
  if (!kd) return null;
  const { type, defs, values } = kd;

  const reasons = new Set<DimensionConfirmationReason>();
  if ((Number(parsed.confidence) || 0) < DIM_CONFIRM_LOW_CONFIDENCE) {
    reasons.add("low_confidence");
  }
  if (
    Array.isArray(parsed.assumptions) &&
    parsed.assumptions.some((a) =>
      /disagreed with the dimensions text/i.test(a),
    )
  ) {
    reasons.add("plan_text_disagree");
  }
  if (noScale) reasons.add("no_scale");
  const area = defs.reduce((acc, d) => acc * values[d.key], 1);
  if (area >= DIM_CONFIRM_LARGE_AREA_M2) reasons.add("large_quantity");

  // Safe drawing — nothing flagged, so no confirmation (no friction).
  if (reasons.size === 0) return null;

  const dimensions: ConfirmableDimension[] = defs.map((d) => ({
    key: d.key,
    label: d.label,
    value: values[d.key],
    unit: "m",
    confirmed: false,
  }));

  return {
    required: true,
    reasons: REASON_ORDER.filter((r) => reasons.has(r)),
    takeoff_type: type,
    dimensions,
    confirmed_by: null,
    confirmed_at: null,
  };
}

export type DimensionEdit = { key: string; value: number };

/**
 * Apply the tradie's confirmations/corrections to a quote.
 *
 * Confirming with no value change keeps every number (`changed: false`).
 * Correcting any dimension re-runs the SAME deterministic calculator with the
 * corrected inputs (`changed: true`) so the quantities follow from concrete
 * numbers — the AI never re-enters the loop. Prices and library matches from
 * the prior calculator lines are preserved (keyed by `price_match_key`);
 * non-calculator lines (labour, tradie additions) are left untouched.
 *
 * Returns null when there's nothing to act on (no confirmation object or no
 * stored takeoff inputs to recompute from).
 */
export function confirmAndRecalc(
  quoteData: QuoteData,
  edits: DimensionEdit[],
  meta: { confirmedBy: string; confirmedAt: string },
): {
  line_items: QuoteLineItem[];
  dimension_confirmation: DimensionConfirmation;
  changed: boolean;
} | null {
  const dc = quoteData.dimension_confirmation;
  if (!dc) return null;
  const takeoffInputs = quoteData.takeoff_inputs as
    | Record<string, unknown>
    | undefined;
  if (!takeoffInputs) return null;

  const editMap = new Map<string, number>();
  for (const e of edits) {
    const v = Number(e.value);
    if (Number.isFinite(v) && v > 0) editMap.set(e.key, v);
  }

  // Build the corrected dimension list; every dimension is now confirmed.
  let changed = false;
  const newDimensions: ConfirmableDimension[] = dc.dimensions.map((d) => {
    const edited = editMap.has(d.key) ? editMap.get(d.key)! : d.value;
    if (Math.abs(edited - d.value) > 1e-9) {
      changed = true;
      return { ...d, value: edited, confirmed: true };
    }
    return { ...d, confirmed: true };
  });

  const newConfirmation: DimensionConfirmation = {
    ...dc,
    dimensions: newDimensions,
    confirmed_by: meta.confirmedBy,
    confirmed_at: meta.confirmedAt,
  };

  // Pure confirmation (no edit) — nothing to recompute.
  if (!changed) {
    return {
      line_items: quoteData.line_items,
      dimension_confirmation: newConfirmation,
      changed: false,
    };
  }

  // Rebuild the calculator input from the frozen takeoff inputs + corrections.
  const input: Record<string, unknown> = { ...takeoffInputs };
  for (const d of newDimensions) input[d.key] = d.value;

  const parsed = {
    type: dc.takeoff_type,
    input,
    missingFields: [],
    assumptions: [],
    confidence: 1,
  } as unknown as ParsedTakeoffResult;

  const calc = runTakeoff(parsed);
  if (!calc) {
    // Never certify corrected measurements while retaining quantities that
    // were calculated from different inputs.
    return null;
  }

  // Preserve prices / library matches from the prior calculator lines.
  const priorByKey = new Map<
    string,
    { unit_price: number; library_id: string | null; is_missing_price: boolean }
  >();
  for (const it of quoteData.line_items) {
    if (!it.is_calculated_takeoff) continue;
    const key = it.price_match_key ?? it.description;
    if (!key) continue;
    priorByKey.set(key, {
      unit_price: Number(it.unit_price) || 0,
      library_id: it.library_id ?? null,
      is_missing_price: !!it.is_missing_price,
    });
  }

  const recomputedCalc: QuoteLineItem[] = calc.materials.map((m) => {
    const prior = priorByKey.get(m.priceMatchKey ?? m.name) ?? priorByKey.get(m.name);
    const unit_price = prior?.unit_price ?? 0;
    return {
      type: "material",
      description: m.name,
      quantity: m.quantity,
      unit: m.unit,
      unit_price,
      line_total: round2(m.quantity * unit_price),
      library_id: prior?.library_id ?? null,
      is_ai_estimated: false,
      is_missing_price: prior ? prior.is_missing_price : true,
      is_calculated_takeoff: true,
      quantity_source: "calculator",
      formula: m.formula,
      price_match_key: m.priceMatchKey,
      takeoff_status: "ok",
    };
  });

  const nonCalc = quoteData.line_items.filter((it) => !it.is_calculated_takeoff);

  return {
    line_items: [...recomputedCalc, ...nonCalc],
    dimension_confirmation: newConfirmation,
    changed: true,
  };
}
