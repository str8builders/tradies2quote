import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
import { LiveWallpaper, useMotionPaused } from "../LiveWallpaper";

const render = (path: string) => {
  pathname = path;
  return renderToStaticMarkup(createElement(LiveWallpaper));
};

describe("LiveWallpaper", () => {
  it("draws the SVG terrain on public pages, with no canvas", () => {
    const html = render("/");
    expect(html).toContain('data-wallpaper="live"');
    expect(html).toContain('class="studio-wallpaper-terrain"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<canvas");
  });

  it("keeps only the still CSS layers behind the app and print sheets", () => {
    for (const path of ["/app", "/app/quotes/new", "/print/request-poster"]) {
      const html = render(path);
      expect(html).toContain('data-wallpaper="still"');
      expect(html).toContain("studio-wallpaper-glow");
      expect(html).not.toContain("studio-wallpaper-terrain");
    }
  });

  it("renders nothing on client documents", () => {
    expect(render("/quote/abc123")).toBe("");
    expect(render("/app/quotes/42/pdf")).toBe("");
  });

  it("still exports useMotionPaused for existing importers", () => {
    expect(typeof useMotionPaused).toBe("function");
  });

  it("no longer imports Three.js", () => {
    const source = readFileSync(resolve(__dirname, "../LiveWallpaper.tsx"), "utf8");
    expect(source).not.toMatch(/from ["']three["']|import\(["']three["']\)/);
  });
});
