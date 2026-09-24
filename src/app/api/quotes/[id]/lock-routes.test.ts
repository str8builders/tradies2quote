import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/subscription", () => ({
  getSubscriptionStatus: async () => ({ state: "active" }),
  canWrite: () => true,
}));
vi.mock("@/lib/compliance", () => ({
  complianceReviewEnabledFromEnv: () => true,
  safelyReviewQuote: async (items: unknown[]) => ({
    status: "ok",
    items,
    clarifications: [],
    warnings: [],
    citations: [],
    diagnostics: {},
  }),
}));

import { POST as regenerate } from "./transcript/regenerate/route";
import { POST as editTranscript } from "./transcript/route";
import { POST as clarify } from "./compliance/clarify/route";
import { QUOTE_LOCKED_MESSAGE } from "@/lib/lifecycle/lock";

const OWNER = "0f7f4f6e-1111-4222-8333-944444444444";
const QUOTE_ID = "5d0a1c2e-5555-4666-8777-988888888888";
const quoteData = {
  client: { name: "Fixture", address: null, email: null, phone: null },
  line_items: [{ type: "labour", description: "Labour", quantity: 1, unit: "hour", unit_price: 80, line_total: 80 }],
  transcript: { raw: "raw", cleaned: "cleaned" },
};

let status: string | null = "draft";
let conditionalRows: unknown[] = [{ id: QUOTE_ID }];
let db: ReturnType<typeof fakeSupabase>;

function respond(op: FakeOp) {
  if (op.table === "quotes" && op.action === "select") {
    return { data: { id: QUOTE_ID, user_id: OWNER, status, quote_data: quoteData, voice_transcript: "deck" } };
  }
  if (op.table === "quotes" && op.action === "update") return { data: conditionalRows };
  return {};
}

const ctx = () => ({ params: Promise.resolve({ id: QUOTE_ID }) });
const post = (path: string, body: unknown) =>
  new NextRequest(`https://tradies2quote.com/api/quotes/${QUOTE_ID}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const quoteUpdates = () => db.ops.filter((op) => op.table === "quotes" && op.action === "update");

beforeEach(() => {
  status = "draft";
  conditionalRows = [{ id: QUOTE_ID }];
  db = fakeSupabase(respond);
  state.client = {
    auth: { getUser: async () => ({ data: { user: { id: OWNER, email: "owner@example.invalid", created_at: "2026-01-01T00:00:00Z" } } }) },
    from: db.from,
  };
});

describe("regenerate from transcript — drafts only", () => {
  it.each(["sent", "viewed", "accepted", "scheduled", "in_progress", "completed", "declined", "expired"])(
    "answers 409 for a %s quote and wipes nothing",
    async (s) => {
      status = s;
      const res = await regenerate(post("transcript/regenerate", { cleanedTranscript: "new text" }), ctx());
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("not_draft");
      expect(body.error).toMatch(s === "sent" || s === "viewed" || s === "declined" || s === "expired"
        ? /Only draft quotes can be regenerated/
        : /accepted.*locked/);
      expect(quoteUpdates()).toEqual([]);
    },
  );

  it("clears a draft for regeneration, conditional on it still being a draft", async () => {
    const res = await regenerate(post("transcript/regenerate", { cleanedTranscript: "new text" }), ctx());
    expect(res.status).toBe(200);
    const [update] = quoteUpdates();
    expect(update.values).toMatchObject({ voice_transcript: "new text", quote_data: null, total_amount: null });
    expect(db.eqValue(update, "status")).toBe("draft");
    expect(db.eqValue(update, "user_id")).toBe(OWNER);
  });

  it("answers 409 when the quote was sent between the check and the write", async () => {
    conditionalRows = [];
    const res = await regenerate(post("transcript/regenerate", { cleanedTranscript: "new text" }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("not_draft");
  });
});

describe("other quote_data writers respect the lock", () => {
  it.each(["accepted", "scheduled", "in_progress", "completed"])("transcript edit refuses a %s quote", async (s) => {
    status = s;
    const res = await editTranscript(post("transcript", { cleanedTranscript: "typo fix" }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(QUOTE_LOCKED_MESSAGE);
    expect(quoteUpdates()).toEqual([]);
  });

  it("transcript edit still works on a sent quote", async () => {
    status = "sent";
    const res = await editTranscript(post("transcript", { cleanedTranscript: "typo fix" }), ctx());
    expect(res.status).toBe(200);
    expect(quoteUpdates()).toHaveLength(1);
  });

  it.each(["accepted", "scheduled", "in_progress", "completed"])("compliance clarify refuses a %s quote", async (s) => {
    status = s;
    const res = await clarify(post("compliance/clarify", { wall: { exterior: true } }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(QUOTE_LOCKED_MESSAGE);
    expect(quoteUpdates()).toEqual([]);
  });

  it("compliance clarify still works on a draft", async () => {
    const res = await clarify(post("compliance/clarify", { wall: { exterior: true } }), ctx());
    expect(res.status).toBe(200);
    expect(quoteUpdates()).toHaveLength(1);
  });
});
