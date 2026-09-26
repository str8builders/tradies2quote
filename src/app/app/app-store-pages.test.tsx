// Signed-in pages inside the iPhone app, decided on the server: no plan
// names, plan links, trial or subscription talk (App Store 3.1.3(f)), no
// install steps for other phones (2.3.10). The website is unchanged.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ native: false }));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => h.native }));
vi.mock("@/lib/supabase/auth", () => ({ getCachedAuthUser: async () => ({ user: { id: "u-1", email: "t@example.invalid" } }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "t@example.invalid" } } }) } }),
}));
vi.mock("@/app/app/_components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import GuidePage from "./settings/guide/page";
import TeamPage from "./team/page";
import TemplatesPage from "./templates/page";
import InstallPage from "../install/page";
import { deleteAccountWarning } from "./settings/_newlook/DeleteAccountCard";

const html = (node: ReactElement) => renderToStaticMarkup(node);
const MONEY = /subscri|\bplans?\b|upgrade|billing|\$\d|free trial|7-day|no card|\bcrew\b|\bbuilder\b/i;
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

beforeEach(() => {
  h.native = false;
});

describe("the manual (/app/settings/guide)", () => {
  it("in the iPhone app: no install steps (Android, Home Screen) and no Your plan section", async () => {
    h.native = true;
    const out = html(await GuidePage());
    expect(out).not.toContain('data-testid="guide-section-install-app"');
    expect(out).not.toContain('data-testid="guide-section-billing"');
    expect(out).not.toMatch(/Android|Add to Home Screen|Progressive Web App|free trial|no card needed/);
    expect(out).toContain("// 12 sections — tap to jump");
  });

  it("on the website: every section as before", async () => {
    const out = html(await GuidePage());
    expect(out).toContain('data-testid="guide-section-install-app"');
    expect(out).toContain('data-testid="guide-section-billing"');
    expect(out).toContain("// 14 sections — tap to jump");
  });
});

describe("Your team (/app/team)", () => {
  it("in the iPhone app: no subscription in the intro or on an invitation", async () => {
    h.native = true;
    const out = text(html(await TeamPage({ searchParams: Promise.resolve({ invite: "a".repeat(64) }) })));
    expect(out).toContain("A shared address book.");
    expect(out).toContain("becomes available once you join");
    expect(out).not.toMatch(MONEY);
  });

  it("on the website: as before", async () => {
    const out = text(html(await TeamPage({ searchParams: Promise.resolve({ invite: "a".repeat(64) }) })));
    expect(out).toContain("One subscription. A shared address book.");
    expect(out).toContain("If you already have a personal subscription, it must end before you join.");
  });
});

describe("Terms templates (/app/templates)", () => {
  it("in the iPhone app the heading doesn't name the Builder plan; the website keeps it", async () => {
    h.native = true;
    expect(text(html(await TemplatesPage()))).not.toMatch(/builder/i);
    h.native = false;
    expect(text(html(await TemplatesPage()))).toContain("// builder workspace");
  });
});

describe("/install", () => {
  it("in the iPhone app it sends you back into the app (it is the app; Android and Home Screen steps)", async () => {
    h.native = true;
    await expect(InstallPage()).rejects.toThrow("redirect:/app");
  });

  it("on the website: the install guide as before", async () => {
    expect(html(await InstallPage())).toContain("home screen.");
  });
});

describe("deleting your account (new look)", () => {
  it("the app's warning doesn't mention a subscription; the website's does", () => {
    expect(deleteAccountWarning(true)).not.toMatch(MONEY);
    expect(deleteAccountWarning(false)).toContain("any active subscription is cancelled");
  });
});
