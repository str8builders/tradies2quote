import { describe, expect, it } from "vitest";
import { tools } from "@/t2qcal/lib/tools";
import sitemap from "./sitemap";

describe("sitemap — T2QCAL calculators and the legal/help pages", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it("lists every calculator (all 95), not just the directory page", () => {
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(urls).toContain(`http://localhost:3000/t2qcal/calculator/${tool.slug}`);
    }
  });

  it("lists /support, /privacy, /terms and /help alongside the existing pages", () => {
    for (const path of ["/support", "/privacy", "/terms", "/help"]) {
      expect(urls).toContain(`http://localhost:3000${path}`);
    }
    // Unchanged existing entries still there.
    for (const path of ["/", "/t2qcal", "/install", "/calculator"]) {
      expect(urls).toContain(`http://localhost:3000${path}`);
    }
  });

  it("has no duplicate URLs", () => {
    expect(new Set(urls).size).toBe(urls.length);
  });
});
