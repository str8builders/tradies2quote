import { describe, expect, it } from "vitest";
import { matchesBlocklist, sanitizeForPush } from "./moderation";

/**
 * Guideline 1.2 filter — the local blocklist must catch unambiguous abuse
 * while NEVER matching normal trade language (a false positive here blocks a
 * legitimate customer's question about their quote).
 */

describe("matchesBlocklist", () => {
  it("catches unambiguous threats and self-harm bait", () => {
    expect(matchesBlocklist("kill yourself")).toBe(true);
    expect(matchesBlocklist("kys")).toBe(true);
    expect(matchesBlocklist("I'll kill you if you charge that")).toBe(true);
  });

  it("NEVER matches normal trade language", () => {
    for (const text of [
      "Can you demolish the wall in the laundry too?",
      "You'll need to kill the power at the switchboard first",
      "Rip out the old bathroom and skip it",
      "This quote is bloody expensive mate",
      "What's the price to remove the concrete pad?",
      "Can we knock $200 off the labour?",
    ]) {
      expect(matchesBlocklist(text), text).toBe(false);
    }
  });

  it("stays quiet on empty input", () => {
    expect(matchesBlocklist("")).toBe(false);
  });
});

describe("sanitizeForPush", () => {
  it("strips newlines + control chars and collapses whitespace", () => {
    expect(sanitizeForPush("Bob\nthe\r\nBuilder\tJones")).toBe(
      "Bob the Builder Jones",
    );
  });

  it("caps length with an ellipsis", () => {
    const long = "A".repeat(100);
    const out = sanitizeForPush(long, 60);
    expect(out.length).toBe(60);
    expect(out.endsWith("…")).toBe(true);
  });

  it("handles null/undefined/empty", () => {
    expect(sanitizeForPush(null)).toBe("");
    expect(sanitizeForPush(undefined)).toBe("");
    expect(sanitizeForPush("   ")).toBe("");
  });
});
