import { describe, expect, it } from "vitest";
import { isNoiseErrorEvent, isRewrittenPageHydrationError } from "./GlobalErrorListeners";

describe("isNoiseErrorEvent", () => {
  it("is noise: a plain-text cross-origin \"Script error.\" with no real Error object", () => {
    expect(isNoiseErrorEvent({ message: "Script error." })).toBe(true);
    expect(isNoiseErrorEvent({ message: "Script error" })).toBe(true);
  });

  it("is noise: ResizeObserver's own loop-limit notice", () => {
    expect(
      isNoiseErrorEvent({ message: "ResizeObserver loop completed with undelivered notifications." }),
    ).toBe(true);
  });

  it("is NOT noise once there's a real Error object, even with the same message text", () => {
    expect(isNoiseErrorEvent({ message: "Script error.", error: new Error("Script error.") })).toBe(false);
  });

  it("is noise: the source file is a browser extension or a masked url", () => {
    expect(isNoiseErrorEvent({ message: "boom", filename: "chrome-extension://abc/content.js" })).toBe(true);
    expect(isNoiseErrorEvent({ message: "boom", filename: "moz-extension://abc/content.js" })).toBe(true);
    expect(isNoiseErrorEvent({ message: "boom", filename: "safari-web-extension://abc/content.js" })).toBe(true);
    expect(isNoiseErrorEvent({ message: "boom", filename: "webkit-masked-url://hidden/" })).toBe(true);
  });

  it("is NOT noise for our own app code or a real third-party https:// script", () => {
    expect(isNoiseErrorEvent({ message: "boom", filename: "https://app.tradies2quote.com/_next/static/chunks/app.js" })).toBe(false);
    expect(isNoiseErrorEvent({ message: "Cannot read properties of undefined (reading 'x')", error: new Error("x") })).toBe(false);
  });
});

describe("isRewrittenPageHydrationError", () => {
  const stock = { translated: false, langChanged: false, appleDataDetectors: false, grammarly: false };
  const min418 = "Minified React error #418; visit https://react.dev/errors/418?args[]=text&args[]= for the full message";

  it("is not reported: a hydration error on a page the visitor's browser rewrote", () => {
    expect(isRewrittenPageHydrationError(min418, { ...stock, translated: true })).toBe(true);
    expect(isRewrittenPageHydrationError(min418, { ...stock, langChanged: true })).toBe(true);
    expect(isRewrittenPageHydrationError(min418, { ...stock, appleDataDetectors: true })).toBe(true);
    expect(isRewrittenPageHydrationError(min418, { ...stock, grammarly: true })).toBe(true);
    expect(isRewrittenPageHydrationError("Hydration failed because the server rendered text didn't match the client", { ...stock, translated: true })).toBe(true);
    expect(isRewrittenPageHydrationError("Minified React error #423; visit https://react.dev/errors/423", { ...stock, langChanged: true })).toBe(true);
  });

  it("is still reported: the same error on a page nothing rewrote, or no flags at all", () => {
    expect(isRewrittenPageHydrationError(min418, stock)).toBe(false);
    expect(isRewrittenPageHydrationError(min418, undefined)).toBe(false);
  });

  it("is still reported: any other error, even on a translated page", () => {
    expect(isRewrittenPageHydrationError("Cannot read properties of undefined (reading 'x')", { ...stock, translated: true })).toBe(false);
    expect(isRewrittenPageHydrationError(null, { ...stock, translated: true })).toBe(false);
  });
});

