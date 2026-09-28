// sendPushToUser wasn't unit-tested at all before (every caller mocks
// "@/lib/push" wholesale) — these lock in the audit-driven fixes: iOS sends
// must not depend on VAPID being configured (finding 5), a subscription
// whose endpoint isn't one of the browsers' own push services is pruned and
// reported rather than POSTed to (finding 4), and a 403/404/410 (web) or
// 410/BadDeviceToken (APNs) response prunes the dead row and reports it
// exactly once — other failures are reported but the row is kept (finding
// 3). A fresh module per test (env vars are read once at import time).

import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp, type FakeResult } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({
  sendNotification: vi.fn<(sub: { endpoint: string }, body: string) => Promise<unknown>>(),
  setVapidDetails: vi.fn(),
  sendApnsNotification: vi.fn(),
  captureError: vi.fn(),
  respond: (() => undefined) as (op: FakeOp) => FakeResult,
  ops: [] as FakeOp[],
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: state.setVapidDetails,
    sendNotification: (sub: { endpoint: string }, body: string) => state.sendNotification(sub, body),
  },
}));
vi.mock("@/lib/apns", () => ({
  sendApnsNotification: (...a: unknown[]) => state.sendApnsNotification(...a),
}));
vi.mock("@/lib/observability", () => ({
  captureError: (...a: unknown[]) => state.captureError(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () =>
    fakeSupabase((op) => {
      state.ops.push(op);
      return state.respond(op);
    }),
}));

const GOOD_ENDPOINT = "https://fcm.googleapis.com/fcm/send/fixture";
const BAD_ENDPOINT = "https://evil.example/collect";

type Sub = { endpoint: string; p256dh: string | null; auth: string | null; platform?: string | null };

/** A fresh module per test — VAPID_PRIVATE_KEY is read once, at import time. */
async function freshPush(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("VAPID_PRIVATE_KEY", env.VAPID_PRIVATE_KEY ?? "fixture-private-key");
  return import("./push");
}

function withSubs(subs: Sub[]) {
  state.respond = (op) =>
    op.table === "push_subscriptions" && op.action === "select" ? { data: subs } : undefined;
}

afterEach(() => {
  state.ops = [];
  state.respond = () => undefined;
  state.sendNotification.mockReset();
  state.sendApnsNotification.mockReset();
  state.captureError.mockReset();
  state.setVapidDetails.mockReset();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("sendPushToUser", () => {
  it("does nothing without a user id — no lookup at all", async () => {
    const { sendPushToUser } = await freshPush();
    await sendPushToUser(null, { title: "t", body: "b" });
    await sendPushToUser(undefined, { title: "t", body: "b" });
    expect(state.ops).toHaveLength(0);
  });

  it("sends an iOS push even when VAPID is not configured (an APNs-only shop)", async () => {
    withSubs([{ endpoint: "device-token", p256dh: null, auth: null, platform: "ios" }]);
    state.sendApnsNotification.mockResolvedValue({ ok: true });
    const { sendPushToUser } = await freshPush({ VAPID_PRIVATE_KEY: "" });
    await sendPushToUser("user-1", { title: "New quote request", body: "Fixture", url: "/app" });
    expect(state.sendApnsNotification).toHaveBeenCalledWith("device-token", {
      title: "New quote request",
      body: "Fixture",
      url: "/app",
    });
    expect(state.sendNotification).not.toHaveBeenCalled();
  });

  it("sends web push when VAPID is configured", async () => {
    withSubs([{ endpoint: GOOD_ENDPOINT, p256dh: "p", auth: "a", platform: "web" }]);
    state.sendNotification.mockResolvedValue(undefined);
    const { sendPushToUser } = await freshPush();
    await sendPushToUser("user-1", { title: "t", body: "b" });
    expect(state.sendNotification).toHaveBeenCalledTimes(1);
    expect(state.ops.some((op) => op.action === "delete")).toBe(false);
  });

  it("skips web push silently when VAPID isn't configured, without touching the row", async () => {
    withSubs([{ endpoint: GOOD_ENDPOINT, p256dh: "p", auth: "a", platform: "web" }]);
    const { sendPushToUser } = await freshPush({ VAPID_PRIVATE_KEY: "" });
    await sendPushToUser("user-1", { title: "t", body: "b" });
    expect(state.sendNotification).not.toHaveBeenCalled();
    expect(state.ops.some((op) => op.action === "delete")).toBe(false);
    expect(state.captureError).not.toHaveBeenCalled();
  });

  it("prunes and reports a subscription whose endpoint isn't an allowed push service, without sending", async () => {
    withSubs([{ endpoint: BAD_ENDPOINT, p256dh: "p", auth: "a", platform: "web" }]);
    const { sendPushToUser } = await freshPush();
    await sendPushToUser("user-1", { title: "t", body: "b" });
    expect(state.sendNotification).not.toHaveBeenCalled();
    const del = state.ops.find((op) => op.action === "delete");
    expect(del).toBeTruthy();
    expect(del?.filters).toContainEqual(["eq", "endpoint", BAD_ENDPOINT]);
    expect(state.captureError).toHaveBeenCalledTimes(1);
  });

  it.each([403, 404, 410])("prunes a web subscription the push service rejected with %d", async (code) => {
    withSubs([{ endpoint: GOOD_ENDPOINT, p256dh: "p", auth: "a", platform: "web" }]);
    state.sendNotification.mockRejectedValue(Object.assign(new Error("rejected"), { statusCode: code }));
    const { sendPushToUser } = await freshPush();
    await sendPushToUser("user-1", { title: "t", body: "b" });
    const del = state.ops.find((op) => op.action === "delete");
    expect(del?.filters).toContainEqual(["eq", "endpoint", GOOD_ENDPOINT]);
    expect(state.captureError).toHaveBeenCalledTimes(1);
  });

  it("keeps the row and reports (but doesn't prune) an unexpected web push failure", async () => {
    withSubs([{ endpoint: GOOD_ENDPOINT, p256dh: "p", auth: "a", platform: "web" }]);
    state.sendNotification.mockRejectedValue(Object.assign(new Error("server error"), { statusCode: 500 }));
    const { sendPushToUser } = await freshPush();
    await sendPushToUser("user-1", { title: "t", body: "b" });
    expect(state.ops.some((op) => op.action === "delete")).toBe(false);
    expect(state.captureError).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 410, reason: "Unregistered" },
    { status: 400, reason: "BadDeviceToken" },
  ])("prunes an APNs subscription on $reason", async ({ status, reason }) => {
    withSubs([{ endpoint: "device-token", p256dh: null, auth: null, platform: "ios" }]);
    state.sendApnsNotification.mockResolvedValue({ ok: false, status, reason });
    const { sendPushToUser } = await freshPush();
    await sendPushToUser("user-1", { title: "t", body: "b" });
    const del = state.ops.find((op) => op.action === "delete");
    expect(del?.filters).toContainEqual(["eq", "endpoint", "device-token"]);
    expect(state.captureError).toHaveBeenCalledTimes(1);
  });

  it("never reports APNs simply being unconfigured", async () => {
    withSubs([{ endpoint: "device-token", p256dh: null, auth: null, platform: "ios" }]);
    state.sendApnsNotification.mockResolvedValue({ ok: false, status: 0, reason: "not_configured" });
    const { sendPushToUser } = await freshPush();
    await sendPushToUser("user-1", { title: "t", body: "b" });
    expect(state.ops.some((op) => op.action === "delete")).toBe(false);
    expect(state.captureError).not.toHaveBeenCalled();
  });

  it("never throws — an unexpected lookup failure is swallowed and reported", async () => {
    state.respond = () => {
      throw new Error("db down");
    };
    const { sendPushToUser } = await freshPush();
    await expect(sendPushToUser("user-1", { title: "t", body: "b" })).resolves.toBeUndefined();
    expect(state.captureError).toHaveBeenCalledTimes(1);
  });
});
