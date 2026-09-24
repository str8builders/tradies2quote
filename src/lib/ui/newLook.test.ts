import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string | null } | null,
  row: null as Record<string, unknown> | null,
  error: null as { code: string; message: string } | null,
  selects: [] as Array<{ table: string; columns: string; id: unknown }>,
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCachedAuthUser: async () => ({ user: state.user, error: null }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const q = { table, columns: "", id: undefined as unknown };
      const builder = {
        select: (columns: string) => ((q.columns = columns), builder),
        eq: (_col: string, value: unknown) => ((q.id = value), builder),
        maybeSingle: async () => {
          state.selects.push(q);
          return { data: state.row, error: state.error };
        },
      };
      return builder;
    },
  }),
}));

import { OWNER_EMAIL } from "@/lib/owner";
import {
  canChooseNewLook,
  getNewLookState,
  newLookDefault,
  parseNewLookDefault,
  resolveNewLook,
} from "./newLook";

describe("T2Q_NEW_LOOK_DEFAULT", () => {
  it("is off unless it says on", () => {
    expect(parseNewLookDefault(undefined)).toBe("off");
    expect(parseNewLookDefault("")).toBe("off");
    expect(parseNewLookDefault("off")).toBe("off");
    expect(parseNewLookDefault("true")).toBe("off");
    expect(parseNewLookDefault("1")).toBe("off");
    expect(parseNewLookDefault("on")).toBe("on");
    expect(parseNewLookDefault(" ON ")).toBe("on");
    expect(newLookDefault({ T2Q_NEW_LOOK_DEFAULT: "on" })).toBe("on");
    expect(newLookDefault({})).toBe("off");
  });
});

describe("resolveNewLook (pure)", () => {
  it("follows the default when there is no explicit choice", () => {
    expect(resolveNewLook({ profileValue: null, envDefault: "off" })).toBe(false);
    expect(resolveNewLook({ profileValue: undefined, envDefault: "on" })).toBe(true);
  });
  it("an explicit profile value wins over the default", () => {
    expect(resolveNewLook({ profileValue: true, envDefault: "off" })).toBe(true);
    expect(resolveNewLook({ profileValue: false, envDefault: "on" })).toBe(false);
  });
  it("ignores a stored value from someone who may not choose", () => {
    expect(resolveNewLook({ profileValue: true, envDefault: "off", canChoose: false })).toBe(false);
  });
});

describe("canChooseNewLook", () => {
  it("is owner-only while the default is off, everyone once it is on", () => {
    expect(canChooseNewLook(OWNER_EMAIL, "off")).toBe(true);
    expect(canChooseNewLook(` ${OWNER_EMAIL.toUpperCase()} `, "off")).toBe(true);
    expect(canChooseNewLook("tradie@example.test", "off")).toBe(false);
    expect(canChooseNewLook(null, "off")).toBe(false);
    expect(canChooseNewLook("tradie@example.test", "on")).toBe(true);
  });
});

describe("getNewLookState (server helper)", () => {
  beforeEach(() => {
    state.user = null;
    state.row = null;
    state.error = null;
    state.selects = [];
    vi.unstubAllEnvs();
  });

  it("signed out: the default, no choice, no database read", async () => {
    vi.stubEnv("T2Q_NEW_LOOK_DEFAULT", "on");
    await expect(getNewLookState()).resolves.toEqual({
      on: true,
      choice: null,
      envDefault: "on",
      canChoose: false,
    });
    expect(state.selects).toHaveLength(0);
  });

  it("a non-owner while the default is off gets the old look without a read", async () => {
    state.user = { id: "u-1", email: "tradie@example.test" };
    state.row = { ui_new_look: true };
    const result = await getNewLookState();
    expect(result).toEqual({ on: false, choice: null, envDefault: "off", canChoose: false });
    expect(state.selects).toHaveLength(0);
  });

  it("the owner's stored choice is read from their own row and wins", async () => {
    state.user = { id: "owner-1", email: OWNER_EMAIL };
    state.row = { ui_new_look: true };
    const result = await getNewLookState();
    expect(result).toEqual({ on: true, choice: true, envDefault: "off", canChoose: true });
    expect(state.selects).toEqual([{ table: "profiles", columns: "ui_new_look", id: "owner-1" }]);
  });

  it("before the migration (missing column) it follows the default instead of failing", async () => {
    state.user = { id: "owner-1", email: OWNER_EMAIL };
    state.error = { code: "42703", message: 'column profiles.ui_new_look does not exist' };
    await expect(getNewLookState()).resolves.toEqual({
      on: false,
      choice: null,
      envDefault: "off",
      canChoose: true,
    });
  });

  it("once the default is on, everyone's explicit choice counts", async () => {
    vi.stubEnv("T2Q_NEW_LOOK_DEFAULT", "on");
    state.user = { id: "u-2", email: "tradie@example.test" };
    state.row = { ui_new_look: false };
    const result = await getNewLookState();
    expect(result).toEqual({ on: false, choice: false, envDefault: "on", canChoose: true });
  });
});
