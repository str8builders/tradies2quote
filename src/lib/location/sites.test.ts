// Client addresses to job sites: an address OpenStreetMap couldn't place is
// remembered and left alone for a while (Nominatim's usage policy), not
// looked up again on every Timesheet load.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => ({
  answers: {} as Record<string, { point: { lat: number; lng: number } } | { miss: "not_found" | "error" }>,
  asked: [] as string[],
}));

vi.mock("./street-geocode", () => ({
  lookUpStreet: vi.fn(async (address: string) => {
    lookup.asked.push(address);
    return lookup.answers[address] ?? { miss: "not_found" };
  }),
}));

import { MISS_RETRY_MS, loadJobSites, needsLookup, type SiteMiss } from "./sites";

type Write = { table: string; op: "upsert" | "delete"; row?: unknown; filter?: [string, unknown] };

function fakeDb(tables: Record<string, { data: unknown; error?: unknown }>) {
  const writes: Write[] = [];
  const from = (table: string) => {
    const answer = () => Promise.resolve({ data: tables[table]?.data ?? [], error: tables[table]?.error ?? null });
    const builder = {
      select: () => builder,
      eq: () => builder,
      limit: () => builder,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => answer().then(resolve, reject),
      upsert: (row: unknown) => {
        writes.push({ table, op: "upsert", row });
        return Promise.resolve({ error: null });
      },
      delete: () => ({
        eq: (column: string, value: unknown) => {
          writes.push({ table, op: "delete", filter: [column, value] });
          return Promise.resolve({ error: null });
        },
      }),
    };
    return builder;
  };
  return { db: { from } as unknown as Parameters<typeof loadJobSites>[0], writes };
}

const NOW = Date.parse("2026-09-29T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const miss = (over: Partial<SiteMiss> = {}): SiteMiss => ({
  client_id: "c1",
  address: "14 Kauri Street, Tauranga",
  reason: "not_found",
  failed_at: new Date(NOW - DAY).toISOString(),
  ...over,
});

describe("needsLookup", () => {
  const client = { address: "14 Kauri Street, Tauranga" };

  it("an address with no site yet: look it up", () => {
    expect(needsLookup(client, undefined, undefined, NOW)).toBe(true);
  });

  it("too short to be a street, pinned, or already found for this address: no", () => {
    expect(needsLookup({ address: " Tga " }, undefined, undefined, NOW)).toBe(false);
    expect(needsLookup(client, { source: "pinned", address: null }, undefined, NOW)).toBe(false);
    expect(needsLookup(client, { source: "geocoded", address: client.address }, undefined, NOW)).toBe(false);
    expect(needsLookup(client, { source: "geocoded", address: "1 Old Road" }, undefined, NOW)).toBe(true);
  });

  it("couldn't be found: left for a week", () => {
    expect(needsLookup(client, undefined, miss({ failed_at: new Date(NOW - 6 * DAY).toISOString() }), NOW)).toBe(false);
    expect(needsLookup(client, undefined, miss({ failed_at: new Date(NOW - MISS_RETRY_MS.not_found).toISOString() }), NOW)).toBe(true);
  });

  it("the service had trouble: tried again after a day", () => {
    const hiccup = (ago: number) => miss({ reason: "error", failed_at: new Date(NOW - ago).toISOString() });
    expect(needsLookup(client, undefined, hiccup(DAY / 2), NOW)).toBe(false);
    expect(needsLookup(client, undefined, hiccup(DAY), NOW)).toBe(true);
  });

  it("the address changed since it failed: straight away", () => {
    expect(needsLookup({ address: "16 Kauri Street, Tauranga" }, undefined, miss(), NOW)).toBe(true);
  });
});

describe("loadJobSites looks up only what it should, and remembers misses", () => {
  beforeEach(() => {
    lookup.answers = {};
    lookup.asked = [];
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const clients = [
    { id: "c1", name: "Hemi Walker", address: "14 Kauri Street, Tauranga" },
    { id: "c2", name: "K. Patel", address: "Somewhere Remote Rd" },
  ];

  it("a recent miss isn't looked up again; a new address is; a new miss is saved", async () => {
    const { db, writes } = fakeDb({
      clients: { data: clients },
      job_sites: { data: [] },
      job_site_misses: { data: [miss()] },
    });
    lookup.answers["Somewhere Remote Rd"] = { miss: "not_found" };
    const sites = await loadJobSites(db, "owner", { country: "NZ" });
    expect(lookup.asked).toEqual(["Somewhere Remote Rd"]);
    expect(sites).toEqual([]);
    expect(writes).toEqual([
      {
        table: "job_site_misses",
        op: "upsert",
        row: { client_id: "c2", owner_id: "owner", address: "Somewhere Remote Rd", reason: "not_found", failed_at: new Date(NOW).toISOString() },
      },
    ]);
  });

  it("found after an old miss: the site is saved and the miss cleared", async () => {
    const { db, writes } = fakeDb({
      clients: { data: [clients[0]] },
      job_sites: { data: [] },
      job_site_misses: { data: [miss({ failed_at: new Date(NOW - 8 * DAY).toISOString() })] },
    });
    lookup.answers["14 Kauri Street, Tauranga"] = { point: { lat: -37.6868, lng: 176.1654 } };
    const sites = await loadJobSites(db, "owner", { country: "NZ" });
    expect(sites.map((s) => [s.clientId, s.lat, s.lng])).toEqual([["c1", -37.6868, 176.1654]]);
    expect(writes.map((w) => [w.table, w.op])).toEqual([
      ["job_sites", "upsert"],
      ["job_site_misses", "delete"],
    ]);
  });

  it("the service struggling: saved as a short miss and nothing more is asked this time", async () => {
    const { db, writes } = fakeDb({
      clients: { data: clients },
      job_sites: { data: [] },
      job_site_misses: { data: [] },
    });
    lookup.answers["14 Kauri Street, Tauranga"] = { miss: "error" };
    await loadJobSites(db, "owner", { country: "NZ" });
    expect(lookup.asked).toEqual(["14 Kauri Street, Tauranga"]);
    expect(writes).toHaveLength(1);
    expect((writes[0].row as SiteMiss).reason).toBe("error");
  });

  it("before the migration (no misses table): looks up as before, and still works", async () => {
    const { db } = fakeDb({
      clients: { data: [clients[0]] },
      job_sites: { data: [] },
      job_site_misses: { data: null, error: { code: "42P01", message: 'relation "job_site_misses" does not exist' } },
    });
    lookup.answers["14 Kauri Street, Tauranga"] = { point: { lat: -37.6868, lng: 176.1654 } };
    const sites = await loadJobSites(db, "owner", { country: "NZ" });
    expect(sites).toHaveLength(1);
  });

  it("no lookups at all when asked not to (page loads)", async () => {
    const { db } = fakeDb({ clients: { data: clients }, job_sites: { data: [] } });
    await loadJobSites(db, "owner", { geocode: false });
    expect(lookup.asked).toEqual([]);
  });
});
