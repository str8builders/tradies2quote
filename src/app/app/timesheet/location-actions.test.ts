// Location actions: the business's own time zone (kept from the phone only
// when it's in the business's country, and used for clocking out), whose
// state the page gets, and which failures are worth another go.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeOp, FakeResult } from "@/test/fake-supabase";

const env = vi.hoisted(() => ({
  respond: (() => undefined) as (op: FakeOp) => FakeResult,
  rpc: vi.fn(),
  ops: [] as FakeOp[],
  captured: [] as unknown[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/observability", () => ({ captureError: (e: unknown) => void env.captured.push(e) }));
vi.mock("@/lib/team", () => ({ getTeamContext: async () => ({ clientOwnerId: "me" }) }));
vi.mock("@/lib/location/sites", () => ({ loadJobSites: async () => [], geofenceSites: async () => [] }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabase } = await import("@/test/fake-supabase");
  return {
    createClient: async () => {
      const fake = fakeSupabase((op) => env.respond(op));
      env.ops = fake.ops;
      return { from: fake.from, rpc: env.rpc, auth: { getUser: async () => ({ data: { user: { id: "me" } } }) } };
    },
  };
});

import { clockIn, clockOut, getLocationState, saveDeviceTimeZone } from "./location-actions";

/** A profile in a country, with a saved zone (or none, or no such column yet). */
function profile(country: string, currency: string, stored: string | null | "missing") {
  return (op: FakeOp): FakeResult => {
    if (op.table === "profiles" && op.action === "select" && op.columns === "time_zone") {
      return stored === "missing"
        ? { error: { code: "42703", message: "column profiles.time_zone does not exist" } }
        : { data: { time_zone: stored } };
    }
    if (op.table === "profiles" && op.action === "select") return { data: { country, currency } };
    if (op.table === "profiles" && op.action === "update") {
      return stored === "missing" ? { error: { code: "PGRST204", message: "Could not find the 'time_zone' column" } } : {};
    }
    return { data: null };
  };
}

const zoneWrites = () => env.ops.filter((op) => op.table === "profiles" && op.action === "update");

beforeEach(() => {
  env.rpc.mockReset();
  env.ops = [];
  env.captured = [];
  env.respond = profile("NZ", "NZD", null);
});

describe("saveDeviceTimeZone", () => {
  it("a phone in Perth for a business in Australia: saved, and pages should re-read their days", async () => {
    env.respond = profile("AU", "AUD", null);
    expect(await saveDeviceTimeZone("Australia/Perth")).toEqual({ ok: true, changed: true });
    expect(zoneWrites()).toHaveLength(1);
    expect(zoneWrites()[0].values).toEqual({ time_zone: "Australia/Perth" });
    expect(zoneWrites()[0].filters).toContainEqual(["eq", "id", "me"]);
  });

  it("already saved: nothing written", async () => {
    env.respond = profile("AU", "AUD", "Australia/Perth");
    expect(await saveDeviceTimeZone("Australia/Perth")).toEqual({ ok: true, changed: false });
    expect(zoneWrites()).toEqual([]);
  });

  it("on holiday abroad: the business stays where it is", async () => {
    env.respond = profile("NZ", "NZD", null);
    expect(await saveDeviceTimeZone("Asia/Makassar")).toEqual({ ok: true, changed: false });
    expect(await saveDeviceTimeZone("Australia/Sydney")).toEqual({ ok: true, changed: false });
    expect(zoneWrites()).toEqual([]);
  });

  it("not a real zone: refused before anything is read", async () => {
    expect(await saveDeviceTimeZone("Mars/Olympus_Mons")).toEqual({ ok: false, changed: false });
    expect(await saveDeviceTimeZone("+12:00")).toEqual({ ok: false, changed: false });
    expect(env.ops).toEqual([]);
  });

  it("before the migration (no column): quietly nothing, and no error report", async () => {
    env.respond = profile("US", "USD", "missing");
    expect(await saveDeviceTimeZone("America/Denver")).toEqual({ ok: false, changed: false });
    expect(env.captured).toEqual([]);
  });

  it("any other failure is reported", async () => {
    env.respond = (op) =>
      op.action === "update" ? { error: { code: "57014", message: "canceling statement" } } : profile("US", "USD", null)(op);
    expect(await saveDeviceTimeZone("America/Denver")).toEqual({ ok: false, changed: false });
    expect(env.captured).toHaveLength(1);
  });
});

describe("the saved zone is the business's zone", () => {
  it("the page's state: yours (your account), in the saved zone", async () => {
    env.respond = profile("AU", "AUD", "Australia/Perth");
    const state = await getLocationState();
    expect(state.userId).toBe("me");
    expect(state.timeZone).toBe("Australia/Perth");
  });

  it("no saved zone yet (or no column yet): the country's, as before", async () => {
    env.respond = profile("AU", "AUD", "missing");
    expect((await getLocationState()).timeZone).toBe("Australia/Sydney");
  });

  it("clocking out writes the hours in the saved zone", async () => {
    env.respond = profile("AU", "AUD", "Australia/Perth");
    env.rpc.mockResolvedValue({ data: { session_id: "s1", time_entry_id: "e1" }, error: null });
    expect(await clockOut({ breakMinutes: 30 })).toEqual({ ok: true, value: { place: null } });
    expect(env.rpc).toHaveBeenCalledWith("clock_out", expect.objectContaining({ p_time_zone: "Australia/Perth", p_break_minutes: 30 }));
  });
});

describe("which failures are worth another go (the phone keeps its saved arrival or departure)", () => {
  const failWith = (message: string) => env.rpc.mockResolvedValue({ data: null, error: { message } });

  it("clocking in: definite answers aren't retried", async () => {
    failWith("Already clocked in");
    expect(await clockIn({ source: "auto" })).toEqual({ ok: false, error: "You're already clocked in." });
    failWith("That start time is out of range");
    expect(await clockIn({ source: "auto" })).toEqual({ ok: false, error: "That start time is too long ago." });
    failWith("Client not found");
    expect(await clockIn({ source: "auto" })).toEqual({ ok: false, error: "That client isn't in the client list any more." });
  });

  it("clocking in: a hiccup is", async () => {
    failWith("canceling statement due to lock timeout");
    expect(await clockIn({ source: "auto" })).toMatchObject({ ok: false, retry: true });
  });

  it("clocking out: definite answers aren't retried, a hiccup is", async () => {
    failWith("Not clocked in");
    expect(await clockOut({})).toEqual({ ok: false, error: "You're not clocked in." });
    failWith("That session is over 24 hours");
    expect(await clockOut({})).toEqual({
      ok: false,
      error: "That's more than 24 hours after you started: pick the time you finished.",
    });
    failWith("Clocked in over midnight: add the hours by hand");
    expect((await clockOut({})).ok).toBe(false);
    failWith("could not serialize access");
    expect(await clockOut({})).toMatchObject({ ok: false, retry: true });
  });
});
