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
  quotes: [] as unknown[],
  site: null as unknown,
  geocoded: null as Geocoded | null,
  clients: 0,
}));

vi.mock("@/lib/supabase/auth", () => ({ getCachedAuthUser: async () => ({ user: env.user, error: null }) }));
vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => env.newLook }));
vi.mock("@/lib/weather-planning/geocode", () => ({ geocodeAddress: vi.fn(async () => env.geocoded) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeBoardDb } = await import("@/test/fake-board-db");
  return {
    createClient: async () => {
      env.clients += 1;
      return fakeBoardDb({ quotes: () => ({ data: env.quotes }), quote_site_context: () => ({ data: env.site }) });
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

const ROWS = [
  { id: "q-1", status: "draft", scheduled_for: null, quote_data: { job_summary: "New fence", client: { address: "4 Hill St, Katikati" } } },
  { id: "q-2", status: "scheduled", scheduled_for: "2026-09-30", quote_data: { job_summary: "Deck rebuild", client: { address: "12 Beach Rd, Tauranga" } } },
  { id: "q-3", status: "draft", scheduled_for: null, quote_data: { job_summary: "No address yet", client: {} } },
];

// Scheduled jobs first; a quote with no client address isn't offered.
const JOBS = [
  { id: "q-2", label: "Deck rebuild — 12 Beach Rd, Tauranga", address: "12 Beach Rd, Tauranga", scheduled: true },
  { id: "q-1", label: "New fence — 4 Hill St, Katikati", address: "4 Hill St, Katikati", scheduled: false },
];

beforeEach(() => {
  env.newLook = false;
  env.user = { id: "user-1", email: "sam@bayside.co.nz" };
  env.quotes = ROWS;
  env.site = null;
  env.geocoded = null;
  env.clients = 0;
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
