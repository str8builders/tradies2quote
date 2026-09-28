import { describe, expect, it } from "vitest";
import { isNoiseErrorEvent } from "./GlobalErrorListeners";

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
