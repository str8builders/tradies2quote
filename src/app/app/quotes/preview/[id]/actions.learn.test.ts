// saveQuoteChanges' learnMaterials option: the new job page's price keypad
// turns library learning off for one save ("Remember for next time" off).
// Everything else about the save must stay exactly as it was.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";
import type { QuoteData } from "@/lib/quote-types";

const state = vi.hoisted(() => ({
  client: null as unknown,
  learn: vi.fn(),
  brain: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirected");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/quoteEditLearning", () => ({
  applyMaterialCorrections: (...args: unknown[]) => state.learn(...args),
}));
vi.mock("@/lib/tradieBrain/ingest", () => ({
  ingestFromQuoteSave: (...args: unknown[]) => state.brain(...args),
  ingestFromAcceptedPrice: async () => undefined,
}));
vi.mock("@/lib/agents/suggestPrice", () => ({ suggestPriceAgentEnabledFromEnv: () => false }));

import { saveQuoteChanges } from "./actions";

const OWNER = "0f7f4f6e-1111-4222-8333-944444444444";
const QUOTE_ID = "5d0a1c2e-5555-4666-8777-988888888888";

const stored: QuoteData = {
  client: { name: "Fixture Client", address: null, email: "fixture@example.invalid", phone: null },
  job_summary: "Deck repair",
  line_items: [
    { type: "material", description: "Joist hanger 190 mm", quantity: 28, unit: "each", unit_price: 0, line_total: 0, is_missing_price: true },
    { type: "labour", description: "Labour", quantity: 2, unit: "day", unit_price: 560, line_total: 1120 },
  ],
  materials_subtotal: 0,
  labour_subtotal: 1120,
  markup_pct: 0,
  markup_amount: 0,
  subtotal_before_tax: 1120,
  tax_amount: 168,
  total: 1288,
  currency: "NZD",
  tax_label: "GST",
  tax_rate: 15,
  terms: "Fixture terms",
  notes: [],
};

/** The keypad's save: the hanger now has a price. */
const priced = (): QuoteData => ({
  ...stored,
  line_items: [{ ...stored.line_items[0], unit_price: 3.85, is_missing_price: false }, stored.line_items[1]],
});

let db: ReturnType<typeof fakeSupabase>;

function respond(op: FakeOp) {
  if (op.table === "quotes" && op.action === "select") {
    return { data: { quote_data: stored, ai_snapshot: stored, status: "draft", user_id: OWNER } };
  }
  if (op.table === "quotes" && op.action === "update") return { data: [{ id: QUOTE_ID }] };
  return {};
}

beforeEach(() => {
  state.learn.mockReset();
  state.learn.mockResolvedValue({ materialsLearned: 1, failed: 0 });
  state.brain.mockReset();
  state.brain.mockResolvedValue(undefined);
  db = fakeSupabase(respond);
  state.client = {
    auth: { getUser: async () => ({ data: { user: { id: OWNER, email: "owner@example.invalid" } } }) },
    from: db.from,
  };
});

describe("saveQuoteChanges — learnMaterials option", () => {
  it("learns by default, exactly as before (no options argument)", async () => {
    expect(await saveQuoteChanges(QUOTE_ID, priced())).toEqual({ ok: true, materialsLearned: 1 });
    expect(state.learn).toHaveBeenCalledTimes(1);
    const [, userId, items, prior] = state.learn.mock.calls[0] as [unknown, string, QuoteData["line_items"], QuoteData["line_items"]];
    expect(userId).toBe(OWNER);
    expect(items[0]).toMatchObject({ description: "Joist hanger 190 mm", unit_price: 3.85, line_total: 107.8 });
    expect(prior).toEqual(stored.line_items);
  });

  it.each([{}, { learnMaterials: true }, { learnMaterials: undefined }])("learns with %o", async (options) => {
    await saveQuoteChanges(QUOTE_ID, priced(), options);
    expect(state.learn).toHaveBeenCalledTimes(1);
  });

  it("skips only the library learning when learnMaterials is false", async () => {
    expect(await saveQuoteChanges(QUOTE_ID, priced(), { learnMaterials: false })).toEqual({
      ok: true,
      materialsLearned: 0,
    });
    expect(state.learn).not.toHaveBeenCalled();
    // The quote itself still saves with server-recomputed totals…
    const update = db.ops.find((op) => op.table === "quotes" && op.action === "update");
    expect(update?.values).toMatchObject({ total_amount: 1411.97, currency: "NZD" });
    // …its line items are rewritten, the eval diff is logged, and the
    // owner-only observe-only brain still sees the save.
    expect(db.ops.some((op) => op.table === "quote_items" && op.action === "insert")).toBe(true);
    expect(db.ops.some((op) => op.table === "quote_edit_events" && op.action === "insert")).toBe(true);
    expect(state.brain).toHaveBeenCalledTimes(1);
  });

  it("treats a null options value (bad client input) as the default", async () => {
    await saveQuoteChanges(QUOTE_ID, priced(), null as unknown as undefined);
    expect(state.learn).toHaveBeenCalledTimes(1);
  });
});
