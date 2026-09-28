// Saving from the job page never erases the customer chat. The page (or the
// classic editor) was loaded before the client's latest messages, so the
// chat it sends back is old: the save keeps the stored row's chat instead.
// Scenario from the audit: page opened 10:00, client asks at 10:05, tradie
// changes a price at 10:10.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";
import type { QuoteData } from "@/lib/quote-types";

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirected");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/quoteEditLearning", () => ({
  applyMaterialCorrections: async () => ({ materialsLearned: 0 }),
}));
vi.mock("@/lib/tradieBrain/ingest", () => ({
  ingestFromQuoteSave: async () => undefined,
  ingestFromAcceptedPrice: async () => undefined,
}));
vi.mock("@/lib/agents/suggestPrice", () => ({ suggestPriceAgentEnabledFromEnv: () => false }));

import { confirmDimensions, saveQuoteChanges } from "./actions";

const OWNER = "0f7f4f6e-1111-4222-8333-944444444444";
const QUOTE_ID = "5d0a1c2e-5555-4666-8777-988888888888";

const AT_10_00 = [{ role: "customer", content: "Could it be pine?", timestamp: "2026-09-28T10:00:00.000Z" }];
const AT_10_05 = [
  ...AT_10_00,
  { role: "customer", content: "Can you start Monday?", timestamp: "2026-09-28T10:05:00.000Z" },
  {
    role: "assistant",
    content: "I've passed that on to the builder.",
    timestamp: "2026-09-28T10:05:03.000Z",
    note_to_tradie: "Wants a Monday start",
  },
];

const quote: QuoteData = {
  client: { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: null },
  job_summary: "Deck",
  line_items: [{ type: "labour", description: "Deck labour", quantity: 2, unit: "hour", unit_price: 75, line_total: 150 }],
  materials_subtotal: 0,
  labour_subtotal: 150,
  markup_pct: 0,
  markup_amount: 0,
  subtotal_before_tax: 150,
  tax_amount: 22.5,
  total: 172.5,
  currency: "NZD",
  tax_label: "GST",
  tax_rate: 15,
  terms: "",
  notes: [],
  takeoff_inputs: { deckLengthM: 6, deckWidthM: 4 } as QuoteData["takeoff_inputs"],
  dimension_confirmation: {
    required: true,
    reasons: ["low_confidence"],
    takeoff_type: "deck",
    dimensions: [
      { key: "deckLengthM", label: "Deck length", value: 6, unit: "m", confirmed: false },
      { key: "deckWidthM", label: "Deck width", value: 4, unit: "m", confirmed: false },
    ],
    confirmed_by: null,
    confirmed_at: null,
  },
};

/** What the database holds now: the 10:05 messages are in. */
let storedChat: unknown = AT_10_05;
let db: ReturnType<typeof fakeSupabase>;

function respond(op: FakeOp) {
  if (op.table === "quotes" && op.action === "select") {
    const stored = storedChat === undefined ? quote : { ...quote, chat_history: storedChat };
    return {
      data: {
        quote_data: stored,
        ai_snapshot: quote,
        status: "draft",
        user_id: OWNER,
        // PostgREST's answer for quote_data->chat_history (null when absent).
        chat_history: storedChat ?? null,
      },
    };
  }
  if (op.table === "quotes" && op.action === "update") return { data: [{ id: QUOTE_ID }] };
  return {};
}

/** The page's copy, loaded at 10:00, with the tradie's new price. */
const fromThePage = (): QuoteData => ({
  ...quote,
  chat_history: AT_10_00,
  line_items: [{ ...quote.line_items[0], unit_price: 90, line_total: 180 }],
});

const writtenQuote = () => {
  const update = db.ops.find((op) => op.table === "quotes" && op.action === "update");
  return (update?.values as { quote_data: QuoteData }).quote_data;
};

beforeEach(() => {
  storedChat = AT_10_05;
  db = fakeSupabase(respond);
  state.client = {
    auth: { getUser: async () => ({ data: { user: { id: OWNER, email: "owner@example.invalid" } } }) },
    from: db.from,
  };
});

describe("saveQuoteChanges keeps the stored chat", () => {
  it("saves the new price and the client's newer messages, not the page's old copy", async () => {
    expect(await saveQuoteChanges(QUOTE_ID, fromThePage())).toMatchObject({ ok: true });
    const saved = writtenQuote();
    expect(saved.line_items[0].unit_price).toBe(90);
    expect(saved.chat_history).toEqual(AT_10_05);
  });

  it("never adds a chat the quote doesn't have", async () => {
    storedChat = undefined;
    expect(await saveQuoteChanges(QUOTE_ID, fromThePage())).toMatchObject({ ok: true });
    expect("chat_history" in writtenQuote()).toBe(false);
  });

  it("keeps the chat when the page sends none", async () => {
    const { chat_history: _chat, ...withoutChat } = fromThePage();
    expect(await saveQuoteChanges(QUOTE_ID, withoutChat)).toMatchObject({ ok: true });
    expect(writtenQuote().chat_history).toEqual(AT_10_05);
  });
});

describe("confirmDimensions keeps the stored chat", () => {
  it("reads only the chat back and writes it with the confirmed sizes", async () => {
    const result = await confirmDimensions(QUOTE_ID, fromThePage(), []);
    expect(result).toMatchObject({ ok: true, changed: false });
    const select = db.ops.find((op) => op.table === "quotes" && op.action === "select");
    expect(select?.columns).toContain("chat_history:quote_data->chat_history");
    const saved = writtenQuote();
    expect(saved.dimension_confirmation?.dimensions.every((d) => d.confirmed)).toBe(true);
    expect(saved.chat_history).toEqual(AT_10_05);
  });

  it("never adds a chat the quote doesn't have", async () => {
    storedChat = undefined;
    expect(await confirmDimensions(QUOTE_ID, fromThePage(), [])).toMatchObject({ ok: true });
    expect("chat_history" in writtenQuote()).toBe(false);
  });
});

describe("confirmDimensions and the automated check", () => {
  const checked = (): QuoteData => ({
    ...fromThePage(),
    takeoff_evaluation: { status: "fail", reasons: ["Joist count doesn't match a 6 m deck"], confidence: 0.4 },
  });

  it("keeps the check when the sizes are only confirmed", async () => {
    expect(await confirmDimensions(QUOTE_ID, checked(), [])).toMatchObject({ ok: true, changed: false });
    expect(writtenQuote().takeoff_evaluation?.status).toBe("fail");
  });

  it("drops the check that judged the old lines once a corrected size re-works them", async () => {
    const result = await confirmDimensions(QUOTE_ID, checked(), [{ key: "deckLengthM", value: 5 }]);
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(writtenQuote().takeoff_evaluation).toBeUndefined();
  });
});
