import type { CalculatorField, FieldKind, VerifiedUnit } from "../verified-calculators";
import type { DiagramKind } from "@/t2qcal/components/calculators/technicalDrawing";
import meta from "./meta.json";

/**
 * Catalogue metadata exported from the native app (`Tool` + `Field`), plus the
 * exact port of `Field.sanitizedDisplayValue`, for the drainage tools.
 *
 * `native/roof-meta.ts` carries the identical helper for the roof family; file
 * ownership keeps each category to its own `native/<category>-*.ts` helpers, so
 * the two are deliberately separate until a shared `native/catalogue.ts` lands.
 */

type MetaField = {
  key: string;
  label: string;
  default: number;
  kind: string;
  min: number;
  max: number;
  options?: { id: number; label: string }[];
  visibleWhen?: { key: string; allowed: number[] };
};

type MetaTool = {
  name: string;
  summary: string;
  diagram: string;
  sheets: { label: string; kind: string }[];
  showsAssembly: boolean;
  fields: MetaField[];
};

const catalogue = meta as unknown as Record<string, MetaTool>;

function nativeTool(slug: string): MetaTool {
  const tool = catalogue[slug];
  if (!tool) throw new Error(`native/meta.json has no tool "${slug}"`);
  return tool;
}

const toField = (field: MetaField): CalculatorField => ({
  key: field.key,
  label: field.label,
  default: field.default,
  kind: field.kind as FieldKind,
  min: field.min,
  max: field.max,
  ...(field.options ? { options: field.options } : {}),
  ...(field.visibleWhen ? { visibleWhen: field.visibleWhen } : {}),
});

/**
 * `title`, `note`, `diagram`, `sheets` and `showsAssembly` straight from the
 * catalogue, with the trailing 3D sheet dropped (the web picker appends the
 * assembly itself, as `Tool.drawingSheets` does natively).
 */
export function nativeShell(slug: string, kind: (native: string) => DiagramKind) {
  const tool = nativeTool(slug);
  return {
    title: tool.name,
    note: tool.summary,
    diagram: kind(tool.diagram),
    sheets: tool.sheets
      .filter((sheet) => !sheet.kind.endsWith("3d"))
      .map((sheet) => ({ label: sheet.label, diagram: kind(sheet.kind) })),
    showsAssembly: tool.showsAssembly,
    fields: tool.fields.map(toField),
  };
}

const MM_PER_INCH = 25.4;

/** Exact port of `Field.displayValue(fromCanonical:unit:)`. */
function displayValue(field: MetaField, value: number, metric: boolean): number {
  if (metric) return value;
  switch (field.kind) {
    case "length": return value / MM_PER_INCH;
    case "area": return value / 0.09290304;
    case "volumeRate": return value * 0.764554857984;
    case "linearRate": return value * 0.3048;
    case "cubicFootRate": return value * 0.028316846592;
    default: return value;
  }
}

/**
 * Exact port of the sanitising wrapper in `Tool.init`: a non-finite entry falls
 * back to the field default, a count is rounded, and everything is clamped to
 * the field range expressed in the display unit.
 */
export function sanitized(slug: string, values: Record<string, number>, unit: VerifiedUnit): Record<string, number> {
  const metric = unit === "metric";
  const clean: Record<string, number> = {};
  for (const field of nativeTool(slug).fields) {
    const fallback = displayValue(field, field.default, metric);
    const entered = values[field.key];
    const finite = Number.isFinite(entered) ? entered : fallback;
    const value = field.kind === "count" ? (finite < 0 ? -Math.round(-finite) : Math.round(finite)) : finite;
    const low = displayValue(field, field.min, metric);
    const high = displayValue(field, field.max, metric);
    clean[field.key] = Math.min(Math.max(value, low), high);
  }
  return clean;
}

/** `ToolsLayouts.invalid` — a refusal is a result row, never a thrown error. */
export const invalid = (message: string) => ({
  results: [{ label: "Check inputs", value: message, primary: true }],
  marks: [] as string[],
  diagramValues: { invalid: 1 },
  handoffs: [],
  cuts: [],
});
