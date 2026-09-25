// ─────────────────────────────────────────────────────────────────────────
// Fencing calculator.
//
// Lineal-metres × posts at spacing × rails per bay × palings/pickets
// at coverage. Defaults are NZ paling fence on 1.8m post centres (unless
// the tradie gives theirs — "posts at 2.4m centres"), 2 rails, 100mm wide
// palings with 5mm gap.
// ─────────────────────────────────────────────────────────────────────────

import type {
  ExtractedExtraction,
  ScopeResult,
  TakeoffLine,
} from "../schemas";
import { worstStatus } from "../schemas";
import {
  boardCoverageMm,
  round2,
  safeCeil,
  stockLengthsForLM,
} from "../normalise";

const DEFAULT_POST_SPACING_M = 1.8;
/** Post centres a fence can have (m): anything outside is a misread, not a spacing. */
const POST_SPACING_BAND_M = { min: 0.9, max: 3.6 } as const;
const DEFAULT_RAIL_COUNT = 2;
const DEFAULT_PALING_WIDTH_MM = 100;
const DEFAULT_PALING_GAP_MM = 5;
const DEFAULT_HEIGHT_M = 1.8;
const DEFAULT_STOCK_M = 4.8;

export function runFencingCalculator(ext: ExtractedExtraction): ScopeResult {
  const length_m =
    ext.dimensions.perimeter_m !== null && ext.dimensions.perimeter_m !== undefined
      ? ext.dimensions.perimeter_m
      : (ext.dimensions.length_m ?? 0);
  const height_m =
    ext.dimensions.height_m !== null && ext.dimensions.height_m !== undefined
      ? ext.dimensions.height_m
      : DEFAULT_HEIGHT_M;
  const stockM = ext.stock_length_m ?? DEFAULT_STOCK_M;
  const wastePct = ext.waste_percent ?? 10;

  const assumptions: string[] = [];
  if (ext.dimensions.height_m === null || ext.dimensions.height_m === undefined) {
    assumptions.push(`Used default fence height ${DEFAULT_HEIGHT_M}m.`);
  }
  if (ext.waste_percent === null || ext.waste_percent === undefined) {
    assumptions.push("Used default 10% waste.");
  }

  // Post centres: the tradie's own ("posts at 2.4m centres" → spacing_mm
  // 2400), else 1.8 m — flagged below either way it's defaulted.
  const statedSpacingM =
    typeof ext.spacing_mm === "number" && Number.isFinite(ext.spacing_mm) && ext.spacing_mm > 0
      ? ext.spacing_mm / 1000
      : null;
  const spacingUsable =
    statedSpacingM !== null &&
    statedSpacingM >= POST_SPACING_BAND_M.min &&
    statedSpacingM <= POST_SPACING_BAND_M.max;
  const postSpacing = spacingUsable ? statedSpacingM : DEFAULT_POST_SPACING_M;
  const posts = safeCeil(length_m / postSpacing) + 1;
  const rails = DEFAULT_RAIL_COUNT;
  const railsLinearM = round2(length_m * rails);
  const railStock = stockLengthsForLM(railsLinearM, stockM, wastePct);

  const palingCover = boardCoverageMm({
    nominalWidthMm: DEFAULT_PALING_WIDTH_MM,
    gapMm: DEFAULT_PALING_GAP_MM,
  });
  const palingCount = safeCeil((length_m * 1000) / palingCover);

  const lines: TakeoffLine[] = [];
  lines.push({
    id: "fence-posts",
    name: "Fence posts",
    category: "Posts",
    quantity: posts,
    unit: "each",
    status: "ok",
    basis: {
      formula: `ceil(length=${length_m}m / postSpacing=${postSpacing}m) + 1 = ${posts}`,
      inputs: { length_m, post_spacing_m: postSpacing },
      assumed: [],
    },
    confidence: 0.85,
    assumption_flags: [],
    validation_flags: [],
    explanation: "",
    priceMatchKey: "fence-posts",
  });
  lines.push({
    id: "fence-rails",
    name: "Fence rails",
    category: "Rails",
    quantity: railStock,
    unit: "lengths",
    status: "ok",
    basis: {
      formula: `ceil(length=${length_m}m × ${rails} × (1+${wastePct}/100) / stock=${stockM}m) = ${railStock}`,
      inputs: {
        length_m,
        rails_per_bay: rails,
        stock_length_m: stockM,
        waste_percent: wastePct,
      },
      assumed: [],
    },
    confidence: 0.85,
    assumption_flags: [],
    validation_flags: [],
    explanation: "",
    priceMatchKey: "fence-rails",
  });
  lines.push({
    id: "fence-palings",
    name: "Palings",
    category: "Cladding",
    quantity: palingCount,
    unit: "each",
    status: "ok",
    basis: {
      formula: `ceil(length=${length_m * 1000}mm / coverage=${palingCover}mm) = ${palingCount}`,
      inputs: {
        length_mm: length_m * 1000,
        paling_width_mm: DEFAULT_PALING_WIDTH_MM,
        gap_mm: DEFAULT_PALING_GAP_MM,
      },
      assumed: [],
    },
    confidence: 0.85,
    assumption_flags: [],
    validation_flags: [],
    explanation: "",
    priceMatchKey: "palings",
  });
  // Concrete for post holes — typical 0.05 m³ per post hole.
  const concreteM3 = round2(posts * 0.05);
  lines.push({
    id: "fence-post-concrete",
    name: "Post-hole concrete",
    category: "Concrete",
    quantity: concreteM3,
    unit: "m³",
    status: "ok",
    basis: {
      formula: `posts=${posts} × 0.05m³ = ${concreteM3}`,
      inputs: { posts, per_post_m3: 0.05 },
      assumed: [],
    },
    confidence: 0.7,
    assumption_flags: [],
    validation_flags: [],
    explanation: "",
    priceMatchKey: "ready-mix-concrete",
  });

  // Rail count and paling width are fixed defaults that drive the counts and
  // aren't read from the spec yet — and the post spacing is, unless the
  // tradie gave a usable one — so flag every line they feed and a different
  // fence spec is never silently mis-counted.
  const fenceDefaultNotes = [
    ...(spacingUsable
      ? []
      : statedSpacingM !== null
        ? [
            `Post spacing ${Math.round(statedSpacingM * 1000) / 1000}m isn't a fence post spacing (${POST_SPACING_BAND_M.min}–${POST_SPACING_BAND_M.max}m) — used ${DEFAULT_POST_SPACING_M}m centres. Check it.`,
          ]
        : [`Assumed ${DEFAULT_POST_SPACING_M}m post spacing — say e.g. "posts at 2.4m centres" to change it.`]),
    `Assumed ${DEFAULT_RAIL_COUNT} rails per bay.`,
    `Assumed ${DEFAULT_PALING_WIDTH_MM}mm palings (${DEFAULT_PALING_GAP_MM}mm gap) — state the paling width if different.`,
  ];
  assumptions.push(...fenceDefaultNotes);
  for (const l of lines) {
    if (l.status === "ok") {
      l.status = "assumed";
      l.assumption_flags = [...l.assumption_flags, ...fenceDefaultNotes];
    }
  }

  const status = worstStatus([
    ...(assumptions.length > 0 ? (["assumed"] as const) : []),
    ...lines.map((l) => l.status),
  ]);

  return {
    scope: "fencing",
    status,
    summary: {
      primary_metric: "fence length",
      primary_value: length_m,
      unit: "m",
      inputs: {
        length_m,
        height_m,
        post_spacing_m: postSpacing,
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
