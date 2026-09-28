import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowSignInAttempt, SIGNIN_PER_EMAIL, SIGNIN_PER_IP, SIGNIN_TOO_MANY_MESSAGE, SIGNIN_WINDOW_MS } from "./signin-throttle";

let n = 0;
/** Fresh keys per test: the limiter's buckets are module-wide. */
const fresh = () => {
  n += 1;
  return { ip: `198.51.100.${n}`, email: `tradie${n}-${Date.now()}@example.invalid` };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("sign-in throttle", () => {
  it("stops guessing one account's password, whatever the IP", () => {
    const { email } = fresh();
    for (let i = 0; i < SIGNIN_PER_EMAIL; i++) expect(allowSignInAttempt({ ip: `203.0.113.${i}`, email })).toBe(true);
    expect(allowSignInAttempt({ ip: "203.0.113.200", email })).toBe(false);
    // Case and spaces don't make a new address.
    expect(allowSignInAttempt({ ip: "203.0.113.201", email: `  ${email.toUpperCase()} ` })).toBe(false);
  });

  it("stops one IP spraying many accounts", () => {
    const { ip } = fresh();
    for (let i = 0; i < SIGNIN_PER_IP; i++) expect(allowSignInAttempt({ ip, email: `spray${i}-${n}@example.invalid` })).toBe(true);
    expect(allowSignInAttempt({ ip, email: `spray-last-${n}@example.invalid` })).toBe(false);
  });

  it("lets them try again after the window", () => {
    const { ip, email } = fresh();
    for (let i = 0; i < SIGNIN_PER_EMAIL; i++) allowSignInAttempt({ ip, email });
    expect(allowSignInAttempt({ ip, email })).toBe(false);
    vi.setSystemTime(Date.now() + SIGNIN_WINDOW_MS + 1);
    expect(allowSignInAttempt({ ip, email })).toBe(true);
  });

  it("says so plainly", () => {
    expect(SIGNIN_TOO_MANY_MESSAGE).toBe("Too many tries. Wait a few minutes and try again.");
  });
});
