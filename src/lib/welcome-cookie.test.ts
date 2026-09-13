import { describe, expect, it } from "vitest";
import { WELCOME_SEEN_COOKIE, parseWelcomeSeen } from "./welcome-cookie";

describe("welcome seen cookie", () => {
  it("parses the timestamp out of a cookie header", () => {
    expect(parseWelcomeSeen(`a=1; ${WELCOME_SEEN_COOKIE}=1757800000000; b=2`)).toBe(1757800000000);
    expect(parseWelcomeSeen(`${WELCOME_SEEN_COOKIE}=1757800000000`)).toBe(1757800000000);
  });
  it("ignores missing, empty or malformed values", () => {
    expect(parseWelcomeSeen("")).toBe(0);
    expect(parseWelcomeSeen(null)).toBe(0);
    expect(parseWelcomeSeen("sb-token=abc")).toBe(0);
    expect(parseWelcomeSeen(`${WELCOME_SEEN_COOKIE}=; x=1`)).toBe(0);
    expect(parseWelcomeSeen(`${WELCOME_SEEN_COOKIE}=abc`)).toBe(0);
    expect(parseWelcomeSeen(`not-${WELCOME_SEEN_COOKIE}=1757800000000`)).toBe(0);
  });
});
