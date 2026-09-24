import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, formatRatio, parseHex, relativeLuminance } from "./contrast";
import {
  UI_COLOR_NAMES,
  UI_DURATION,
  UI_EASE,
  UI_RADIUS,
  UI_SHADOW_NAMES,
  UI_TEXT,
  UI_THEMES,
  uiCssVariables,
  type UiColorName,
  type UiMode,
} from "./tokens";

const MODES: UiMode[] = ["default", "outdoor"];
const color = (mode: UiMode, name: UiColorName) => UI_THEMES[mode].colors[name];
const ratio = (mode: UiMode, fg: UiColorName, bg: UiColorName) =>
  contrastRatio(color(mode, fg), color(mode, bg));

describe("contrast maths", () => {
  it("matches the WCAG reference points", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
    // WCAG's own worked example: #777 on white is just under 4.5:1.
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(relativeLuminance("#fff")).toBe(1);
    expect(parseHex("#FF5F15")).toEqual([255, 95, 21]);
    expect(() => parseHex("rgba(0,0,0,.5)")).toThrow();
    expect(formatRatio(4.4999)).toBe("4.4:1");
  });
});

describe.each(MODES)("%s palette contrast (WCAG)", (mode) => {
  const surfaces: UiColorName[] = ["bg", "surface", "surface-2"];

  it("body text is at least 7:1 on every surface", () => {
    for (const s of surfaces) expect(ratio(mode, "text", s)).toBeGreaterThanOrEqual(7);
  });

  it("muted and faint text are at least 4.5:1 on every surface", () => {
    for (const s of surfaces) {
      expect(ratio(mode, "muted", s), `muted on ${s}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(mode, "faint", s), `faint on ${s}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("orange text (brand-text) is at least 4.5:1 on every surface and its soft tint", () => {
    for (const s of [...surfaces, "brand-soft"] as UiColorName[]) {
      expect(ratio(mode, "brand-text", s), `brand-text on ${s}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("text on the orange and hi-vis fills is at least 4.5:1", () => {
    expect(ratio(mode, "on-brand", "brand")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(mode, "on-brand", "hivis")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(mode, "on-mark", "mark")).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["ok", "warn", "bad", "info"] as const)(
    "%s is readable on every surface, on its soft tint, and as a fill",
    (tone) => {
      for (const s of surfaces) {
        expect(ratio(mode, tone, s), `${tone} on ${s}`).toBeGreaterThanOrEqual(4.5);
      }
      const soft = `${tone}-soft` as UiColorName;
      expect(ratio(mode, tone, soft), `${tone} on ${soft}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(mode, "text", soft), `text on ${soft}`).toBeGreaterThanOrEqual(4.5);
      // Icons drawn in the page colour on a solid tone fill (status rail ticks).
      expect(ratio(mode, "bg", tone), `bg on ${tone}`).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("control edges and the focus ring stand out (3:1 non-text)", () => {
    for (const s of surfaces) {
      expect(ratio(mode, "line-strong", s), `line-strong on ${s}`).toBeGreaterThanOrEqual(3);
      expect(ratio(mode, "focus", s), `focus on ${s}`).toBeGreaterThanOrEqual(3);
    }
    expect(ratio(mode, "brand", "bg")).toBeGreaterThanOrEqual(3);
  });

  it("uses opaque hex for every colour except the scrim", () => {
    for (const name of UI_COLOR_NAMES) {
      if (name === "scrim") expect(color(mode, name)).toMatch(/^rgba\(/);
      else expect(color(mode, name)).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("outdoor mode is the high-contrast option", () => {
  it("keeps the brand orange fill and puts black text on it", () => {
    expect(color("outdoor", "brand")).toBe("#FF5F15");
    expect(color("outdoor", "on-brand")).toBe("#000000");
    expect(ratio("outdoor", "text", "bg")).toBeGreaterThanOrEqual(7);
  });
  it("is at least as strong as the default palette for body and muted text", () => {
    expect(ratio("outdoor", "text", "bg")).toBeGreaterThanOrEqual(ratio("default", "text", "bg"));
    expect(ratio("outdoor", "muted", "bg")).toBeGreaterThanOrEqual(ratio("default", "muted", "bg"));
    expect(UI_THEMES.outdoor.bodyWeight).toBe(500);
    expect(parseFloat(UI_THEMES.outdoor.focusWidth)).toBeGreaterThan(
      parseFloat(UI_THEMES.default.focusWidth),
    );
  });
});

// ── globals.css must say exactly what tokens.ts says ─────────────────────────

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Body of the first top-level block whose header matches, braces balanced. */
function block(header: RegExp): string {
  const match = header.exec(css);
  expect(match, `block ${header} must exist in globals.css`).not.toBeNull();
  let depth = 0;
  const start = css.indexOf("{", match!.index);
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start + 1, i);
  }
  throw new Error(`unbalanced block ${header}`);
}

/** `--name: value;` pairs declared directly in a block (nested blocks dropped). */
function declarations(body: string): Record<string, string> {
  let flat = body;
  // Remove nested blocks (e.g. @keyframes inside @theme).
  while (/\{[^{}]*\}/.test(flat)) flat = flat.replace(/[^;{}]*\{[^{}]*\}/g, "");
  const out: Record<string, string> = {};
  for (const m of flat.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim().replace(/\s+/g, " ");
  }
  return out;
}

const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const normMap = (map: Record<string, string>) =>
  Object.fromEntries(Object.entries(map).map(([k, v]) => [k, norm(v)]));

describe("globals.css matches tokens.ts (no drift)", () => {
  it("the :root default palette equals UI_THEMES.default", () => {
    const vars = declarations(block(/:root\s*\{\s*--ui-bg:/));
    expect(normMap(vars)).toEqual(normMap(uiCssVariables("default")));
  });

  it('the [data-contrast="outdoor"] palette equals UI_THEMES.outdoor', () => {
    const vars = declarations(block(/\[data-contrast="outdoor"\]\s*\{/));
    expect(normMap(vars)).toEqual(normMap(uiCssVariables("outdoor")));
  });

  it("@theme inline maps every colour, shadow and the body weight to its --ui-* variable", () => {
    const inline = declarations(block(/@theme inline\s*\{/));
    const expected: Record<string, string> = {};
    for (const name of UI_COLOR_NAMES) expected[`--color-ui-${name}`] = `var(--ui-${name})`;
    for (const name of UI_SHADOW_NAMES) expected[`--shadow-ui-${name}`] = `var(--ui-shadow-${name})`;
    expected["--font-weight-ui-body"] = "var(--ui-body-weight)";
    expect(normMap(inline)).toEqual(normMap(expected));
  });

  it("the ui @theme sizes, radii and motion equal tokens.ts", () => {
    const theme = declarations(block(/@theme\s*\{\s*--font-ui-sans:/));
    for (const [name, [size, lineHeight]] of Object.entries(UI_TEXT)) {
      expect(theme[`--text-ui-${name}`], `--text-ui-${name}`).toBe(size);
      expect(theme[`--text-ui-${name}--line-height`], `--text-ui-${name}--line-height`).toBe(lineHeight);
    }
    for (const [name, value] of Object.entries(UI_RADIUS)) {
      expect(theme[`--radius-ui-${name}`], `--radius-ui-${name}`).toBe(value);
    }
    for (const [name, value] of Object.entries(UI_DURATION)) {
      expect(theme[`--transition-duration-ui-${name}`], `duration ${name}`).toBe(value);
    }
    for (const [name, value] of Object.entries(UI_EASE)) {
      expect(theme[`--ease-ui-${name}`], `ease ${name}`).toBe(value);
    }
    // Fonts reuse the next/font variables the root layout already loads.
    expect(theme["--font-ui-sans"]).toMatch(/^var\(--font-ibm-plex-sans\)/);
    expect(theme["--font-ui-display"]).toMatch(/^var\(--font-archivo-black\)/);
  });

  it("keeps transitions at 250 ms or less and body text at 17 px, captions at 13 px", () => {
    for (const value of Object.values(UI_DURATION)) expect(parseInt(value, 10)).toBeLessThanOrEqual(250);
    const theme = declarations(block(/@theme\s*\{\s*--font-ui-sans:/));
    for (const name of ["sheet-in", "fade-in", "toast-in"]) {
      const ms = /(\d+)ms/.exec(theme[`--animate-ui-${name}`] ?? "");
      expect(ms, `--animate-ui-${name}`).not.toBeNull();
      expect(Number(ms![1])).toBeLessThanOrEqual(250);
    }
    expect(parseFloat(UI_TEXT.base[0]) * 16).toBe(17);
    expect(parseFloat(UI_TEXT.xs[0]) * 16).toBe(13);
    const sizes = Object.values(UI_TEXT).map(([size]) => parseFloat(size) * 16);
    expect(Math.min(...sizes)).toBe(13);
  });

  it("only --ui-* variables change in outdoor mode, so existing screens cannot", () => {
    const outdoor = declarations(block(/\[data-contrast="outdoor"\]\s*\{/));
    for (const key of Object.keys(outdoor)) expect(key).toMatch(/^--ui-/);
    // Nothing else in the file may key off the contrast attribute.
    const uses = css.match(/data-contrast/g) ?? [];
    expect(uses).toHaveLength(1);
  });
});
