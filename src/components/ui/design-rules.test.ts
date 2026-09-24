// The six design rules, checked in the source of every new-look file so a
// later edit cannot quietly bring back tiny text, code-style labels, raw
// colours or motion that ignores reduced-motion settings.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
/** input.tsx is the older shadcn Input used by the landing page and T2QCAL. */
const LEGACY = new Set(["src/components/ui/input.tsx"]);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) out.push(...sources(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !LEGACY.has(path)) out.push(path);
  }
  return out;
}

const files = [...sources("src/components/ui"), ...sources("src/app/ui-kit")].map((path) => ({
  path: relative(root, join(root, path)),
  // Comments may talk about banned things ("no // label eyebrows"); code may not.
  code: readFileSync(join(root, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1"),
}));

describe("new-look source follows the design rules", () => {
  it("covers the kit and the kit page", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.path.endsWith("button.tsx"))).toBe(true);
    expect(files.some((f) => f.path.startsWith("src/app/ui-kit/"))).toBe(true);
  });

  it.each(files)("$path: colours come only from ui- tokens", ({ code }) => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\brgba?\(/);
    expect(code).not.toMatch(
      /\b(?:bg|text|border|ring|outline|divide|fill|stroke|from|via|to|placeholder|caret|accent|decoration|shadow)-(?:ink|brand|hivis|white|black|red|green|blue|yellow|orange|amber|emerald|gray|zinc|neutral|slate|stone)(?:-\d+)?\b/,
    );
    // Brand orange is a fill; orange text must use brand-text (readable outdoors).
    expect(code).not.toMatch(/\btext-ui-brand(?![-\w])/);
  });

  it.each(files)("$path: no tiny text (13 px captions are the floor)", ({ code }) => {
    expect(code).not.toMatch(/\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/);
    expect(code).not.toMatch(/\btext-\[\d+(?:\.\d+)?px\]/);
  });

  it.each(files)("$path: plain words, no code-style labels", ({ code }) => {
    expect(code).not.toMatch(/\{\s*["'`]\/\/ /);
    expect(code).not.toMatch(/>\s*\/\/ /);
    expect(code).not.toMatch(/\buppercase\b/);
    expect(code).not.toMatch(/tracking-\[0\.\d+em\]/);
    expect(code).not.toMatch(/\bfont-mono\b/);
  });

  it.each(files)("$path: motion is transform/opacity only and stops for reduced motion", ({ code }) => {
    expect(code).not.toMatch(/\btransition(?:-all|-colors|-shadow)?(?=["'`\s])/);
    const animations = code.match(/\banimate-(?!none\b)[\w-]+/g) ?? [];
    const animationsOff = code.match(/motion-reduce:animate-none/g) ?? [];
    expect(animationsOff.length).toBeGreaterThanOrEqual(animations.length);
    const transitions = code.match(/\btransition-(?:transform|opacity)\b/g) ?? [];
    const transitionsOff = code.match(/motion-reduce:transition-none/g) ?? [];
    expect(transitionsOff.length).toBeGreaterThanOrEqual(transitions.length);
  });

  it.each(files)("$path: no emoji in the interface", ({ code }) => {
    expect(code).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
