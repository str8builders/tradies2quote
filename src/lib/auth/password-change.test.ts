import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn(), created: [] as unknown[] }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    h.created.push(args);
    return { auth: { signInWithPassword: h.signIn, signOut: h.signOut } };
  },
}));

import {
  FRESH_SIGN_IN_WINDOW_S,
  RECOVERY_WINDOW_S,
  currentPasswordRequired,
  passwordChangeAllowance,
  verifyCurrentPassword,
} from "./password-change";

const NOW = 1_790_000_000;

describe("passwordChangeAllowance", () => {
  it("a reset link used within the hour", () => {
    expect(passwordChangeAllowance([{ method: "recovery", timestamp: NOW - 120 }], NOW)).toBe("recovery");
    expect(passwordChangeAllowance([{ method: "recovery", timestamp: NOW - RECOVERY_WINDOW_S }], NOW)).toBe("recovery");
  });

  it("a sign-in within the last few minutes", () => {
    expect(passwordChangeAllowance([{ method: "password", timestamp: NOW - 60 }], NOW)).toBe("fresh_sign_in");
    expect(passwordChangeAllowance([{ method: "otp", timestamp: NOW - FRESH_SIGN_IN_WINDOW_S }], NOW)).toBe("fresh_sign_in");
    expect(passwordChangeAllowance([{ method: "oauth", timestamp: NOW - 30 }], NOW)).toBe("fresh_sign_in");
  });

  it("an older session needs the current password", () => {
    expect(passwordChangeAllowance([{ method: "password", timestamp: NOW - FRESH_SIGN_IN_WINDOW_S - 1 }], NOW)).toBeNull();
    expect(passwordChangeAllowance([{ method: "recovery", timestamp: NOW - RECOVERY_WINDOW_S - 1 }], NOW)).toBeNull();
    // Refreshing a token is not signing in.
    expect(passwordChangeAllowance([{ method: "token_refresh", timestamp: NOW - 5 }], NOW)).toBeNull();
    expect(passwordChangeAllowance([{ method: "anonymous", timestamp: NOW - 5 }], NOW)).toBeNull();
  });

  it("currentPasswordRequired is the same rule, at the current time by default", () => {
    const nowS = Math.floor(Date.now() / 1000);
    expect(currentPasswordRequired([{ method: "recovery", timestamp: nowS - 60 }])).toBe(false);
    expect(currentPasswordRequired([{ method: "password", timestamp: nowS - 86400 }])).toBe(true);
    expect(currentPasswordRequired([{ method: "password", timestamp: NOW - 60 }], NOW)).toBe(false);
  });

  it("no timestamps, no claim, junk: needs the current password", () => {
    expect(passwordChangeAllowance(["recovery", "password"], NOW)).toBeNull();
    expect(passwordChangeAllowance(undefined, NOW)).toBeNull();
    expect(passwordChangeAllowance([null, 7, { method: "recovery" }], NOW)).toBeNull();
    expect(passwordChangeAllowance([{ method: "recovery", timestamp: NOW + 3600 }], NOW)).toBeNull();
  });
});

describe("verifyCurrentPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.created = [];
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://api.example.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-only");
    h.signOut.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("right password: ok, and the check's own session is signed straight out (only it)", async () => {
    h.signIn.mockResolvedValue({ data: { user: { id: "user-1" }, session: {} }, error: null });
    expect(await verifyCurrentPassword({ email: "a@b.nz", password: "right", userId: "user-1" })).toBe("ok");
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
    // A throwaway client: no cookies, nothing persisted, no refresh timer.
    expect(h.created[0]).toEqual([
      "https://api.example.invalid",
      "test-only",
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    ]);
  });

  it("wrong password", async () => {
    h.signIn.mockResolvedValue({ data: { user: null, session: null }, error: { message: "Invalid login credentials", code: "invalid_credentials" } });
    expect(await verifyCurrentPassword({ email: "a@b.nz", password: "nope", userId: "user-1" })).toBe("wrong");
  });

  it("anything else (rate limit, outage) is not a wrong password", async () => {
    h.signIn.mockResolvedValue({ data: { user: null, session: null }, error: { message: "Request rate limit reached", code: "over_request_rate_limit" } });
    expect(await verifyCurrentPassword({ email: "a@b.nz", password: "x", userId: "user-1" })).toBe("unavailable");
  });

  it("a different account's password doesn't count", async () => {
    h.signIn.mockResolvedValue({ data: { user: { id: "someone-else" }, session: {} }, error: null });
    expect(await verifyCurrentPassword({ email: "a@b.nz", password: "x", userId: "user-1" })).toBe("wrong");
  });
});
