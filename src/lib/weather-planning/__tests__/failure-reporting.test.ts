import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiError } from "@/lib/ai/errors";

/**
 * Weather planning swallowed two failure classes with a console.error only:
 * Pat/Willa failing inside assessJob (best-effort, the deterministic
 * assessment still stands) and a whole job failing inside the cron sweep.
 * Both now reach the internal error monitor.
 */

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  runPat: vi.fn(),
  assessJob: null as null | ((...args: unknown[]) => Promise<unknown>),
  tables: {} as Record<string, { single?: unknown; list?: unknown[] }>,
}));

vi.mock("@/lib/observability", () => ({ captureError: h.capture }));
vi.mock("@/lib/agents/pat", () => ({ runPat: h.runPat }));
vi.mock("@/lib/agents/willa", () => ({ runWilla: vi.fn() }));
vi.mock("../provider", () => ({
  fetchForecastForWindow: async () => ({
    provider: "open_meteo",
    generated_at: "2026-09-26T00:00:00Z",
    job_id: "q-1",
    latitude: -37.7,
    longitude: 176.1,
    timezone: "UTC",
    window: { start: "2026-09-27T19:00:00Z", end: "2026-09-28T05:00:00Z" },
    hourly: [],
    alerts: [],
  }),
}));
vi.mock("../risk-engine", () => ({
  evaluateJobWeather: () => ({
    risk_level: "high",
    risk_types: ["rain"],
    triggers_fired: [],
    summary: "Heavy rain",
    recommended_action: "reschedule",
    customer_comms_needed: false,
    pat_should_run: true,
    willa_should_run: false,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      const chain = () => b;
      const answer = () => ({ data: h.tables[table]?.single ?? null, error: null });
      Object.assign(b, {
        select: chain, eq: chain, gt: chain, gte: chain, lt: chain, neq: chain, order: chain, limit: chain,
        insert: chain, upsert: chain, update: chain,
        single: async () => answer(),
        maybeSingle: async () => answer(),
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: h.tables[table]?.list ?? [], error: null }).then(res),
      });
      return b;
    },
  }),
}));

import { assessJob } from "../assess";

beforeEach(() => {
  h.capture.mockReset();
  h.runPat.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  h.tables = {
    quotes: {
      single: { id: "q-1", user_id: "u-1", status: "scheduled", scheduled_for: "2026-09-27T20:00:00Z", client_id: null, quote_data: { job_summary: "Build a deck" } },
      list: [],
    },
    quote_site_context: {
      single: { quote_id: "q-1", job_type: "decking", indoor_outdoor: "outdoor", latitude: -37.7, longitude: 176.1, timezone: "Pacific/Auckland", geocoded_address: "Tauranga" },
    },
    job_weather_assessments: { single: { id: "a-1" } },
  };
});

describe("weather planning failure reporting", () => {
  it("reports a Pat failure but keeps the stored assessment", async () => {
    h.runPat.mockRejectedValueOnce(new AiError({ kind: "overloaded", provider: "anthropic", status: 529, attempts: 3 }));
    const result = await assessJob({ quoteId: "q-1", userId: "u-1", triggerSource: "evening", apiKey: "k" });
    expect(result).toMatchObject({ status: "assessed", assessmentId: "a-1", pat: null });
    expect(h.runPat).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledWith(expect.any(AiError), { route: "weather-planning/assess" });
  });
});

describe("weather sweep failure reporting", () => {
  it("reports a job that throws and carries on", async () => {
    vi.resetModules();
    vi.doMock("../assess", () => ({
      assessJob: async ({ quoteId }: { quoteId: string }) => {
        if (quoteId === "bad") throw new Error("store assessment failed: boom");
        return { status: "skipped", reason: "no_date" };
      },
    }));
    h.tables.quotes = { list: [{ id: "bad", user_id: "u-1", scheduled_for: "x" }, { id: "ok", user_id: "u-1", scheduled_for: "y" }] };
    const { runWeatherSweep } = await import("../cron");
    const now = new Date().toISOString();
    const out = await runWeatherSweep({ triggerSource: "evening", fromISO: now, toISO: now, now });
    expect(out).toMatchObject({ scanned: 2, errors: 1, skipped: 1 });
    expect(h.capture).toHaveBeenCalledWith(expect.any(Error), { route: "weather-planning/cron:evening" });
    vi.doUnmock("../assess");
  });
});
