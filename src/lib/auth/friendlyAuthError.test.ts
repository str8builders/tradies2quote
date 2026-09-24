import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "./friendlyAuthError";

describe("friendlyAuthError", () => {
  it("explains a wrong email or password", () => {
    expect(friendlyAuthError("Invalid login credentials", "login")).toMatch(/don't match/);
  });

  it("keeps the word 'confirm' for unconfirmed emails so the resend form appears", () => {
    const text = friendlyAuthError("Email not confirmed", "login");
    expect(/confirm/i.test(text)).toBe(true);
    expect(text).toMatch(/send a new one/);
  });

  it("turns GoTrue throttling into a wait-and-retry message", () => {
    expect(friendlyAuthError("For security purposes, you can only request this after 42 seconds.", "forgot")).toMatch(
      /Wait a minute/,
    );
    expect(friendlyAuthError("Request rate limit reached", "login")).toMatch(/Wait a minute/);
  });

  it("explains password rules", () => {
    expect(
      friendlyAuthError("Password is known to be weak and easy to guess, please choose a different one.", "signup"),
    ).toMatch(/too easy to guess/);
    expect(friendlyAuthError("Password should be at least 8 characters.", "signup")).toMatch(/at least 8/);
    expect(friendlyAuthError("New password should be different from the old password.", "reset")).toMatch(
      /not the one you already have/,
    );
  });

  it("sends an expired reset session back to 'Forgot password'", () => {
    expect(friendlyAuthError("Auth session missing!", "reset")).toMatch(/Forgot password/);
    expect(friendlyAuthError("Auth session missing!", "login")).toMatch(/sign in again/);
  });

  it("handles a bad email address and paused sign-ups", () => {
    expect(friendlyAuthError("Unable to validate email address: invalid format", "signup")).toMatch(/doesn't look right/);
    expect(friendlyAuthError("Signups not allowed for this instance", "signup")).toMatch(/paused/);
  });

  it("falls back to a plain sentence per page for anything unknown", () => {
    expect(friendlyAuthError("connect ECONNREFUSED 10.0.0.3:9999", "login")).toBe(
      "We couldn't sign you in. Please try again.",
    );
    expect(friendlyAuthError(undefined, "signup")).toBe("We couldn't create your account. Please try again.");
    expect(friendlyAuthError("", "reset")).toBe("We couldn't change your password. Please try again.");
    expect(friendlyAuthError(null, "forgot")).toBe("We couldn't send the reset email. Please try again.");
  });
});
