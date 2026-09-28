import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  ops: [] as FakeOp[],
  insertError: null as unknown,
  getUserById: vi.fn(),
  generateLink: vi.fn(),
  verifyOtp: vi.fn(),
  spent: [{ user_id: "user-1" }] as Array<{ user_id: string }>,
}));

vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  consumeFixedWindow: () => ({ ok: true, resetAt: 0 }),
  tooManyRequestsResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () =>
    Object.assign(
      fakeSupabase((op) => {
        state.ops.push(op);
        if (op.action === "insert") return { error: state.insertError };
        if (op.action === "update") return { data: state.spent };
        return undefined;
      }),
      { auth: { admin: { getUserById: state.getUserById, generateLink: state.generateLink } } },
    ),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { verifyOtp: state.verifyOtp } }) }));

import { POST as create } from "./route";
import { POST as redeem } from "./redeem/route";
import { handoffCodeHash } from "@/lib/t2qcal-handoff";

const redeemRequest = (code: unknown) =>
  new Request("https://tradies2quote.com/api/t2qcal/handoff/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  }) as never;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://api.example.invalid");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "anon-fixture");
  Object.assign(state, { user: { id: "user-1" }, ops: [], insertError: null, spent: [{ user_id: "user-1" }] });
  state.getUserById.mockReset().mockResolvedValue({ data: { user: { id: "user-1", email: "sam@example.invalid" } }, error: null });
  state.generateLink.mockReset().mockResolvedValue({ data: { properties: { hashed_token: "hashed-fixture" } }, error: null });
  state.verifyOtp.mockReset().mockResolvedValue({ data: { session: { refresh_token: "refresh-fixture" } }, error: null });
});

describe("POST /api/t2qcal/handoff", () => {
  it("only for someone signed in", async () => {
    state.user = null;
    expect((await create()).status).toBe(401);
    expect(state.ops).toEqual([]);
  });

  it("issues a one-time code and keeps only its hash, for 60 seconds", async () => {
    const res = await create();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code: string; userId: string; expiresIn: number };
    expect(body.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body).toMatchObject({ userId: "user-1", expiresIn: 60 });
    const insert = state.ops.find((op) => op.action === "insert");
    const row = insert?.values as { code_hash: string; user_id: string; expires_at: string };
    expect(row.code_hash).toBe(handoffCodeHash(body.code));
    expect(row.code_hash).not.toContain(body.code);
    expect(row.user_id).toBe("user-1");
    expect(Date.parse(row.expires_at) - Date.now()).toBeLessThanOrEqual(60_000);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("POST /api/t2qcal/handoff/redeem", () => {
  it("refuses anything that isn't a code", async () => {
    expect((await redeem(redeemRequest("nope"))).status).toBe(400);
    expect((await redeem(redeemRequest(undefined))).status).toBe(400);
    expect(state.ops).toEqual([]);
  });

  it("spends the code once, only while unused and unexpired", async () => {
    const code = "a".repeat(43);
    const res = await redeem(redeemRequest(code));
    expect(res.status).toBe(200);
    const spend = state.ops.find((op) => op.action === "update");
    expect(spend?.filters).toContainEqual(["eq", "code_hash", handoffCodeHash(code)]);
    expect(spend?.filters).toContainEqual(["is", "used_at", null]);
    expect(spend?.filters.some(([m, c]) => m === "gt" && c === "expires_at")).toBe(true);
  });

  it("gives T2QCAL a session of the same account, and nothing of the magic link", async () => {
    const res = await redeem(redeemRequest("b".repeat(43)));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ refresh_token: "refresh-fixture", user_id: "user-1", email: "sam@example.invalid" });
    expect(state.generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "sam@example.invalid" });
    expect(state.verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "hashed-fixture" });
    expect(JSON.stringify(body)).not.toContain("hashed-fixture");
  });

  it("an expired, used or unknown code signs nobody in", async () => {
    state.spent = [];
    const res = await redeem(redeemRequest("c".repeat(43)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "expired" });
    expect(state.generateLink).not.toHaveBeenCalled();
  });
});
