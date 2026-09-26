// Screens not yet in the new look keep a dark panel in outdoor mode, so
// they're never white-on-white. Remove a screen from this list when it
// moves to ui- tokens (and drop its data-legacy-body marker).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");

const OLD_LOOK_SCREENS = [
  "weather/page.tsx",
  "suppliers/page.tsx",
  "materials/import-quote/page.tsx",
  "materials/capture/page.tsx",
  "upgrade/page.tsx",
  "debug/page.tsx",
  "admin/page.tsx",
  "agents/page.tsx",
  "quotes/new/_v2/ScanScreen.tsx",
  "quotes/preview/[id]/_v2/parts/ToolSection.tsx",
  "quotes/preview/[id]/page.tsx",
];

describe("outdoor safety net for old-look screens", () => {
  it("globals.css paints marked bodies dark in outdoor mode only", () => {
    const css = read("../globals.css");
    expect(css).toMatch(/\[data-look="new"\]\[data-contrast="outdoor"\] \[data-legacy-body\] \{[^}]*background-color: #111110;/);
  });

  it.each(OLD_LOOK_SCREENS)("%s marks its old-look body", (file) => {
    expect(read(file)).toContain('data-legacy-body=""');
  });
});
