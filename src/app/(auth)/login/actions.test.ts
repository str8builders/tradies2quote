import { beforeEach, describe, expect, it, vi } from "vitest";

/** Website sign-in is throttled per IP and per email before Supabase is asked. */

const h = vi.hoisted(() => ({ signIn: vi.fn(), ip: "192.0.2.10", cookieSet: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": h.ip }),
  cookies: async () => ({ set: h.cookieSet }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: h.signIn } }),
}));

import { loginAction } from "./actions";
import { SIGNIN_PER_EMAIL, SIGNIN_TOO_MANY_MESSAGE } from "@/lib/auth/signin-throttle";

function form(email: string, password = "wrong-password") {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  fd.set("next", "/app");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.signIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
});

describe("loginAction throttle", () => {
  it("stops asking Supabase after too many tries for one email, with a plain message", async () => {
    h.ip = "192.0.2.10";
    const email = "guessed@example.invalid";
    for (let i = 0; i < SIGNIN_PER_EMAIL; i++) {
      await expect(loginAction(form(email))).rejects.toThrow(/NEXT_REDIRECT \/login\?error=/);
    }
    expect(h.signIn).toHaveBeenCalledTimes(SIGNIN_PER_EMAIL);
    await expect(loginAction(form(email))).rejects.toThrow(
      `NEXT_REDIRECT /login?error=${encodeURIComponent(SIGNIN_TOO_MANY_MESSAGE)}&next=%2Fapp`,
    );
    expect(h.signIn).toHaveBeenCalledTimes(SIGNIN_PER_EMAIL);
  });

  it("a normal sign-in goes straight through", async () => {
    h.ip = "192.0.2.77";
    h.signIn.mockResolvedValue({ error: null });
    await expect(loginAction(form("fine@example.invalid", "right-password"))).rejects.toThrow("NEXT_REDIRECT /app");
    expect(h.signIn).toHaveBeenCalledWith({ email: "fine@example.invalid", password: "right-password" });
  });
});
