import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Changing the password (audit 2026-09-28): it used to work for ANY signed-in
 * session. Now: a recovery session from the email link, or a fresh sign-in,
 * or the current password.
 */

const h = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  update: vi.fn(),
  userSignOut: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "192.0.2.90" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => (h.claims ? { data: { claims: h.claims }, error: null } : { data: null, error: { message: "Auth session missing!" } }),
      updateUser: h.update,
      signOut: h.userSignOut,
    },
  }),
}));
vi.mock("@/lib/auth/password-change", async (original) => ({
  ...(await original<typeof import("@/lib/auth/password-change")>()),
  verifyCurrentPassword: h.verify,
}));

import { resetPasswordAction } from "./actions";

const NOW_S = () => Math.floor(Date.now() / 1000);

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
const NEW = { password: "new-password-1", confirm: "new-password-1" };

beforeEach(() => {
  vi.clearAllMocks();
  h.update.mockResolvedValue({ error: null });
});

describe("resetPasswordAction", () => {
  it("from the reset email: the new password is enough (forgot-password still works end to end)", async () => {
    h.claims = { sub: "user-1", email: "mike@bayside.co.nz", amr: [{ method: "recovery", timestamp: NOW_S() - 90 }] };
    await expect(resetPasswordAction(form(NEW))).rejects.toThrow("NEXT_REDIRECT /app");
    expect(h.update).toHaveBeenCalledWith({ password: "new-password-1" });
    expect(h.verify).not.toHaveBeenCalled();
  });

  it("just signed in: the new password is enough", async () => {
    h.claims = { sub: "user-1", email: "mike@bayside.co.nz", amr: [{ method: "password", timestamp: NOW_S() - 60 }] };
    await expect(resetPasswordAction(form(NEW))).rejects.toThrow("NEXT_REDIRECT /app");
    expect(h.update).toHaveBeenCalled();
  });

  it("an older session must give the current password", async () => {
    h.claims = { sub: "user-2", email: "old@bayside.co.nz", amr: [{ method: "password", timestamp: NOW_S() - 3 * 86400 }] };
    await expect(resetPasswordAction(form(NEW))).rejects.toThrow(/NEXT_REDIRECT \/reset-password\?error=Enter%20your%20current%20password/);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("a wrong current password changes nothing", async () => {
    h.claims = { sub: "user-3", email: "wrong@bayside.co.nz", amr: [{ method: "password", timestamp: NOW_S() - 86400 }] };
    h.verify.mockResolvedValue("wrong");
    await expect(resetPasswordAction(form({ ...NEW, current_password: "guess" }))).rejects.toThrow(/current%20password%20isn't%20right/);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("the right current password: checked without touching this session, then changed", async () => {
    h.claims = { sub: "user-4", email: "right@bayside.co.nz", amr: [{ method: "password", timestamp: NOW_S() - 86400 }] };
    h.verify.mockResolvedValue("ok");
    await expect(resetPasswordAction(form({ ...NEW, current_password: "old-password" }))).rejects.toThrow("NEXT_REDIRECT /app");
    expect(h.verify).toHaveBeenCalledWith({ email: "right@bayside.co.nz", password: "old-password", userId: "user-4" });
    expect(h.userSignOut).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith({ password: "new-password-1" });
  });

  it("a reset link opened hours ago no longer counts", async () => {
    h.claims = { sub: "user-5", email: "late@bayside.co.nz", amr: [{ method: "recovery", timestamp: NOW_S() - 3 * 3600 }] };
    await expect(resetPasswordAction(form(NEW))).rejects.toThrow(/Enter%20your%20current%20password/);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("no session: back to Forgot password", async () => {
    h.claims = null;
    await expect(resetPasswordAction(form(NEW))).rejects.toThrow(/NEXT_REDIRECT \/forgot-password\?error=/);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("current-password guesses are throttled like sign-ins", async () => {
    h.claims = { sub: "user-6", email: "throttled@bayside.co.nz", amr: [{ method: "password", timestamp: NOW_S() - 86400 }] };
    h.verify.mockResolvedValue("wrong");
    let last = "";
    for (let i = 0; i < 12; i++) {
      last = await resetPasswordAction(form({ ...NEW, current_password: `guess-${i}` })).then(
        () => "",
        (e: Error) => e.message,
      );
    }
    expect(last).toContain(encodeURIComponent("Too many tries. Wait a few minutes and try again."));
    expect(h.verify.mock.calls.length).toBeLessThan(12);
  });
});
