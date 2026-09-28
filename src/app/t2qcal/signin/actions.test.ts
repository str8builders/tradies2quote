import { beforeEach, describe, expect, it, vi } from "vitest";

/** T2QCAL sign-in shares the website's per-IP / per-email throttle. */

const h = vi.hoisted(() => ({ signIn: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "192.0.2.44" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: h.signIn } }),
}));

import { t2qcalSignInAction } from "./actions";
import { SIGNIN_PER_EMAIL } from "@/lib/auth/signin-throttle";

function form(email: string) {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", "wrong-password");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.signIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
});

describe("t2qcalSignInAction throttle", () => {
  it("answers 'throttled' without asking Supabase once the email has had too many tries", async () => {
    const email = "calc-guessed@example.invalid";
    for (let i = 0; i < SIGNIN_PER_EMAIL; i++) {
      await expect(t2qcalSignInAction(form(email))).rejects.toThrow(/error=credentials/);
    }
    await expect(t2qcalSignInAction(form(email))).rejects.toThrow(/NEXT_REDIRECT \/t2qcal\/signin\?error=throttled/);
    expect(h.signIn).toHaveBeenCalledTimes(SIGNIN_PER_EMAIL);
  });
});
