import { beforeEach, describe, expect, it } from "vitest";
import { previousPathname, recordPathname, resetRouteHistory, shouldPlayWelcome } from "./route-history";

const HOUR = 3600_000;
const args = (previous: string | null, lastSeen = 0, now = 10 * HOUR) => ({ previous, lastSeen, now, skipWindowMs: 6 * HOUR });

describe("route history", () => {
  beforeEach(resetRouteHistory);
  it("remembers the route before the current one, ignoring repeats", () => {
    expect(previousPathname()).toBeNull();
    recordPathname("/login"); recordPathname("/login"); recordPathname("/app");
    expect(previousPathname()).toBe("/login");
    recordPathname("/t2qcal/calculators"); recordPathname("/app");
    expect(previousPathname()).toBe("/t2qcal/calculators");
  });
});

describe("shouldPlayWelcome", () => {
  it("always plays after signing in, even if seen recently", () => {
    expect(shouldPlayWelcome(args("/login", 9.9 * HOUR))).toBe(true);
    expect(shouldPlayWelcome(args("/signup?next=%2Fapp"))).toBe(true);
    expect(shouldPlayWelcome(args("/auth/callback"))).toBe(true);
  });
  it("never plays when coming back from elsewhere in the site", () => {
    expect(shouldPlayWelcome(args("/t2qcal/calculators"))).toBe(false);
    expect(shouldPlayWelcome(args("/t2qcal/calculator/common-rafter"))).toBe(false);
    expect(shouldPlayWelcome(args("/"))).toBe(false);
    expect(shouldPlayWelcome(args("/app/quotes"))).toBe(false);
  });
  it("plays on a cold start unless seen within the window", () => {
    expect(shouldPlayWelcome(args(null))).toBe(true);
    expect(shouldPlayWelcome(args(null, 9 * HOUR))).toBe(false);
    expect(shouldPlayWelcome(args(null, 2 * HOUR))).toBe(true);
    expect(shouldPlayWelcome(args(null, 11 * HOUR))).toBe(true); // clock went backwards
  });
});
