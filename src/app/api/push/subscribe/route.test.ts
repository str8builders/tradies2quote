import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type FakeOp, type FakeResult } from "@/test/fake-supabase";
import { PUSH_SUBSCRIPTION_COOKIE } from "@/lib/push-subscription-cookie";

const state = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  respond: (() => undefined) as (op: FakeOp) => FakeResult,
  ops: [] as FakeOp[],
  userClientWrites: [] as FakeOp[],
  captureError: vi.fn(),
}));

vi.mock("@/lib/observability", () => ({ captureError: (...a: unknown[]) => state.captureError(...a) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    // The DELETE handler still writes with this (user-scoped) client — any
    // write through it is recorded separately so a test can assert the POST
    // path never touches it (audit finding 2: POST must use the admin
    // client only).
    from: (table: string) => {
      const db = fakeSupabase((op) => {
        state.userClientWrites.push(op);
        return op.table === "push_subscriptions" && op.action === "delete" ? { error: null } : undefined;
      });
      return db.from(table);
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () =>
    fakeSupabase((op) => {
      state.ops.push(op);
      return state.respond(op);
    }),
}));

import { DELETE, POST } from "./route";

const GOOD_ENDPOINT = "https://fcm.googleapis.com/fcm/send/fixture";
const GOOD_TOKEN = "ab".repeat(20);

function post(body: unknown) {
  return POST(
    new NextRequest("https://tradies2quote.com/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function del(body: unknown) {
  return DELETE(
    new NextRequest("https://tradies2quote.com/api/push/subscribe", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  state.user = { id: "user-1" };
  state.ops = [];
  state.userClientWrites = [];
  state.captureError.mockClear();
  // Default: delete-then-insert both succeed, insert returns a fresh id.
  state.respond = (op) => {
    if (op.table !== "push_subscriptions") return undefined;
    if (op.action === "delete") return { error: null };
    if (op.action === "insert") return { data: { id: "aaaaaaaa-0000-0000-0000-000000000001" } };
    return undefined;
  };
});

describe("POST /api/push/subscribe", () => {
  it("rejects an unauthenticated caller before touching the database", async () => {
    state.user = null;
    const res = await post({ endpoint: GOOD_ENDPOINT, keys: { p256dh: "p", auth: "a" } });
    expect(res.status).toBe(401);
    expect(state.ops).toHaveLength(0);
  });

  it("rejects a body that isn't valid JSON", async () => {
    const res = await POST(
      new NextRequest("https://tradies2quote.com/api/push/subscribe", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an endpoint that isn't one of the browsers' own push services", async () => {
    const res = await post({ endpoint: "https://evil.example/collect", keys: { p256dh: "p", auth: "a" } });
    expect(res.status).toBe(400);
    expect(state.ops).toHaveLength(0);
  });

  it("web push: writes with the admin client only — delete-then-insert, never the user-scoped client", async () => {
    const res = await post({ endpoint: GOOD_ENDPOINT, keys: { p256dh: "p", auth: "a" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.userClientWrites).toHaveLength(0);

    const del = state.ops.find((op) => op.action === "delete");
    const insert = state.ops.find((op) => op.action === "insert");
    expect(del?.filters).toContainEqual(["eq", "endpoint", GOOD_ENDPOINT]);
    expect(insert?.values).toMatchObject({ user_id: "user-1", endpoint: GOOD_ENDPOINT, platform: "web" });
    // The delete must run before the insert, so a stale row (this account's
    // own, or — the actual bug — another account's, reusing the identical
    // endpoint) can never block or collide with the fresh one.
    expect(state.ops.indexOf(del!)).toBeLessThan(state.ops.indexOf(insert!));

    // The row id comes back as an httpOnly cookie so /auth/signout can find
    // it later (audit finding 1).
    const cookie = res.cookies.get(PUSH_SUBSCRIPTION_COOKIE);
    expect(cookie?.value).toBe("aaaaaaaa-0000-0000-0000-000000000001");
    expect(cookie?.httpOnly).toBe(true);
  });

  it("this same admin-client path also fixes the second-account-on-one-phone collision (audit finding 2): no 500, no RLS involved", async () => {
    // Simulate: a row for this exact endpoint already exists, owned by a
    // DIFFERENT account (this is exactly what a shared phone produces). The
    // admin client bypasses RLS entirely, so the collision never surfaces.
    state.respond = (op) => {
      if (op.table !== "push_subscriptions") return undefined;
      if (op.action === "delete") return { error: null }; // removes the other account's row
      if (op.action === "insert") return { data: { id: "bbbbbbbb-0000-0000-0000-000000000002" } };
      return undefined;
    };
    const res = await post({ endpoint: GOOD_ENDPOINT, keys: { p256dh: "p", auth: "a" } });
    expect(res.status).toBe(200);
  });

  it("reports and returns 500 when the write genuinely fails", async () => {
    state.respond = (op) =>
      op.table === "push_subscriptions" && op.action === "insert" ? { error: new Error("db down") } : { error: null };
    const res = await post({ endpoint: GOOD_ENDPOINT, keys: { p256dh: "p", auth: "a" } });
    expect(res.status).toBe(500);
    expect(state.captureError).toHaveBeenCalledTimes(1);
  });

  it("iOS: rejects a malformed token", async () => {
    const res = await post({ platform: "ios", token: "not-hex!!" });
    expect(res.status).toBe(400);
    expect(state.ops).toHaveLength(0);
  });

  it("iOS: stores the device token as the endpoint and sets the same tracking cookie", async () => {
    const res = await post({ platform: "ios", token: GOOD_TOKEN });
    expect(res.status).toBe(200);
    const insert = state.ops.find((op) => op.action === "insert");
    expect(insert?.values).toMatchObject({ user_id: "user-1", endpoint: GOOD_TOKEN, platform: "ios", p256dh: null, auth: null });
    expect(res.cookies.get(PUSH_SUBSCRIPTION_COOKIE)?.value).toBe("aaaaaaaa-0000-0000-0000-000000000001");
  });
});

describe("DELETE /api/push/subscribe", () => {
  it("rejects an unauthenticated caller", async () => {
    state.user = null;
    const res = await del({ endpoint: GOOD_ENDPOINT });
    expect(res.status).toBe(401);
  });

  it("deletes with the user-scoped client, scoped to this account, and clears the tracking cookie", async () => {
    const res = await del({ endpoint: GOOD_ENDPOINT });
    expect(res.status).toBe(200);
    const delOp = state.userClientWrites.find((op) => op.action === "delete");
    expect(delOp?.filters).toContainEqual(["eq", "endpoint", GOOD_ENDPOINT]);
    expect(delOp?.filters).toContainEqual(["eq", "user_id", "user-1"]);
    expect(state.ops).toHaveLength(0); // never touches the admin client
    expect(res.cookies.get(PUSH_SUBSCRIPTION_COOKIE)?.value).toBe("");
  });
});
