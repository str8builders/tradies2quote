import { describe, expect, it } from "vitest";
import {
  PRICED_MATERIALS_TARGET,
  isSetupDismissed,
  nextSetupStep,
  setupProgress,
  setupSteps,
  showSetupCard,
  type SetupInput,
} from "./setup-steps";

const fresh: SetupInput = { businessName: null, logoUrl: null, labourRate: null, pricedMaterials: 0, quoteCount: 0 };
const ready: SetupInput = {
  businessName: "STR8 Builders",
  logoUrl: "https://example.test/logo.png",
  labourRate: 85,
  pricedMaterials: PRICED_MATERIALS_TARGET,
  quoteCount: 1,
};

const byId = (input: SetupInput) => Object.fromEntries(setupSteps(input).map((s) => [s.id, s]));

describe("setup steps: ticks from real data, one tap to where it's done", () => {
  it("a brand-new account has three open steps, in order", () => {
    const steps = setupSteps(fresh);
    expect(steps.map((s) => [s.id, s.label, s.done, s.href])).toEqual([
      ["business", "Add your business name and logo", false, "/app/settings/business"],
      ["prices", "Set your rates and prices", false, "/app/settings/rates"],
      ["quote", "Make your first quote", false, "/app/quotes/new"],
    ]);
    expect(nextSetupStep(steps)?.id).toBe("business");
    expect(setupProgress(steps)).toBe("0 of 3 done");
  });

  it("business: needs both the name and the logo", () => {
    expect(byId({ ...fresh, businessName: "STR8" }).business).toMatchObject({ done: false, hint: "Add your logo to finish" });
    expect(byId({ ...fresh, logoUrl: "x" }).business).toMatchObject({ done: false, hint: "Add your business name to finish" });
    expect(byId({ ...fresh, businessName: "  " }).business.done).toBe(false);
    expect(byId({ ...fresh, businessName: "STR8", logoUrl: "x" }).business).toMatchObject({ done: true, hint: "Done" });
  });

  it("prices: a labour rate and at least 8 priced materials; the link goes to what's missing", () => {
    const noRate = byId({ ...fresh, pricedMaterials: 12 }).prices;
    expect(noRate).toMatchObject({ done: false, href: "/app/settings/rates" });
    const zeroRate = byId({ ...fresh, labourRate: 0, pricedMaterials: 12 }).prices;
    expect(zeroRate.done).toBe(false);
    const fewPrices = byId({ ...fresh, labourRate: 85, pricedMaterials: 3 }).prices;
    expect(fewPrices).toMatchObject({ done: false, hint: "3 of 8 prices saved", href: "/app/materials/quick-start" });
    const seven = byId({ ...fresh, labourRate: 85, pricedMaterials: 7 }).prices;
    expect(seven.done).toBe(false);
    expect(byId({ ...fresh, labourRate: 85, pricedMaterials: 8 }).prices).toMatchObject({ done: true, hint: "Done" });
  });

  it("quote: done once there is any quote", () => {
    expect(byId({ ...fresh, quoteCount: 1 }).quote).toMatchObject({ done: true, href: "/app/quotes/new" });
  });

  it("the next step skips what's done", () => {
    expect(nextSetupStep(setupSteps({ ...ready, quoteCount: 0 }))?.id).toBe("quote");
    expect(nextSetupStep(setupSteps(ready))).toBeNull();
    expect(setupProgress(setupSteps({ ...ready, quoteCount: 0 }))).toBe("2 of 3 done");
  });
});

describe("the card shows until done or hidden", () => {
  it("shows while anything is open and it hasn't been hidden", () => {
    expect(showSetupCard(setupSteps(fresh), false)).toBe(true);
    expect(showSetupCard(setupSteps({ ...ready, logoUrl: null }), false)).toBe(true);
  });
  it("goes when all three are done", () => {
    expect(showSetupCard(setupSteps(ready), false)).toBe(false);
  });
  it("goes when hidden on this device", () => {
    expect(showSetupCard(setupSteps(fresh), true)).toBe(false);
  });
  it("reads the cookie strictly", () => {
    expect(isSetupDismissed("1")).toBe(true);
    for (const v of [undefined, null, "", "0", "true"]) expect(isSetupDismissed(v)).toBe(false);
  });
});
