// Page titles and descriptions are in the HTML too, so inside the iPhone app
// they carry no trial or plan wording (App Store 3.1.3(f)). The website's
// stay as they were.

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ native: false }));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => h.native }));
vi.mock("@/app/(auth)/signup/actions", () => ({ signupAction: vi.fn() }));

import { generateMetadata as signupMetadata } from "./(auth)/signup/page";
import { generateMetadata as upgradeMetadata } from "./app/upgrade/page";
import { generateMetadata as helpMetadata } from "./help/page";

const MONEY = /trial|plan|billing|subscri|price/i;

beforeEach(() => {
  h.native = false;
});

describe("metadata inside the iPhone app", () => {
  it("sign up: Create account", async () => {
    h.native = true;
    expect((await signupMetadata()).title).toBe("Create account");
  });

  it("the account page behind /app/upgrade: Account", async () => {
    h.native = true;
    expect((await upgradeMetadata()).title).toBe("Account");
  });

  it("help: no trial or billing in the description", async () => {
    h.native = true;
    const meta = await helpMetadata();
    expect(String(meta.description)).not.toMatch(MONEY);
    expect(meta.title).toBe("Help & FAQ — Tradies2Quote");
  });
});

describe("metadata on the website (unchanged)", () => {
  it("keeps its titles and description", async () => {
    expect((await signupMetadata()).title).toBe("Start your free trial");
    expect((await upgradeMetadata()).title).toBe("Choose your plan");
    expect(String((await helpMetadata()).description)).toContain("Trial, billing");
  });
});
