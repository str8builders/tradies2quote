import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";
import type { QuoteData } from "@/lib/quote-types";

const state = vi.hoisted(() => ({
  client: null as unknown,
  captureError: vi.fn(),
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
vi.mock("@/lib/quoteEditLearning", () => ({
  applyMaterialCorrections: async () => ({ materialsLearned: 0 }),
}));
vi.mock("@/lib/tradieBrain/ingest", () => ({
  ingestFromQuoteSave: async () => undefined,
  ingestFromAcceptedPrice: async () => undefined,
}));
vi.mock("@/lib/agents/suggestPrice", () => ({ suggestPriceAgentEnabledFromEnv: () => false }));

import { confirmDimensions, saveQuoteChanges } from "./actions";
import { QUOTE_LOCKED_MESSAGE } from "@/lib/lifecycle/lock";

const OWNER = "0f7f4f6e-1111-4222-8333-944444444444";
const QUOTE_ID = "5d0a1c2e-5555-4666-8777-988888888888";
const CLIENT_NAME = "Audit Fixture Client";

const quote: QuoteData = {
  client: { name: CLIENT_NAME, address: "1 Fixture Street", email: "fixture@example.invalid", phone: null },
  job_summary: "Deck repair",
  line_items: [
    { type: "labour", description: "Deck labour", quantity: 2, unit: "hour", unit_price: 75, line_total: 150 },
  ],
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
  terms: "Fixture terms",
  notes: [],
};

let status = "draft";
let quoteUpdateError: { code: string; message: string } | null = null;
let editEventError: { code: string; message: string; details: string } | null = null;
let db: ReturnType<typeof fakeSupabase>;

function respond(op: FakeOp) {
  if (op.table === "quotes" && op.action === "select") {
    return { data: { quote_data: quote, ai_snapshot: quote, status, user_id: OWNER } };
  }
  if (op.table === "quotes" && op.action === "update") {
    return quoteUpdateError ? { error: quoteUpdateError } : { data: [{ id: QUOTE_ID }] };
  }
  if (op.table === "quote_edit_events") return { error: editEventError };
  return {};
}

const writes = () => db.ops.filter((op) => op.action !== "select");
const edited = (): QuoteData => ({
  ...quote,
  line_items: [{ ...quote.line_items[0], unit_price: 90, line_total: 180 }],
});

beforeEach(() => {
  status = "draft";
  quoteUpdateError = null;
  editEventError = null;
  state.captureError.mockReset();
  db = fakeSupabase(respond);
  state.client = {
    auth: { getUser: async () => ({ data: { user: { id: OWNER, email: "owner@example.invalid" } } }) },
    from: db.from,
  };
});

const LOCKED = ["accepted", "scheduled", "in_progress", "completed", "invoiced", "paid"];

describe("post-acceptance edit lock (server actions)", () => {
  it.each(LOCKED)("saveQuoteChanges refuses a %s quote without writing", async (s) => {
    status = s;
    expect(await saveQuoteChanges(QUOTE_ID, edited())).toEqual({ error: QUOTE_LOCKED_MESSAGE });
    expect(writes()).toEqual([]);
  });

  it.each(LOCKED)("confirmDimensions refuses a %s quote without writing", async (s) => {
    status = s;
    expect(await confirmDimensions(QUOTE_ID, edited(), [])).toEqual({ error: QUOTE_LOCKED_MESSAGE });
    expect(writes()).toEqual([]);
  });

  it.each(["draft", "sent", "viewed", "declined"])("saveQuoteChanges still saves a %s quote", async (s) => {
    status = s;
    expect(await saveQuoteChanges(QUOTE_ID, edited())).toMatchObject({ ok: true });
    const update = db.ops.find((op) => op.table === "quotes" && op.action === "update");
    expect(update?.values).toMatchObject({ total_amount: 207 });
  });

  it("reports the lock when the database trigger wins a race with an accept", async () => {
    status = "viewed";
    quoteUpdateError = { code: "55000", message: "Quote is locked after acceptance" };
    expect(await saveQuoteChanges(QUOTE_ID, edited())).toEqual({ error: QUOTE_LOCKED_MESSAGE });
    expect(db.ops.some((op) => op.table === "quote_items")).toBe(false);
  });
});

describe("quote_edit_events logging", () => {
  it("captures a failed eval-log insert without personal data and still saves", async () => {
    editEventError = {
      code: "42501",
      message: "new row violates row-level security policy",
      details: `Failing row contains (${CLIENT_NAME}, fixture@example.invalid)`,
    };
    expect(await saveQuoteChanges(QUOTE_ID, edited())).toMatchObject({ ok: true });
    expect(db.ops.some((op) => op.table === "quote_edit_events" && op.action === "insert")).toBe(true);
    expect(state.captureError).toHaveBeenCalledTimes(1);
    const [error, context] = state.captureError.mock.calls[0] as [Error, Record<string, unknown>];
    expect(error.message).toBe("quote_edit_events insert failed: 42501");
    expect(JSON.stringify([error.message, context])).not.toMatch(/Fixture Client|example\.invalid|Failing row/);
    expect(context).toMatchObject({ route: "actions/saveQuoteChanges" });
  });

  it("stays quiet when the eval-log insert succeeds", async () => {
    expect(await saveQuoteChanges(QUOTE_ID, edited())).toMatchObject({ ok: true });
    expect(state.captureError).not.toHaveBeenCalled();
  });
});
