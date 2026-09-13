import type { CalculatorOutput, VerifiedDefinition, VerifiedUnit } from "../verified-calculators";
import { baseFromMeta } from "./stairs-meta";
import { ceilInt, floorInt, len, n, pos, ulp, type Values } from "./format";

/**
 * Exact port of ios/T2QCAL/T2QCAL/Models/BalancedSpacing.swift and the
 * `verifiedSpacing(...)` tool factory at the top of Models/ToolsSpacing.swift.
 * Baluster spacing lives in the stairs catalogue but is built by the same
 * factory, so both ported modules share this file.
 */

export type BalancedSpacing = { count: number; gap: number };

/** n fixed-width members with n + 1 equal clear gaps, including both ends. */
export function solveBalancedSpacing(
  span: number,
  width: number,
  target: number,
  maximumGap = false,
): BalancedSpacing | null {
  if (!Number.isFinite(span) || !Number.isFinite(width) || !Number.isFinite(target)) return null;
  if (!(span > 0) || !(width >= 0) || !(target >= 0) || !(width <= span) || !(width + target > 0)) return null;
  const ideal = (span - target) / (width + target);
  if (!(ideal <= 10_000)) return null;
  const fitting = width > 0 ? floorInt(span / width, 1, 10_000) : 10_000;
  const candidates = [...new Set([floorInt(ideal, 1, fitting), ceilInt(ideal, 1, fitting)])];
  const layouts = candidates
    .map((count): BalancedSpacing => ({ count, gap: Math.max(0, (span - count * width) / (count + 1)) }))
    .filter((layout) => !maximumGap || layout.gap <= target + ulp(span) * 8);
  let best: BalancedSpacing | null = null;
  for (const layout of layouts) {
    if (best === null) {
      best = layout;
      continue;
    }
    const a = Math.abs(layout.gap - target);
    const b = Math.abs(best.gap - target);
    const lower = Math.abs(a - b) <= ulp(span) * 8 ? layout.count < best.count : a < b;
    if (lower) best = layout;
  }
  return best;
}

/** `BalancedSpacing.invalid` — the native "check your dimensions" output. */
export function balancedSpacingInvalid(): CalculatorOutput {
  return {
    results: [
      {
        label: "Check spacing dimensions",
        value:
          "Members must fit inside the span. Use a positive member width or gap, and a layout of at most 10,000 members. A maximum gap must be achievable with the entered member width.",
        primary: true,
      },
    ],
    marks: [],
    diagramValues: { invalid: 1 },
  };
}

/** `ToolsLayouts.invalid(_:)`. */
export function layoutInvalid(message: string): CalculatorOutput {
  return {
    results: [{ label: "Check inputs", value: message, primary: true }],
    marks: [],
    diagramValues: { invalid: 1 },
  };
}

/** `ToolsLayouts.marks(count:first:spacing:metric:)`. */
export function layoutMarks(count: number, first: number, spacing: number, metric: boolean): string[] {
  return Array.from(
    { length: Math.max(0, Math.min(count, 1000)) },
    (_, i) => `${i + 1} · centre ${len(first + i * spacing, metric)}`,
  );
}

/** Two-digit running index for the set-out lists: "01", "02", … */
export const ord = (index: number): string => String(index).padStart(2, "0");

/**
 * `verifiedSpacing(...)` — the shared balanced-field tool. Fields, title, note,
 * diagram and sheets come from the catalogue meta; only the compute closure and
 * the per-tool noun / maximum-gap / flag behaviour are re-declared here.
 */
export function verifiedSpacing(options: {
  slug: string;
  noun: string;
  maximumGap?: boolean;
  flags?: Record<string, number>;
}): VerifiedDefinition {
  const { slug, noun, maximumGap = false, flags = {} } = options;
  const model = Math.trunc(flags.model ?? 0);
  return {
    ...baseFromMeta(slug),
    compute(values: Values, unit: VerifiedUnit): CalculatorOutput {
      const metric = unit === "metric";
      const span = pos(n(values, "span"));
      const width = Math.max(0, n(values, "memberWidth"));
      if (model === 5 && width > n(values, "height")) {
        return layoutInvalid("The fixing diameter must fit within the stock width.");
      }
      const target = Math.max(0, n(values, "targetGap"));
      const layout = solveBalancedSpacing(span, width, target, maximumGap);
      if (!layout) return balancedSpacingInvalid();
      const count = layout.count;
      const gap = layout.gap;
      const centres = width + gap;
      const marks = Array.from(
        { length: count },
        (_, i) => `${ord(i + 1)} · centre ${len(gap + width / 2 + i * centres, metric)}`,
      );
      const diagramValues: Record<string, number> = { count, gap, spacing: centres, center: centres };
      if (slug !== "starter-bars") diagramValues.spacingGeometry = 1;
      for (const [key, flag] of Object.entries(flags)) diagramValues[key] = flag;
      return {
        results: [
          { label: "Balanced clear gap", value: len(gap, metric), primary: true },
          { label: `${noun} count`, value: String(count) },
          { label: "Centre to centre", value: len(centres, metric) },
          { label: "Equal end margins", value: len(gap, metric) },
          { label: "Occupied material", value: len(count * width, metric) },
          { label: "Open space", value: len((count + 1) * gap, metric) },
        ],
        marks,
        diagramValues,
      };
    },
  };
}
