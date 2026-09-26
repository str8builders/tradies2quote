// The kit's design rules (src/components/ui/design-rules.test.ts), applied to
// the everyday screens reached from the photo menu, Home and Prices once they
// switched to the new look: add and change a price, quick start, client
// requests, clients, team, terms templates, send feedback and the calendar
// body. Checked in the source so a later edit cannot quietly bring back tiny
// text, code-style labels, raw colours, old-look classes or motion that
// ignores reduced motion. (materials/_newlook is also covered by the
// settings design-rules test.)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const DIRS = [
  "src/app/app/materials/quick-start/_newlook",
  "src/app/app/requests/_newlook",
  "src/app/app/requests/_lib",
  "src/app/app/clients/_newlook",
  "src/app/app/clients/_lib",
  "src/app/app/team/_newlook",
  "src/app/app/team/_lib",
  "src/app/app/templates/_newlook",
  "src/app/app/templates/_lib",
  "src/app/app/beta/_newlook",
  "src/app/app/beta/_lib",
  "src/app/app/calendar/_newlook",
];
const FILES = ["src/app/app/materials/_newlook/PriceForm.tsx", "src/app/app/materials/_newlook/PriceFormScreen.tsx"];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) out.push(...sources(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const files = [...DIRS.flatMap(sources), ...FILES].map((path) => ({
  path,
  // Comments may talk about banned things; code may not.
  code: readFileSync(join(root, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1"),
}));

describe("everyday new-look screens follow the design rules", () => {
  it("covers every converted screen", () => {
    for (const part of [
      "PriceForm.tsx",
      "QuickStartPrices.tsx",
      "RequestsView.tsx",
      "ClientsBook.tsx",
      "ClientEditSheet.tsx",
      "TeamCards.tsx",
      "TemplatesCards.tsx",
      "FeedbackForm.tsx",
      "FeedbackBody.tsx",
      "CalendarView.tsx",
    ]) {
      expect(files.some((f) => f.path.endsWith(`/${part}`)), part).toBe(true);
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

  it.each(files)("$path: none of the old look's classes", ({ code }) => {
    expect(code).not.toMatch(/\bt2q-(?:btn|card|section|shadow|page|account|profile)(?:-[\w-]+)?\b/);
    expect(code).not.toMatch(/\bfont-display\b/);
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
