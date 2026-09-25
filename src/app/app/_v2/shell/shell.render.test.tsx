// Markup contracts for the new-look shell: the tab bar / side rail, the
// content column, the top bar old pages get, and the shell itself.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/app" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
// Async server component (reads the subscription); not what this file tests.
vi.mock("../../_components/TrialBanner", () => ({ TrialBanner: () => <div data-testid="trial-banner-stub" /> }));

import { AppContent } from "./AppContent";
import { AppNav } from "./AppNav";
import { LegacyTopBar } from "./LegacyTopBar";
import { NewLookShell } from "./NewLookShell";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const links = (markup: string) => markup.match(/<a [^>]*>/g) ?? [];
const linkTo = (markup: string, href: string) => links(markup).find((a) => a.includes(`href="${href}"`)) ?? "";
const openTag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};

beforeEach(() => {
  nav.pathname = "/app";
});

describe("AppNav: bottom bar on phones, side rail from sm", () => {
  it("five destinations in order, with the raised New quote in the middle", () => {
    const out = html(<AppNav />);
    expect(links(out).map((a) => /href="([^"]+)"/.exec(a)?.[1])).toEqual([
      "/app",
      "/app/jobs",
      "/app/quotes/new",
      "/app/materials",
      "/app/more",
    ]);
    expect(out).toMatch(/<nav [^>]*aria-label="Main"/);
    expect(linkTo(out, "/app/quotes/new")).toContain('aria-label="New quote"');
    // The New tile: the orange gradient (its base colour is the brand fill).
    expect(out).toContain("ui-brand-gradient");
    for (const label of ["Home", "Jobs", "Prices", "More"]) expect(out).toContain(`>${label}</span>`);
  });

  it("docked to the bottom edge, painting the home-indicator zone; a rail from sm", () => {
    const tag = openTag(html(<AppNav />), "<nav");
    expect(tag).toContain("fixed right-0 bottom-0 left-0");
    expect(tag).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(tag).toContain("bg-ui-bg");
    expect(tag).toContain("sm:top-0");
    expect(tag).toContain("sm:w-[calc(6rem+env(safe-area-inset-left))]");
  });

  it.each([
    ["/app", "/app"],
    ["/app/jobs", "/app/jobs"],
    ["/app/quotes/preview/abc", "/app/jobs"],
    ["/app/invoices", "/app/jobs"],
    ["/app/materials/kits", "/app/materials"],
    ["/app/settings/business", "/app/more"],
    ["/app/clients", "/app/more"],
  ])("on %s the current tab is %s (aria-current and a filled icon)", (path, href) => {
    nav.pathname = path;
    const out = html(<AppNav />);
    const current = links(out).filter((a) => a.includes('aria-current="page"'));
    expect(current).toHaveLength(1);
    expect(current[0]).toContain(`href="${href}"`);
  });

  it("the new-quote flow marks New quote as current", () => {
    nav.pathname = "/app/quotes/new";
    expect(linkTo(html(<AppNav />), "/app/quotes/new")).toContain('aria-current="page"');
  });

  it("every tab is a big target and uses ui tokens", () => {
    for (const a of links(html(<AppNav />))) {
      expect(a).toContain("min-h-14");
      expect(a).toContain("ui-focus-ring");
    }
  });

  it("steps aside on phones for focused routes (the job page, the new-quote flow)", () => {
    for (const path of ["/app/quotes/preview/abc", "/app/quotes/new"]) {
      nav.pathname = path;
      const tag = openTag(html(<AppNav />), "<nav");
      expect(tag).toContain('data-focused="true"');
      expect(tag).toContain("max-sm:hidden");
    }
    nav.pathname = "/app/jobs";
    expect(openTag(html(<AppNav />), "<nav")).not.toContain("max-sm:hidden");
  });
});

describe("AppContent: the content column", () => {
  it("is the shell's scroll clearance wrapper, padded for the notch and clear of the rail", () => {
    nav.pathname = "/app/jobs";
    const out = html(<AppContent banners={<p>banner</p>}>page</AppContent>);
    const tag = openTag(out, 'data-testid="app-content"');
    expect(tag).toContain("t2q-app-scroll");
    expect(tag).toContain("pt-[env(safe-area-inset-top)]");
    expect(tag).toContain("sm:pl-[calc(6rem+env(safe-area-inset-left))]");
    expect(tag).not.toContain("max-sm:pb-0!");
    expect(out).toContain("<p>banner</p>page");
  });

  it("on focused routes the tab bar's clearance goes, so the page's action bar owns the bottom", () => {
    nav.pathname = "/app/quotes/preview/abc";
    expect(openTag(html(<AppContent>page</AppContent>), 'data-testid="app-content"')).toContain("max-sm:pb-0!");
  });

  it("the old Quotes and Invoices lists open Jobs instead of rendering", () => {
    for (const path of ["/app/quotes", "/app/invoices"]) {
      nav.pathname = path;
      const out = html(<AppContent>old list</AppContent>);
      expect(out).not.toContain("old list");
      expect(out).toContain('data-testid="legacy-list-redirect"');
      expect(out).toContain('role="status"');
      expect(linkTo(out, "/app/jobs")).not.toBe("");
      expect(out).toContain("motion-reduce:animate-none");
    }
  });
});

describe("LegacyTopBar: what old pages get in the new look", () => {
  it("a plain title and a way back, sticking below the notch the shell pads", () => {
    nav.pathname = "/app/clients";
    const out = html(<LegacyTopBar context="Clients" />);
    expect(out).toMatch(/<h1 [^>]*>Clients<\/h1>/);
    expect(linkTo(out, "/app/more")).not.toBe("");
    expect(out).toContain(">More</a>");
    const header = openTag(out, "<header");
    expect(header).toContain("top-[env(safe-area-inset-top)]");
    expect(header).not.toContain("pt-[env(safe-area-inset-top)]");
  });

  it("the job page goes back to Jobs with the quote number under the title", () => {
    nav.pathname = "/app/quotes/preview/abc";
    const out = html(<LegacyTopBar context="Q-2026-AB12" />);
    expect(out).toMatch(/<h1 [^>]*>Job<\/h1>/);
    expect(out).toContain("Q-2026-AB12");
    expect(linkTo(out, "/app/jobs")).not.toBe("");
  });

  it("no old menu, tabs or account button", () => {
    nav.pathname = "/app/settings";
    const out = html(<LegacyTopBar context="Settings" />);
    expect(out).not.toContain("app-header-tabs");
    expect(out).not.toContain("account");
    expect(links(out)).toHaveLength(1);
  });
});

describe("NewLookShell", () => {
  it("keeps the mobile shell contract: normal-flow canvas, document scroll, one nav", () => {
    nav.pathname = "/app/jobs";
    const out = html(<NewLookShell outdoor={false}>page</NewLookShell>);
    const canvas = openTag(out, 'data-shell="app"');
    expect(canvas).toContain('data-look="new"');
    expect(canvas).toContain("data-contrast-root");
    expect(canvas).not.toContain("data-contrast=");
    expect(canvas).toContain("min-h-dvh");
    expect(canvas).toContain("overflow-x-clip");
    expect(canvas).toContain("bg-ui-bg!");
    expect(canvas).not.toMatch(/\bfixed\b/);
    expect(canvas).not.toMatch(/\binset-0\b/);
    expect(canvas).not.toContain("overflow-x-hidden");
    expect(out.match(/<nav /g)).toHaveLength(1);
    expect(out).toContain('data-testid="app-nav"');
    expect(out).toContain('data-testid="trial-banner-stub"');
    expect(out).toContain('data-testid="status-bar-strip"');
    expect(out).toContain("page");
  });

  it("paints for outdoor mode from the first byte", () => {
    const out = html(<NewLookShell outdoor>page</NewLookShell>);
    expect(openTag(out, 'data-shell="app"')).toContain('data-contrast="outdoor"');
  });

  it("no welcome video, tour, side tape or old menu", () => {
    const out = html(<NewLookShell outdoor={false}>page</NewLookShell>);
    for (const old of ["app-splash", "side-measure-tape", "app-bottom-nav", "app-account-avatar", "t2q-bottomnav"]) {
      expect(out).not.toContain(old);
    }
  });

  it("a paused-motion choice skips kit animations instead of freezing them", () => {
    const canvas = openTag(html(<NewLookShell outdoor={false}>page</NewLookShell>), 'data-shell="app"');
    expect(canvas).toContain("[[data-motion=paused]_&amp;_[class*=&#x27;animate-ui-&#x27;]]:animate-none!");
  });
});
