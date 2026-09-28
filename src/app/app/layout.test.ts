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

  it("keeps the single-owner safe-area settings, unchanged from root", () => {
    expect(viewport.width).toBe("device-width");
    expect(viewport.initialScale).toBe(1);
    expect(viewport.viewportFit).toBe("cover");
    expect(viewport.themeColor).toBe("#0A0A0A");
  });
});
