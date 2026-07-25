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

  it("nav is a floating island: fixed, lifted by the safe-area inset, own background", () => {
    // 2026-07-17 redesign: the nav floats 0.75rem above the home indicator;
    // the safe-area inset rides in the BOTTOM OFFSET (not internal padding),
    // and the bottom-edge paint owner is the root/canvas dark (asserted in
    // the root-paint test below) — same colour everywhere, so the
    // white-strip regression cannot recur.
    const nav = ruleBody(css, ".t2q-bottomnav-bar {");
    expect(nav).toMatch(/position:\s*fixed/);
    expect(nav).toMatch(/left:\s*0\.75rem/);
    expect(nav).toMatch(/right:\s*0\.75rem/);
    expect(nav).toMatch(
      /bottom:\s*calc\(env\(safe-area-inset-bottom[^)]*\)\s*\+\s*0\.75rem\)/,
    );
    expect(nav).toMatch(/margin-inline:\s*auto/);
    expect(nav).toMatch(/max-width:\s*26rem/);
    expect(nav).toMatch(/min-height:\s*4\.15rem/);
    expect(nav).toMatch(/border-radius:/);
    expect(nav).toMatch(/background:/);
  });

  it("scroll clearance stays in parity with the island geometry (5.8rem + inset)", () => {
    // Island claims 0.75rem lift + 4.15rem bar = 4.9rem; clearance adds
    // 0.9rem breathing → 5.8rem. Fixed sticky bars dock at 5.3rem (spot-check
    // StickyActionBar/SupplierBrowser when changing this).
    expect(css).toMatch(
      /\.t2q-app-scroll\s*\{[^}]*padding-bottom:\s*calc\(5\.8rem \+ env\(safe-area-inset-bottom/,
    );
  });

  it("root fallback paint exists (ink, matches the splash — never white)", () => {
    // The invariant is "root layer matches the splash/canvas colour so no
    // strip can ever contrast at the screen edges" — ink since the dark
    // app-shell flip (was cream #F5F4EE).
    const rootPaint = ruleBody(css, 'html:has([data-shell="app"])');
    expect(rootPaint).toMatch(/background:\s*#0A0A0A/i);
  });

  it("iOS zoom lock: form controls are >=16px on phones (kills focus-zoom)", () => {
    // A control < 16px force-zooms the installed iOS shell on focus and never
    // zooms back — the "app moves around inside the screen" bug. This rule
    // lives INSIDE the single 639px block (a second block is banned above).
    expect(css).toMatch(
      /@media\s*\(max-width:\s*639px\)\s*\{[\s\S]*input,\s*textarea,\s*select\s*\{\s*font-size:\s*16px/,
    );
  });

  it("iOS zoom lock: body sets touch-action manipulation (no double-tap zoom)", () => {
    expect(ruleBody(css, "body {")).toMatch(/touch-action:\s*manipulation/);
  });

  it("iOS zoom lock: root viewport pins scale (maximumScale 1, userScalable false)", () => {
    expect(rootLayout).toMatch(/maximumScale:\s*1\b/);
    expect(rootLayout).toMatch(/userScalable:\s*false/);
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
