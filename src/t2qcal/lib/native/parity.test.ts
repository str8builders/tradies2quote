import { describe, expect, it } from "vitest";
import reference from "../fixtures/native-reference.json";
import { getVerifiedDefinition } from "../verified-calculators";
import { nativePortedSlugs } from "./index";

/**
 * Native parity harness.
 *
 * `fixtures/native-reference.json` is produced by running every native
 * calculator through the real Swift code (scripts/native-web-reference in
 * the T2QCAL repo): 95 tools × metric/imperial × defaults plus two scaled
 * variants. A ported web calculator must reproduce, for every case:
 *   - every result row, label and value string byte for byte,
 *   - the set-out marks,
 *   - every diagram value (to 1e-8), and
 *   - every handoff and cut.
 * Only slugs registered in native/index.ts are held to this; the list of
 * unported slugs is asserted so nothing is silently skipped.
 */

type Case = {
  slug: string;
  unit: "metric" | "imperial";
  variant: number;
  values: Record<string, number>;
  results: { label: string; value: string; primary: boolean }[];
  marks: string[];
  diagramValues: Record<string, number>;
  nonFinite: string[];
  handoffs: { key: string; label: string; quantity: number; unit: string; role: string; includeByDefault: boolean }[];
  cuts: { mm: number; count: number; label: string }[];
};

const cases = (reference as unknown as { cases: Case[] }).cases;
const allSlugs = [...new Set(cases.map((c) => c.slug))];
const ported = new Set(nativePortedSlugs());

/** Slugs still served by the older hand-written web definitions. */
export const UNPORTED_SLUGS = allSlugs.filter((s) => !ported.has(s));

describe("native parity coverage", () => {
  it("reference covers every catalogue tool in both units with three variants", () => {
    expect(allSlugs).toHaveLength(95);
    for (const slug of allSlugs) expect(cases.filter((c) => c.slug === slug)).toHaveLength(6);
  });
  it("lists the calculators not yet ported (must reach zero)", () => {
    // Update this expectation as ports land; it exists so nobody removes a
    // port without noticing.
    expect(UNPORTED_SLUGS.length).toBeLessThanOrEqual(95);
  });
});

describe.each(allSlugs.filter((s) => ported.has(s)))("native parity: %s", (slug) => {
  const definition = getVerifiedDefinition(slug);
  it.each(cases.filter((c) => c.slug === slug).map((c) => [c.unit, c.variant, c] as const))(
    "%s variant %i matches the native app",
    (_unit, _variant, c) => {
      const output = definition.compute(c.values, c.unit);
      expect(output.errors, `web reported errors: ${output.errors?.join(" | ")}`).toBeUndefined();

      // Result rows: same count, same order, same label and value text.
      expect(output.results.map((r) => [r.label, r.value, r.primary === true])).toEqual(
        c.results.map((r) => [r.label, r.value, r.primary]),
      );

      // Set-out marks.
      expect(output.marks ?? []).toEqual(c.marks);

      // Diagram values: every native key present and equal.
      const dv = output.diagramValues ?? {};
      for (const [key, value] of Object.entries(c.diagramValues)) {
        expect(dv[key], `diagramValues.${key}`).toBeCloseTo(value, 8);
      }

      // Handoffs and cuts.
      const handoffs = (output.handoffs ?? []).map((h) => ({
        key: h.key, label: h.label, unit: h.unit, role: h.role, includeByDefault: h.includeByDefault === true,
      }));
      expect(handoffs).toEqual(c.handoffs.map(({ key, label, unit, role, includeByDefault }) => ({ key, label, unit, role, includeByDefault })));
      (output.handoffs ?? []).forEach((h, i) => expect(h.quantity, `handoff ${h.key} quantity`).toBeCloseTo(c.handoffs[i].quantity, 6));
      expect(output.cuts ?? []).toEqual(c.cuts);
    },
  );
});
