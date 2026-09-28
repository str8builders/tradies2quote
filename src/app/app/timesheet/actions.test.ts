// Saving hours twice (the first answer lost to a bad signal) never adds them
// twice: new hours carry an id made on the phone, and a retry changes that
// row; a new client made by a save whose hours failed is handed back so the
// next try uses it instead of making another.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeOp, FakeResult } from "@/test/fake-supabase";

const env = vi.hoisted(() => ({
  respond: (() => undefined) as (op: FakeOp) => FakeResult,
  rpc: vi.fn(),
  ops: [] as FakeOp[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/team", () => ({ getTeamContext: async () => ({ clientOwnerId: "owner" }) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabase } = await import("@/test/fake-supabase");
  return {
    createClient: async () => {
      const fake = fakeSupabase((op) => env.respond(op));
      env.ops = fake.ops;
      return {
        from: fake.from,
        rpc: env.rpc,
        auth: { getUser: async () => ({ data: { user: { id: "me" } } }) },
      };
    },
  };
});

import { saveTimeEntry, type EntryInput } from "./actions";

const NEW_ID = "7b0c1f2e-3d4a-4b5c-8d6e-9f0a1b2c3d4e";
const CLIENT = "0f1e2d3c-4b5a-4968-8776-655443322110";
const input = (over: Partial<EntryInput> = {}): EntryInput => ({
  workDate: "2026-09-29",
  start: "07:00",
  finish: "15:30",
  breakMinutes: 30,
  note: "Framing",
  ...over,
});

const writes = () => env.ops.filter((op) => op.action !== "select");
const eq = (op: FakeOp, column: string) => op.filters.find(([m, c]) => m === "eq" && c === column)?.[2];

beforeEach(() => {
  env.rpc.mockReset();
  env.ops = [];
  env.respond = (op) => {
    if (op.action === "select") return { data: null };
    return { data: [{ id: NEW_ID }] };
  };
});

describe("saveTimeEntry: new hours", () => {
  it("saved with the id made on the phone, for the business", async () => {
    expect(await saveTimeEntry(input({ newId: NEW_ID, clientId: CLIENT }))).toEqual({ ok: true });
    const [insert] = writes();
    expect(insert.action).toBe("insert");
    expect(insert.values).toMatchObject({ id: NEW_ID, owner_id: "owner", user_id: "me", client_id: CLIENT, start_time: "07:00" });
  });

  it("tapped again after the answer was lost: that row is changed, not added again", async () => {
    env.respond = (op) => {
      if (op.action === "select") return { data: { id: NEW_ID, client_id: null } };
      return { data: [{ id: NEW_ID }] };
    };
    expect(await saveTimeEntry(input({ newId: NEW_ID, finish: "16:00" }))).toEqual({ ok: true });
    const changes = writes();
    expect(changes.map((op) => op.action)).toEqual(["update"]);
    expect(eq(changes[0], "id")).toBe(NEW_ID);
    expect(eq(changes[0], "user_id")).toBe("me");
    expect(changes[0].values).toMatchObject({ end_time: "16:00" });
  });

  it("a retry with a new client uses the client the first save made", async () => {
    env.respond = (op) => {
      if (op.action === "select") return { data: { id: NEW_ID, client_id: CLIENT } };
      return { data: [{ id: NEW_ID }] };
    };
    expect(await saveTimeEntry(input({ newId: NEW_ID, newClientName: "Hemi Walker" }))).toEqual({ ok: true });
    expect(env.rpc).not.toHaveBeenCalled();
    expect(writes()[0].values).toMatchObject({ client_id: CLIENT });
  });

  it("two tries crossed and the other saved first: this one changes that row", async () => {
    env.respond = (op) => {
      if (op.action === "select") return { data: null };
      if (op.action === "insert") return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      return { data: [{ id: NEW_ID }] };
    };
    expect(await saveTimeEntry(input({ newId: NEW_ID }))).toEqual({ ok: true });
    const changes = writes();
    expect(changes.map((op) => op.action)).toEqual(["insert", "update"]);
    expect(eq(changes[1], "id")).toBe(NEW_ID);
  });

  it("a new client saved but the hours not: the client comes back for the next try", async () => {
    env.rpc.mockResolvedValue({ data: { id: CLIENT }, error: null });
    env.respond = (op) => {
      if (op.action === "select") return { data: null };
      return { error: { code: "08006", message: "connection failure" } };
    };
    const result = await saveTimeEntry(input({ newId: NEW_ID, newClientName: "Hemi Walker" }));
    expect(result).toEqual({ ok: false, error: "Couldn't save those hours. Check your signal and try again.", clientId: CLIENT });
    expect(env.rpc).toHaveBeenCalledOnce();
  });

  it("from an older page (no id made on the phone): saved as before", async () => {
    expect(await saveTimeEntry(input())).toEqual({ ok: true });
    const [insert] = writes();
    expect(insert.action).toBe("insert");
    expect(insert.values).not.toHaveProperty("id");
    expect(env.ops.some((op) => op.action === "select" && op.table === "time_entries" && op.terminal === "maybeSingle")).toBe(false);
  });

  it("a made-up id is refused before anything is read or written", async () => {
    const result = await saveTimeEntry(input({ newId: "not-a-uuid" }));
    expect(result.ok).toBe(false);
    expect(env.ops).toEqual([]);
  });
});

describe("saveTimeEntry: changing hours", () => {
  it("changes your own row by its id (a new id is ignored)", async () => {
    expect(await saveTimeEntry(input({ id: NEW_ID, newId: CLIENT }))).toEqual({ ok: true });
    const changes = writes();
    expect(changes.map((op) => op.action)).toEqual(["update"]);
    expect(eq(changes[0], "id")).toBe(NEW_ID);
  });

  it("hours on an invoice can't be changed", async () => {
    env.respond = () => ({ data: [] });
    expect(await saveTimeEntry(input({ id: NEW_ID }))).toEqual({
      ok: false,
      error: "Those hours are on an invoice now, so they can't be changed.",
    });
  });
});
