import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";
import { PUSH_SUBSCRIPTION_COOKIE } from "@/lib/push-subscription-cookie";

const state = vi.hoisted(() => ({
  requestCookies: [] as Array<{ name: string; value: string }>,
  signOut: vi.fn(async () => ({ error: null })),
  ops: [] as FakeOp[],
  deleteError: null as unknown,
  captureError: vi.fn(),
  userId: "user-1" as string | null,
}));

vi.mock("@/lib/observability", () => ({ captureError: (...a: unknown[]) => state.captureError(...a) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signOut: state.signOut,
      getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }),
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () =>
    fakeSupabase((op) => {
      state.ops.push(op);
      if (op.table === "push_subscriptions" && op.action === "delete") return { error: state.deleteError };
      return undefined;
    }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => state.requestCookies.find((c) => c.name === name),
    getAll: () => state.requestCookies,
  }),
}));

import { GET, POST } from "./route";

const request = (path = "/auth/signout", headers: Record<string, string> = {}) =>
  new NextRequest(`https://tradies2quote.com${path}`, { method: "POST", headers });

beforeEach(() => {
  state.requestCookies = [
    { name: "sb-access-token", value: "fixture-access" },
    { name: "sb-refresh-token", value: "fixture-refresh" },
  ];
  state.signOut.mockClear();
  state.ops = [];
  state.deleteError = null;
  state.captureError.mockClear();
  state.userId = "user-1";
});

describe("POST /auth/signout", () => {
  it("deletes this device's push subscription row when the tracking cookie is present", async () => {
    state.requestCookies.push({ name: PUSH_SUBSCRIPTION_COOKIE, value: "aaaaaaaa-0000-0000-0000-000000000001" });
    const res = await POST(request());
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://tradies2quote.com/login");
    const del = state.ops.find((op) => op.table === "push_subscriptions" && op.action === "delete");
    expect(del?.filters).toContainEqual(["eq", "id", "aaaaaaaa-0000-0000-0000-000000000001"]);
    expect(del?.filters).toContainEqual(["eq", "user_id", "user-1"]);
    // The tracking cookie itself is cleared on the way out, same as the sb-* ones.
    expect(res.cookies.get(PUSH_SUBSCRIPTION_COOKIE)?.value).toBe("");
  });

  it("leaves the row alone when the session is already gone (it can't prove whose row it is)", async () => {
    state.userId = null;
    state.requestCookies.push({ name: PUSH_SUBSCRIPTION_COOKIE, value: "aaaaaaaa-0000-0000-0000-000000000001" });
    const res = await POST(request());
    expect(res.status).toBe(303);
    expect(state.ops.some((op) => op.table === "push_subscriptions")).toBe(false);
  });

  it("does nothing when there is no tracking cookie — no admin call at all", async () => {
    const res = await POST(request());
    expect(res.status).toBe(303);
    expect(state.ops).toHaveLength(0);
  });

  it("ignores a malformed tracking cookie rather than querying with it", async () => {
    state.requestCookies.push({ name: PUSH_SUBSCRIPTION_COOKIE, value: "'; drop table push_subscriptions; --" });
    await POST(request());
    expect(state.ops).toHaveLength(0);
  });

  it("still signs out and redirects even if the push cleanup fails", async () => {
    state.requestCookies.push({ name: PUSH_SUBSCRIPTION_COOKIE, value: "aaaaaaaa-0000-0000-0000-000000000001" });
    state.deleteError = new Error("db down");
    const res = await POST(request());
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://tradies2quote.com/login");
    expect(state.captureError).toHaveBeenCalledWith(state.deleteError, { route: "auth/signout" });
  });

  it("still expires every sb-* cookie as before", async () => {
    const res = await POST(request());
    expect(res.cookies.get("sb-access-token")?.value).toBe("");
    expect(res.cookies.get("sb-refresh-token")?.value).toBe("");
  });
});

describe("GET /auth/signout", () => {
  it("signs out a same-site / pasted-URL visit", async () => {
    state.requestCookies.push({ name: PUSH_SUBSCRIPTION_COOKIE, value: "aaaaaaaa-0000-0000-0000-000000000001" });
    const res = await GET(request("/auth/signout", { "sec-fetch-site": "none" }));
    expect(res.status).toBe(303);
    expect(state.ops.some((op) => op.action === "delete")).toBe(true);
  });

  it("refuses a cross-site GET (an <img> or link on someone else's page) without signing out", async () => {
    const res = await GET(request("/auth/signout", { "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(303);
    expect(state.signOut).not.toHaveBeenCalled();
    expect(state.ops).toHaveLength(0);
  });
});
