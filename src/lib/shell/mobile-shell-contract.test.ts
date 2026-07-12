// ─────────────────────────────────────────────────────────────────────────
// MOBILE SHELL CONTRACT — regression lock (CI, deterministic).
//
// docs/mobile-shell-contract.md is the canonical shell: fixed bottom nav +
// document scroll, born from the white-bottom-strip regression. These tests
// read the shell source files as TEXT and assert the contract's invariants,
// so a future edit that re-introduces a banned pattern (fixed-inset canvas,
// html/body overflow lock, second shell media block, forced-white masking…)
// fails CI instead of shipping to a phone.
//
// This is a STATIC lock — the real gate for any deliberate shell change is
// still the 4-state checklist on a real iPhone (see the contract doc).
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const globalsCss = readFileSync(join(root, "src/app/globals.css"), "utf8");
const rootLayout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
const appLayout = readFileSync(join(root, "src/app/app/layout.tsx"), "utf8");

/** Strip /* … *\/ CSS comments so assertions only see live rules. */
function liveCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}
const css = liveCss(globalsCss);

/** Extract the body of the first `selector { … }` rule found. */
function ruleBody(source: string, selector: string): string {
  const idx = source.indexOf(selector);
  expect(idx, `selector "${selector}" must exist`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{", idx);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

describe("mobile shell contract — single owners", () => {
  it("exactly ONE @media (max-width: 639px) shell block exists", () => {
    const matches = css.match(/@media\s*\(max-width:\s*639px\)/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("the document is the scroller: .t2q-app-scroll is never a nested scroll owner", () => {
    // `overflow-x:hidden` is banned too: CSS computes the other axis to
    // `auto`, silently turning this wrapper into a second scroll container.
    // `clip` prevents horizontal escape without establishing a scroller.
    const scrollRules = css
      .split("}")
      .filter((chunk) => chunk.includes(".t2q-app-scroll"));
    for (const rule of scrollRules) {
      expect(rule).not.toMatch(/overflow(?:-x|-y)?:\s*(hidden|auto|scroll)/);
    }
    expect(css).toMatch(/\.t2q-app-scroll\s*\{[^}]*overflow-x:\s*clip/);
  });

  it("bottom nav owns the safe area: fixed, bottom 0, inset padding, own background", () => {
    const nav = ruleBody(css, ".t2q-bottomnav-bar {");
    expect(nav).toMatch(/position:\s*fixed/);
    expect(nav).toMatch(/left:\s*0/);
    expect(nav).toMatch(/right:\s*0/);
    expect(nav).toMatch(/bottom:\s*0/);
    expect(nav).toMatch(/width:\s*100%/);
    expect(nav).toMatch(/max-width:\s*100vw/);
    expect(nav).toMatch(/padding:[^;]*env\(safe-area-inset-bottom/);
    expect(nav).toMatch(/min-height:\s*calc\(4\.05rem \+ env\(safe-area-inset-bottom/);
    expect(nav).toMatch(/background:/);
  });

  it("scroll clearance stays in parity with the nav height (4.05rem + inset)", () => {
    // .t2q-app-scroll's only shell job: pad content clear of the fixed nav.
    expect(css).toMatch(
      /\.t2q-app-scroll\s*\{[^}]*padding-bottom:\s*calc\(4\.05rem \+ env\(safe-area-inset-bottom/,
    );
  });

  it("root fallback paint exists (cream, matches the splash — never white)", () => {
    const rootPaint = ruleBody(css, 'html:has([data-shell="app"])');
    expect(rootPaint).toMatch(/background:\s*#F5F4EE/i);
  });

  it("overscroll is suppressed on BOTH html and body (no rubber-band / chain)", () => {
    expect(ruleBody(css, "html {")).toMatch(/overscroll-behavior:\s*none/);
    expect(ruleBody(css, "body {")).toMatch(/overscroll-behavior:\s*none/);
  });

  it("horizontal overflow uses clip on body (hidden breaks iOS momentum scroll)", () => {
    expect(ruleBody(css, "body {")).toMatch(/overflow-x:\s*clip/);
  });
});

describe("mobile shell contract — banned patterns stay banned", () => {
  it("no html/body overflow lock (general shell scroll-lock is the regression)", () => {
    expect(ruleBody(css, "html {")).not.toMatch(/overflow(-y)?:\s*hidden/);
    expect(ruleBody(css, "body {")).not.toMatch(/overflow(-y)?:\s*hidden/);
    expect(ruleBody(css, "html {")).not.toMatch(/height:\s*100%/);
    expect(ruleBody(css, "body {")).not.toMatch(/height:\s*100%/);
  });

  it("the /app canvas is normal flow (min-h-dvh), never a fixed-inset container", () => {
    const canvasLine = appLayout
      .split("\n")
      .find((l) => l.includes("t2q-app-canvas") && l.includes("className"));
    expect(canvasLine, "canvas element must exist in app/layout.tsx").toBeDefined();
    expect(canvasLine!).toContain("min-h-dvh");
    expect(canvasLine!).toContain("overflow-x-clip");
    expect(canvasLine!).not.toContain("overflow-x-hidden");
    expect(canvasLine!).not.toMatch(/\bfixed\b/);
    expect(canvasLine!).not.toMatch(/\binset-0\b/);
  });

  it("bottom-nav press feedback never moves or scales the tabs", () => {
    const activeRule = ruleBody(css, ".t2q-bottomnav-tab:active");
    expect(activeRule).not.toMatch(/transform\s*:/);
    expect(activeRule).not.toMatch(/translate|scale/);
  });

  it("no forced-white root/page masking", () => {
    expect(css).not.toMatch(
      /html:has\(\[data-shell="app"\]\)[^{]*\{[^}]*background:\s*#fff/i,
    );
    expect(css).not.toMatch(/--t2q-app-page:\s*#FFFFFF/i);
  });

  it("viewportFit cover is on, themeColor declared exactly once at the root", () => {
    expect(rootLayout).toMatch(/viewportFit:\s*"cover"/);
    expect(rootLayout).toMatch(/themeColor:/);
    // /app must NOT re-declare themeColor (route-level override = banned mask).
    expect(appLayout).not.toMatch(/themeColor:\s*["']/);
  });

  it("no hand-written viewport meta tags anywhere in the layouts", () => {
    expect(rootLayout).not.toMatch(/<meta[^>]*name=["']viewport/);
    expect(appLayout).not.toMatch(/<meta[^>]*name=["']viewport/);
  });
});
