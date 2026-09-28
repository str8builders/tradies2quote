import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/ui/contrast";

const css = readFileSync(resolve(__dirname, "./jobsite.css"), "utf8");

// --js-text (#f2efea) on --js-muted (#bdb7ae): the support-email link's
// colour against the surrounding .jobsite-help paragraph's own colour is
// only ~1.7:1 — no amount of squinting tells them apart by colour alone
// (WCAG 1.4.1). An underline makes it distinguishable without relying on
// colour at all.
describe("jobsite-help support-email link — distinguishable without relying on colour", () => {
  it("confirms the colour-only contrast really is too low to rely on", () => {
    expect(contrastRatio("#f2efea", "#bdb7ae")).toBeLessThan(2);
  });

  it("the link rule sets an actual underline, not just a colour for one that never shows", () => {
    const rule = css.match(/\.jobsite-help a\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toBeTruthy();
    // `text-decoration-color` alone paints nothing without a decoration line.
    expect(rule).toMatch(/text-decoration:\s*underline/);
    expect(rule).toContain("text-decoration-color");
  });
});
