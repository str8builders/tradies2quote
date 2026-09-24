import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp, type FakeResult } from "@/test/fake-supabase";

const env = vi.hoisted(() => ({
  user: null as { id: string; email: string | null } | null,
  respond: (() => undefined) as (op: FakeOp) => FakeResult,
  db: null as ReturnType<typeof fakeSupabase> | null,
  revalidated: [] as unknown[][],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => void env.revalidated.push(args),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    env.db = fakeSupabase((op) => env.respond(op));
    return {
      auth: { getUser: async () => ({ data: { user: env.user } }) },
      from: env.db.from,
    };
  },
}));
// newLook.ts reads the user through this for its helper; the action does not.
vi.mock("@/lib/supabase/auth", () => ({ getCachedAuthUser: async () => ({ user: env.user }) }));

import { OWNER_EMAIL } from "@/lib/owner";
import { setNewLookAction } from "./new-look-actions";

describe("setNewLookAction", () => {
  beforeEach(() => {
    env.user = { id: "owner-1", email: OWNER_EMAIL };
    env.respond = () => ({ data: [{ id: "owner-1" }] });
    env.db = null;
    env.revalidated = [];
    vi.unstubAllEnvs();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("saves the owner's choice on their own row only", async () => {
    await expect(setNewLookAction(true)).resolves.toEqual({ ok: true, on: true, choice: true });
    const writes = env.db!.ops.filter((op) => op.action !== "select");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      table: "profiles",
      action: "update",
      values: { ui_new_look: true },
      filters: [["eq", "id", "owner-1"]],
    });
    expect(env.revalidated).toEqual([["/app", "layout"]]);
  });

  it("null means follow the default again", async () => {
    await expect(setNewLookAction(null)).resolves.toEqual({ ok: true, on: false, choice: null });
    expect(env.db!.ops[0].values).toEqual({ ui_new_look: null });
  });

  it("refuses everyone else while the default is off, without writing", async () => {
    env.user = { id: "u-9", email: "tradie@example.test" };
    const result = await setNewLookAction(true);
    expect(result.ok).toBe(false);
    expect(env.db!.ops).toHaveLength(0);
  });

  it("lets anyone choose once the default is on", async () => {
    vi.stubEnv("T2Q_NEW_LOOK_DEFAULT", "on");
    env.user = { id: "u-9", email: "tradie@example.test" };
    env.respond = () => ({ data: [{ id: "u-9" }] });
    await expect(setNewLookAction(false)).resolves.toEqual({ ok: true, on: false, choice: false });
    expect(env.db!.ops[0].filters).toEqual([["eq", "id", "u-9"]]);
  });

  it("rejects anything that is not true, false or null", async () => {
    for (const bad of ["true", 1, undefined, {}, "on"]) {
      const result = await setNewLookAction(bad);
      expect(result.ok).toBe(false);
    }
    expect(env.db).toBeNull();
  });

  it("sends a signed-out caller to sign in", async () => {
    env.user = null;
    await expect(setNewLookAction(true)).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("reports a database error (e.g. migration not applied) in plain words", async () => {
    env.respond = () => ({ error: { code: "42703", message: "column does not exist" } });
    const result = await setNewLookAction(true);
    expect(result).toEqual({ ok: false, error: "Couldn't save that. Try again in a minute." });
    expect(env.revalidated).toEqual([]);
  });

  it("reports a missing profile row instead of pretending it saved", async () => {
    env.respond = () => ({ data: [] });
    const result = await setNewLookAction(true);
    expect(result.ok).toBe(false);
  });
});
