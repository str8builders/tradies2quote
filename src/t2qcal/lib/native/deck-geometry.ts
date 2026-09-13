import type { CalculatorField, CalculatorOutput, FieldKind } from "../verified-calculators";
import type { DiagramKind } from "@/t2qcal/components/calculators/technicalDrawing";
import meta from "./meta.json";
import { ceilInt, floorInt, ulp } from "./format";

/**
 * Geometry and catalogue plumbing behind the ported ToolsDeck.swift
 * calculators — BoardRun, FramingRun, BalancedSpacing, CircularArcGeometry,
 * GazeboGeometry and PostHoleGeometry, each a line-for-line port of the
 * matching native struct.
 */

type MetaSheet = { label: string; kind: string };
type MetaField = {
  key: string; label: string; default: number; kind: string; min?: number; max?: number;
  options?: { id: number; label: string }[];
  visibleWhen?: { key: string; allowed: number[] };
};
type MetaEntry = {
  name: string; summary: string; diagram: string; showsAssembly: boolean;
  sheets: MetaSheet[]; fields: MetaField[];
};

const catalogue = meta as unknown as Record<string, MetaEntry>;

/** Title, note, diagram, measured sheets and fields, straight from the catalogue. */
export function metaBase(slug: string): {
  title: string; note: string; diagram: DiagramKind;
  sheets: { label: string; diagram: DiagramKind }[];
  showsAssembly: boolean; fields: CalculatorField[];
} {
  const entry = catalogue[slug];
  return {
    title: entry.name,
    note: entry.summary,
    diagram: entry.diagram as DiagramKind,
    // The 3D assembly is not a measured sheet; the renderer appends it itself.
    sheets: entry.sheets
      .filter((sheet) => !sheet.kind.endsWith("3d"))
      .map((sheet) => ({ label: sheet.label, diagram: sheet.kind as DiagramKind })),
    showsAssembly: entry.showsAssembly,
    fields: entry.fields.map((field) => ({
      key: field.key,
      label: field.label,
      default: field.default,
      kind: field.kind as FieldKind,
      min: field.min,
      max: field.max,
      ...(field.options ? { options: field.options } : {}),
      ...(field.visibleWhen ? { visibleWhen: field.visibleWhen } : {}),
    })),
  };
}

/** `ToolsLayouts.invalid` — a single explanatory row, never a hard error. */
export function invalidOutput(message: string): CalculatorOutput {
  return { results: [{ label: "Check inputs", value: message, primary: true }], diagramValues: { invalid: 1 } };
}

export const BOARD_RUN_INVALID =
  "The entered width and gaps must leave positive edge cuts within the stock width. Reduce the gap or change the stock width. A run supports up to 10,000 pieces.";

/** Two-digit running index for the set-out lists: "01", "02", … */
export const ord = (index: number) => String(index).padStart(2, "0");

// MARK: BoardRun

export type BoardRun = { span: number; stockWidth: number; gap: number; count: number; edge: number };

/** A closed run of full-width interior pieces, equal edge cuts and fixed joints. */
export function boardRun(span: number, stockWidth: number, gap: number): BoardRun | null {
  if (!Number.isFinite(span) || !Number.isFinite(stockWidth) || !Number.isFinite(gap)) return null;
  if (!(span > 0 && stockWidth > 0 && gap >= 0)) return null;
  const required = (span + gap) / (stockWidth + gap);
  if (!(required <= 10_000)) return null;
  const count = ceilInt(required, 1, 10_000);
  const edge = count === 1 ? span : (span - (count - 2) * stockWidth - (count - 1) * gap) / 2;
  if (!(edge > 0 && edge <= stockWidth + ulp(span) * 8)) return null;
  return { span, stockWidth, gap, count, edge };
}

// MARK: FramingRun

export type FramingRun = { count: number; centres: number; member: number };

/** Members fit completely within the outside run, with first and last faces flush. */
export function framingRun(span: number, member: number, maximum: number): FramingRun | null {
  if (!(span > 0 && member > 0 && member <= span && maximum > 0)) return null;
  const required = (span - member) / maximum;
  if (!(Number.isFinite(required) && required <= 9_999)) return null;
  const count = span === member ? 1 : ceilInt(required, 1, 9_999) + 1;
  const centres = count === 1 ? 0 : (span - member) / (count - 1);
  if (!(count === 1 || centres >= member)) return null;
  return { count, centres, member };
}

// MARK: BalancedSpacing

export type BalancedSpacing = { count: number; gap: number };

/** n fixed-width members with n + 1 equal clear gaps, including both ends. */
export function balancedSpacingSolve(span: number, width: number, target: number, maximumGap = false): BalancedSpacing | null {
  if (!Number.isFinite(span) || !Number.isFinite(width) || !Number.isFinite(target)) return null;
  if (!(span > 0 && width >= 0 && target >= 0 && width <= span && width + target > 0)) return null;
  const ideal = (span - target) / (width + target);
  if (!(ideal <= 10_000)) return null;
  const fitting = width > 0 ? floorInt(span / width, 1, 10_000) : 10_000;
  const candidates = [...new Set([floorInt(ideal, 1, fitting), ceilInt(ideal, 1, fitting)])];
  const layouts = candidates
    .map((count) => ({ count, gap: Math.max(0, (span - count * width) / (count + 1)) }))
    .filter((layout) => !maximumGap || layout.gap <= target + ulp(span) * 8);
  const isLess = (a: BalancedSpacing, b: BalancedSpacing) => {
    const ea = Math.abs(a.gap - target);
    const eb = Math.abs(b.gap - target);
    return Math.abs(ea - eb) <= ulp(span) * 8 ? a.count < b.count : ea < eb;
  };
  let best: BalancedSpacing | null = null;
  for (const layout of layouts) if (best === null || isLess(layout, best)) best = layout;
  return best;
}

export const BALANCED_SPACING_INVALID: CalculatorOutput = {
  results: [{
    label: "Check spacing dimensions",
    value: "Members must fit inside the span. Use a positive member width or gap, and a layout of at most 10,000 members. A maximum gap must be achievable with the entered member width.",
    primary: true,
  }],
  diagramValues: { invalid: 1 },
};

// MARK: CircularArcGeometry

export const arcRadius = (span: number, rise: number) => (span * span) / (8 * rise) + rise / 2;

export function arcHeight(span: number, rise: number, x: number): number {
  const radius = arcRadius(span, rise);
  const offset = x - span / 2;
  return rise - (offset * offset) / (radius + Math.sqrt(Math.max(0, radius * radius - offset * offset)));
}

// MARK: GazeboGeometry

export type Gazebo = {
  radius: number; sides: number; pitch: number; halfAngle: number; side: number;
  apothem: number; rise: number; common: number; hip: number; floorArea: number; roofArea: number;
};

export function gazeboGeometry(diameter: number, sides: number, pitch: number): Gazebo | null {
  if (!Number.isFinite(diameter) || !Number.isFinite(pitch)) return null;
  if (!(diameter > 0 && sides >= 3 && sides <= 16 && pitch >= 0 && pitch < 90)) return null;
  const radius = diameter / 2;
  const halfAngle = Math.PI / sides;
  const side = 2 * radius * Math.sin(halfAngle);
  const apothem = radius * Math.cos(halfAngle);
  const rise = apothem * Math.tan((pitch * Math.PI) / 180);
  const common = Math.hypot(apothem, rise);
  return {
    radius, sides, pitch, halfAngle, side, apothem, rise, common,
    hip: Math.hypot(radius, rise),
    floorArea: (sides * side * apothem) / 2,
    roofArea: (sides * side * common) / 2,
  };
}

// MARK: PostHoleGeometry

export type PostHoles = {
  count: number; diameter: number; depth: number; spacing: number; post: number;
  postWidth: number; postDepth: number; postDiameter: number; embedment: number;
  gross: number; displacement: number; net: number; run: number;
  diagramValues: Record<string, number>;
};

export function postHoleGeometry(
  count: number, diameter: number, depth: number, spacing: number, post: number,
  postWidth: number, postDepth: number, postDiameter: number, embedment: number,
): PostHoles | null {
  if (!(count >= 1 && count <= 60)) return null;
  const entered = [diameter, depth, spacing, postWidth, postDepth, postDiameter, embedment];
  if (!entered.every((value) => Number.isFinite(value))) return null;
  if (!(diameter > 0 && depth > 0 && spacing >= 0 && (count === 1 || spacing >= diameter))) return null;
  if (post !== 0) {
    if (!(embedment >= 0 && embedment <= depth)) return null;
    if (post === 1 && !(Math.min(postWidth, postDepth) > 0 && Math.hypot(postWidth, postDepth) <= diameter + ulp(diameter) * 16)) return null;
    if (post === 2 && !(postDiameter > 0 && postDiameter <= diameter)) return null;
  }
  const embedded = post === 0 ? 0 : embedment;
  const radius = diameter / 2;
  const holeArea = Math.PI * radius * radius;
  const postArea = post === 0 ? 0 : post === 1 ? postWidth * postDepth : (Math.PI * postDiameter * postDiameter) / 4;
  const gross = holeArea * depth * count;
  const displacement = postArea * embedded * count;
  return {
    count, diameter, depth, spacing, post, postWidth, postDepth, postDiameter,
    embedment: embedded,
    gross,
    displacement,
    net: gross - displacement,
    run: (count - 1) * spacing,
    diagramValues: {
      postHoleGeometry: 1, count, diameter, depth, spacing,
      postShape: post, postWidth, postDepth, postDiameter, embedment: embedded,
    },
  };
}

// MARK: HandoffFingerprint

const stableNumber = (value: number) => value.toFixed(6);

/** Stable product/package identity; lengths normalise back to millimetres. */
export function fingerprintPackage(kind: string, metric: boolean, lengths: number[] = [], values: number[] = []): string {
  const canonicalLengths = lengths.map((value) => {
    const millimetres = metric ? value : value * 25.4;
    return Math.round(millimetres * 100) / 100;
  });
  const parts = ["v1", kind]
    .concat(canonicalLengths.map((value, index) => `l${index}=${stableNumber(value)}`))
    .concat(values.map((value, index) => `v${index}=${stableNumber(value)}`));
  return parts.join("|");
}
