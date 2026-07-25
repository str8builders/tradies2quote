import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { smsConfigured } from "./sms-quote";

/**
 * smsConfigured() decides whether the Text-send button renders at all
 * (quote preview page → StickyActionBar). A false here must hide the
 * channel — an unconfigured platform showing a Text button that can
 * only error is exactly the "broken visible feature" App Review
 * rejects under Guideline 2.1.
 */

const KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.TWILIO_ACCOUNT_SID = "AC" + "a".repeat(32);
  process.env.TWILIO_AUTH_TOKEN = "b".repeat(32);
  process.env.TWILIO_FROM_NUMBER = "TRADIES2Q";
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("smsConfigured", () => {
  it("is true only when all three Twilio values are present", () => {
    expect(smsConfigured()).toBe(true);
  });

  it.each(KEYS)("is false when %s is missing", (key) => {
    delete process.env[key];
    expect(smsConfigured()).toBe(false);
  });

  it.each(KEYS)("is false when %s is empty string", (key) => {
    process.env[key] = "";
    expect(smsConfigured()).toBe(false);
  });
});
