import { describe, expect, it } from "vitest";
import { viewport } from "./layout";

// The installed app's viewport LOCK — moved here from the root layout, which
// is zoomable by default now (see src/app/layout.test.ts). /app/* still needs
// the lock: in the installed iOS shell, focusing a form field force-zooms the
// page and it never zooms back.
describe("/app layout — viewport (locked, installed-shell only)", () => {
  it("locks pinch/double-tap zoom", () => {
    expect(viewport.maximumScale).toBe(1);
    expect(viewport.userScalable).toBe(false);
  });

  it("sets only the zoom keys: the safe-area settings stay single-owned by the root", () => {
    // Next merges viewport per key (mergeViewport clones the parent and
    // overrides only the keys a segment sets), so width, viewportFit and
    // themeColor come from src/app/layout.tsx.
    expect(Object.keys(viewport).sort()).toEqual(["maximumScale", "userScalable"]);
  });
});
