// ─────────────────────────────────────────────────────────────────────────
// Deterministic plan geometry.
//
// The drawing-scan vision model READS shapes and numbers off a sketch; this
// module does the MATHS. Keeping area/perimeter computation here (not in the
// LLM) means a footprint that isn't a plain rectangle — an L, a T, a stepped
// deck, a triangle, a circle — gets a correct, reproducible area instead of
// being approximated by its bounding box (which over-quotes material).
//
// Two ways a non-rectangular footprint is described:
//   1. `regions` — a list of non-overlapping sub-rectangles whose areas sum to
//      the true footprint. Covers L / T / U / stepped shapes (~90% of real
//      building footprints). This is the model's primary tool.
//   2. a primitive `shape` (triangle / circle / trapezoid) with its own
//      dimensions, for the genuinely curved/angled cases.
//
// Everything is pure + side-effect-free so it's trivially unit-testable.
// ─────────────────────────────────────────────────────────────────────────

// Areas/perimeters round exact half-up through the shared quantity maths.
import { round2 } from "../quantity-maths";

export type ShapeKind =
  | "rect"
  | "l_shape"
  | "line"
  | "triangle"
  | "circle"
  | "trapezoid"
  | "other";

/** One sub-rectangle of a composite footprint. */
export type Region = {
  width_m: number;
  length_m: number;
  label?: string | null;
};

export interface PlanGeometryInput {
  shape: ShapeKind;
  /** Overall bounding box — always present, used as the rect/other fallback. */
  width_m: number;
  length_m: number;
  /** Composite footprint as a list of sub-rectangles. */
  regions?: Region[] | null;
  /** Triangle (right-angle or general, base × perpendicular height). */
  tri_base_m?: number | null;
  tri_height_m?: number | null;
  /** Circle / round footprint. */
  radius_m?: number | null;
  /** Trapezoid — two parallel sides (a, b) and the height between them. */
  trap_a_m?: number | null;
  trap_b_m?: number | null;
  trap_h_m?: number | null;
}

export interface PlanGeometry {
  /** Floor/plan area in m². 0 for a pure line (fence) plan. */
  area_m2: number;
  /** Outline length in m. null when it can't be computed safely. */
  perimeter_m: number | null;
  /** Human label, e.g. "L-shape (2 regions)" or "Triangle". */
  label: string;
  /**
   * True when the figure was computed from explicit regions or a primitive
   * shape (i.e. NOT just the bounding box). The caller uses this to decide
   * whether to inject the computed geometry over whatever the model wrote.
   */
  composite: boolean;
}

const finitePos = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** Sum of w×l over valid sub-rectangles. */
export function regionsArea(regions: Region[] | null | undefined): number {
  if (!Array.isArray(regions)) return 0;
  let total = 0;
  for (const r of regions) {
    total += finitePos(r?.width_m) * finitePos(r?.length_m);
  }
  return round2(total);
}

export function rectArea(width_m: number, length_m: number): number {
  return round2(finitePos(width_m) * finitePos(length_m));
}

export function rectPerimeter(width_m: number, length_m: number): number {
  return round2(2 * (finitePos(width_m) + finitePos(length_m)));
}

export function triangleArea(base_m: number, height_m: number): number {
  return round2(0.5 * finitePos(base_m) * finitePos(height_m));
}

export function circleArea(radius_m: number): number {
  const r = finitePos(radius_m);
  return round2(Math.PI * r * r);
}

export function circleCircumference(radius_m: number): number {
  return round2(2 * Math.PI * finitePos(radius_m));
}

export function trapezoidArea(a_m: number, b_m: number, height_m: number): number {
  return round2(0.5 * (finitePos(a_m) + finitePos(b_m)) * finitePos(height_m));
}

/**
 * Compute the area + perimeter for a scanned plan.
 *
 * Precedence:
 *   1. explicit `regions` (composite footprint) — sum of sub-rectangle areas;
 *      perimeter = bounding-box outline (geometrically exact for a true
 *      L-shape; a safe approximation for other rectilinear unions, so we only
 *      report it for l_shape to avoid quietly wrong perimeters elsewhere).
 *   2. a primitive `shape` with its own dimensions.
 *   3. fallback: the bounding-box rectangle (current behaviour).
 */
export function computePlanGeometry(input: PlanGeometryInput): PlanGeometry {
  const w = finitePos(input.width_m);
  const l = finitePos(input.length_m);

  // 1 — composite regions.
  const regionsTotal = regionsArea(input.regions);
  if (regionsTotal > 0 && Array.isArray(input.regions) && input.regions.length > 0) {
    const n = input.regions.length;
    // A true L-shape's outline equals its bounding-box perimeter. For other
    // rectilinear unions that isn't guaranteed, so only emit perimeter when
    // the shape is explicitly an L and we have a bounding box.
    const perimeter_m =
      input.shape === "l_shape" && w > 0 && l > 0 ? rectPerimeter(w, l) : null;
    return {
      area_m2: regionsTotal,
      perimeter_m,
      label:
        n === 1
          ? "Rectangle"
          : `${input.shape === "l_shape" ? "L-shape" : "Composite"} (${n} regions)`,
      composite: true,
    };
  }

  // 2 — primitives.
  switch (input.shape) {
    case "triangle": {
      const b = finitePos(input.tri_base_m);
      const h = finitePos(input.tri_height_m);
      if (b > 0 && h > 0) {
        return {
          area_m2: triangleArea(b, h),
          perimeter_m: null, // needs all three sides; don't guess.
          label: "Triangle",
          composite: true,
        };
      }
      break;
    }
    case "circle": {
      const r = finitePos(input.radius_m);
      if (r > 0) {
        return {
          area_m2: circleArea(r),
          perimeter_m: circleCircumference(r),
          label: "Circle",
          composite: true,
        };
      }
      break;
    }
    case "trapezoid": {
      const a = finitePos(input.trap_a_m);
      const b = finitePos(input.trap_b_m);
      const h = finitePos(input.trap_h_m);
      if (a > 0 && b > 0 && h > 0) {
        return {
          area_m2: trapezoidArea(a, b, h),
          perimeter_m: null, // slanted sides unknown; don't guess.
          label: "Trapezoid",
          composite: true,
        };
      }
      break;
    }
    case "line": {
      // Fence run — no area, the length is the run.
      return {
        area_m2: 0,
        perimeter_m: l > 0 ? l : w > 0 ? w : null,
        label: "Line (fence run)",
        composite: false,
      };
    }
    default:
      break;
  }

  // 3 — bounding-box rectangle fallback.
  return {
    area_m2: rectArea(w, l),
    perimeter_m: w > 0 && l > 0 ? rectPerimeter(w, l) : null,
    label: input.shape === "other" ? "Approx (bounding box)" : "Rectangle",
    composite: false,
  };
}
