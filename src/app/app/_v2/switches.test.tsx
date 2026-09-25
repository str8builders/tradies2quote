// The new-look switch, route by route: with isNewLookOn() false every
// existing screen renders exactly what it did before; with it true the
// new-look screen takes over. Server components are called directly and
// their element trees inspected (nothing is rendered or fetched for real).

import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sw = vi.hoisted(() => ({
  on: false,
  canChoose: false,
  user: { id: "user-1", email: "tradie@example.test" } as { id: string; email: string | null } | null,
  cookies: {} as Record<string, string>,
}));

vi.mock("@/lib/ui/newLook", () => ({
  isNewLookOn: async () => sw.on,
  getNewLookState: async () => ({ on: sw.on, choice: null, envDefault: "off", canChoose: sw.canChoose }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name in sw.cookies ? { name, value: sw.cookies[name] } : undefined),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/supabase/auth", () => ({ getCachedAuthUser: async () => ({ user: sw.user, error: null }) }));
vi.mock("@/lib/supabase/profile", () => ({
  getCachedAvatarUrl: async () => null,
  getCachedTopBarProfile: async () => ({
    firstName: "Sam",
    businessName: null,
    avatarUrl: null,
    country: "NZ",
    currency: "NZD",
  }),
}));
vi.mock("@/lib/weather-impact/outlook", () => ({ getWeekOutlook: vi.fn(async () => null) }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeBoardDb } = await import("@/test/fake-board-db");
  return {
    createClient: async () => ({
      ...fakeBoardDb({
        quotes: { data: [{ id: "q1", status: "draft", total_amount: 100, created_at: "2026-09-20T00:00:00Z" }] },
        invoices: { data: [] },
        profiles: { data: { country: "NZ", currency: "NZD" } },
      }),
      auth: { getUser: async () => ({ data: { user: sw.user } }) },
    }),
  };
});

import { OWNER_EMAIL } from "@/lib/owner";
import { AppHeader } from "../_components/AppHeader";
import { AppHeaderClient } from "../_components/AppHeaderClient";
import AppSplash from "../_components/AppSplash";
import { MobileAppMenu } from "../_components/MobileAppMenu";
import { OnboardingTourGate } from "../_components/OnboardingTourGate";
import { SideMeasureTape } from "../../_components/app/SideMeasureTape";
import InvoicesPage from "../invoices/page";
import JobsPage from "../jobs/page";
import { JobsBrowser } from "../jobs/_components/JobsBrowser";
import AppLayout from "../layout";
import MorePage from "../more/page";
import { MoreView } from "../more/_components/MoreView";
import DashboardPage from "../page";
import AppTemplate from "../template";
import { NewHome } from "./home/NewHome";
import { LegacyTopBar } from "./shell/LegacyTopBar";
import { NewLookShell } from "./shell/NewLookShell";
import { NewLookWelcome } from "./shell/NewLookWelcome";

/** Every element in a JSX tree (not rendering components, just walking props.children). */
function elements(node: ReactNode): Array<{ type: unknown; props: Record<string, unknown> }> {
  const out: Array<{ type: unknown; props: Record<string, unknown> }> = [];
  const walk = (n: ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    const props = n.props as Record<string, unknown>;
    out.push({ type: n.type, props });
    walk(props.children as ReactNode);
  };
  walk(node);
  return out;
}

const types = (node: ReactNode) => elements(node).map((e) => e.type);

async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const match = /^NEXT_REDIRECT (.+)$/.exec((error as Error).message);
    if (!match) throw error;
    return match[1];
  }
}

beforeEach(() => {
  sw.on = false;
  sw.canChoose = false;
  sw.user = { id: "user-1", email: "tradie@example.test" };
  sw.cookies = {};
});

describe("/app layout", () => {
  it("switch off: the old shell, with the welcome, the tour, the tape and the old menu", async () => {
    const tree = await AppLayout({ children: "page" });
    expect(types(tree)).toEqual(
      expect.arrayContaining([AppSplash, SideMeasureTape, MobileAppMenu, OnboardingTourGate]),
    );
    expect(types(tree)).not.toContain(NewLookShell);
    const canvas = elements(tree)[0];
    expect(canvas.props["data-shell"]).toBe("app");
    expect(canvas.props.className).toBe(
      "studio-app t2q-app-canvas min-h-dvh w-full max-w-full overflow-x-clip lg:grid lg:grid-cols-[24px_1fr_24px]",
    );
  });

  it("switch off: the welcome still reads its cookie", async () => {
    sw.cookies = { "t2q-welcome-seen": "1" };
    const splash = elements(await AppLayout({ children: "page" })).find((e) => e.type === AppSplash);
    expect(splash?.props.serverOpen).toBe(false);
  });

  it("switch on: the new-look shell instead, outdoor mode passed through", async () => {
    sw.on = true;
    sw.cookies = { "t2q-outdoor": "1" };
    const tree = await AppLayout({ children: "page" });
    expect(isValidElement(tree) && tree.type).toBe(NewLookShell);
    expect(elements(tree)[0].props.outdoor).toBe(true);
    expect(types(tree)).not.toContain(MobileAppMenu);
    expect(types(tree)).not.toContain(AppSplash);
    expect(types(tree)).not.toContain(OnboardingTourGate);
  });

  it("switch on: the short new welcome instead of the old video, until it's been seen", async () => {
    sw.on = true;
    const fresh = await AppLayout({ children: "page" });
    const welcome = elements((fresh as { props: { welcome: ReactNode } }).props.welcome).find(
      (e) => e.type === NewLookWelcome,
    );
    expect(welcome?.props).toMatchObject({ serverOpen: true, data: expect.objectContaining({ name: "Sam" }) });
    expect(types(fresh)).not.toContain(AppSplash);

    sw.cookies = { "t2q-welcome-seen": "1" };
    const seen = await AppLayout({ children: "page" });
    expect((seen as { props: { welcome: ReactNode } }).props.welcome).toBeNull();
  });
});

describe("AppHeader (every page not yet redesigned)", () => {
  it("switch off: the old header, unchanged", async () => {
    const tree = await AppHeader({ context: "Clients" });
    expect(isValidElement(tree) && tree.type).toBe(AppHeaderClient);
    expect(elements(tree)[0].props).toMatchObject({ context: "Clients", isOwner: false });
  });

  it("switch on: only the plain new-style top bar", async () => {
    sw.on = true;
    const tree = await AppHeader({ context: "Clients" });
    expect(isValidElement(tree) && tree.type).toBe(LegacyTopBar);
    expect(elements(tree)[0].props).toEqual({ context: "Clients" });
  });
});

describe("page transition", () => {
  it("switch off: the old enter animation", async () => {
    const tree = await AppTemplate({ children: "page" });
    expect(elements(tree)[0].props.className).toBe("t2q-page-enter");
  });
  it("switch on: a short fade that stops for reduced motion", async () => {
    sw.on = true;
    const tree = await AppTemplate({ children: "page" });
    expect(elements(tree)[0].props.className).toBe("animate-ui-fade-in motion-reduce:animate-none");
  });
});

describe("/app (Home)", () => {
  it("switch off: the old dashboard", async () => {
    const tree = await DashboardPage();
    expect(types(tree)).toContain(AppHeader);
    expect(types(tree)).not.toContain(NewHome);
  });

  it("switch on: the new Home for this user", async () => {
    sw.on = true;
    sw.user = { id: "owner-1", email: OWNER_EMAIL };
    const tree = await DashboardPage();
    expect(isValidElement(tree) && tree.type).toBe(NewHome);
    expect(elements(tree)[0].props).toEqual({
      userId: "owner-1",
      isOwner: true,
      bar: expect.objectContaining({ name: "Sam", greeting: expect.stringMatching(/^Good (morning|afternoon|evening)$/) }),
    });
  });

  it("signed out still goes to login first", async () => {
    sw.user = null;
    sw.on = true;
    expect(await redirectOf(() => DashboardPage())).toBe("/login");
  });
});

describe("/app/jobs", () => {
  const params = (show?: string) => ({ searchParams: Promise.resolve(show ? { show } : {}) });

  it("switch off: hands over to the old list that fits", async () => {
    expect(await redirectOf(() => JobsPage(params()))).toBe("/app/quotes");
    expect(await redirectOf(() => JobsPage(params("to-send")))).toBe("/app/quotes?stage=draft");
    expect(await redirectOf(() => JobsPage(params("unpaid")))).toBe("/app/invoices");
    expect(await redirectOf(() => JobsPage(params("done")))).toBe("/app/invoices?status=paid");
  });

  it("switch on: the Jobs list, built from the user's rows", async () => {
    sw.on = true;
    const tree = await JobsPage(params("to-send"));
    const browser = elements(tree).find((e) => e.type === JobsBrowser);
    expect(browser?.props.rows).toMatchObject([{ id: "q1", href: "/app/quotes/preview/q1", filter: "to-send" }]);
  });
});

describe("/app/more", () => {
  it("switch off: back to the dashboard (the old account menu has these)", async () => {
    expect(await redirectOf(() => MorePage())).toBe("/app");
  });

  it("switch on: the More screen; owner tools only for the owner", async () => {
    sw.on = true;
    sw.cookies = { "t2q-outdoor": "1" };
    let view = elements(await MorePage()).find((e) => e.type === MoreView);
    expect(view?.props).toEqual({
      bar: expect.objectContaining({ name: "Sam", letter: "S", email: "tradie@example.test", outdoor: true }),
      isOwner: false,
      outdoor: true,
      canChooseLook: false,
    });
    sw.user = { id: "owner-1", email: OWNER_EMAIL };
    sw.canChoose = true;
    view = elements(await MorePage()).find((e) => e.type === MoreView);
    expect(view?.props).toMatchObject({ isOwner: true, canChooseLook: true });
  });
});

describe("/app/invoices", () => {
  const params = (status?: string) => ({ searchParams: Promise.resolve(status ? { status } : {}) });

  it("switch on: folded into Jobs, filter kept", async () => {
    sw.on = true;
    expect(await redirectOf(() => InvoicesPage(params()))).toBe("/app/jobs?show=unpaid");
    expect(await redirectOf(() => InvoicesPage(params("overdue")))).toBe("/app/jobs?show=unpaid");
    expect(await redirectOf(() => InvoicesPage(params("paid")))).toBe("/app/jobs?show=done");
  });

  it("switch off: the old Invoices page, no redirect", async () => {
    const tree = await InvoicesPage(params("sent"));
    expect(types(tree)).toContain(AppHeader);
  });
});
