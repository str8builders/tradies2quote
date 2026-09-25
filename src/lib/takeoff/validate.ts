// ─────────────────────────────────────────────────────────────────────────
// Validation / guardrail layer.
//
// Runs AFTER extraction and BEFORE calculation. If validation says
// "blocked" the orchestrator does not call any calculator — it returns a
// clarification result so the tradie can fix the input.
//
// Three categories of check:
//   1. Hard constraints — physically impossible inputs (negative
//      lengths, zero areas, NaN). These hard-block.
//   2. Plausibility — a length / height that drives a calculator must sit
//      inside the ONE shared band (takeoff/plausibility.ts, the same rule
//      the legacy gate and the calculators use). Outside it HARD-blocks
//      with a plain reason — a 4800 "m" deck is never rescaled to 4.8 m,
//      and a 62 m cladding run is taken as stated. Merely unusual values
//      (a deck side under 1 m, stud spacing not in {300, 400, 450, 600})
//      soft-flag.
//   3. Cross-field — area/perimeter mismatch, openings larger than the
//      wall they sit in. These soft-flag.
// ─────────────────────────────────────────────────────────────────────────

import type {
  ExtractedExtraction,
  ScopeType,
  TakeoffStatus,
} from "./schemas";
import { checkMetres, type MetresKind } from "./plausibility";

export type ValidationResult = {
  status: TakeoffStatus;
  reasons: string[];
  /** Soft flags that don't block calculation but should colour the UI. */
  flags: string[];
  /**
   * Fields that were given but can't be right (outside the shared
   * plausibility band), each with the plain reason — so the clarification
   * asks about that exact number instead of calling it "missing".
   */
  problems?: Array<{ field: string; reason: string }>;
};

/** A plan edge under this is plausible but unusual — flagged, not blocked. */
const TYPICAL_MIN_EDGE_M = 1;

/**
 * Validate a single scope's extraction. Returns `blocked` only when
 * the calculator literally cannot run.
 */
export function validateExtractionForScope(
  ext: ExtractedExtraction,
  scope: ScopeType,
): ValidationResult {
  const reasons: string[] = [];
  const flags: string[] = [];
  const problems: Array<{ field: string; reason: string }> = [];
  const { dimensions } = ext;
  const blocked = (): ValidationResult => ({
    status: "blocked",
    reasons,
    flags,
    ...(problems.length > 0 ? { problems } : {}),
  });

  /** Soft typical-range check (non-calculator dimensions, e.g. fence height). */
  const requireDim = (
    label: string,
    v: number | null | undefined,
    min: number,
    max: number,
  ): "missing" | "out-of-range" | "ok" => {
    if (v === null || v === undefined) {
      reasons.push(`${label} is missing`);
      return "missing";
    }
    if (!Number.isFinite(v) || v <= 0) {
      reasons.push(`${label}=${v} is not a positive number`);
      return "out-of-range";
    }
    if (v < min || v > max) {
      flags.push(`${label}=${v}m is outside the typical ${min}–${max}m range`);
      return "out-of-range";
    }
    return "ok";
  };

  /**
   * A metres value that drives a calculator: the ONE shared plausibility
   * band. Outside it is a hard block with the plain reason (never a
   * rescale); a plan edge under 1 m is plausible but soft-flagged.
   */
  const requireMetres = (
    field: string,
    label: string,
    v: number | null | undefined,
    kind: MetresKind,
  ): "missing" | "out-of-range" | "ok" => {
    if (v === null || v === undefined) {
      reasons.push(`${field} is missing`);
      return "missing";
    }
    if (!Number.isFinite(v) || v <= 0) {
      reasons.push(`${field}=${v} is not a positive number`);
      return "out-of-range";
    }
    const check = checkMetres(label, v, kind);
    if (!check.ok) {
      reasons.push(check.reason);
      problems.push({ field, reason: check.reason });
      return "out-of-range";
    }
    if (kind === "edge" && v < TYPICAL_MIN_EDGE_M) {
      flags.push(`${label} ${v} m is unusually small — check it`);
    }
    return "ok";
  };

  switch (scope) {
    case "deck": {
      const l = requireMetres("length_m", "Deck length", dimensions.length_m, "footprint");
      const w = requireMetres("width_m", "Deck width", dimensions.width_m, "footprint");
      // Hard-block on missing, physically impossible (negative/zero/NaN) or
      // outside the shared plausibility band — all pushed to `reasons`, so a
      // non-empty reasons array means at least one critical input is
      // unusable and we can't run the calculator.
      if (l === "missing" || w === "missing" || reasons.length > 0) {
        return blocked();
      }
      // Length:width ratio sanity — a 20:1 deck is almost certainly
      // a fence or boardwalk, flag it.
      const ratio =
        (dimensions.length_m ?? 0) / Math.max(0.0001, dimensions.width_m ?? 0);
      if (ratio > 20) {
        flags.push(
          `length:width ratio ${ratio.toFixed(1)}:1 is unusual for a deck`,
        );
      }
      break;
    }
    case "cladding": {
      requireMetres("length_m", "Cladding wall length", dimensions.length_m, "edge");
      requireMetres("height_m", "Wall height", dimensions.height_m, "wallHeight");
      if (!Number.isFinite(dimensions.length_m ?? NaN) || reasons.length > 0) {
        return blocked();
      }
      // Sum of openings shouldn't exceed wall area.
      const wallArea =
        (dimensions.length_m ?? 0) * (dimensions.height_m ?? 0);
      const openArea = ext.openings.reduce((s, o) => {
        const w = o.width_m ?? 0;
        const h = o.height_m ?? 0;
        const c = o.count ?? 1;
        return s + w * h * c;
      }, 0);
      if (openArea > 0 && openArea >= wallArea) {
        flags.push(
          `openings total ${openArea.toFixed(2)}m² ≥ wall area ${wallArea.toFixed(2)}m²`,
        );
      }
      break;
    }
    case "framing": {
      // Framing sizes off the wall RUN (every wall summed on a floor plan).
      const l = requireMetres("length_m", "Wall length", dimensions.length_m, "wallRun");
      const h = requireMetres("height_m", "Wall height", dimensions.height_m, "wallHeight");
      if (l === "missing" || h === "missing" || reasons.length > 0) {
        return blocked();
      }
      if (
        ext.spacing_mm !== null &&
        ext.spacing_mm !== undefined &&
        ![300, 400, 450, 600].includes(ext.spacing_mm)
      ) {
        flags.push(
          `stud spacing ${ext.spacing_mm}mm is non-standard (NZ uses 400 or 600)`,
        );
      }
      break;
    }
    case "roofing": {
      const haveArea =
        Number.isFinite(dimensions.area_m2 ?? NaN) &&
        (dimensions.area_m2 ?? 0) > 0;
      const haveLW =
        Number.isFinite(dimensions.length_m ?? NaN) &&
        Number.isFinite(dimensions.width_m ?? NaN);
      if (!haveArea && !haveLW) {
        reasons.push("roof needs either area_m2 OR length_m + width_m (plan)");
        return { status: "blocked", reasons, flags };
      }
      if (dimensions.pitch_deg === null || dimensions.pitch_deg === undefined) {
        flags.push("pitch_deg missing — assuming 15° (low-pitch)");
      }
      break;
    }
    case "lining": {
      const haveArea =
        Number.isFinite(dimensions.area_m2 ?? NaN) &&
        (dimensions.area_m2 ?? 0) > 0;
      const haveLH =
        Number.isFinite(dimensions.length_m ?? NaN) &&
        Number.isFinite(dimensions.height_m ?? NaN);
      if (!haveArea && !haveLH) {
        reasons.push("lining needs either area_m2 OR length_m + height_m");
        return { status: "blocked", reasons, flags };
      }
      break;
    }
    case "insulation": {
      // EXTERIOR-ONLY RULE (P0, fail closed): insulation is quoted for
      // exterior walls only. Positive evidence required — either the
      // tradie SAID the walls are exterior (wall_kind === "exterior") or
      // the scan supplied an exterior wall run. Interior walls block
      // outright; missing evidence blocks with a clarification. We never
      // assume walls are exterior.
      const extRun = ext.exterior_wall_run_m;
      const haveExtRun = Number.isFinite(extRun ?? NaN) && (extRun ?? 0) > 0;
      if (ext.wall_kind === "interior" && !haveExtRun) {
        reasons.push(
          "interior walls — insulation is quoted for exterior walls only",
        );
        return { status: "blocked", reasons, flags };
      }
      if (!haveExtRun && ext.wall_kind !== "exterior") {
        reasons.push(
          "insulation needs exterior-wall evidence (insulation is quoted for exterior walls only)",
        );
        return { status: "blocked", reasons, flags };
      }
      const haveArea =
        Number.isFinite(dimensions.area_m2 ?? NaN) &&
        (dimensions.area_m2 ?? 0) > 0;
      const haveLH =
        Number.isFinite(dimensions.length_m ?? NaN) &&
        Number.isFinite(dimensions.height_m ?? NaN);
      const haveHeight =
        Number.isFinite(dimensions.height_m ?? NaN) &&
        (dimensions.height_m ?? 0) > 0;
      // With an exterior run we size off run × height; otherwise we need
      // the stated (exterior) area or length + height.
      const haveRunBasis = haveExtRun && haveHeight;
      if (!haveArea && !haveLH && !haveRunBasis) {
        reasons.push(
          haveExtRun
            ? "insulation needs the wall height (to size exterior run × height)"
            : "insulation needs either area_m2 OR length_m + height_m",
        );
        return { status: "blocked", reasons, flags };
      }
      break;
    }
    case "fencing": {
      const havePerimeter =
        Number.isFinite(dimensions.perimeter_m ?? NaN) &&
        (dimensions.perimeter_m ?? 0) > 0;
      const haveLength =
        Number.isFinite(dimensions.length_m ?? NaN) &&
        (dimensions.length_m ?? 0) > 0;
      if (!havePerimeter && !haveLength) {
        reasons.push("fence needs perimeter_m or length_m");
        return { status: "blocked", reasons, flags };
      }
      requireDim("height_m", dimensions.height_m, 0.6, 3);
      break;
    }
    case "concrete": {
      const haveLW =
        Number.isFinite(dimensions.length_m ?? NaN) &&
        Number.isFinite(dimensions.width_m ?? NaN);
      const haveVol =
        Number.isFinite(dimensions.volume_m3 ?? NaN) &&
        (dimensions.volume_m3 ?? 0) > 0;
      if (!haveLW && !haveVol) {
        reasons.push("concrete needs length_m + width_m OR volume_m3");
        return { status: "blocked", reasons, flags };
      }
      break;
    }
    case "fixing": {
      // Skirtings / architraves are LM-based; we need either a
      // perimeter or a count.
      const haveLength =
        Number.isFinite(dimensions.length_m ?? NaN) &&
        (dimensions.length_m ?? 0) > 0;
      const havePerimeter =
        Number.isFinite(dimensions.perimeter_m ?? NaN) &&
        (dimensions.perimeter_m ?? 0) > 0;
      if (!haveLength && !havePerimeter) {
        reasons.push("fixing scope needs length_m or perimeter_m");
        return { status: "blocked", reasons, flags };
      }
      break;
    }
    case "generic": {
      // Generic only blocks on a completely empty extraction.
      const haveAny =
        Number.isFinite(dimensions.length_m ?? NaN) ||
        Number.isFinite(dimensions.width_m ?? NaN) ||
        Number.isFinite(dimensions.area_m2 ?? NaN) ||
        Number.isFinite(dimensions.perimeter_m ?? NaN) ||
        Number.isFinite(dimensions.volume_m3 ?? NaN);
      if (!haveAny) {
        reasons.push("no dimensions extracted");
        return { status: "blocked", reasons, flags };
      }
      break;
    }
  }

  // Cumulative status: if reasons is non-empty we'd have returned blocked
  // above. Flags are soft → status = needs_review when present,
  // otherwise ok.
  return {
    status: flags.length > 0 ? "needs_review" : "ok",
    reasons,
    flags,
  };
}
