// The client's quote page is rendered on the server and again in the visitor's browser (hydration). Any text
// that depends on the engine, its language or its time zone makes the two differ, and React reports it as
// error #418 (it happened for every September quote opened on an iPhone: WebKit says "Sep", the server "Sept").
// The words and numbers on this page are built in code (src/lib/format-date.ts, formatCurrency); Intl may only
// supply digits. This guard keeps the page's own files from reaching for the engine's words again.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src");
// Rendered on the server and again in the browser.
const FILES = [
  ...walk(join(ROOT, "app/quote/[token]/_components")),
  join(ROOT, "app/_components/quote/QuotePhotos.tsx"),
  join(ROOT, "lib/quantity-display.ts"),
  join(ROOT, "lib/quote-sections.ts"),
  join(ROOT, "lib/quote-defaults.ts"),
];
// Server only (it may read the clock), but its words must still come from code.
const SERVER_PAGE = join(ROOT, "app/quote/[token]/page.tsx");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sourceFiles = FILES.filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f));
const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function expectWordsFromCode(code: string) {
  expect(code).not.toMatch(/\.toLocale(?:Date|Time)?String\(/);
  expect(code).not.toMatch(/Intl\.(?:DateTimeFormat|RelativeTimeFormat|ListFormat|PluralRules|DisplayNames)\b/);
  // The only Intl number formatting allowed is for digits, with the locale spelled out ("en-US").
  for (const m of code.matchAll(/Intl\.NumberFormat\(\s*([^,)]*)/g)) expect(m[1].trim()).toMatch(/^["']en-US["']$/);
}

describe("the client's quote page keeps its words out of the engine's hands", () => {
  it("covers the page's files", () => {
    expect(sourceFiles.length).toBeGreaterThan(8);
  });

  it.each(sourceFiles.map((f) => [f.replace(`${ROOT}/`, ""), f]))("%s has no locale-dependent formatting", (_name, file) => {
    const code = stripComments(readFileSync(file, "utf8"));
    expectWordsFromCode(code);
    // Nothing that reads the visitor's clock or language during render.
    expect(code).not.toMatch(/navigator\.language|new Date\(\)|Date\.now\(\)/);
  });

  it("the page itself takes its words from code too", () => {
    expectWordsFromCode(stripComments(readFileSync(SERVER_PAGE, "utf8")));
  });
});
