import type { VerifiedDefinition } from "../verified-calculators";
import type { DiagramKind } from "@/t2qcal/components/calculators/technicalDrawing";
import meta from "./meta.json";
import { definitions as roof } from "./roof";
import { definitions as stairs } from "./stairs";
import { definitions as spacing } from "./spacing";
import { definitions as concrete } from "./concrete";
import { definitions as tube } from "./tube";
import { definitions as templates } from "./templates";
import { definitions as deck } from "./deck";
import { definitions as convert } from "./convert";
import { definitions as geometry } from "./geometry";
import { definitions as materials } from "./materials";
import { definitions as drainage } from "./drainage";

/**
 * Calculators ported one-for-one from the native app. When a slug is
 * present here it takes precedence over the older hand-written web
 * definition, so the web app computes and labels exactly like the native
 * app (proved by native/parity.test.ts against the Swift reference export).
 */
const nativeMeta = meta as Record<string, { assembly: string | null }>;

const merged: Record<string, VerifiedDefinition> = {
  ...roof,
  ...stairs,
  ...spacing,
  ...concrete,
  ...tube,
  ...templates,
  ...deck,
  ...convert,
  ...geometry,
  ...materials,
  ...drainage,
};

// The native 3D assembly kind rides along from the catalogue meta so the web
// sheet picker stands up the same model as the native app.
const ported: Record<string, VerifiedDefinition> = Object.fromEntries(
  Object.entries(merged).map(([slug, definition]) => {
    const assembly = nativeMeta[slug]?.assembly;
    return [slug, assembly ? { ...definition, assembly: assembly as DiagramKind } : definition];
  }),
);

export function nativePortDefinition(slug: string): VerifiedDefinition | null {
  return ported[slug] ?? null;
}

export function nativePortedSlugs(): string[] {
  return Object.keys(ported);
}
