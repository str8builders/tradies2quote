// `src/app/layout.tsx` calls next/font/google at module scope, which only
// works inside the real Next.js build pipeline. Stub it so the metadata /
// viewport exports (plain objects, the only things this file tests) can be
// imported directly in vitest.
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "mock-var", className: "mock-class" });
  return {
    Archivo_Black: font,
    IBM_Plex_Sans: font,
    IBM_Plex_Mono: font,
    Fraunces: font,
    Inter: font,
    Plus_Jakarta_Sans: font,
  };
});

import { metadata, viewport } from "./layout";

describe("root layout — viewport (public default)", () => {
  it("is zoomable — axe flagged the old locked default on public pages", () => {
    expect(viewport.maximumScale).toBe(5);
    expect(viewport.userScalable).toBe(true);
  });

  it("keeps the single-owner safe-area settings unchanged", () => {
    expect(viewport.width).toBe("device-width");
    expect(viewport.initialScale).toBe(1);
    expect(viewport.viewportFit).toBe("cover");
    expect(viewport.themeColor).toBe("#0A0A0A");
  });
});

describe("root layout — metadata", () => {
  it("turns off iOS/browser format auto-detection", () => {
    expect(metadata.formatDetection).toEqual({
      telephone: false,
      date: false,
      email: false,
      address: false,
    });
  });

  it("does not set a site-wide og:url — only the homepage should claim '/'", () => {
    expect(metadata.openGraph).toBeTruthy();
    expect(metadata.openGraph?.url).toBeUndefined();
  });
});
