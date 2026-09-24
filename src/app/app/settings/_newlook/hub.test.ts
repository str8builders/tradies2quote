import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEGACY_SETTINGS_HREF,
  MORE_PATH,
  SETTINGS_PATHS,
  newLookSettingsRedirect,
  settingsHubItems,
  settingsPathForHash,
} from "./hub";

describe("the settings hub", () => {
  it("lists exactly the four pages, in order, at the paths the More menu links to", () => {
    const items = settingsHubItems({ taxLabel: "GST", native: false });
    expect(items.map((i) => i.href)).toEqual([
      "/app/settings/business",
      "/app/settings/rates",
      "/app/settings/payments",
      "/app/settings/account",
    ]);
    expect(items.map((i) => i.title)).toEqual(["Business details", "Rates and quotes", "Payments", "Your account"]);
    expect(MORE_PATH).toBe("/app/more");
  });

  it("names the tradie's own tax", () => {
    const [business, rates] = settingsHubItems({ taxLabel: "VAT", native: false });
    expect(business.subtitle).toContain("VAT number");
    expect(rates.subtitle).toContain("VAT");
    expect(business.subtitle).not.toContain("GST");
  });

  it("never mentions the plan inside the iOS app (3.1.3(f))", () => {
    const web = settingsHubItems({ taxLabel: "GST", native: false }).find((i) => i.page === "payments")!;
    const ios = settingsHubItems({ taxLabel: "GST", native: true }).find((i) => i.page === "payments")!;
    expect(web.subtitle).toContain("plan");
    expect(ios.subtitle).not.toMatch(/plan|billing|price|subscri/i);
  });

  it("uses plain words: sentence case, no code-style labels", () => {
    for (const item of settingsHubItems({ taxLabel: "GST", native: false })) {
      expect(item.title).not.toMatch(/\/\/|^[A-Z\s]+$/);
      expect(item.title[0]).toBe(item.title[0].toUpperCase());
      expect(item.title.slice(1)).not.toMatch(/\b[A-Z][a-z]/);
    }
  });
});

describe("old /app/settings#… links land on the right page", () => {
  it("maps each old section", () => {
    expect(settingsPathForHash("#business")).toBe(SETTINGS_PATHS.business);
    expect(settingsPathForHash("#profile")).toBe(SETTINGS_PATHS.business);
    expect(settingsPathForHash("#defaults")).toBe(SETTINGS_PATHS.rates);
    expect(settingsPathForHash("#request-link")).toBe(SETTINGS_PATHS.rates);
    expect(settingsPathForHash("#payment_instructions")).toBe(SETTINGS_PATHS.payments);
    expect(settingsPathForHash("")).toBeNull();
    expect(settingsPathForHash("#")).toBeNull();
    expect(settingsPathForHash("#nothing-here")).toBeNull();
    expect(settingsPathForHash(null)).toBeNull();
  });

  it("covers every /app/settings#… link anywhere in the app", () => {
    const root = join(process.cwd(), "src");
    const hashes = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          for (const match of readFileSync(path, "utf8").matchAll(/\/app\/settings#([\w-]+)/g)) hashes.add(match[1]);
        }
      }
    };
    walk(root);
    expect(hashes.size).toBeGreaterThan(0);
    for (const hash of hashes) expect(settingsPathForHash(`#${hash}`), `#${hash}`).not.toBeNull();
  });
});

describe("with the new look off, the new pages hand over to the old one", () => {
  it("at the matching spot", () => {
    expect(LEGACY_SETTINGS_HREF).toEqual({
      business: "/app/settings#business",
      rates: "/app/settings#defaults",
      payments: "/app/settings#payment_instructions",
      account: "/app/settings",
    });
  });
});

describe("Stripe's return", () => {
  it("goes on to the Payments page, which refreshes the status", () => {
    expect(newLookSettingsRedirect({ stripe: "return" })).toBe("/app/settings/payments?stripe=return");
    expect(newLookSettingsRedirect({})).toBeNull();
    expect(newLookSettingsRedirect({ stripe: "other" })).toBeNull();
    expect(newLookSettingsRedirect(null)).toBeNull();
  });
});
