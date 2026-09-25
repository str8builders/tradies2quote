// ─────────────────────────────────────────────────────────────────────────
// Deterministic foundation calculator.
//
// Pure, unit-tested takeoff maths for slab-on-grade + perimeter-footing
// foundations. It depends ONLY on confirmed numeric inputs — there is no
// vision / OCR / extraction in here, and it is intentionally NOT registered in
// the orchestrator's CALCULATORS map yet. It is safe to ship ahead of Phase 3
// geometry because it makes no assumptions about a drawing; a caller must hand
// it real measurements.
//
// HARD-FAIL CONTRACT (non-negotiable):
//   Required *measurements* are never silently defaulted. If any are missing
//   or non-positive, calculateFoundationTakeoff() THROWS FoundationInputError
//   listing exactly what's missing. Only estimating *config* (mesh sheet size,
//   lap, waste %) has documented defaults — those are template values, not
//   measurements, per the build brief's "configurable estimating templates".
//
// Every output line carries its formula, the exact inputs that fed it, the
// waste factor, and the rounding rule — so each quantity is auditable.
// ─────────────────────────────────────────────────────────────────────────

// Areas/volumes round exact half-up through the shared quantity maths.
import { round2 } from "../quantity-maths";

// ── Config (defaulted estimating template — NOT required measurements) ────

export type FoundationConfig = {
  /** Waste added to ordered concrete volume. Default 10%. */
  concrete_waste_pct: number;
  /** Reinforcing mesh sheet length (m). Default 6.0 (common NZ sheet). */
  mesh_sheet_length_m: number;
  /** Reinforcing mesh sheet width (m). Default 2.4. */
  mesh_sheet_width_m: number;
  /** Mesh side-lap (m) deducted from each sheet's effective coverage. Default 0.2. */
  mesh_lap_m: number;
  /** Extra mesh waste on top of lap (fraction, e.g. 0.0). Default 0. */
  mesh_waste_pct: number;
  /** Concrete is ordered in steps of this many m³ (round UP). Default 0.1. */
  concrete_order_step_m3: number;
};

export const DEFAULT_FOUNDATION_CONFIG: FoundationConfig = {
  concrete_waste_pct: 10,
  mesh_sheet_length_m: 6.0,
  mesh_sheet_width_m: 2.4,
  mesh_lap_m: 0.2,
  mesh_waste_pct: 0,
  concrete_order_step_m3: 0.1,
};

// ── Inputs ────────────────────────────────────────────────────────────────

export type FoundationInput = {
  // Slab geometry — supply EITHER a rectangle (length + width) OR an explicit
  // area. When only area is given, slab_perimeter_m becomes required (we can't
  // derive a perimeter from area alone).
  slab_length_m?: number | null;
  slab_width_m?: number | null;
  slab_area_m2?: number | null;
  slab_perimeter_m?: number | null;

  // Required sections (measurements — never defaulted).
  slab_thickness_mm?: number | null;
  footing_width_mm?: number | null;
  footing_depth_mm?: number | null;

  // Optional measured: additional internal/load-bearing footing run beyond the
  // perimeter. Absent ⇒ 0 (explicitly: "no internal footings"), recorded as an
  // assumption — it is NOT a required input.
  internal_footing_run_m?: number | null;

  /** Optional config override; unspecified keys fall back to defaults. */
  config?: Partial<FoundationConfig>;
};

// ── Output ────────────────────────────────────────────────────────────────

export type FoundationLine = {
  key:
    | "slab_area"
    | "slab_concrete"
    | "footing_run"
    | "footing_concrete"
    | "mesh"
    | "total_concrete";
  name: string;
  quantity: number;
  unit: string;
  /** Human-readable calc string. */
  formula: string;
  /** Exact numeric inputs that fed the formula. */
  inputs: Record<string, number>;
  /** Waste fraction applied (0 when n/a). */
  waste_factor: number;
  /** How the result was rounded. */
  rounded_to: string;
  /** Deterministic maths from confirmed inputs ⇒ always 1. */
  confidence: number;
  assumptions: string[];
};

export type FoundationTakeoff = {
  lines: FoundationLine[];
  /** Config defaults / explicit zero-assumptions applied across the run. */
  assumptions: string[];
  /** The fully-resolved config used (defaults merged with overrides). */
  config: FoundationConfig;
};

// ── Hard-failure error ────────────────────────────────────────────────────

export class FoundationInputError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Missing or invalid required foundation inputs: ${missing.join(", ")}`);
    this.name = "FoundationInputError";
    this.missing = missing;
  }
}

// ── Helpers (pure) ────────────────────────────────────────────────────────

const isPos = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

const isNonNeg = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Round UP to a step (e.g. 0.1 m³), guarded against float drift. */
const roundUpTo = (value: number, step: number): number => {
  const n = Math.ceil(value / step - 1e-6);
  return Math.round(n * step * 1000) / 1000;
};

// ── Calculator ──────────────────────────────────────────────────────────────

/**
 * Compute a deterministic foundation takeoff. THROWS FoundationInputError when
 * any required measurement is missing or non-positive.
 */
export function calculateFoundationTakeoff(
  input: FoundationInput,
): FoundationTakeoff {
  const cfg: FoundationConfig = { ...DEFAULT_FOUNDATION_CONFIG, ...(input.config ?? {}) };
  const missing: string[] = [];

  // ── Resolve slab area + perimeter ──────────────────────────────────────
  const hasRect = isPos(input.slab_length_m) && isPos(input.slab_width_m);
  let area_m2: number | null = null;
  let perimeter_m: number | null = null;

  if (hasRect) {
    area_m2 = (input.slab_length_m as number) * (input.slab_width_m as number);
    perimeter_m = 2 * ((input.slab_length_m as number) + (input.slab_width_m as number));
  } else if (isPos(input.slab_area_m2)) {
    area_m2 = input.slab_area_m2 as number;
    // Perimeter cannot be derived from area alone — require it explicitly.
    if (isPos(input.slab_perimeter_m)) {
      perimeter_m = input.slab_perimeter_m as number;
    } else {
      missing.push("slab_perimeter_m (required when slab area is given without length+width)");
    }
  } else {
    missing.push("slab_length_m + slab_width_m (or slab_area_m2)");
  }

  // ── Required sections ───────────────────────────────────────────────────
  if (!isPos(input.slab_thickness_mm)) missing.push("slab_thickness_mm");
  if (!isPos(input.footing_width_mm)) missing.push("footing_width_mm");
  if (!isPos(input.footing_depth_mm)) missing.push("footing_depth_mm");

  // internal footing run is optional; reject only if explicitly negative.
  if (input.internal_footing_run_m != null && !isNonNeg(input.internal_footing_run_m)) {
    missing.push("internal_footing_run_m (must be >= 0 when provided)");
  }

  if (missing.length > 0) throw new FoundationInputError(missing);

  // Past this point every required value is a confirmed positive number.
  const thickness_mm = input.slab_thickness_mm as number;
  const footing_w_mm = input.footing_width_mm as number;
  const footing_d_mm = input.footing_depth_mm as number;
  const internalRun = isNonNeg(input.internal_footing_run_m)
    ? (input.internal_footing_run_m as number)
    : 0;

  const wasteFrac = cfg.concrete_waste_pct / 100;
  const assumptions: string[] = [];
  if (input.config?.concrete_waste_pct == null) {
    assumptions.push(`Concrete waste defaulted to ${cfg.concrete_waste_pct}%.`);
  }
  if (input.internal_footing_run_m == null) {
    assumptions.push("Assumed no internal/load-bearing footings (internal_footing_run_m = 0).");
  }

  const lines: FoundationLine[] = [];
  const A = area_m2 as number;
  const P = perimeter_m as number;

  // 1. Slab area
  lines.push({
    key: "slab_area",
    name: "Slab area",
    quantity: round2(A),
    unit: "m²",
    formula: hasRect
      ? `length × width = ${input.slab_length_m} × ${input.slab_width_m}`
      : `given area`,
    inputs: hasRect
      ? { length_m: input.slab_length_m as number, width_m: input.slab_width_m as number }
      : { area_m2: A },
    waste_factor: 0,
    rounded_to: "2 dp",
    confidence: 1,
    assumptions: [],
  });

  // 2. Slab concrete volume = area × thickness, + waste, ordered to step.
  const slabRaw = A * (thickness_mm / 1000);
  const slabWasted = slabRaw * (1 + wasteFrac);
  const slabVol = roundUpTo(slabWasted, cfg.concrete_order_step_m3);
  lines.push({
    key: "slab_concrete",
    name: "Slab concrete",
    quantity: slabVol,
    unit: "m³",
    formula: `area × thickness × (1 + waste) = ${round2(A)} × ${thickness_mm / 1000} × ${1 + wasteFrac}`,
    inputs: { area_m2: round2(A), thickness_m: thickness_mm / 1000, waste: wasteFrac },
    waste_factor: wasteFrac,
    rounded_to: `up to ${cfg.concrete_order_step_m3} m³`,
    confidence: 1,
    assumptions: [],
  });

  // 3. Footing run = perimeter + internal.
  const footingRun = P + internalRun;
  lines.push({
    key: "footing_run",
    name: "Footing run",
    quantity: round2(footingRun),
    unit: "m",
    formula: `perimeter + internal = ${round2(P)} + ${internalRun}`,
    inputs: { perimeter_m: round2(P), internal_footing_run_m: internalRun },
    waste_factor: 0,
    rounded_to: "2 dp",
    confidence: 1,
    assumptions: [],
  });

  // 4. Footing concrete volume = run × width × depth, + waste, ordered to step.
  const footingRaw = footingRun * (footing_w_mm / 1000) * (footing_d_mm / 1000);
  const footingWasted = footingRaw * (1 + wasteFrac);
  const footingVol = roundUpTo(footingWasted, cfg.concrete_order_step_m3);
  lines.push({
    key: "footing_concrete",
    name: "Footing concrete",
    quantity: footingVol,
    unit: "m³",
    formula: `run × width × depth × (1 + waste) = ${round2(footingRun)} × ${footing_w_mm / 1000} × ${footing_d_mm / 1000} × ${1 + wasteFrac}`,
    inputs: {
      run_m: round2(footingRun),
      width_m: footing_w_mm / 1000,
      depth_m: footing_d_mm / 1000,
      waste: wasteFrac,
    },
    waste_factor: wasteFrac,
    rounded_to: `up to ${cfg.concrete_order_step_m3} m³`,
    confidence: 1,
    assumptions: [],
  });

  // 5. Total concrete (slab + footing), re-ordered to step.
  const totalVol = roundUpTo(slabVol + footingVol, cfg.concrete_order_step_m3);
  lines.push({
    key: "total_concrete",
    name: "Total concrete",
    quantity: totalVol,
    unit: "m³",
    formula: `slab + footing = ${slabVol} + ${footingVol}`,
    inputs: { slab_m3: slabVol, footing_m3: footingVol },
    waste_factor: wasteFrac,
    rounded_to: `up to ${cfg.concrete_order_step_m3} m³`,
    confidence: 1,
    assumptions: [],
  });

  // 6. Reinforcing mesh sheets — area / effective coverage (lap modelled).
  const effL = cfg.mesh_sheet_length_m - cfg.mesh_lap_m;
  const effW = cfg.mesh_sheet_width_m - cfg.mesh_lap_m;
  if (!(effL > 0 && effW > 0)) {
    // Config is internally inconsistent (lap >= sheet dim) — a config bug, not
    // a missing measurement. Fail loudly rather than emit a nonsense count.
    throw new FoundationInputError([
      "mesh_lap_m must be smaller than both mesh sheet dimensions",
    ]);
  }
  const effCoverage = effL * effW;
  const meshCount = Math.ceil((A * (1 + cfg.mesh_waste_pct / 100)) / effCoverage - 1e-6);
  if (input.config?.mesh_sheet_length_m == null && input.config?.mesh_sheet_width_m == null) {
    assumptions.push(
      `Mesh sheet assumed ${cfg.mesh_sheet_length_m} × ${cfg.mesh_sheet_width_m} m with ${cfg.mesh_lap_m} m lap.`,
    );
  }
  lines.push({
    key: "mesh",
    name: "Reinforcing mesh sheets",
    quantity: meshCount,
    unit: "sheet",
    formula: `ceil(area / effective coverage) = ceil(${round2(A)} / ${round2(effCoverage)})`,
    inputs: {
      area_m2: round2(A),
      effective_coverage_m2: round2(effCoverage),
      lap_m: cfg.mesh_lap_m,
      mesh_waste: cfg.mesh_waste_pct / 100,
    },
    waste_factor: cfg.mesh_waste_pct / 100,
    rounded_to: "whole sheet (round up)",
    confidence: 1,
    assumptions: [],
  });

  return { lines, assumptions, config: cfg };
}
