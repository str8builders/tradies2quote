import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import robots from "../robots";
import sitemap from "../sitemap";
import { metadata } from "./page";

describe("/ui-kit stays out of search and away from real data", () => {
  it("asks search engines not to index or follow it", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("is disallowed in robots.txt and absent from the sitemap", () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    expect(list.flatMap((r) => r.disallow ?? [])).toContain("/ui-kit");
    expect(sitemap().some((entry) => entry.url.includes("/ui-kit"))).toBe(false);
  });

  it("touches no data: no Supabase, no server actions, no fetch", () => {
    const dir = join(process.cwd(), "src/app/ui-kit");
    const files = ["page.tsx", "_components/ExampleScreens.tsx", "_components/KitDemos.tsx", "_components/Swatches.tsx"];
    for (const file of files) {
      const code = readFileSync(join(dir, file), "utf8");
      expect(code, file).not.toMatch(/supabase|"use server"|fetch\(|actions"/);
    }
  });
});
