import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MotionToggle, MOTION_TOGGLE_LABELS } from "./MotionToggle";
import { Footer } from "../landing/Footer";

const textOf = (html: string) => html.replace(/<[^>]*>/g, "").trim();

describe("MotionToggle", () => {
  it("is a real toggle button whose visible text is its whole accessible name", () => {
    const html = renderToStaticMarkup(createElement(MotionToggle));
    expect(html).toMatch(/^<button type="button" class="studio-motion-toggle"/);
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain("aria-label");
    expect(textOf(html)).toBe(MOTION_TOGGLE_LABELS.playing);
    // The icon is decoration only.
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("uses the agreed labels", () => {
    expect(MOTION_TOGGLE_LABELS).toEqual({
      playing: "Pause background motion",
      paused: "Play background motion",
    });
  });

  it("lives in the landing footer", () => {
    const html = renderToStaticMarkup(createElement(Footer));
    const footer = /<footer[\s\S]*<\/footer>/.exec(html)?.[0] ?? "";
    expect(footer).toContain('data-testid="motion-toggle"');
  });

  it("leaves no fixed-position motion control and hides the toggle for reduced motion", () => {
    const css = readFileSync(resolve(__dirname, "../../redesign.css"), "utf8");
    expect(css).not.toContain("studio-motion-control");
    const toggleRules = css.match(/\.studio-motion-toggle[^{]*\{[^}]*\}/g) ?? [];
    expect(toggleRules.length).toBeGreaterThan(0);
    for (const rule of toggleRules) expect(rule).not.toMatch(/position:\s*fixed/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.studio-motion-toggle \{\s*display: none;/,
    );
  });
});
