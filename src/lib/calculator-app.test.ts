import { describe, expect, it } from "vitest";
import { calculatorDeepLink, shouldOfferCalculatorApp } from "./calculator-app";

describe("shouldOfferCalculatorApp", () => {
  it("offers it on the web whether or not the app is published", () => {
    expect(shouldOfferCalculatorApp({ nativeShell: false })).toBe(true);
    expect(
      shouldOfferCalculatorApp({ nativeShell: false, appStoreUrl: "https://apps.apple.com/app/id1" }),
    ).toBe(true);
  });

  it("withholds it from the App Store shell until T2QCAL is published", () => {
    // Guideline 2.5.2: the shell must not point at software that is not on the
    // store. This is the case that would get the binary rejected.
    expect(shouldOfferCalculatorApp({ nativeShell: true })).toBe(false);
    expect(shouldOfferCalculatorApp({ nativeShell: true, appStoreUrl: "" })).toBe(false);
    expect(shouldOfferCalculatorApp({ nativeShell: true, appStoreUrl: "   " })).toBe(false);
    expect(shouldOfferCalculatorApp({ nativeShell: true, appStoreUrl: null })).toBe(false);
  });

  it("offers it in the shell once the store URL is configured", () => {
    expect(
      shouldOfferCalculatorApp({
        nativeShell: true,
        appStoreUrl: "https://apps.apple.com/nz/app/t2qcal/id123456789",
      }),
    ).toBe(true);
  });
});

describe("calculatorDeepLink", () => {
  it("builds the routes the calculator understands", () => {
    expect(calculatorDeepLink()).toBe("t2qcal://");
    expect(calculatorDeepLink("measure")).toBe("t2qcal://measure");
    expect(calculatorDeepLink("tool/concrete-slab")).toBe("t2qcal://tool/concrete-slab");
  });

  it("strips anything that could steer the link somewhere else", () => {
    // This string becomes a window.location.href that launches another app, so
    // it is built from a whitelist rather than trusted.
    expect(calculatorDeepLink("../../evil")).toBe("t2qcal://evil");
    expect(calculatorDeepLink("tool/slab?token=abc")).toBe("t2qcal://tool/slabtokenabc");
    expect(calculatorDeepLink("javascript:alert(1)")).toBe("t2qcal://javascriptalert1");
    expect(calculatorDeepLink("/measure")).toBe("t2qcal://measure");
  });
});

describe("shouldOfferT2QCAL", () => {
  it("on the web: always; in the iOS app: once it's on the App Store, or for the owner testing it", async () => {
    const { shouldOfferT2QCAL } = await import("./calculator-app");
    expect(shouldOfferT2QCAL({ nativeShell: false, isOwner: false })).toBe(true);
    expect(shouldOfferT2QCAL({ nativeShell: true, isOwner: false })).toBe(false);
    expect(shouldOfferT2QCAL({ nativeShell: true, isOwner: false, appStoreUrl: "https://apps.apple.com/app/id1" })).toBe(true);
    expect(shouldOfferT2QCAL({ nativeShell: true, isOwner: true })).toBe(true);
  });
  it("opens the app's calculators and measuring (routes T2QCAL handles)", async () => {
    const { T2QCAL_ROUTES, calculatorDeepLink } = await import("./calculator-app");
    expect(calculatorDeepLink(T2QCAL_ROUTES.tools)).toBe("t2qcal://tools");
    expect(calculatorDeepLink(T2QCAL_ROUTES.measure)).toBe("t2qcal://measure");
  });
});
