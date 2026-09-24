// The redesign's rules, checked in the source of every new job page file (the
// same checks the kit runs on itself in src/components/ui/design-rules.test.ts)
// so a later edit can't quietly bring back tiny text, "//" labels, raw colours
// or motion that ignores reduced-motion settings. The classic panels shown in
// "More tools" are reused as they are and are not part of this folder.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const dir = "src/app/app/quotes/preview/[id]/_v2";

function sources(folder: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, folder))) {
    const path = join(folder, name);
    if (statSync(join(root, path)).isDirectory()) out.push(...sources(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const files = sources(dir).map((path) => ({
  path: relative(root, join(root, path)),
  code: readFileSync(join(root, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1"),
}));

describe("new job page source follows the design rules", () => {
  it("covers the page, its parts and its sheets", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.path.endsWith("JobScreen.tsx"))).toBe(true);
    expect(files.some((f) => f.path.includes("/sheets/"))).toBe(true);
  });

  it.each(files)("$path: colours come only from ui- tokens", ({ code }) => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\brgba?\(/);
    expect(code).not.toMatch(
      /\b(?:bg|text|border|ring|outline|divide|fill|stroke|from|via|to|placeholder|caret|accent|decoration|shadow)-(?:ink|brand|hivis|white|black|red|green|blue|yellow|orange|amber|emerald|gray|zinc|neutral|slate|stone|cyan)(?:-\d+)?\b/,
    );
    expect(code).not.toMatch(/\btext-ui-brand(?![-\w])/);
    expect(code).not.toMatch(/\bt2q-(?:btn|card|section-label)/);
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

  it.each(files)("$path: no emoji and no browser confirm()", ({ code }) => {
    expect(code).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(code).not.toMatch(/\b(?:window\.)?confirm\(/);
  });
});
