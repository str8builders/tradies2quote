// Markup contracts for the More screen (static HTML in node).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../settings/new-look-actions", () => ({ setNewLookAction: vi.fn() }));

import { TOP_BAR_FIXTURE } from "../../_v2/lib/fixtures";
import { accountMenuSections, moreMenu, ownerMenu } from "../_lib/menu";
import { MoreView } from "./MoreView";

const hrefs = (markup: string) => [...markup.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);

describe("More menu (data)", () => {
  it("the rows the brief lists, in order, pointing at the right places", () => {
    const { groups, owner } = moreMenu({ isOwner: false });
    expect(groups.flatMap((g) => g.items.map((i) => [i.label, i.href]))).toEqual([
      ["Clients", "/app/clients"],
      ["Prices", "/app/materials"],
      ["Calendar", "/app/calendar"],
      ["Business details", "/app/settings/business"],
      ["Rates and quotes", "/app/settings/rates"],
      ["Payments", "/app/settings/payments"],
      ["Account", "/app/settings/account"],
      ["Team", "/app/team"],
      ["Help", "/help"],
      ["Send feedback", "/app/beta"],
      ["Privacy policy", "/privacy"],
      ["Terms", "/terms"],
    ]);
    expect(owner).toBeNull();
  });

  it("owner tools for the owner only", () => {
    expect(moreMenu({ isOwner: true }).owner?.items.map((i) => i.href)).toEqual([
      "/app/agents",
      "/app/debug",
      "/app/agents/monitor",
      "/app/admin",
    ]);
  });

  it("no plan or price talk anywhere (same list inside the iOS app)", () => {
    const text = JSON.stringify([moreMenu({ isOwner: true }), accountMenuSections()]);
    expect(text).not.toMatch(/plan|subscri|upgrade|\$/i);
  });

  it("the photo menu (More's replacement): three groups from the same rows, no T2QCAL web link", () => {
    expect(accountMenuSections().map((g) => [g.title, g.items.map((i) => [i.label, i.href])])).toEqual([
      [
        "You and your business",
        [
          ["Your profile", "/app/settings/account"],
          ["Business details", "/app/settings/business"],
          ["Rates and quotes", "/app/settings/rates"],
          ["Payments", "/app/settings/payments"],
        ],
      ],
      ["Work", [["Clients", "/app/clients"], ["Calendar", "/app/calendar"], ["Team", "/app/team"]]],
      [
        "Help",
        [
          ["Help", "/help"],
          ["Send feedback", "/app/beta"],
          ["Privacy policy", "/privacy"],
          ["Terms", "/terms"],
        ],
      ],
    ]);
    expect(JSON.stringify(accountMenuSections())).not.toContain("/t2qcal");
    expect(ownerMenu(false)).toBeNull();
    expect(ownerMenu(true)?.items).toHaveLength(4);
  });
});

describe("MoreView", () => {
  const view = (over: Partial<Parameters<typeof MoreView>[0]> = {}) =>
    renderToStaticMarkup(
      <MoreView bar={TOP_BAR_FIXTURE} isOwner={false} outdoor={false} canChooseLook={false} {...over} />,
    );

  it("the top bar, Open T2QCAL (the app, not the web copy), then big rows to every place", () => {
    const out = view();
    expect(out).toMatch(/<h1 [^>]*>More<\/h1>/);
    expect(out).toContain('aria-label="Your account and settings"');
    expect(out).toContain('data-testid="account-sheet-t2qcal"');
    expect(out).not.toContain('href="/t2qcal');
    expect(out.indexOf('data-testid="more-t2qcal"')).toBeLessThan(out.indexOf("Your business"));
    expect(view({ bar: { ...TOP_BAR_FIXTURE, t2qcal: false } })).not.toContain("more-t2qcal");
    expect(hrefs(out)).toEqual([
      "/app/clients",
      "/app/materials",
      "/app/calendar",
      "/app/settings/business",
      "/app/settings/rates",
      "/app/settings/payments",
      "/app/settings/account",
      "/app/team",
      "/help",
      "/app/beta",
      "/privacy",
      "/terms",
    ]);
    expect(out.match(/min-h-16/g)?.length).toBeGreaterThanOrEqual(10);
  });

  it("outdoor mode, explained in one line, showing this device's setting", () => {
    const off = view();
    expect(off).toContain(">Outdoor mode</label>");
    expect(off).toContain("High contrast for bright sun");
    expect(off).toMatch(/role="switch" aria-checked="false"/);
    expect(view({ outdoor: true })).toMatch(/role="switch" aria-checked="true"/);
  });

  it("sign out posts to the existing sign-out route", () => {
    expect(view()).toMatch(/<form action="\/auth\/signout" method="POST"><button type="submit"[^>]*>.*Sign out/);
  });

  it("owner tools only for the owner, at the very bottom", () => {
    expect(view()).not.toContain("Owner only");
    const owner = view({ isOwner: true });
    expect(owner).toContain("Owner only");
    expect(owner.indexOf("Owner only")).toBeGreaterThan(owner.indexOf("Sign out"));
    expect(hrefs(owner).slice(-4)).toEqual(["/app/agents", "/app/debug", "/app/agents/monitor", "/app/admin"]);
  });

  it("the new-look preview switch only for people allowed to choose", () => {
    expect(view()).not.toContain("New look (preview)");
    const chooser = view({ canChooseLook: true });
    expect(chooser).toContain("New look (preview)");
    expect(chooser).toContain("Turn it off to go back to the current look.");
  });
});
