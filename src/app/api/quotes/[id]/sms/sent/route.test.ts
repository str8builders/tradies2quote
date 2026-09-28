import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

/**
 * "I've sent the text" from the tradie's own phone (audit 2026-09-28): the
 * job page offers "Send it again" for a declined quote, so a declined or
 * expired quote must become sent here too — otherwise the client's link says
 * the quote is no longer available while the tradie sees "Quote texted".
 */
const state = vi.hoisted(() => ({ client: null as unknown, admin: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => state.admin }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { POST } from "./route";

const NOW = "2026-09-28T10:00:00.000Z";
let quote: Record<string, unknown>;
let adminDb: ReturnType<typeof fakeSupabase>;
let flipRows: unknown[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  quote = { id: "quote-1", status: "declined", public_token: "tok-1", expires_at: "2026-10-20T00:00:00.000Z" };
  flipRows = [{ id: "quote-1" }];
  const userDb = fakeSupabase((op: FakeOp) => (op.table === "quotes" ? { data: quote } : {}));
  state.client = { auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) }, from: userDb.from };
  adminDb = fakeSupabase((op: FakeOp) => (op.table === "quotes" && op.action === "update" ? { data: flipRows } : {}));
  state.admin = { from: adminDb.from };
});
afterEach(() => vi.useRealTimers());

const confirm = () =>
  POST(
    new NextRequest("https://tradies2quote.com/api/quotes/quote-1/sms/sent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trigger: "opened_messages" }),
    }),
    { params: Promise.resolve({ id: "quote-1" }) },
  );
const flip = () => adminDb.ops.find((op) => op.table === "quotes" && op.action === "update");
const event = () => adminDb.ops.find((op) => op.table === "quote_events" && op.action === "insert");

describe("/sms/sent — the tradie texted it from their own phone", () => {
  it.each(["draft", "declined", "expired"])("a %s quote becomes sent", async (status) => {
    quote.status = status;
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(flip()?.values).toEqual({ status: "sent", sent_at: NOW, viewed_at: null, expires_at: "2026-10-20T00:00:00.000Z" });
    expect(flip()?.filters).toContainEqual(["in", "status", ["draft", "declined", "expired"]]);
    expect(event()?.values).toMatchObject({ type: "sent", metadata: { channel: "sms_device", trigger: "opened_messages" } });
  });

  it("repairs an expiry that has already passed, so the link works", async () => {
    quote.expires_at = "2026-09-01T00:00:00.000Z";
    await confirm();
    expect(flip()?.values).toMatchObject({ expires_at: "2026-10-28T10:00:00.000Z" });
  });

  it.each(["sent", "viewed", "accepted", "scheduled", "completed"])("a %s quote is left exactly as it is", async (status) => {
    quote.status = status;
    const res = await confirm();
    expect(await res.json()).toEqual({ ok: true, already: status });
    expect(flip()).toBeUndefined();
    expect(event()).toBeUndefined();
  });

  it("the second of two taps (or an acceptance in between) writes nothing more", async () => {
    flipRows = [];
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(event()).toBeUndefined();
  });

  it("refuses a quote whose text was never prepared", async () => {
    quote.public_token = null;
    expect((await confirm()).status).toBe(400);
    expect(flip()).toBeUndefined();
  });
});
