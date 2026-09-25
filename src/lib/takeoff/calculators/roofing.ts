// ─────────────────────────────────────────────────────────────────────────
// Roofing calculator.
//
// Plan area + pitch → actual area (screws, tiles). Long-run sheets are laid
// side by side along the GUTTER (eave) and cut to the rafter length, so the
// count is the gutter length ÷ the 0.762 m cover, rounded up once — no waste
// on the count (the last sheet is ripped to width) — and each sheet is the
// plan fall ÷ cos(pitch) long. The gutter length is the one the tradie names
// ("gutter runs the 12m side"), else the longer plan side (a roof usually
// falls across its short dimension), and that assumption is flagged. For
// tile or sheet-cut roofs, the caller can hint via ext.material_spec.
// ─────────────────────────────────────────────────────────────────────────

import type {
  ExtractedExtraction,
  ScopeResult,
  TakeoffLine,
} from "../schemas";
import { worstStatus } from "../schemas";
import { roofAreaFromPitch, round2, safeCeil, slopeLengthFromPitch } from "../normalise";

const DEFAULT_PITCH_DEG = 15;
const DEFAULT_COVER_WIDTH_M = 0.762; // long-run colorsteel
const DEFAULT_SHEET_AREA_M2 = 2.16; // 2.7m × 0.8m typical tile-batten panel

const positive = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
/** A metres figure as the tradie reads it (up to 3 dp, no trailing zeros). */
const show = (n: number): string => String(Math.round(n * 1000) / 1000);

export function runRoofingCalculator(ext: ExtractedExtraction): ScopeResult {
  const assumptions: string[] = [];
  const wastePct = ext.waste_percent ?? 10;
  const pitch =
    ext.dimensions.pitch_deg !== null && ext.dimensions.pitch_deg !== undefined
      ? ext.dimensions.pitch_deg
      : DEFAULT_PITCH_DEG;
  if (ext.dimensions.pitch_deg === null || ext.dimensions.pitch_deg === undefined) {
    assumptions.push(`Assumed pitch ${DEFAULT_PITCH_DEG}° (low-pitch default).`);
  }
  if (ext.waste_percent === null || ext.waste_percent === undefined) {
    assumptions.push("Used default 10% waste.");
  }

  // Plan area: explicit, or L×W — exact (counts round up once, from the
  // exact area); shown to 0.01 m².
  const planArea =
    ext.dimensions.area_m2 !== null && ext.dimensions.area_m2 !== undefined
      ? ext.dimensions.area_m2
      : (ext.dimensions.length_m ?? 0) * (ext.dimensions.width_m ?? 0);
  const shownPlanArea = round2(planArea);

  // Exact — every count below rounds up once from it; shown to 0.01 m².
  const actualArea = roofAreaFromPitch(planArea, pitch);
  const shownArea = round2(actualArea);
  const lines: TakeoffLine[] = [];

  // Long-run colorsteel: lengths cut to the roof. Quantity = sheets side by
  // side along the gutter; each is the fall (ridge-to-eave) down the slope.
  const isTile = /(tile)/i.test(ext.material_spec ?? "");
  const coverWidth = DEFAULT_COVER_WIDTH_M;
  // Cover width (long-run) / tile panel area are fixed defaults that drive
  // the sheet/length count and aren't read from the spec yet — flag them so
  // a different profile is never silently mis-counted.
  if (isTile) {
    assumptions.push(
      `Assumed ${DEFAULT_SHEET_AREA_M2}m² tile panel coverage — confirm your tile profile.`,
    );
  } else {
    assumptions.push(
      `Assumed ${DEFAULT_COVER_WIDTH_M}m sheet cover (long-run) — confirm your profile's cover width.`,
    );
  }
  if (!isTile) {
    // Which plan side the gutter runs along, and the fall the sheets span.
    const lengthM = positive(ext.dimensions.length_m);
    const widthM = positive(ext.dimensions.width_m);
    const statedEave = positive(ext.dimensions.eave_m);
    const same = (a: number, b: number) => Math.abs(a - b) <= 0.005;
    let eaveM: number;
    let fallM: number;
    if (statedEave !== null) {
      eaveM = statedEave;
      fallM =
        lengthM !== null && widthM !== null && same(statedEave, lengthM)
          ? widthM
          : lengthM !== null && widthM !== null && same(statedEave, widthM)
            ? lengthM
            : planArea / statedEave;
    } else if (lengthM !== null && widthM !== null) {
      eaveM = Math.max(lengthM, widthM);
      fallM = Math.min(lengthM, widthM);
      if (eaveM !== fallM) {
        assumptions.push(
          `Assumed the gutter runs along the ${show(eaveM)}m side (sheets cut to the ${show(fallM)}m fall) — say e.g. "gutter along the ${show(fallM)}m side" if it doesn't.`,
        );
      }
    } else {
      eaveM = Math.sqrt(planArea);
      fallM = eaveM;
      assumptions.push(
        `No roof sides given — assumed a square roof (${show(eaveM)}m each way). Give the gutter length for an exact sheet count.`,
      );
    }
    const sheetCount = safeCeil(eaveM / coverWidth);
    const sheetLengthM = round2(slopeLengthFromPitch(fallM, pitch));
    lines.push({
      id: "roof-sheets",
      name: ext.material_spec ?? "Long-run colorsteel sheets",
      category: "Roofing",
      quantity: sheetCount,
      unit: "lengths",
      status: assumptions.length > 0 ? "assumed" : "ok",
      basis: {
        formula: `ceil(gutter=${show(eaveM)}m / cover=${coverWidth}m) = ${sheetCount}, each cut to ${show(fallM)}m ÷ cos ${pitch}° = ${sheetLengthM}m`,
        inputs: {
          plan_area_m2: shownPlanArea,
          actual_area_m2: shownArea,
          pitch_deg: pitch,
          cover_width_m: coverWidth,
          eave_length_m: round2(eaveM),
          fall_m: round2(fallM),
          sheet_length_m: sheetLengthM,
        },
        assumed: assumptions,
      },
      confidence: assumptions.length > 0 ? 0.65 : 0.85,
      assumption_flags: assumptions,
      validation_flags: [],
      explanation: `${sheetCount} sheets side by side along the ${show(eaveM)}m gutter, each cut to ${sheetLengthM}m.`,
      priceMatchKey: "long-run-colorsteel",
    });
  } else {
    const sheets = safeCeil(
      (actualArea * (1 + wastePct / 100)) / DEFAULT_SHEET_AREA_M2,
    );
    lines.push({
      id: "roof-tiles",
      name: ext.material_spec ?? "Roof tiles",
      category: "Roofing",
      quantity: sheets,
      unit: "packs",
      status: assumptions.length > 0 ? "assumed" : "ok",
      basis: {
        formula: `ceil(actualArea=${shownArea}m² × (1+${wastePct}/100) / panelArea=${DEFAULT_SHEET_AREA_M2}m²) = ${sheets}`,
        inputs: {
          plan_area_m2: shownPlanArea,
          actual_area_m2: shownArea,
          pitch_deg: pitch,
          panel_area_m2: DEFAULT_SHEET_AREA_M2,
          waste_percent: wastePct,
        },
        assumed: assumptions,
      },
      confidence: assumptions.length > 0 ? 0.6 : 0.8,
      assumption_flags: assumptions,
      validation_flags: [],
      explanation: `${sheets} packs cover ${shownArea}m² actual roof area.`,
      priceMatchKey: "roof-tiles",
    });
  }

  // Fixings — roofing screws ~6 per m² for long-run, rounded up once from
  // the exact roof area.
  const fixings = safeCeil(actualArea * 6 * (1 + wastePct / 100));
  lines.push({
    id: "roof-fixings",
    name: "Roofing screws",
    category: "Fixings",
    quantity: fixings,
    unit: "each",
    status: "ok",
    basis: {
      formula: `ceil(actualArea=${Math.round(actualArea * 10000) / 10000}m² × 6 × (1+${wastePct}/100)) = ${fixings}`,
      inputs: { actual_area_m2: shownArea, per_m2: 6, waste_percent: wastePct },
      assumed: [],
    },
    confidence: 0.8,
    assumption_flags: [],
    validation_flags: [],
    explanation: "",
    priceMatchKey: "roofing-screws",
  });

  const status = worstStatus([
    ...(assumptions.length > 0 ? (["assumed"] as const) : []),
    ...lines.map((l) => l.status),
  ]);

  return {
    scope: "roofing",
    status,
    summary: {
      primary_metric: "actual roof area",
      primary_value: shownArea,
      unit: "m²",
      inputs: {
        plan_area_m2: shownPlanArea,
        actual_area_m2: shownArea,
        pitch_deg: pitch,
        waste_percent: wastePct,
      },
    },
    lines,
    warnings: [],
    assumptions,
    clarifications: [],
    explanation: "",
  };
}
