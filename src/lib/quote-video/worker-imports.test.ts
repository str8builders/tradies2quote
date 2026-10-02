// The quote-video worker (scripts/quote-video-worker.mjs, systemd t2q-video) runs the app's TypeScript straight
// under Node's type stripping, not through the bundler, so every module it can reach must import its neighbours
// the way Node resolves them: a relative path WITH its extension (".ts"), and no "@/" alias. A plain
// `from "./format-date"` in quote-defaults.ts stopped the worker on 2 Oct 2026, right after a release; the
// website itself was fine, which is why a build and every other test passed.
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
// What the worker script loads (loadTs in scripts/quote-video-worker.mjs).
const ENTRIES = ["sample", "constants", "worker"].map((name) => resolve(ROOT, `src/lib/quote-video/${name}.ts`));

const FROM = /(?:^|\n)[ \t]*(?:import|export)[ \t]+([^;]*?)[ \t\n]+from[ \t]+["']([^"']+)["']/g;
const SIDE_EFFECT = /(?:^|\n)[ \t]*import[ \t]+["']([^"']+)["']/g;
const DYNAMIC = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

/** The modules this file imports at run time (type-only imports are erased and never looked up). */
function runtimeImports(code: string): string[] {
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const found: string[] = [];
  for (const m of stripped.matchAll(FROM)) if (!/^type\b/.test(m[1].trim())) found.push(m[2]);
  for (const m of stripped.matchAll(SIDE_EFFECT)) found.push(m[1]);
  for (const m of stripped.matchAll(DYNAMIC)) found.push(m[1]);
  return found;
}

function walk(entries: string[]): { seen: Set<string>; problems: string[] } {
  const seen = new Set<string>();
  const problems: string[] = [];
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of runtimeImports(readFileSync(file, "utf8"))) {
      const here = relative(ROOT, file);
      if (spec.startsWith("@/")) problems.push(`${here}: "${spec}" uses the @/ alias, which Node can't resolve`);
      else if (spec.startsWith(".")) {
        if (!/\.(?:ts|tsx|js|mjs|json)$/.test(spec)) problems.push(`${here}: "${spec}" has no file extension`);
        else {
          const target = resolve(dirname(file), spec);
          if (!existsSync(target)) problems.push(`${here}: "${spec}" doesn't exist`);
          else if (/\.tsx?$/.test(target)) queue.push(target);
        }
      }
    }
  }
  return { seen, problems };
}

describe("the quote-video worker's modules load under Node's type stripping", () => {
  const { seen, problems } = walk(ENTRIES);

  it("reaches the modules it needs (so a pass means something)", () => {
    const names = [...seen].map((f) => relative(ROOT, f));
    expect(names).toEqual(expect.arrayContaining(["src/lib/quote-video/worker.ts", "src/lib/quote-video/props.ts", "src/lib/quote-defaults.ts", "src/lib/format-date.ts"]));
  });

  it("every relative import has its extension and no module uses the @/ alias", () => {
    expect(problems).toEqual([]);
  });

  it("the check catches what broke the worker", () => {
    expect(runtimeImports('import { a } from "./format-date";\nimport type { B } from "./types";\nexport type { C } from "./c";\nimport { d } from "./d.ts";')).toEqual(["./format-date", "./d.ts"]);
    expect(runtimeImports('import {\n  a,\n  b,\n} from "./multi";')).toEqual(["./multi"]);
    expect(runtimeImports('const m = await import("./lazy");\nimport "./side";')).toEqual(["./side", "./lazy"]);
  });
});
