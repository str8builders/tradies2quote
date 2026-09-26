// loadTimesheet against a scripted database: each entry gets its job site
// (saved sites only, never looked up on page load), the client's address
// when there's no site, and where the clock-in and finish were.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Answer = { data: unknown; error?: unknown };
interface Query {
  table: string;
  columns: string;
  filters: Array<[string, string, unknown]>;
}

const db = vi.hoisted(() => ({
  answers: {} as Record<string, Answer>,
  queries: [] as Query[],
  writes: [] as string[],
}));

vi.mock("@/lib/team", () => ({ getTeamContext: async () => ({ clientOwnerId: "me" }) }));
vi.mock("@/lib/location/street-geocode", () => ({
  geocodeStreet: vi.fn(async () => {
    throw new Error("no lookups on page load");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => ({ data: { members: [] }, error: null }),
    from(table: string) {
      const query: Query = { table, columns: "", filters: [] };
      const answer = () => {
        db.queries.push(query);
        const a = db.answers[table] ?? { data: [] };
        return Promise.resolve({ data: a.data, error: a.error ?? null });
      };
      const filter = (method: string) => (column: string, value?: unknown) => {
        query.filters.push([method, column, value]);
        return builder;
      };
      const builder = {
        select: (columns: string) => {
          query.columns = columns;
          return builder;
        },
        eq: filter("eq"),
        gte: filter("gte"),
        lte: filter("lte"),
        in: filter("in"),
        order: () => builder,
        limit: () => builder,
        upsert: () => {
          db.writes.push(table);
          return Promise.resolve({ error: null });
        },
        maybeSingle: () => answer().then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data })),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => answer().then(resolve, reject),
      };
      return builder;
    },
  }),
}));

import { loadTimesheet } from "./load";

const row = (over: Record<string, unknown>) => ({
  id: "e1",
  owner_id: "me",
  user_id: "me",
  client_id: null,
  work_date: "2026-09-21",
  start_time: "07:00:00",
  end_time: "15:30:00",
  break_minutes: 30,
  note: null,
  invoice_id: null,
  session_id: null,
  ...over,
});

const HEMI = { lat: -37.6868, lng: 176.1654 };

beforeEach(() => {
  db.queries = [];
  db.writes = [];
  db.answers = {
    time_entries: {
      data: [
        row({ id: "e1", client_id: "c1", session_id: "s1" }),
        row({ id: "e2", client_id: "c2" }),
        row({ id: "e3", session_id: "s2" }),
        row({ id: "e4", client_id: "c3" }),
      ],
    },
    clients: {
      data: [
        { id: "c1", name: "Hemi Walker", email: null, address: "14 Kauri Street, Mount Maunganui", phone: null },
        { id: "c2", name: "K. Patel", email: null, address: "  22 Totara Rd, Tauranga ", phone: null },
        { id: "c3", name: "No Address Ltd", email: null, address: null, phone: null },
      ],
    },
    profiles: { data: { default_labour_rate: 80, tax_rate: 15, tax_label: "GST", currency: "NZD", country: "NZ" } },
    job_sites: {
      data: [
        { client_id: "c1", address: "14 Kauri St", latitude: HEMI.lat, longitude: HEMI.lng, radius_m: 150, source: "pinned" },
        { client_id: "gone", address: "1 Nowhere", latitude: -36.8, longitude: 174.7, radius_m: 150, source: "geocoded" },
      ],
    },
    work_sessions: {
      data: [
        { id: "s1", start_place: "At the Hemi Walker job", end_place: "At the Hemi Walker job", start_lat: -37.6869, start_lng: 176.1655, end_lat: -37.6867, end_lng: 176.1653 },
        { id: "s2", start_place: "Not at a job site", end_place: null, start_lat: -37.7, start_lng: 176.2, end_lat: null, end_lng: null },
      ],
    },
    location_points: { data: [] },
  };
});

const load = () => loadTimesheet({ userId: "me", weekStart: "2026-09-21", today: "2026-09-23" });
const byId = async () => new Map((await load()).entries.map((e) => [e.id, e]));

describe("loadTimesheet: where each entry's hours were", () => {
  it("a client with a job site: the site's point, with the client's current address", async () => {
    const e1 = (await byId()).get("e1")!;
    expect(e1.site).toEqual({ lat: HEMI.lat, lng: HEMI.lng, address: "14 Kauri Street, Mount Maunganui" });
    expect(e1.address).toBeNull();
  });

  it("clocked in and out with location on: both points (and the words, as before)", async () => {
    const e1 = (await byId()).get("e1")!;
    expect(e1.clockPoints).toEqual({ start: { lat: -37.6869, lng: 176.1655 }, end: { lat: -37.6867, lng: 176.1653 } });
    expect(e1.pins).toEqual({ start: "At the Hemi Walker job", end: "At the Hemi Walker job" });
  });

  it("a client with an address but no site yet: the address, tidied", async () => {
    const e2 = (await byId()).get("e2")!;
    expect(e2.site).toBeNull();
    expect(e2.address).toBe("22 Totara Rd, Tauranga");
    expect(e2.clockPoints).toBeNull();
  });

  it("no client, clocked in only: the start point alone", async () => {
    const e3 = (await byId()).get("e3")!;
    expect(e3.site).toBeNull();
    expect(e3.address).toBeNull();
    expect(e3.clockPoints).toEqual({ start: { lat: -37.7, lng: 176.2 }, end: null });
  });

  it("a client with neither: nothing", async () => {
    const e4 = (await byId()).get("e4")!;
    expect([e4.site, e4.address, e4.clockPoints]).toEqual([null, null, null]);
  });

  it("the business's saved sites, read once, with no address looked up on page load", async () => {
    await load();
    const sites = db.queries.filter((q) => q.table === "job_sites");
    expect(sites).toHaveLength(1);
    expect(sites[0].filters).toContainEqual(["eq", "owner_id", "me"]);
    expect(db.writes).toEqual([]);
    const sessions = db.queries.find((q) => q.table === "work_sessions")!;
    expect(sessions.columns).toContain("start_lat, start_lng, end_lat, end_lng");
  });

  it("a week with no client hours doesn't read the sites at all", async () => {
    db.answers.time_entries = { data: [row({ id: "e9" })] };
    const data = await load();
    expect(data.entries[0].site).toBeNull();
    expect(db.queries.some((q) => q.table === "job_sites")).toBe(false);
  });

  it("sites that can't be read: hours still load, with the address to go on", async () => {
    db.answers.job_sites = { data: null, error: { message: "permission denied" } };
    const e1 = (await byId()).get("e1")!;
    expect(e1.site).toBeNull();
    expect(e1.address).toBe("14 Kauri Street, Mount Maunganui");
  });
});
