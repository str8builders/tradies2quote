import type { CalculatorField, FieldKind, VerifiedDefinition } from "../verified-calculators";
import type { DiagramKind } from "@/t2qcal/components/calculators/technicalDrawing";
import meta from "./meta.json";

/**
 * Catalogue metadata exported from the native app (`scripts/native-web-reference`).
 * A ported definition takes its title, note, diagram, sheets, assembly flag and
 * fields straight from here, so the web tool is labelled exactly like the native
 * one without re-typing the Swift `Tool(...)` declarations.
 *
 * NOTE: this helper is generic to every category; it lives under a `stairs-*`
 * name only because file ownership for this port is limited to the stairs and
 * spacing modules. It belongs in a shared `native/meta.ts`.
 */
type MetaField = { key: string; label: string; kind: string; default: number; min: number; max: number };
type MetaEntry = {
  name: string;
  summary: string;
  diagram: string;
  showsAssembly: boolean;
  sheets: { label: string; kind: string }[];
  fields: MetaField[];
};

const entries = meta as unknown as Record<string, MetaEntry>;

/** Everything but `compute`: the parts of a definition the catalogue already knows. */
export type DefinitionBase = Omit<VerifiedDefinition, "compute">;

export function baseFromMeta(slug: string): DefinitionBase {
  const entry = entries[slug];
  if (!entry) throw new Error(`native/meta.json has no entry for "${slug}"`);
  return {
    title: entry.name,
    note: entry.summary,
    diagram: entry.diagram as DiagramKind,
    // The 3D sheet is added by the web sheet picker from `assembly`, not listed.
    sheets: entry.sheets
      .filter((sheet) => !sheet.kind.endsWith("3d"))
      .map((sheet) => ({ label: sheet.label, diagram: sheet.kind as DiagramKind })),
    showsAssembly: entry.showsAssembly,
    fields: entry.fields.map(
      (field): CalculatorField => ({
        key: field.key,
        label: field.label,
        default: field.default,
        kind: field.kind as FieldKind,
        min: field.min,
        max: field.max,
      }),
    ),
  };
}
