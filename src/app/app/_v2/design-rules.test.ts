// The kit's design rules (src/components/ui/design-rules.test.ts), applied
// to the phase 2 screens too: Home, the navigation shell, Jobs and More.
// Checked in the source so a later edit cannot quietly bring back tiny
// text, code-style labels, raw colours or motion that ignores reduced-motion.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const DIRS = ["src/app/app/_v2", "src/app/app/jobs", "src/app/app/more", "src/app/app/timesheet"];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) out.push(...sources(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const files = DIRS.flatMap(sources).map((path) => ({
  path: relative(root, join(root, path)),
  code: readFileSync(join(root, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1"),
}));

describe("phase 2 screens follow the design rules", () => {
  it("covers the shell, Home, Jobs and More", () => {
    for (const part of ["shell/AppNav.tsx", "home/HomeParts.tsx", "jobs/page.tsx", "more/_components/MoreView.tsx"]) {
      expect(files.some((f) => f.path.endsWith(part)), part).toBe(true);
    }
  });

  it.each(files)("$path: colours come only from ui- tokens", ({ code }) => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\brgba?\(/);
    expect(code).not.toMatch(
      /\b(?:bg|text|border|ring|outline|divide|fill|stroke|from|via|to|placeholder|caret|accent|decoration|shadow)-(?:ink|brand|hivis|white|black|red|green|blue|yellow|orange|amber|emerald|gray|zinc|neutral|slate|stone)(?:-\d+)?\b/,
    );
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
    // `[class*='animate-ui-']` is a selector (the shell turning kit animations
    // off when motion is paused), not an animation.
    const animations = code.match(/(?<!\[class\*=')\banimate-(?!none\b)[\w-]+/g) ?? [];
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
