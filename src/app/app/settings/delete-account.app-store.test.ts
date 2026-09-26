// Where a finished account deletion lands. The iPhone app goes to the
// sign-in screen with a note, never the website's homepage (its HTML carries
// trial offers: App Store 3.1.3(f)). The website is unchanged. The review
// demo account is only signed out, in both.

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  native: false,
  email: "tradie@example.invalid",
  purge: vi.fn(async () => ({ ok: true as const })),
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => h.native }));
vi.mock("@/lib/account-deletion", () => ({ purgeAccount: h.purge }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1", email: h.email } } }), signOut: h.signOut },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

import { deleteAccountAction } from "./delete-account-actions";

const confirmed = () => {
  const form = new FormData();
  form.set("confirm", "DELETE");
  return form;
};

beforeEach(() => {
  h.native = false;
  h.email = "tradie@example.invalid";
  h.purge.mockClear();
});

describe("deleteAccountAction: where it lands", () => {
  it("iPhone app: the sign-in screen, saying the account has been deleted", async () => {
    h.native = true;
    await expect(deleteAccountAction(confirmed())).rejects.toThrow(
      `redirect:/login?message=${encodeURIComponent("Your account has been deleted.")}`,
    );
    expect(h.purge).toHaveBeenCalledWith("u-1");
  });

  it("website: the homepage, as before", async () => {
    await expect(deleteAccountAction(confirmed())).rejects.toThrow("redirect:/?account-deleted=1");
  });

  it("the review demo account is only signed out (never purged), and lands the same way", async () => {
    h.email = "demo@tradies2quote.com";
    h.native = true;
    await expect(deleteAccountAction(confirmed())).rejects.toThrow("redirect:/login?message=");
    expect(h.purge).not.toHaveBeenCalled();
    expect(h.signOut).toHaveBeenCalled();
  });
});
