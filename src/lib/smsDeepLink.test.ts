import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSmsHref, deviceCanSendSms } from "./smsDeepLink";

/**
 * The sms: deep link is the ONLY working send path to NZ mobiles (Twilio
 * cannot originate to +64 — see smsDeepLink.ts). If the URI shape breaks,
 * the Text button silently opens an empty Messages draft, or nothing.
 */

describe("buildSmsHref", () => {
  const body = "Hi Tom, your quote Q-2026-0001 from STR8 Builders: $2,242.50. View & accept: https://tradies2quote.com/quote/tok";

  it("uses the ?& separator both iOS and Android parse", () => {
    const href = buildSmsHref("+6421234567", body);
    expect(href.startsWith("sms:+6421234567?&body=")).toBe(true);
  });

  it("percent-encodes the body so & and # in the text can't truncate it", () => {
    // A raw "&" would start a new URI param; a raw "#" would start a
    // fragment and drop everything after it — including the accept link.
    const href = buildSmsHref("+6421234567", "A & B #1 https://x.test/q?a=1");
    expect(href).toContain("%26");
    expect(href).toContain("%23");
    expect(href).not.toMatch(/body=A & B/);
  });

  it("round-trips the exact body back out", () => {
    const href = buildSmsHref("+6421234567", body);
    const encoded = href.slice("sms:+6421234567?&body=".length);
    expect(decodeURIComponent(encoded)).toBe(body);
  });

  it("keeps the E.164 number intact (leading + must survive)", () => {
    expect(buildSmsHref("+6421234567", "x")).toContain("sms:+6421234567");
  });
});

describe("deviceCanSendSms", () => {
  const setUA = (ua: string) =>
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { Capacitor?: unknown }).Capacitor;
  });

  it("is true on iPhone", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15");
    expect(deviceCanSendSms()).toBe(true);
  });

  it("is true on Android", () => {
    setUA("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36");
    expect(deviceCanSendSms()).toBe(true);
  });

  it("is FALSE on desktop — no Messages app, so no Text button", () => {
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120");
    expect(deviceCanSendSms()).toBe(false);
  });

  it("is true inside the native shell regardless of UA", () => {
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
    };
    expect(deviceCanSendSms()).toBe(true);
  });
});
