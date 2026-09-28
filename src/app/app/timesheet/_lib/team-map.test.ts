// The owner's live team map shows only people still in the team: someone
// who left (or was removed) while clocked in isn't the owner's to see.

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, unknown>>,
  roster: { members: [] as Array<{ user_id: string; email: string | null }> } as unknown,
  rosterError: null as unknown,
  points: [] as Array<Record<string, unknown>>,
  pointFilter: null as unknown,
}));

vi.mock("@/lib/location/sites", () => ({ loadJobSites: async () => [] }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => ({ data: db.rosterError ? null : db.roster, error: db.rosterError }),
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        in: (_column: string, values: unknown) => {
          if (table === "location_points") db.pointFilter = values;
          return builder;
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: table === "work_sessions" ? db.sessions : db.points, error: null }).then(resolve),
      };
      return builder;
    },
  }),
}));

import { loadTeamMap, stillInTeam } from "./team-map";

const session = (id: string, user: string) => ({
  id,
  user_id: user,
  started_at: "2026-09-29T19:00:00.000Z",
  start_lat: -37.6868,
  start_lng: 176.1654,
  start_place: "At the Hemi Walker job",
});

beforeEach(() => {
  db.sessions = [session("s-me", "me"), session("s-sam", "sam"), session("s-gone", "gone")];
  db.roster = {
    members: [
      { user_id: "me", email: "mike@bayside.co.nz" },
      { user_id: "sam", email: "sam@bayside.co.nz" },
    ],
  };
  db.rosterError = null;
  db.points = [];
  db.pointFilter = null;
});

describe("stillInTeam", () => {
  it("keeps the owner and current members, drops anyone who's left", () => {
    const kept = stillInTeam(db.sessions as Array<{ user_id: string }>, [{ user_id: "sam", email: null }], "me");
    expect(kept.map((s) => s.user_id)).toEqual(["me", "sam"]);
  });

  it("no roster: the owner alone", () => {
    expect(stillInTeam(db.sessions as Array<{ user_id: string }>, [], "me").map((s) => s.user_id)).toEqual(["me"]);
  });
});

describe("loadTeamMap", () => {
  it("someone who left while clocked in isn't on the map, and their route isn't read", async () => {
    const members = await loadTeamMap("me");
    expect(members.map((m) => [m.userId, m.name])).toEqual([
      ["me", "You"],
      ["sam", "Sam"],
    ]);
    expect(db.pointFilter).toEqual(["s-me", "s-sam"]);
  });

  it("the roster can't be read: only the owner's own session shows", async () => {
    db.rosterError = { message: "timeout" };
    const members = await loadTeamMap("me");
    expect(members.map((m) => m.userId)).toEqual(["me"]);
  });

  it("only ex-members clocked in: nobody, and nothing more is read", async () => {
    db.sessions = [session("s-gone", "gone")];
    expect(await loadTeamMap("me")).toEqual([]);
    expect(db.pointFilter).toBeNull();
  });
});
