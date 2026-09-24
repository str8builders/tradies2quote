// ─────────────────────────────────────────────────────────────────────────
// Concrete calculator.
//
// Volume in m³ from either explicit volume or L × W × thickness.
// Adds reinforcing mesh (one sheet per 12.5 m²) and a polythene
// damp-proof layer (1 roll per 50 m²) as defaults. Pile / footing
// mode is handled by passing count + per-pile volume via notes.
// ─────────────────────────────────────────────────────────────────────────

import type {
  ExtractedExtraction,
  ScopeResult,
  TakeoffLine,
} from "../schemas";
import { worstStatus } from "../schemas";
import { concreteVolumeM3, round2, safeCeil } from "../normalise";

const DEFAULT_SLAB_THICKNESS_MM = 100;
const DEFAULT_MESH_COVERAGE_M2 = 12.5; // SE62 mesh sheet
const DEFAULT_POLY_COVERAGE_M2 = 50;

export function runConcreteCalculator(ext: ExtractedExtraction): ScopeResult {
  const explicitVolume = ext.dimensions.volume_m3 ?? null;
  const length_m = ext.dimensions.length_m ?? 0;
  const width_m = ext.dimensions.width_m ?? 0;
  const thicknessMm =
    ext.dimensions.height_m !== null && ext.dimensions.height_m !== undefined
      ? Number(ext.dimensions.height_m) > 1
        ? Number(ext.dimensions.height_m) // already mm
        : Number(ext.dimensions.height_m) * 1000
      : DEFAULT_SLAB_THICKNESS_MM;
  const wastePct = ext.waste_percent ?? 5;

  const assumptions: string[] = [];
  if (
    explicitVolume === null &&
    (ext.dimensions.height_m === null || ext.dimensions.height_m === undefined)
  ) {
    assumptions.push(`Assumed slab thickness ${DEFAULT_SLAB_THICKNESS_MM}mm.`);
  }
  if (ext.waste_percent === null || ext.waste_percent === undefined) {
    assumptions.push("Used default 5% waste on concrete order.");
  }

  const planArea = round2(length_m * width_m);
  const volume =
    explicitVolume !== null && explicitVolume > 0
      ? explicitVolume
      : concreteVolumeM3(length_m, width_m, thicknessMm);
  // Round up to the 0.1 m³ delivery unit without float noise adding a tenth
  // (6 m³ × 1.05 = 6.300000000000001 → 6.3, not 6.4).
  const orderVolume = safeCeil(volume * (1 + wastePct / 100) * 10) / 10;

  const lines: TakeoffLine[] = [];
  lines.push({
    id: "concrete-volume",
    name: "Ready-mix concrete",
    category: "Concrete",
    quantity: orderVolume,
    unit: "m³",
    status: assumptions.length > 0 ? "assumed" : "ok",
    basis: {
      formula:
        explicitVolume !== null
          ? `volume=${explicitVolume}m³ × (1+${wastePct}/100) = ${orderVolume}`
          : `${length_m}m × ${width_m}m × ${thicknessMm}mm × (1+${wastePct}/100) = ${orderVolume}m³`,
      inputs: {
        length_m,
        width_m,
        thickness_mm: thicknessMm,
        plan_area_m2: planArea,
        waste_percent: wastePct,
        base_volume_m3: volume,
      },
      assumed: assumptions,
    },
    confidence: assumptions.length > 0 ? 0.7 : 0.9,
    assumption_flags: assumptions,
    validation_flags: [],
    explanation: `${orderVolume} m³ of ready-mix (rounded up to nearest 0.1 m³).`,
    priceMatchKey: "ready-mix-concrete",
  });

  if (planArea > 0) {
    const meshSheets = safeCeil(planArea / DEFAULT_MESH_COVERAGE_M2);
    lines.push({
      id: "concrete-mesh",
      name: "Reinforcing mesh (SE62)",
      category: "Reinforcing",
      quantity: meshSheets,
      unit: "sheets",
      status: "ok",
      basis: {
        formula: `ceil(planArea=${planArea}m² / ${DEFAULT_MESH_COVERAGE_M2}m² per sheet) = ${meshSheets}`,
        inputs: { plan_area_m2: planArea, per_sheet_m2: DEFAULT_MESH_COVERAGE_M2 },
        assumed: [],
      },
      confidence: 0.85,
      assumption_flags: [],
      validation_flags: [],
      explanation: "",
      priceMatchKey: "reinforcing-mesh",
    });
    const polyRolls = safeCeil(planArea / DEFAULT_POLY_COVERAGE_M2);
    lines.push({
      id: "concrete-poly",
      name: "Polythene DPM",
      category: "Damp-proof",
      quantity: polyRolls,
      unit: "rolls",
      status: "ok",
      basis: {
        formula: `ceil(planArea=${planArea}m² / ${DEFAULT_POLY_COVERAGE_M2}m² per roll) = ${polyRolls}`,
        inputs: { plan_area_m2: planArea, per_roll_m2: DEFAULT_POLY_COVERAGE_M2 },
        assumed: [],
      },
      confidence: 0.8,
      assumption_flags: [],
      validation_flags: [],
      explanation: "",
      priceMatchKey: "polythene-dpm",
    });
  }

  // Mesh + DPM use standard product coverages that drive sheet/roll counts —
  // flag them so a different mesh/underlay isn't silently mis-counted.
  if (planArea > 0) {
    const coverageNote =
      "Reinforcing mesh (SE62, 12.5 m²/sheet) and DPM (50 m²/roll) use standard coverages — change if your products differ.";
    assumptions.push(coverageNote);
    for (const l of lines) {
      if (l.id === "concrete-mesh" || l.id === "concrete-poly") {
        l.status = "assumed";
        l.assumption_flags = [coverageNote];
      }
    }
  }

  const status = worstStatus([
    ...(assumptions.length > 0 ? (["assumed"] as const) : []),
    ...lines.map((l) => l.status),
  ]);

  return {
    scope: "concrete",
    status,
    summary: {
      primary_metric: "concrete volume",
      primary_value: orderVolume,
      unit: "m³",
      inputs: {
        length_m,
        width_m,
        thickness_mm: thicknessMm,
        volume_m3: orderVolume,
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
