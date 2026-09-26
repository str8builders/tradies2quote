// Home's first-run tour (new look): its stops, when it starts, where its
// card goes, and the card's markup (static HTML in node).

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/weather-impact/outlook", () => ({ getWeekOutlook: vi.fn() }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { markupRuleBreaks } from "@/test/design-rules";
import { HomeView } from "../home/HomeParts";
import { setupSteps } from "../lib/setup-steps";
import { AppNav } from "../shell/AppNav";
import { HomeTour, HomeTourView } from "./HomeTour";
import {
  EDGE,
  GAP,
  NEW_ACCOUNT_DAYS,
  TOUR_STOPS,
  isFirstRun,
  placeCard,
  shouldStartTour,
  stopsOnScreen,
  type TourStop,
} from "./tour-steps";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const NOW = new Date("2026-09-27T09:00:00Z");
const daysBefore = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const PHONE = { width: 390, height: 844 };
const CARD = { width: 358, height: 210 };

describe("the stops", () => {
  it("welcome, then New, Jobs, Prices, Timesheet, your QR code, the photo menu and the setup card", () => {
    expect(TOUR_STOPS.map((s) => s.id)).toEqual(["welcome", "new", "jobs", "prices", "timesheet", "qr", "photo", "setup"]);
    expect(TOUR_STOPS[0].target).toBeNull();
    expect(TOUR_STOPS.slice(1).every((s) => typeof s.target === "string")).toBe(true);
  });

  it("points at what's really on Home: the tab bar, the QR code tile, the setup card", () => {
    const nav = html(<AppNav />);
    for (const id of ["new", "jobs", "prices", "timesheet"]) expect(nav).toContain(`data-testid="app-nav-${id}"`);
    const home = html(
      <HomeView
        summary="Let's get you set up"
        setup={setupSteps({ businessName: null, logoUrl: null, labourRate: null, pricedMaterials: 0, quoteCount: 0 })}
        todos={[]}
        hasJobs={false}
        tiles={null}
        failed={false}
      />,
    );
    expect(home).toContain('data-testid="setup-card"');
    const quick = home.slice(home.indexOf('data-testid="home-quick"'), home.indexOf("</nav>", home.indexOf('data-testid="home-quick"')));
    expect(quick).toContain('href="/app/qr-code"');
    expect(TOUR_STOPS.find((s) => s.id === "qr")?.target).toBe('[data-testid="home-quick"] a[href="/app/qr-code"]');
    // The photo button (AccountButton) carries this id; the photo stop points at it.
    expect(TOUR_STOPS.find((s) => s.id === "photo")?.target).toBe('[data-testid="top-bar-account"]');
  });

  it("leaves out a stop whose target isn't on screen (no setup card once set up)", () => {
    const shown = stopsOnScreen((selector) => !selector.includes("setup-card"));
    expect(shown.map((s) => s.id)).not.toContain("setup");
    expect(shown[0].id).toBe("welcome");
    expect(stopsOnScreen(() => false).map((s) => s.id)).toEqual(["welcome"]);
  });

  it("plain words, no plans or prices (the same tour in the iPhone app)", () => {
    const words = TOUR_STOPS.map((s) => `${s.title} ${s.body}`).join(" ");
    expect(words).not.toMatch(/\bplans?\b|subscri|upgrade|trial|\$/i);
    for (const stop of TOUR_STOPS) expect(stop.body.length).toBeLessThanOrEqual(160);
  });
});

describe("when it starts", () => {
  it("a first run: no jobs yet, or an account under two weeks old", () => {
    expect(isFirstRun({ hasJobs: false, failed: false, createdAt: daysBefore(400), now: NOW })).toBe(true);
    expect(isFirstRun({ hasJobs: true, failed: false, createdAt: daysBefore(3), now: NOW })).toBe(true);
    expect(isFirstRun({ hasJobs: true, failed: false, createdAt: daysBefore(NEW_ACCOUNT_DAYS + 1), now: NOW })).toBe(false);
    expect(isFirstRun({ hasJobs: true, failed: false, createdAt: null, now: NOW })).toBe(false);
    expect(isFirstRun({ hasJobs: true, failed: false, createdAt: "not a date", now: NOW })).toBe(false);
  });

  it("never because the jobs failed to load (an empty board isn't a new account)", () => {
    expect(isFirstRun({ hasJobs: false, failed: true, createdAt: daysBefore(400), now: NOW })).toBe(false);
  });

  it("on its own once per phone; ?tour=1 always", () => {
    expect(shouldStartTour({ firstRun: true, asked: false, seen: false })).toBe(true);
    expect(shouldStartTour({ firstRun: true, asked: false, seen: true })).toBe(false);
    expect(shouldStartTour({ firstRun: false, asked: false, seen: false })).toBe(false);
    expect(shouldStartTour({ firstRun: false, asked: true, seen: true })).toBe(true);
  });
});

describe("where the card goes", () => {
  it("the welcome sits in the middle of the screen", () => {
    expect(placeCard(null, CARD, PHONE)).toEqual({
      top: (PHONE.height - CARD.height) / 2,
      left: (PHONE.width - CARD.width) / 2,
      placement: "center",
    });
  });

  it("above a tab in the bottom bar, kept inside the screen", () => {
    const jobsTab = { top: 780, left: 78, width: 78, height: 64 };
    const at = placeCard(jobsTab, CARD, PHONE);
    expect(at.placement).toBe("above");
    expect(at.top).toBe(780 - GAP - CARD.height);
    expect(at.left).toBe(EDGE);
  });

  it("below something near the top (the photo)", () => {
    const photo = { top: 40, left: 10, width: 56, height: 56 };
    const at = placeCard(photo, CARD, PHONE);
    expect(at).toEqual({ top: 96 + GAP, left: EDGE, placement: "below" });
  });

  it("beside the desktop rail", () => {
    const railItem = { top: 120, left: 8, width: 84, height: 72 };
    const at = placeCard(railItem, CARD, { width: 1280, height: 800 });
    expect(at.placement).toBe("right");
    expect(at.left).toBe(8 + 84 + GAP);
  });

  it("a tall target with no room either side: the roomier side, still on screen", () => {
    const tall = { top: 100, left: 0, width: 390, height: 640 };
    const at = placeCard(tall, CARD, PHONE);
    expect(at.top).toBeGreaterThanOrEqual(EDGE);
    expect(at.top + CARD.height).toBeLessThanOrEqual(PHONE.height - EDGE);
  });
});

describe("the tour on screen", () => {
  const stop = (id: TourStop["id"]) => TOUR_STOPS.find((s) => s.id === id)!;
  const view = (id: TourStop["id"], index: number, layout: Parameters<typeof HomeTourView>[0]["layout"] = { hole: null, top: 100, left: 16 }) =>
    html(<HomeTourView stop={stop(id)} index={index} total={8} layout={layout} onNext={() => {}} onBack={() => {}} onSkip={() => {}} />);

  it("is nothing in the server HTML (it waits for the welcome)", () => {
    expect(html(<HomeTour firstRun />)).toBe("");
  });

  it("the welcome: where you are, the words, Show me around and Skip", () => {
    const out = view("welcome", 0);
    expect(out).toContain("1 of 8");
    expect(out).toContain('id="home-tour-title"');
    expect(out).toContain("Welcome to Tradies2Quote");
    expect(out).toContain('id="home-tour-body"');
    expect(out).toContain("Show me around");
    expect(out).toContain("Skip tour");
    expect(out).not.toContain('data-testid="home-tour-back"');
    // The whole screen dimmed, no spotlight box.
    expect(out).toContain("inset-0 bg-ui-scrim");
  });

  it("a stop: the spotlight over its target, Back and Next", () => {
    const out = view("jobs", 2, { hole: { top: 774, left: 72, width: 90, height: 76 }, top: 550, left: 16 });
    expect(out).toContain("3 of 8");
    expect(out).toContain('data-testid="home-tour-back"');
    expect(out).toContain(">Next<");
    expect(out).toMatch(/data-testid="home-tour-spotlight"[^>]*style="top:774px;left:72px;width:90px;height:76px"/);
  });

  it("the last stop: Let's go and Close", () => {
    const out = view("setup", 7);
    expect(out).toContain("8 of 8");
    expect(out).toContain("Let’s go");
    expect(out).toContain(">Close<");
  });

  it("hidden until it's placed", () => {
    expect(view("new", 1, null)).toMatch(/data-tour-card=""[^>]*class="[^"]*\binvisible\b/);
  });

  it("follows the new look's design rules, and its motion stops for Reduce Motion", () => {
    for (const out of [view("welcome", 0), view("jobs", 2, { hole: { top: 1, left: 1, width: 10, height: 10 }, top: 0, left: 0 }), view("setup", 7)]) {
      expect(markupRuleBreaks(out)).toEqual([]);
      expect(out).toContain("motion-reduce:animate-none");
    }
  });
});
