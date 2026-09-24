import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit 2026-09-24, item 11 — the T2QCAL → quote handoff must put a price in
 * CENTS on the quote line (a converted calculator price arrived as
 * $191.138714496/yd³), and label tax by the business country (item 9).
 */

const state = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  profile: {} as Record<string, unknown>,
  handoff: [] as Array<{ input: { unitPrice: number }; profile: { tax_label: string }; fingerprint: string }>,
  inserted: null as null | Record<string, unknown>,
}));

vi.mock("@/lib/t2qcal-api", () => ({
  privateHeaders: { "Cache-Control": "private, no-store" },
  smallJSON: async () => state.body,
  calculatorAccount: async () => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    const profiles = {
      select: () => profiles,
      eq: () => profiles,
      single: async () => ({ data: state.profile, error: null }),
    };
    const db = {
      from: (table: string) =>
        table === "profiles"
          ? profiles
          : {
              ...q,
              insert: (row: Record<string, unknown>) => {
                state.inserted = row;
                const ins = { select: () => ins, single: async () => ({ data: { id: row.id }, error: null }) };
                return ins;
              },
            },
    };
    return { db, user: { id: "user-1" } };
  },
}));

vi.mock("@/t2qcal/lib/quote-handoff", async () => {
  const { round2, computeQuoteTotals } = await import("@/lib/quote-defaults");
  return {
    validateHandoff: (raw: unknown) => raw,
    handoffQuote: (
      input: { unitPrice: number; quantity: number; unit: string; description: string; clientName: string },
      profile: { currency: string; tax_label: string; tax_rate: number; default_markup_pct: number },
      fingerprint: string,
    ) => {
      state.handoff.push({ input, profile, fingerprint });
      const line = {
        type: "material" as const,
        description: input.description,
        quantity: input.quantity,
        unit: input.unit,
        unit_price: input.unitPrice,
        line_total: round2(input.quantity * input.unitPrice),
      };
      return {
        client: { name: input.clientName, address: null, email: null, phone: null },
        job_summary: "estimate",
        line_items: [line],
        ...computeQuoteTotals([line], profile.default_markup_pct, profile.tax_rate),
        markup_pct: profile.default_markup_pct,
        tax_rate: profile.tax_rate,
        tax_label: profile.tax_label,
        currency: profile.currency,
        terms: "",
        notes: [],
      };
    },
  };
});

import { PUT } from "./route";

const ID = "8b7c1f2e-3a4d-4e5f-8a9b-0c1d2e3f4a5b";

describe("PUT /api/t2qcal/quotes/[id] — handoff price in cents", () => {
  beforeEach(() => {
    state.handoff.length = 0;
    state.inserted = null;
    state.profile = { country: "UK", currency: "GBP", tax_label: "GST", tax_rate: 20, default_markup_pct: 0 };
    state.body = {
      mode: "manual",
      description: "Ready-mix concrete",
      quantity: 3,
      unit: "yd³",
      unitPrice: 191.138714496,
      clientName: "Pat",
      snapshot: { slug: "concrete" },
    };
  });

  it("rounds the unit price to cents before building the quote line", async () => {
    const res = await PUT(new Request("https://app.test/api/t2qcal/quotes/x", { method: "PUT" }), {
      params: Promise.resolve({ id: ID }),
    });
    expect(res.status).toBe(201);
    expect(state.handoff).toHaveLength(1);
    expect(state.handoff[0].input.unitPrice).toBe(191.14);
    const qd = state.inserted?.quote_data as { line_items: Array<{ unit_price: number; line_total: number }> };
    expect(qd.line_items[0].unit_price).toBe(191.14);
    expect(qd.line_items[0].line_total).toBe(573.42);
  });

  it("fingerprints the transfer as sent, so a retry still finds its draft", async () => {
    await PUT(new Request("https://app.test/api/t2qcal/quotes/x", { method: "PUT" }), {
      params: Promise.resolve({ id: ID }),
    });
    const expected = createHash("sha256").update(JSON.stringify(state.body)).digest("hex");
    expect(state.handoff[0].fingerprint).toBe(expected);
  });

  it("labels tax by the business country (UK → VAT, never the column-default GST)", async () => {
    await PUT(new Request("https://app.test/api/t2qcal/quotes/x", { method: "PUT" }), {
      params: Promise.resolve({ id: ID }),
    });
    expect(state.handoff[0].profile.tax_label).toBe("VAT");
    expect((state.inserted?.quote_data as { tax_label: string }).tax_label).toBe("VAT");
  });
});
