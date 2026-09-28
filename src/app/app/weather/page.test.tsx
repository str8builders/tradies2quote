// /app/weather: the jobs with a client address, and the picked job's site,
// are worked out on the server either way. With the new look on (always, in
// the iPhone app) they go to the new-look screen; off, to the old page as
// before. The page is called as a plain async function and its returned tree
// inspected (nothing is rendered or fetched for real).

import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Geocoded = { latitude: number; longitude: number; timezone: string | null; matchedName: string };

const env = vi.hoisted(() => ({
  newLook: false,
  user: { id: "user-1", email: "sam@bayside.co.nz" } as { id: string; email: string } | null,
  // Two buckets, matching the page's two queries — booked/upcoming
  // (status="scheduled") and everything else, newest first.
  scheduledRows: [] as unknown[],
  recentRows: [] as unknown[],
  site: null as unknown,
  profile: null as { country?: string | null } | null,
  geocoded: null as Geocoded | null,
  geocodeArgs: [] as unknown[],
  clients: 0,
  lastQueries: [] as import("@/test/fake-board-db").BoardDbQuery[],
}));

vi.mock("@/lib/supabase/auth", () => ({ getCachedAuthUser: async () => ({ user: env.user, error: null }) }));
vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => env.newLook }));
vi.mock("@/lib/weather-planning/geocode", () => ({
  geocodeAddress: vi.fn(async (args: unknown) => {
    env.geocodeArgs.push(args);
    return env.geocoded;
  }),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeBoardDb } = await import("@/test/fake-board-db");
  return {
    createClient: async () => {
      env.clients += 1;
      const db = fakeBoardDb({
        // The picker's two queries share a table name; tell them apart by
        // the status filter each one carries.
        quotes: (q) => {
          const scheduledOnly = q.filters.some(([m, c, v]) => m === "eq" && c === "status" && v === "scheduled");
          return { data: scheduledOnly ? env.scheduledRows : env.recentRows };
        },
        quote_site_context: () => ({ data: env.site }),
        profiles: () => ({ data: env.profile }),
      });
      env.lastQueries = db.queries;
      return db;
    },
  };
});
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => ({ push: vi.fn() }),
}));
// Only found in the tree, never rendered.
vi.mock("../_components/AppHeader", () => ({ AppHeader: () => null }));

import WeatherImpactPage from "./page";
import { AppHeader } from "../_components/AppHeader";
import { WeatherImpactClient } from "./_components/WeatherImpactClient";
import { WeatherScreen } from "./_newlook/WeatherScreen";

function find(node: unknown, type: unknown): ReactElement<Record<string, unknown>> | null {
  let found: ReactElement<Record<string, unknown>> | null = null;
  const visit = (value: unknown) => {
    if (found || !value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (!("props" in value)) return;
    const element = value as ReactElement<Record<string, unknown>>;
    if (element.type === type) found = element;
    for (const prop of Object.values(element.props ?? {})) visit(prop);
  };
  visit(node);
  return found;
}

const page = async (quote?: string) =>
  (await WeatherImpactPage({ searchParams: Promise.resolve(quote ? { quote } : {}) })) as ReactElement<
    Record<string, unknown>
  >;

/** The new-look screen's props, less the switch it adds, and the old client's: the same either way. */
async function bothLooks(quote?: string) {
  env.newLook = false;
  const old = find(await page(quote), WeatherImpactClient)?.props;
  env.newLook = true;
  const tree = await page(quote);
  expect(tree.type).toBe(WeatherScreen);
  const { enabled, ...fresh } = tree.props;
  expect(enabled).toBe(true);
  expect(fresh).toEqual(old);
  return fresh;
}

const SCHEDULED_ROWS = [
  { id: "q-2", status: "scheduled", scheduled_for: "2026-09-30", quote_data: { job_summary: "Deck rebuild", client: { address: "12 Beach Rd, Tauranga" } } },
];
const RECENT_ROWS = [
  { id: "q-1", status: "draft", scheduled_for: null, quote_data: { job_summary: "New fence", client: { address: "4 Hill St, Katikati" } } },
  { id: "q-3", status: "draft", scheduled_for: null, quote_data: { job_summary: "No address yet", client: {} } },
];

// Scheduled (booked/upcoming) jobs first; a quote with no client address isn't offered.
const JOBS = [
  { id: "q-2", label: "Deck rebuild — 12 Beach Rd, Tauranga", address: "12 Beach Rd, Tauranga", scheduled: true },
  { id: "q-1", label: "New fence — 4 Hill St, Katikati", address: "4 Hill St, Katikati", scheduled: false },
];

beforeEach(() => {
  env.newLook = false;
  env.user = { id: "user-1", email: "sam@bayside.co.nz" };
  env.scheduledRows = SCHEDULED_ROWS;
  env.recentRows = RECENT_ROWS;
  env.site = null;
  env.profile = null;
  env.geocoded = null;
  env.geocodeArgs = [];
  env.clients = 0;
  env.lastQueries = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/app/weather, the new-look switch", () => {
  it("off: the old page, its header and the outdoor safety net, as before", async () => {
    const tree = await page();
    expect(tree.props.className).toBe("min-h-screen text-white");
    expect(find(tree, AppHeader)?.props.context).toBe("Weather Impact");
    expect(find(tree, "main")?.props["data-legacy-body"]).toBe("");
    expect(find(tree, WeatherImpactClient)?.props).toEqual({
      jobOptions: JOBS,
      selectedQuoteId: null,
      jobLocation: null,
      geocodeFailed: false,
    });
    expect(find(tree, WeatherScreen)).toBeNull();
  });

  // What the screen draws (no old header, no safety-net marker) is pinned by
  // _newlook/WeatherImpact.render.test.tsx.
  it("on: the new-look screen, with the same jobs", async () => {
    env.newLook = true;
    const tree = await page();
    expect(tree.type).toBe(WeatherScreen);
    expect(tree.props).toEqual({
      enabled: true,
      jobOptions: JOBS,
      selectedQuoteId: null,
      jobLocation: null,
      geocodeFailed: false,
    });
    expect(find(tree, AppHeader)).toBeNull();
  });

  it("a job picked: the planning pipeline's coordinates first, the same site either way", async () => {
    env.site = { latitude: -37.69, longitude: 176.17, geocoded_address: "Tauranga, Bay of Plenty" };
    const props = await bothLooks("q-2");
    expect(props.selectedQuoteId).toBe("q-2");
    expect(props.jobLocation).toEqual({
      quoteId: "q-2",
      address: "12 Beach Rd, Tauranga",
      latitude: -37.69,
      longitude: 176.17,
      matchedName: "Tauranga, Bay of Plenty",
      resolvedFrom: "site_context",
    });
    expect(props.geocodeFailed).toBe(false);
    // Coordinates already on record → never re-geocoded.
    expect(env.geocodeArgs).toEqual([]);
  });

  it("a job with no stored coordinates: its address is placed now, or flagged when it can't be", async () => {
    env.geocoded = { latitude: -37.55, longitude: 175.93, timezone: "Pacific/Auckland", matchedName: "Katikati" };
    const placed = await bothLooks("q-1");
    expect(placed.jobLocation).toEqual({
      quoteId: "q-1",
      address: "4 Hill St, Katikati",
      latitude: -37.55,
      longitude: 175.93,
      matchedName: "Katikati",
      resolvedFrom: "geocoded_now",
    });

    env.geocoded = null;
    const lost = await bothLooks("q-1");
    expect(lost.jobLocation).toBeNull();
    expect(lost.geocodeFailed).toBe(true);
  });

  it("geocoding a job with no stored coordinates prefers a match in the business's own country", async () => {
    env.profile = { country: "AU" };
    env.geocoded = { latitude: -37.55, longitude: 175.93, timezone: "Pacific/Auckland", matchedName: "Katikati" };
    await page("q-1");
    expect(env.geocodeArgs.at(-1)).toMatchObject({ address: "4 Hill St, Katikati", country: "AU" });
  });

  it("the most relevant jobs first: booked/upcoming, then newest — never the oldest on record", async () => {
    // The bug this regresses: a single query ordered by scheduled_for
    // ascending with limit(40) could fill the whole page with the OLDEST
    // scheduled dates on record (completed jobs keep their job date), and a
    // recent draft or a later-dated booking would never be reached at all.
    const oldCompletedJobs = Array.from({ length: 45 }, (_, i) => ({
      id: `old-${i}`,
      status: "completed",
      scheduled_for: "2020-01-01",
      quote_data: { job_summary: `Old job ${i}`, client: { address: `${i} Old Rd, Tauranga` } },
    }));
    env.recentRows = [RECENT_ROWS[0], ...oldCompletedJobs]; // the recent draft, then 45 old completed jobs
    const props = await bothLooks();
    const jobOptions = props.jobOptions as typeof JOBS;
    expect(jobOptions).toHaveLength(20); // capped, even with 46 eligible rows
    expect(jobOptions[0]).toEqual(JOBS[0]); // the booked job, still first
    expect(jobOptions[1]).toEqual(JOBS[1]); // the recent draft — not one of the 45 old jobs
  });

  it("the picker's own queries exclude deleted jobs and split scheduled from the rest", async () => {
    await page();
    const quotesQueries = env.lastQueries.filter((q) => q.table === "quotes");
    expect(quotesQueries).toHaveLength(2);
    for (const q of quotesQueries) {
      expect(q.filters).toContainEqual(["is", "deleted_at", null]);
      expect(q.filters).toContainEqual(["eq", "user_id", "user-1"]);
    }
    expect(quotesQueries[0].filters).toContainEqual(["eq", "status", "scheduled"]);
    expect(quotesQueries[1].filters).toContainEqual(["neq", "status", "scheduled"]);
  });

  it("on, parked for this account: the screen says so, and nothing is looked up", async () => {
    vi.stubEnv("T2Q_WEATHER_IMPACT", "0");
    env.newLook = true;
    const tree = await page("q-2");
    expect(tree.type).toBe(WeatherScreen);
    expect(tree.props).toEqual({
      enabled: false,
      jobOptions: [],
      selectedQuoteId: "q-2",
      jobLocation: null,
      geocodeFailed: false,
    });
    expect(env.clients).toBe(0);
  });

  it("signed out goes to the login page either way", async () => {
    env.user = null;
    await expect(page()).rejects.toThrow("NEXT_REDIRECT /login");
    env.newLook = true;
    await expect(page()).rejects.toThrow("NEXT_REDIRECT /login");
  });
});
