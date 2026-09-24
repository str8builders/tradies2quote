import { describe, expect, it } from "vitest";
import {
  confirmCopyFor,
  defaultNextFor,
  failureRedirectFor,
  parseEmailLinkParams,
} from "./emailLink";

const HASH = "a".repeat(56);

describe("parseEmailLinkParams", () => {
  it("accepts a recovery link and always lands on the set-password screen", () => {
    expect(parseEmailLinkParams({ token_hash: HASH, type: "recovery", next: "/app/settings" })).toEqual({
      tokenHash: HASH,
      type: "recovery",
      next: "/reset-password",
    });
  });

  it("accepts PKCE-prefixed hashes (emails requested by the server client)", () => {
    expect(parseEmailLinkParams({ token_hash: `pkce_${HASH}`, type: "recovery" })?.tokenHash).toBe(`pkce_${HASH}`);
  });

  it("sends a confirmed sign-up to the dashboard by default", () => {
    expect(parseEmailLinkParams({ token_hash: HASH, type: "email" })?.next).toBe("/app?confirmed=1");
    expect(parseEmailLinkParams({ token_hash: HASH, type: "signup" })?.next).toBe("/app?confirmed=1");
  });

  it("keeps a same-site next path for sign-up confirmations", () => {
    expect(parseEmailLinkParams({ token_hash: HASH, type: "email", next: "/app/quotes/new" })?.next).toBe(
      "/app/quotes/new",
    );
  });

  it("never redirects off-site", () => {
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
      expect(parseEmailLinkParams({ token_hash: HASH, type: "email", next })?.next).toBe("/app?confirmed=1");
    }
  });

  it("rejects missing, short or malformed tokens", () => {
    expect(parseEmailLinkParams({ type: "recovery" })).toBeNull();
    expect(parseEmailLinkParams({ token_hash: "", type: "recovery" })).toBeNull();
    expect(parseEmailLinkParams({ token_hash: "abc", type: "recovery" })).toBeNull();
    expect(parseEmailLinkParams({ token_hash: `${HASH}<script>`, type: "recovery" })).toBeNull();
    expect(parseEmailLinkParams({ token_hash: `${HASH}&type=email`, type: "recovery" })).toBeNull();
    expect(parseEmailLinkParams({ token_hash: 42, type: "recovery" })).toBeNull();
  });

  it("rejects link types our emails never send", () => {
    for (const type of ["magiclink", "invite", "email_change", "sms", "", undefined, 1]) {
      expect(parseEmailLinkParams({ token_hash: HASH, type })).toBeNull();
    }
  });
});

describe("failure and copy", () => {
  it("sends an expired reset back to the reset form with a plain message", () => {
    const to = failureRedirectFor("recovery");
    expect(to.startsWith("/forgot-password?error=")).toBe(true);
    expect(decodeURIComponent(to)).toContain("expired or was already used");
  });

  it("sends an expired confirmation to sign-in, worded so the resend form appears", () => {
    const to = failureRedirectFor("email");
    expect(to.startsWith("/login?error=")).toBe(true);
    // LoginForm shows the resend form when the banner matches /confirm/i.
    expect(/confirm/i.test(decodeURIComponent(to))).toBe(true);
    expect(failureRedirectFor(null)).toBe(to);
  });

  it("labels the one button by link type", () => {
    expect(confirmCopyFor("recovery").button).toMatch(/password/i);
    expect(confirmCopyFor("email").button).toMatch(/confirm/i);
    expect(defaultNextFor("recovery")).toBe("/reset-password");
  });
});
