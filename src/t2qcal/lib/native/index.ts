import type { VerifiedDefinition } from "../verified-calculators";
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
const ported: Record<string, VerifiedDefinition> = {
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

export function nativePortDefinition(slug: string): VerifiedDefinition | null {
  return ported[slug] ?? null;
}

export function nativePortedSlugs(): string[] {
  return Object.keys(ported);
}
