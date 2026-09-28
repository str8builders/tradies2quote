import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicQuotePayload } from "@/lib/quote-types";

const state = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
vi.mock("../runtime", () => ({
  runStructuredAgent: async (opts: Record<string, unknown>) => {
    state.calls.push(opts);
    return { value: { intent: "general_question", reply: "Happy to help.", confidence: 0.9 } };
  },
}));

import { buildUserTurn, runCustomerChat } from "../customer-chat";

/** A 20% markup ($1,168.76) on the materials; labour as priced. */
const QUOTE: PublicQuotePayload = {
  id: "q-1", status: "viewed", created_at: "2026-09-01T09:00:00.000Z", sent_at: null, expires_at: "2026-10-01T09:00:00.000Z",
  accepted_at: null, accepted_name: null, accepted_quote_version: 0, version: 1, currency: "NZD",
  has_pdf: true, has_signature: false, has_logo: false, business_name: "Bayside Builders", business_email: null, business_phone: null,
  client: { name: "Dave Thompson", address: null, email: null, phone: null },
  job_summary: "Kwila deck",
  line_items: [
    { type: "material", description: "Deck joists H3.2 SG8 4.8m", quantity: 14, unit: "lengths", unit_price: 62, line_total: 868 },
    { type: "material", description: "Deck bearers H4 4.8m", quantity: 6, unit: "lengths", unit_price: 118, line_total: 708 },
    { type: "material", description: "Kwila decking 140x19", quantity: 184.8, unit: "m", unit_price: 17.95, line_total: 3317.16 },
    { type: "material", description: "Joist hangers", quantity: 15, unit: "each", unit_price: 3.85, line_total: 57.75 },
    { type: "material", description: "Concrete piles", quantity: 20, unit: "each", unit_price: 34.5, line_total: 690 },
    { type: "material", description: "Stainless decking screws (500)", quantity: 2, unit: "pack", unit_price: 89, line_total: 178 },
    { type: "material", description: "Joist hanger nails", quantity: 1, unit: "box", unit_price: 24.9, line_total: 24.9 },
    { type: "labour", description: "Labour — 2 builders", quantity: 3, unit: "days", unit_price: 1200, line_total: 3600 },
  ],
  materials_subtotal: 5843.81,
  labour_subtotal: 3600,
  markup_amount: 1168.76,
  subtotal_before_tax: 10612.57,
  tax_amount: 1591.89,
  total: 12204.46,
  tax_label: "GST",
  tax_rate: 15,
  terms: "50% deposit on acceptance, balance on completion. Quote valid 30 days.",
};

const input = (customerMessage = "What's the markup on the timber?") => ({
  quote: QUOTE,
  tradieBusinessName: "Bayside Builders",
  customerMessage,
  history: [],
});

beforeEach(() => {
  state.calls = [];
});

describe("customer chat — the agent never learns the tradie's markup", () => {
  it("the quote context shows the client's prices, with no markup figure or row", () => {
    const turn = buildUserTurn(input("Hi"));
    expect(turn).not.toMatch(/mark\s*-?\s*up/i);
    expect(turn).not.toContain("1168.76");
    // The materials carry the markup: $868 of joists is $1041.6 to the client.
    expect(turn).toContain("= NZD 1041.6 (material)");
    expect(turn).not.toContain("= NZD 868 (material)");
    // Labour as priced; subtotal, GST and total as the tradie's totals.
    expect(turn).toContain("= NZD 3600 (labour)");
    expect(turn).toContain("Materials subtotal: NZD 7012.57");
    expect(turn).toContain("Subtotal before tax: NZD 10612.57");
    expect(turn).toContain("Total (inc. tax): NZD 12204.46");
  });

  it("the instructions never mention a markup", async () => {
    await runCustomerChat(input());
    expect(String(state.calls[0].system)).not.toMatch(/mark\s*-?\s*up/i);
  });

  it("a reply stating the markup, or a pre-markup price, is sent back to be rewritten", async () => {
    await runCustomerChat(input("How much do you add on top?"));
    const parse = state.calls[0].parse as (raw: unknown) => { ok: boolean };
    const reply = (text: string) => parse({ intent: "general_question", reply: text, confidence: 0.8 });
    expect(reply("The markup comes to $1,168.76.").ok).toBe(false);
    expect(reply("The joists are $868.").ok).toBe(false);
    expect(reply("The joists are $1,041.60 and the total is $12,204.46.").ok).toBe(true);
  });
});
