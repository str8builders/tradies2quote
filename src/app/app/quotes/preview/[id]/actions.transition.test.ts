// Status moves go through the transition_quote_lifecycle RPC. When it refuses
// a move for an everyday reason (a second tab or the client moved the quote
// first), the tradie gets plain words and the error monitor stays quiet; a
// real failure is still reported.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({
  client: null as unknown,
  captureError: vi.fn(),
  rpcError: null as { code?: string; message?: string } | null,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/observability", () => ({
  captureError: (...args: unknown[]) => state.captureError(...args),
}));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirected");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/agents/suggestPrice", () => ({ suggestPriceAgentEnabledFromEnv: () => false }));

import { acceptQuote, markComplete } from "./actions";

const OWNER = "0f7f4f6e-1111-4222-8333-944444444444";
const QUOTE_ID = "5d0a1c2e-5555-4666-8777-988888888888";
let status = "sent";

function respond(op: FakeOp) {
  if (op.table === "quotes" && op.action === "select") return { data: { status } };
  return {};
}

beforeEach(() => {
  status = "sent";
  state.rpcError = null;
  state.captureError.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const db = fakeSupabase(respond);
  state.client = {
    auth: { getUser: async () => ({ data: { user: { id: OWNER } } }) },
    from: db.from,
    rpc: async () => (state.rpcError ? { data: null, error: state.rpcError } : { data: "accepted", error: null }),
  };
});

describe("lifecycle refusals", () => {
  it.each([
    ["22023", "Invalid lifecycle transition", "That status change isn't allowed from the current state."],
    ["P0002", "Quote not found", "Quote not found."],
    ["28000", "Sign in required", "You need to sign in to do that."],
  ])("an everyday refusal (%s) is told plainly and not reported", async (code, message, words) => {
    state.rpcError = { code, message };
    expect(await acceptQuote(QUOTE_ID)).toEqual({ error: words, code });
    expect(state.captureError).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith("transition_quote_lifecycle refused", { code, target: "accepted" });
  });

  it("an unexpected failure is still reported", async () => {
    state.rpcError = { code: "57014", message: "canceling statement due to statement timeout" };
    expect(await acceptQuote(QUOTE_ID)).toMatchObject({ code: "57014" });
    expect(state.captureError).toHaveBeenCalledWith(state.rpcError, { route: "action:transitionQuoteLifecycle" });
  });

  it("a move the page already knows is wrong never reaches the RPC", async () => {
    status = "draft";
    expect(await markComplete(QUOTE_ID)).toEqual({ error: "Cannot move a draft quote to completed.", code: "22023" });
    expect(state.captureError).not.toHaveBeenCalled();
  });

  it("a move that works reports nothing", async () => {
    expect(await acceptQuote(QUOTE_ID)).toEqual({ ok: true, status: "accepted" });
    expect(state.captureError).not.toHaveBeenCalled();
  });
});
