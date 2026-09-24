// The redesign's rules, checked in the source of every new-look new-quote
// file (the same checks src/components/ui/design-rules.test.ts runs on the
// kit), so a later edit cannot quietly bring back tiny text, code-style
// labels, raw colours or motion that ignores reduced-motion settings.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const DIR = "src/app/app/quotes/new/_v2";

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) out.push(...sources(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const files = sources(DIR).map((path) => ({
  path: relative(root, join(root, path)),
  // Comments may talk about banned things; code may not.
  code: readFileSync(join(root, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1"),
}));

describe("new-look new quote follows the design rules", () => {
  it("covers every screen and the logic behind them", () => {
    const names = files.map((f) => f.path.slice(DIR.length + 1));
    for (const expected of [
      "NewQuoteFlow.tsx",
      "ChooseScreen.tsx",
      "TalkScreen.tsx",
      "ReviewScreen.tsx",
      "TypeScreen.tsx",
      "ScanScreen.tsx",
      "QuestionScreen.tsx",
      "MicLevelBars.tsx",
      "parts.tsx",
      "lib/recorder.ts",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it.each(files)("$path: colours come only from ui- tokens", ({ code }) => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\brgba?\(/);
    expect(code).not.toMatch(
      /\b(?:bg|text|border|ring|outline|divide|fill|stroke|from|via|to|placeholder|caret|accent|decoration|shadow)-(?:ink|brand|hivis|white|black|red|green|blue|yellow|orange|amber|emerald|gray|zinc|neutral|slate|stone)(?:-\d+)?\b/,
    );
    expect(code).not.toMatch(/\btext-ui-brand(?![-\w])/);
    // The current look's component classes stay in the current look.
    expect(code).not.toMatch(/\bt2q-(?:card|btn|section|record|page|shadow|loading|job)[\w-]*/);
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
