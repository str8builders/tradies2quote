// Markup contracts for the new-look Home (rendered to static HTML in node,
// like the kit's tests), plus its data step against a scripted database.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/weather-impact/outlook", () => ({ getWeekOutlook: vi.fn() }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { fakeBoardDb } from "@/test/fake-board-db";
import { NOW, daysAgo } from "../lib/fixtures";
import type { MoneyTotal, Todo } from "../lib/home-todos";
import { setupSteps } from "../lib/setup-steps";
import { weatherLine } from "../lib/weather-line";
import { HomeView, MoneyTiles, TodoCard, type HomeViewProps } from "./HomeParts";
import { loadHomeData } from "./NewHome";
import { WeatherLineView } from "./WeatherLine";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const count = (markup: string, fragment: string) => markup.split(fragment).length - 1;
/** Every opening <a> tag in the markup. */
const links = (markup: string) => markup.match(/<a [^>]*>/g) ?? [];
/** The opening <a> tag pointing at `href`. */
const linkTo = (markup: string, href: string) => links(markup).find((a) => a.includes(`href="${href}"`)) ?? "";

function todo(n: number, over: Partial<Todo> = {}): Todo {
  return {
    key: `draft:q-${n}`,
    kind: "draft",
    title: "Quote ready to send",
    detail: `Client ${n} · $1,000.00`,
    action: { label: "Check and send", href: `/app/quotes/preview/q-${n}` },
    tone: "brand",
    ...over,
  };
}

const zero: MoneyTotal = { amount: 0, count: 0, currency: "NZD", otherCurrencies: 0 };

const base: HomeViewProps = {
  summary: "3 things need you today",
  setup: null,
  todos: [],
  hasJobs: true,
  tiles: null,
  failed: false,
};

describe("to-do cards", () => {
  it("one line of what happened, who and how much, and ONE action to the right place", () => {
    const out = html(
      <ul>
        <TodoCard
          todo={todo(1, {
            key: "overdue:inv-1",
            kind: "overdue",
            title: "$1,240.00 is 9 days late",
            detail: "Ben Walker · Fence repair",
            action: { label: "Send a reminder", href: "/app/quotes/preview/fence" },
            tone: "bad",
          })}
          primary
        />
      </ul>,
    );
    expect(out).toContain(">$1,240.00 is 9 days late</p>");
    expect(out).toContain("Ben Walker · Fence repair");
    expect(links(out)).toHaveLength(1);
    expect(linkTo(out, "/app/quotes/preview/fence")).toContain('aria-describedby="todo-overdue-inv-1"');
    expect(out).toContain('id="todo-overdue-inv-1"');
    expect(out).toContain('data-kind="overdue"');
    expect(out).toContain("bg-ui-bad-soft");
  });

  it("the first card's button is the orange one; the rest are secondary", () => {
    const out = html(<HomeView {...base} todos={[todo(1), todo(2), todo(3)]} />);
    const list = out.slice(out.indexOf('data-testid="home-todos"'));
    expect(count(out, 'data-variant="primary"')).toBe(1);
    expect(linkTo(list, "/app/quotes/preview/q-1")).toContain('data-variant="primary"');
    expect(linkTo(list, "/app/quotes/preview/q-2")).toContain('data-variant="secondary"');
    expect(linkTo(list, "/app/quotes/preview/q-3")).toContain('data-variant="secondary"');
  });

  it("six cards show; the rest are one tap away", () => {
    const out = html(<HomeView {...base} todos={Array.from({ length: 8 }, (_, i) => todo(i + 1))} />);
    expect(count(out, 'data-kind="draft"')).toBe(6);
    expect(out).toContain(">Show 2 more</span>");
  });
});

describe("Home states", () => {
  it("the photo hero says how much needs doing, then the quick actions", () => {
    const out = html(<HomeView {...base} todos={[todo(1)]} />);
    const hero = out.slice(out.indexOf('data-testid="home-hero"'), out.indexOf('data-testid="home-quick"'));
    expect(hero).toMatch(/<h2 id="home-summary"[^>]*>3 things need you today<\/h2>/);
    expect(hero).toContain("worksite.webp");
    expect(hero).toContain('alt=""');
    // The h1 is the top bar's (greeting); Home's own headings are h2s.
    expect(out).not.toContain("<h1");
    expect(links(out.slice(out.indexOf('data-testid="home-quick"'))).slice(0, 4).map((a) => /href="([^"]+)"/.exec(a)?.[1])).toEqual([
      "/app/quotes/new?start=talk",
      "/t2qcal/calculators",
      "/t2qcal/measure",
      "/app/materials/import-quote",
    ]);
    expect(out.indexOf('data-testid="home-quick"')).toBeLessThan(out.indexOf('data-testid="home-todos"'));
  });

  it("the hero shows what's owed only when something is", () => {
    const owed: MoneyTotal = { amount: 4820, count: 3, currency: "NZD", otherCurrencies: 0 };
    const withOwed = html(<HomeView {...base} tiles={{ owed, paidThisMonth: zero }} />);
    const hero = withOwed.slice(withOwed.indexOf('data-testid="home-hero"'), withOwed.indexOf('data-testid="home-quick"'));
    expect(hero).toContain("owed to you");
    const none = html(<HomeView {...base} tiles={{ owed: zero, paidThisMonth: zero }} />);
    expect(none.slice(none.indexOf('data-testid="home-hero"'), none.indexOf('data-testid="home-quick"'))).not.toContain(
      "owed to you",
    );
  });

  it("to-do cards carry a coloured stripe and a two-tone icon tile", () => {
    const out = html(<ul><TodoCard todo={todo(1, { tone: "bad" })} primary={false} /></ul>);
    expect(out).toMatch(/class="[^"]*\bbg-ui-bad"/);
    expect(out).toContain('data-tone="bad"');
  });

  it("a brand-new account: the setup card, no empty state, no money tiles", () => {
    const steps = setupSteps({ businessName: null, logoUrl: null, labourRate: null, pricedMaterials: 0, quoteCount: 0 });
    const out = html(<HomeView {...base} summary="Let's get you set up" setup={steps} hasJobs={false} />);
    expect(out).toContain('data-testid="setup-card"');
    expect(out).toContain("0 of 3 done");
    for (const href of ["/app/settings/business", "/app/settings/rates", "/app/quotes/new"]) {
      expect(out).toContain(`href="${href}"`);
    }
    // The next step stands out, and says so to screen readers.
    expect(out).toMatch(/data-step="business" data-done="false" class="[^"]*border-ui-brand/);
    expect(out).toContain("Next step.");
    expect(out).toMatch(/<button type="submit"[^>]*>.*Hide this/);
    expect(out).not.toContain("No jobs yet");
    expect(out).not.toContain('data-testid="money-tiles"');
  });

  it("setup ticks come from the data", () => {
    const steps = setupSteps({ businessName: "STR8", logoUrl: "x", labourRate: 85, pricedMaterials: 3, quoteCount: 0 });
    const out = html(<HomeView {...base} setup={steps} hasJobs={false} />);
    expect(out).toMatch(/data-step="business" data-done="true"/);
    expect(out).toMatch(/data-step="prices" data-done="false"/);
    expect(out).toContain("3 of 8 prices saved");
    expect(out).toContain('href="/app/materials/quick-start"');
    expect(out).toContain("1 of 3 done");
  });

  it("nothing to do: all caught up, with the next useful step", () => {
    const out = html(<HomeView {...base} summary="Nothing needs you right now" />);
    expect(out).toMatch(/<h2 [^>]*>All caught up<\/h2>/);
    const primary = links(out).filter((a) => a.includes('data-variant="primary"'));
    expect(primary).toHaveLength(1);
    expect(primary[0]).toContain('href="/app/quotes/new"');
  });

  it("no jobs and the setup card hidden: an empty state that starts a quote", () => {
    const out = html(<HomeView {...base} hasJobs={false} />);
    expect(out).toContain("No jobs yet");
  });

  it("the jobs didn't load: says so, with a way to retry, and no made-up board", () => {
    const out = html(<HomeView {...base} failed todos={[]} />);
    expect(out).toContain("Couldn&#x27;t load your jobs");
    expect(out).not.toContain("All caught up");
  });
});

describe("money tiles", () => {
  it("owed to you and paid this month, each opening its Jobs filter", () => {
    const out = html(
      <MoneyTiles
        owed={{ amount: 6070, count: 3, currency: "NZD", otherCurrencies: 0 }}
        paidThisMonth={{ amount: 12480, count: 7, currency: "NZD", otherCurrencies: 1 }}
      />,
    );
    expect(out).toMatch(/<a [^>]*href="\/app\/jobs\?show=unpaid"[^>]*>.*Owed to you.*\$6,070\.00.*3 invoices out/);
    expect(out).toMatch(/<a [^>]*href="\/app\/jobs\?show=done"[^>]*>.*Paid this month.*\$12,480\.00.*7 invoices paid, and 1 in another currency/);
  });

  it("nothing yet reads plainly", () => {
    const out = html(<MoneyTiles owed={zero} paidThisMonth={zero} />);
    expect(out).toContain("Nothing owed");
    expect(out).toContain("Nothing yet");
  });
});

describe("weather line", () => {
  const day = {
    date: "2026-09-25",
    status: "caution" as const,
    condition: "rain" as const,
    tempMaxC: 16.6,
    rainProbabilityMaxPct: 60,
    windGustMaxKph: 20,
    reason: "Rain 60%",
  };

  it("reads as one line in plain words", () => {
    expect(weatherLine(day, "Tauranga").text).toBe("Tauranga today: take care, rain 60% · 17°");
    expect(weatherLine({ ...day, status: "safe", reason: "Good to work" }, "Tauranga").text).toBe(
      "Tauranga today: good to work · 17°",
    );
    expect(weatherLine({ ...day, status: "unsafe", reason: "Gusts 52 kph", tempMaxC: null }, "").text).toBe(
      "Today: not safe outside, gusts 52 kph",
    );
  });

  it("links to the weather page when that feature is on", () => {
    const line = weatherLine(day, "Tauranga");
    expect(html(<WeatherLineView line={line} href="/app/weather" />)).toMatch(/^<a [^>]*href="\/app\/weather"/);
    expect(html(<WeatherLineView line={line} href={null} />)).toMatch(/^<div /);
    expect(html(<WeatherLineView line={line} href={null} />)).toContain("bg-ui-warn-soft");
  });
});

describe("loadHomeData: the day, from real rows", () => {
  let answers: Record<string, { data?: unknown; count?: number; error?: unknown }>;

  beforeEach(() => {
    answers = {
      quotes: {
        data: [
          { id: "late", status: "completed", total_amount: 1000, currency: "NZD", created_at: daysAgo(30), client_name: "Ben Walker" },
          { id: "draft", status: "draft", total_amount: 3960, currency: "NZD", created_at: daysAgo(1), client_name: "Aroha Ngata" },
          { id: "paid", status: "completed", total_amount: 500, currency: "NZD", created_at: daysAgo(20) },
        ],
      },
      invoices: {
        data: [
          { id: "i-late", quote_id: "late", status: "sent", total_amount: 1150, currency: "NZD", due_date: daysAgo(4), created_at: daysAgo(12) },
          { id: "i-paid", quote_id: "paid", status: "paid", total_amount: 575, currency: "NZD", created_at: daysAgo(10), paid_at: daysAgo(2) },
        ],
      },
      profiles: {
        data: { business_name: "STR8", logo_url: "x", default_labour_rate: 85, address: "Tauranga", country: "NZ", currency: "NZD" },
      },
      materials: { count: 9 },
      quote_requests: { data: [] },
    };
  });

  it("builds the to-dos, tiles, greeting and weather target", async () => {
    const data = await loadHomeData({
      db: fakeBoardDb(answers),
      userId: "user-1",
      isOwner: false,
      now: NOW,
      setupDismissed: false,
    });
    expect(data.todos.map((t) => [t.kind, t.action.href])).toEqual([
      ["overdue", "/app/quotes/preview/late"],
      ["draft", "/app/quotes/preview/draft"],
    ]);
    expect(data.summary).toBe("2 things need you today");
    expect(data.tiles?.owed).toEqual({ amount: 1150, count: 1, currency: "NZD", otherCurrencies: 0 });
    expect(data.tiles?.paidThisMonth).toEqual({ amount: 575, count: 1, currency: "NZD", otherCurrencies: 0 });
    // Name, logo, rate, 9 prices and a quote: set up, so no card.
    expect(data.setup).toBeNull();
    expect(data.weather).toEqual({ address: "Tauranga", todayKey: "2026-09-25", href: "/app/weather" });
    expect(data.failed).toBe(false);
  });

  it("a fresh account gets the setup card and the set-up line", async () => {
    answers.quotes = { data: [] };
    answers.invoices = { data: [] };
    answers.profiles = { data: null };
    answers.materials = { count: 0 };
    const data = await loadHomeData({ db: fakeBoardDb(answers), userId: "u", isOwner: false, now: NOW, setupDismissed: false });
    expect(data.setup?.map((s) => s.done)).toEqual([false, false, false]);
    expect(data.summary).toBe("Let's get you set up");
    expect(data.tiles).toBeNull();
    expect(data.weather).toBeNull();
  });

  it("hidden setup card: not shown, and the materials count isn't read", async () => {
    answers.profiles = { data: null };
    const db = fakeBoardDb(answers);
    const data = await loadHomeData({ db, userId: "u", isOwner: false, now: NOW, setupDismissed: true });
    expect(data.setup).toBeNull();
    expect(db.queries.some((q) => q.table === "materials")).toBe(false);
  });

  it("a failed read shows the failure, not an empty board", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    answers.quotes = { error: { message: "timeout" } };
    const data = await loadHomeData({ db: fakeBoardDb(answers), userId: "u", isOwner: false, now: NOW, setupDismissed: false });
    expect(data.failed).toBe(true);
    expect(data.todos).toEqual([]);
    expect(data.setup).toBeNull();
    expect(data.tiles).toBeNull();
  });
});
