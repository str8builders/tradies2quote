import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const cookieSet = vi.fn();
const captureError = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp } }),
}));
vi.mock("@/lib/observability", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

import { confirmEmailLinkAction } from "./actions";

const HASH = "b".repeat(56);

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const m = /^NEXT_REDIRECT (.*)$/.exec((e as Error).message);
    if (m) return m[1];
    throw e;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  verifyOtp.mockReset();
  cookieSet.mockReset();
  captureError.mockReset();
});

describe("confirmEmailLinkAction", () => {
  it("verifies a reset link and opens the set-password screen", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const to = await redirectOf(
      confirmEmailLinkAction(form({ token_hash: `pkce_${HASH}`, type: "recovery", next: "https://evil.example" })),
    );
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: `pkce_${HASH}` });
    expect(to).toBe("/reset-password");
    expect(cookieSet).toHaveBeenCalledWith("t2q-welcome-seen", "", { maxAge: 0, path: "/" });
  });

  it("confirms a sign-up and opens the dashboard", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const to = await redirectOf(confirmEmailLinkAction(form({ token_hash: HASH, type: "email" })));
    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: HASH });
    expect(to).toBe("/app?confirmed=1");
  });

  it("sends an expired reset link back to the reset form without reporting an error", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Email link is invalid or has expired", code: "otp_expired" } });
    const to = await redirectOf(confirmEmailLinkAction(form({ token_hash: HASH, type: "recovery" })));
    expect(to.startsWith("/forgot-password?error=")).toBe(true);
    expect(captureError).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("reports an unexpected verification failure and still shows a plain message", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "connection refused", code: "unexpected_failure" } });
    const to = await redirectOf(confirmEmailLinkAction(form({ token_hash: HASH, type: "email" })));
    expect(to.startsWith("/login?error=")).toBe(true);
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it("never calls the auth server with a malformed link", async () => {
    const to = await redirectOf(confirmEmailLinkAction(form({ token_hash: "x", type: "recovery" })));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(to.startsWith("/forgot-password?error=")).toBe(true);
    const to2 = await redirectOf(confirmEmailLinkAction(form({ token_hash: HASH, type: "magiclink" })));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(to2.startsWith("/login?error=")).toBe(true);
  });
});
