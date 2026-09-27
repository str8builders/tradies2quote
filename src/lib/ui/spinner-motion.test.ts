import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Loading spinners keep turning under Reduce Motion and paused motion
 * (globals.css, "SPINNERS KEEP TURNING"). The owner's iPhone has Reduce
 * Motion on, and every spinner in the app froze, so "Writing your quote"
 * looked stuck. The rules that froze them live in redesign.css, so these
 * checks pin both sides.
 */
const css = (file: string) => readFileSync(join(process.cwd(), "src/app", file), "utf8");
const globals = css("globals.css");
const redesign = css("redesign.css");
const flat = (text: string) => text.replace(/\s+/g, " ");

const SPINNERS = ':is(.studio-app, .studio-public, .studio-site) :is(.animate-spin, [class~="motion-safe:animate-spin"])';

describe("loading spinners keep turning", () => {
  it("has a calm spin that the paused-motion settle rule can't catch", () => {
    expect(globals).toMatch(/--animate-spin-calm:\s*spin-calm 1\.6s linear infinite;/);
    expect(flat(globals)).toContain("@keyframes spin-calm { to { transform: rotate(360deg); } }");
    // NewLookShell turns every [class*='animate-ui-'] off when motion is paused.
    expect(globals).not.toMatch(/--animate-ui-spin/);
  });

  it("turns calmly under Reduce Motion, beating the blanket stop", () => {
    expect(flat(globals)).toContain(
      `@media (prefers-reduced-motion: reduce) { ${SPINNERS} { animation: spin-calm 1.6s linear infinite !important; } }`,
    );
    // What it beats: unlayered and !important too, but one class less specific.
    expect(flat(redesign)).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{ \.studio-app \*, \.studio-auth-story \* \{ animation: none !important;/,
    );
    expect(flat(redesign)).toMatch(/\.studio-site \*, \.studio-public \* \{ animation: none !important;/);
  });

  it("keeps running when the site's motion is paused", () => {
    expect(flat(globals)).toContain(`[data-motion="paused"] ${SPINNERS} { animation-play-state: running !important; }`);
    expect(flat(redesign)).toContain(
      '[data-motion="paused"] .studio-app *, [data-motion="paused"] .studio-auth-story * { animation-play-state: paused !important; }',
    );
    expect(flat(redesign)).toContain('[data-motion="paused"] .studio-public * { animation-play-state: paused !important; }');
  });
});
