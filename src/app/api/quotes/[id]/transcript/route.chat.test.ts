// Fixing the transcript writes the whole quote_data back: the customer chat
// in it must be exactly what the row held, never a copy from anywhere else.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));

import { POST } from "./route";

const OWNER = "0f7f4f6e-1111-4222-8333-944444444444";
const QUOTE_ID = "5d0a1c2e-5555-4666-8777-988888888888";
const CHAT = [
  { role: "customer", content: "Can you start Monday?", timestamp: "2026-09-28T10:05:00.000Z" },
  { role: "assistant", content: "Passed on.", timestamp: "2026-09-28T10:05:02.000Z", note_to_tradie: "Monday start" },
];

let stored: Record<string, unknown>;
let db: ReturnType<typeof fakeSupabase>;

function respond(op: FakeOp) {
  if (op.table === "quotes" && op.action === "select") {
    return { data: { id: QUOTE_ID, user_id: OWNER, status: "draft", quote_data: stored } };
  }
  return {};
}

const post = (body: unknown) =>
  new NextRequest(`https://tradies2quote.com/api/quotes/${QUOTE_ID}/transcript`, {
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
    line_items: [],
    transcript: { raw: "raw", cleaned: "old words" },
    chat_history: CHAT,
  };
  db = fakeSupabase(respond);
  state.client = {
    auth: { getUser: async () => ({ data: { user: { id: OWNER } } }) },
    from: db.from,
  };
});

describe("transcript fix keeps the stored chat", () => {
  it("writes the fixed words with the chat exactly as stored", async () => {
    const res = await POST(post({ cleanedTranscript: "new words", chat_history: [] }), ctx());
    expect(res.status).toBe(200);
    expect(written().transcript).toEqual({ raw: "raw", cleaned: "new words" });
    expect(written().chat_history).toEqual(CHAT);
  });

  it("adds no chat to a quote without one", async () => {
    delete stored.chat_history;
    const res = await POST(post({ cleanedTranscript: "new words" }), ctx());
    expect(res.status).toBe(200);
    expect("chat_history" in written()).toBe(false);
  });
});
