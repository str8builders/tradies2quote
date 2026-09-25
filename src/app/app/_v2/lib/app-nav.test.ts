import { describe, expect, it } from "vitest";
import {
  APP_TABS,
  activeTab,
  isFocusedRoute,
  isLegacyListPath,
  legacyListRedirect,
  legacyTopBar,
  normalizePath,
} from "./app-nav";

describe("the five tabs", () => {
  it("Home · Jobs · New · Prices · Timesheet, pointing at the right routes", () => {
    expect(APP_TABS.map((t) => [t.label, t.href])).toEqual([
      ["Home", "/app"],
      ["Jobs", "/app/jobs"],
      ["New", "/app/quotes/new"],
      ["Prices", "/app/materials"],
      ["Timesheet", "/app/timesheet"],
    ]);
    expect(APP_TABS.find((t) => t.id === "new")?.name).toBe("New quote");
  });
});

describe("activeTab: which tab is highlighted", () => {
  it.each([
    ["/app", "home"],
    ["/app/", "home"],
    ["/app/weather", "home"],
    ["/app/jobs", "jobs"],
    ["/app/jobs?show=unpaid", "jobs"],
    ["/app/quotes", "jobs"],
    ["/app/quotes/preview/abc", "jobs"],
    ["/app/quotes/preview/abc/pdf", "jobs"],
    ["/app/invoices", "jobs"],
    ["/app/requests", "jobs"],
    ["/app/quotes/new", "new"],
    ["/app/quotes/new/", "new"],
    ["/app/materials", "prices"],
    ["/app/materials/quick-start", "prices"],
    ["/app/materials/abc/edit", "prices"],
    ["/app/suppliers", "prices"],
    ["/app/timesheet", "timesheet"],
    ["/app/timesheet/", "timesheet"],
  ] as const)("%s → %s", (path, tab) => {
    expect(activeTab(path)).toBe(tab);
  });

  it("no tab for paths it doesn't know, and no false prefix matches", () => {
    expect(activeTab("/app/jobsite")).toBeNull();
    expect(activeTab("/app/moreover")).toBeNull();
    // More's pages are reached from the photo menu now: no tab lights up.
    for (const path of ["/app/more", "/app/settings/business", "/app/clients", "/app/team", "/app/admin"]) {
      expect(activeTab(path)).toBeNull();
    }
    expect(activeTab("/app/timesheets")).toBeNull();
    expect(activeTab("/t2qcal/calculators")).toBeNull();
    expect(activeTab(null)).toBeNull();
  });
});

describe("focused routes hide the phone tab bar", () => {
  it("the new-quote flow and the job page", () => {
    expect(isFocusedRoute("/app/quotes/new")).toBe(true);
    expect(isFocusedRoute("/app/quotes/preview/abc")).toBe(true);
    expect(isFocusedRoute("/app/quotes/preview/abc/pdf")).toBe(true);
  });
  it("not the tab screens or the pages reached from them", () => {
    for (const path of ["/app", "/app/jobs", "/app/materials", "/app/more", "/app/settings/business", "/app/quotes"]) {
      expect(isFocusedRoute(path)).toBe(false);
    }
  });
});

describe("the top bar old pages get in the new look", () => {
  it.each([
    ["/app/quotes/new", "New quote", { href: "/app", label: "Cancel" }],
    ["/app/requests", "Client requests", { href: "/app", label: "Home" }],
    ["/app/weather", "Weather", { href: "/app", label: "Home" }],
    ["/app/materials/quick-start", "Quick start", { href: "/app/materials", label: "Prices" }],
    ["/app/materials/capture", "Add from a photo", { href: "/app/materials", label: "Prices" }],
    ["/app/suppliers", "Suppliers", { href: "/app/materials", label: "Prices" }],
    ["/app/settings", "Settings", { href: "/app/more", label: "More" }],
    ["/app/settings/guide", "How to use T2Q", { href: "/app/more", label: "More" }],
    ["/app/clients", "Clients", { href: "/app/more", label: "More" }],
    ["/app/team", "Your team", { href: "/app/more", label: "More" }],
    ["/app/templates", "Terms templates", { href: "/app/more", label: "More" }],
    ["/app/beta", "Send feedback", { href: "/app/more", label: "More" }],
    ["/app/upgrade", "Plans", { href: "/app/more", label: "More" }],
    ["/app/agents", "Agents", { href: "/app/more", label: "More" }],
    ["/app/agents/monitor", "Agent monitor", { href: "/app/more", label: "More" }],
    ["/app/admin", "Ops", { href: "/app/more", label: "More" }],
  ] as const)("%s → %s", (path, title, back) => {
    expect(legacyTopBar(path, "Some old label")).toEqual({ title, back });
  });

  it("Prices is a tab: no back link", () => {
    expect(legacyTopBar("/app/materials", "Materials")).toEqual({ title: "Prices" });
  });

  it("the job page goes back to Jobs, with the quote number under the title", () => {
    expect(legacyTopBar("/app/quotes/preview/abc", "Q-2026-AB12")).toEqual({
      title: "Job",
      subtitle: "Q-2026-AB12",
      back: { href: "/app/jobs", label: "Jobs" },
    });
    expect(legacyTopBar("/app/quotes/preview/abc")).toEqual({ title: "Job", back: { href: "/app/jobs", label: "Jobs" } });
  });

  it("debug pages use their own label and go back up one level", () => {
    expect(legacyTopBar("/app/debug", "Debug")).toEqual({ title: "Debug", back: { href: "/app/more", label: "More" } });
    expect(legacyTopBar("/app/debug/brain", "Tradie Brain")).toEqual({
      title: "Tradie Brain",
      back: { href: "/app/debug", label: "Debug" },
    });
  });

  it("an unknown page uses its label and goes back Home", () => {
    expect(legacyTopBar("/app/something-new", "  Something   new ")).toEqual({
      title: "Something new",
      back: { href: "/app", label: "Home" },
    });
    expect(legacyTopBar("/app/something-new")).toEqual({ title: "Tradies2Quote", back: { href: "/app", label: "Home" } });
  });
});

describe("old lists → Jobs, filter kept", () => {
  it("only the two list pages themselves", () => {
    expect(isLegacyListPath("/app/quotes")).toBe(true);
    expect(isLegacyListPath("/app/quotes/")).toBe(true);
    expect(isLegacyListPath("/app/invoices")).toBe(true);
    expect(isLegacyListPath("/app/quotes/new")).toBe(false);
    expect(isLegacyListPath("/app/quotes/preview/abc")).toBe(false);
    expect(isLegacyListPath("/app/jobs")).toBe(false);
  });

  it.each([
    ["/app/quotes", "", "/app/jobs"],
    ["/app/quotes", "?stage=draft", "/app/jobs?show=to-send"],
    ["/app/quotes", "?stage=sent", "/app/jobs?show=waiting"],
    ["/app/quotes", "?stage=scheduled", "/app/jobs?show=booked"],
    ["/app/quotes", "?stage=completed", "/app/jobs?show=unpaid"],
    ["/app/quotes", "?status=sent", "/app/jobs?show=waiting"],
    ["/app/quotes", "?stage=nonsense", "/app/jobs"],
    ["/app/invoices", "", "/app/jobs?show=unpaid"],
    ["/app/invoices", "?status=overdue", "/app/jobs?show=unpaid"],
    ["/app/invoices", "?status=paid", "/app/jobs?show=done"],
  ] as const)("%s%s → %s", (path, search, target) => {
    expect(legacyListRedirect(path, search)).toBe(target);
    expect(legacyListRedirect(path, new URLSearchParams(search))).toBe(target);
  });
});

describe("normalizePath", () => {
  it("drops trailing slashes, query and hash", () => {
    expect(normalizePath("/app/jobs/?show=done#top")).toBe("/app/jobs");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath(undefined)).toBe("");
  });
});
