// ─────────────────────────────────────────────────────────────────────────
// Generic calculator — stock/coverage fallback.
//
// Used when the scope router lands on "generic" or when a more specific
// calculator can't run (e.g. extraction was too sparse). Produces a
// single TakeoffLine carrying whatever raw geometry we did extract, so
// the tradie has something to start from and the UI can flag it as
// `needs_review`. Never silently emits a fake quantity.
// ─────────────────────────────────────────────────────────────────────────

import type {
  ExtractedExtraction,
  ScopeResult,
  TakeoffLine,
} from "../schemas";
import { round2 } from "../normalise";

export function runGenericCalculator(ext: ExtractedExtraction): ScopeResult {
  const dims = ext.dimensions;
  const len = dims.length_m ?? 0;
  const wid = dims.width_m ?? 0;
  const area =
    dims.area_m2 !== null && dims.area_m2 !== undefined
      ? dims.area_m2
      : len * wid;
  const volume = dims.volume_m3 ?? 0;
  const perimeter = dims.perimeter_m ?? 0;
  const wastePct = ext.waste_percent ?? 10;
  const coverage = ext.coverage_mm ?? 0;
  const stock = ext.stock_length_m ?? 0;
  const invalid = [...Object.values(dims), ext.coverage_mm, ext.stock_length_m, ext.waste_percent]
    .some(value => value != null && (!Number.isFinite(value) || value < 0))
    || (ext.coverage_mm != null && coverage <= 0) || (ext.stock_length_m != null && stock <= 0)
    || wastePct > 100;
  if (invalid) return {
    scope: "generic", status: "blocked", lines: [], assumptions: [], clarifications: [], explanation: "",
    summary: {primary_metric: "quantity", primary_value: 0, unit: "ea", inputs: {}},
    warnings: ["Enter finite positive geometry and material coverage/stock dimensions; waste must be between 0% and 100%."],
  };

  // Pick the most-likely "primary unit" from what we extracted.
  let quantity = 0;
  let unit = "ea";
  let formula = "";
  let confidence = 0.4;
  if (volume <= 0 && area > 0 && coverage > 0) {
    const lineal = area / (coverage / 1000) * (1 + wastePct / 100);
    quantity = stock > 0 ? Math.ceil(lineal / stock - 1e-10) : round2(lineal);
    unit = stock > 0 ? "length" : "m";
    formula = `area=${area}m² ÷ coverage=${coverage}/1000m × (1+${wastePct}/100)`
      + (stock > 0 ? ` ÷ stock=${stock}m, rounded up = ${quantity}` : ` = ${quantity}m`);
    confidence = 0.7;
  } else if (volume > 0) {
    quantity = round2(volume * (1 + wastePct / 100));
    unit = "m³";
    formula = `volume=${volume}m³ × (1+${wastePct}/100) = ${quantity}`;
    confidence = 0.6;
  } else if (area > 0) {
    quantity = round2(area * (1 + wastePct / 100));
    unit = "m²";
    formula = `area=${area}m² × (1+${wastePct}/100) = ${quantity}`;
    confidence = 0.6;
  } else if (perimeter > 0 || len > 0) {
    const lm = perimeter || len;
    const order = lm * (1 + wastePct / 100);
    quantity = stock > 0 ? Math.ceil(order / stock - 1e-10) : round2(order);
    unit = stock > 0 ? "length" : "m";
    formula = `length=${lm}m × (1+${wastePct}/100)` + (stock > 0 ? ` ÷ stock=${stock}m, rounded up = ${quantity}` : ` = ${quantity}`);
    confidence = 0.6;
  } else {
    quantity = 0;
    unit = "ea";
    formula = "no dimensions extracted";
  }

  const assumptions: string[] = [];
  if (ext.waste_percent === null || ext.waste_percent === undefined) {
    assumptions.push("Used default 10% waste.");
  }

  if (stock > 0 && unit === "length") assumptions.push("Stock count is a lineal allowance; confirm member cut lengths, joins and offcut reuse before ordering.");
  const lines: TakeoffLine[] = [
    {
      id: "generic-quantity",
      name: ext.material_spec ?? "Material (generic)",
      category: "Generic",
      quantity,
      unit,
      // Generic ALWAYS surfaces as needs_review — we don't know what
      // the material is, only what dimension we extracted, and the
      // tradie must confirm the unit + price match the intent.
      status: quantity > 0 ? "needs_review" : "blocked",
      basis: {
        formula,
        inputs: {
          length_m: len,
          width_m: wid,
          area_m2: area,
          perimeter_m: perimeter,
          volume_m3: volume,
          waste_percent: wastePct,
          coverage_mm: coverage || null, stock_length_m: stock || null,
        },
        assumed: assumptions,
      },
      confidence,
      assumption_flags: assumptions,
      validation_flags:
        quantity > 0
          ? ["generic_scope_unconfirmed"]
          : ["no_dimensions_extracted"],
      explanation:
        quantity > 0
          ? "Generic stock/coverage estimate — confirm material and price before sending."
          : "No usable dimensions found — please clarify what to quote.",
      priceMatchKey: undefined,
    },
  ];

  return {
    scope: "generic",
    status: quantity > 0 ? "needs_review" : "blocked",
    summary: {
      primary_metric: unit === "m³" ? "volume" : unit === "m²" ? "area" : "length",
      primary_value: quantity,
      unit,
      inputs: {
        length_m: len,
        width_m: wid,
        area_m2: area,
        perimeter_m: perimeter,
        volume_m3: volume,
        waste_percent: wastePct,
        coverage_mm: coverage || null, stock_length_m: stock || null,
      },
    },
    lines,
    warnings:
      quantity > 0
        ? ["Generic fallback used — confirm scope and material before sending."]
        : ["Could not extract any usable dimensions."],
    assumptions,
    clarifications: [],
    explanation: "",
  };
}
