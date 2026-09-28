// A compliance answer writes the whole quote_data back: the customer chat in
// it must be exactly what the row held, never a copy from anywhere else.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
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

import { POST } from "./route";

const OWNER = "0f7f4f6e-1111-4222-8333-944444444444";
const QUOTE_ID = "5d0a1c2e-5555-4666-8777-988888888888";
const CHAT = [
  { role: "customer", content: "Is the timber treated?", timestamp: "2026-09-28T10:05:00.000Z" },
  { role: "assistant", content: "Yes, H3.2.", timestamp: "2026-09-28T10:05:02.000Z" },
];

let stored: Record<string, unknown>;
let db: ReturnType<typeof fakeSupabase>;

function respond(op: FakeOp) {
  if (op.table === "quotes" && op.action === "select") {
    return { data: { id: QUOTE_ID, user_id: OWNER, status: "sent", quote_data: stored, voice_transcript: "deck" } };
  }
  return {};
}

const post = (body: unknown) =>
  new NextRequest(`https://tradies2quote.com/api/quotes/${QUOTE_ID}/compliance/clarify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = () => ({ params: Promise.resolve({ id: QUOTE_ID }) });
const written = () =>
  (db.ops.find((op) => op.table === "quotes" && op.action === "update")?.values as { quote_data: Record<string, unknown> })
    .quote_data;

beforeEach(() => {
  stored = {
    client: { name: "Sam", address: null, email: null, phone: null },
    line_items: [{ type: "labour", description: "Labour", quantity: 1, unit: "hour", unit_price: 80, line_total: 80 }],
    chat_history: CHAT,
  };
  db = fakeSupabase(respond);
  state.client = {
    auth: { getUser: async () => ({ data: { user: { id: OWNER } } }) },
    from: db.from,
  };
});

describe("compliance answers keep the stored chat", () => {
  it("writes the review with the chat exactly as stored", async () => {
    const res = await POST(post({ wall: { exterior: true } }), ctx());
    expect(res.status).toBe(200);
    expect(written().compliance_review).toMatchObject({ status: "ok", context: { wall: { exterior: true } } });
    expect(written().chat_history).toEqual(CHAT);
  });

  it("adds no chat to a quote without one", async () => {
    delete stored.chat_history;
    const res = await POST(post({ wall: { exterior: true } }), ctx());
    expect(res.status).toBe(200);
    expect("chat_history" in written()).toBe(false);
  });
});
