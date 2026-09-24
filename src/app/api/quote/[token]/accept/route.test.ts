import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({
  admin: null as unknown,
  rpc: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => state.admin }));
vi.mock("@/lib/quote-storage", () => ({ uploadSignature: (...a: unknown[]) => state.upload(...a) }));
vi.mock("@/lib/push", () => ({ sendPushToUser: (...a: unknown[]) => state.push(...a) }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  consumeDailyQuota: () => ({ ok: true }),
  tooManyRequestsResponse: () => new Response(null, { status: 429 }),
}));

import { POST } from "./route";
import { acceptRequestBody } from "@/app/quote/[token]/_components/AcceptForm";

const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString("base64")}`;
let row: Record<string, unknown> | null;
let db: ReturnType<typeof fakeSupabase>;

const respond = (op: FakeOp) => (op.table === "quotes" ? { data: row } : {});
const ctx = () => ({ params: Promise.resolve({ token: "fixture-token" }) });
const accept = (extra: Record<string, unknown>) =>
  POST(
    new NextRequest("https://tradies2quote.com/api/quote/fixture-token/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Fixture Customer", email: "customer@example.invalid", signature: PNG, accepted: true, ...extra }),
    }),
    ctx(),
  );

beforeEach(() => {
  row = {
    id: "quote-1", status: "viewed", expires_at: "2099-01-01T00:00:00Z", total_amount: 172.5,
    version: 3, user_id: "owner-1", created_at: "2026-09-01T00:00:00Z", deleted_at: null,
  };
  db = fakeSupabase(respond);
  state.rpc.mockReset().mockResolvedValue({ data: { ok: true, quote_id: "quote-1" }, error: null });
  state.remove.mockReset().mockResolvedValue({ error: null });
  state.upload.mockReset().mockResolvedValue("quote-1/signature.png");
  state.push.mockReset().mockResolvedValue(undefined);
  state.admin = { from: db.from, rpc: state.rpc, storage: { from: () => ({ remove: state.remove }) } };
});

describe("public accept — the customer accepts exactly what they were shown", () => {
  it("passes the shown version and total to accept_quote", async () => {
    const res = await accept({ version: 3, total: 172.5 });
    expect(res.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = state.rpc.mock.calls[0];
    expect(name).toBe("accept_quote");
    expect(args).toMatchObject({ p_token: "fixture-token", p_version: 3, p_total: 172.5 });
  });

  it.each([
    ["an older version", { version: 2, total: 172.5 }],
    ["a different total", { version: 3, total: 150 }],
    ["no version (page loaded before this release)", { total: 172.5 }],
    ["no total", { version: 3 }],
    ["a non-integer version", { version: "3", total: 172.5 }],
  ])("refuses %s with quote_changed before storing a signature", async (_label, extra) => {
    const res = await accept(extra);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "quote_changed" });
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["draft", "not_available"],
    ["expired", "not_available"],
    ["scheduled", "not_available"],
    ["in_progress", "not_available"],
    ["completed", "not_available"],
    ["accepted", "already_accepted"],
    ["declined", "declined"],
  ])("refuses a %s quote (%s)", async (status, error) => {
    row!.status = status;
    const res = await accept({ version: 3, total: 172.5 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error });
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("treats a deleted quote as not found", async () => {
    row!.deleted_at = "2026-09-20T00:00:00Z";
    expect((await accept({ version: 3, total: 172.5 })).status).toBe(404);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("maps a change caught under the row lock to quote_changed and removes the signature", async () => {
    state.rpc.mockResolvedValue({ data: { error: "quote_changed" }, error: null });
    const res = await accept({ version: 3, total: 172.5 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "quote_changed" });
    expect(state.remove).toHaveBeenCalledWith(["quote-1/signature.png"]);
    expect(state.push).not.toHaveBeenCalled();
  });

  it("the public form posts the version and total it rendered", () => {
    const body = JSON.parse(
      acceptRequestBody({ version: 4, total: 99.5 }, { name: "A", email: "a@example.invalid", signature: PNG, accepted: true }),
    );
    expect(body).toMatchObject({ version: 4, total: 99.5, name: "A", accepted: true });
  });
});
