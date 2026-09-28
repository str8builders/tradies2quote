import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanQuoteLine } from "@/lib/materials/scanToQuote";
import { assessQuoteTakeoffSafety } from "@/lib/quote-validation";
import { NEW_QUOTES_PAUSED } from "@/lib/trial-ended";

// createQuoteFromScan — the trial/plan gate (Finding 12) and the "I've
// checked these — go ahead anyway" override producing a SENDABLE quote
// (Finding 1). Both exercised against a minimal fake DB; the reconciliation
// maths itself is covered in scanToQuote.test.ts.

const h = vi.hoisted(() => ({ canWrite: true, native: false }));
const db = vi.hoisted(() => ({ inserted: [] as Array<Record<string, unknown>> }));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/subscription", () => ({
  getSubscriptionStatus: async () => ({ state: h.canWrite ? "trialing" : "expired" }),
  canWrite: () => h.canWrite,
}));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => h.native }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1", created_at: "2026-01-01" } } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { tax_rate: 15, tax_label: "GST", currency: "NZD", country: "NZ" } }),
            }),
          }),
        };
      }
      if (table === "quotes") {
        return {
          insert: (row: Record<string, unknown>) => {
            db.inserted.push(row);
            return { select: () => ({ single: async () => ({ data: { id: "quote-1" }, error: null }) }) };
          },
        };
      }
      // quote_items
      return { insert: async () => ({ error: null }) };
    },
  }),
}));

import { createQuoteFromScan } from "./actions";

const lines: ScanQuoteLine[] = [
  { name: "A", unit: "each", quantity: 1, price: 60, line_total: 60 },
  { name: "B", unit: "each", quantity: 1, price: 40, line_total: 40 },
];

beforeEach(() => {
  h.canWrite = true;
  h.native = false;
  db.inserted = [];
});

describe("createQuoteFromScan — trial/plan gate", () => {
  it("blocks creation once the trial has ended, same as /api/quotes/generate", async () => {
    h.canWrite = false;
    const res = await createQuoteFromScan(lines, {
      supplier: "ITM",
      gstInclusive: true,
      subtotal: 100,
      total: 100,
    });
    expect(res.error).toMatch(/free trial has ended/i);
    expect(db.inserted).toEqual([]);
  });

  it("tells the iPhone app only that new quotes are paused (App Store 3.1.3(f))", async () => {
    h.canWrite = false;
    h.native = true;
    const res = await createQuoteFromScan(lines, {
      supplier: "ITM",
      gstInclusive: true,
      subtotal: 100,
      total: 100,
    });
    expect(res.error).toBe(NEW_QUOTES_PAUSED);
  });

  it("still creates the quote while the trial is active", async () => {
    const res = await createQuoteFromScan(lines, {
      supplier: "ITM",
      gstInclusive: true,
      subtotal: 100,
      total: 100,
    });
    expect(res.id).toBe("quote-1");
    expect(db.inserted).toHaveLength(1);
  });
});

describe("createQuoteFromScan — an acknowledged subtotal mismatch is sendable", () => {
  // The printed subtotal (102) doesn't match the two lines (100) — every
  // individual line reconciles fine on its own, only the document subtotal
  // is off, which is exactly the "I've checked these" scenario.
  const mismatched = {
    supplier: "ITM",
    gstInclusive: false,
    subtotal: 102,
    total: 102,
  };

  it("without acknowledge: blocked, nothing written", async () => {
    const res = await createQuoteFromScan(lines, mismatched);
    expect(res.blocked).toBe(true);
    expect(db.inserted).toEqual([]);
  });

  it("with acknowledge: creates a quote the send gate does not block on the supplier subtotal", async () => {
    const res = await createQuoteFromScan(lines, { ...mismatched, acknowledge: true });
    expect(res.id).toBe("quote-1");
    expect(db.inserted).toHaveLength(1);
    const quoteData = db.inserted[0].quote_data as ReturnType<typeof JSON.parse>;
    // The created quote's own subtotal now matches its own lines...
    expect(quoteData.supplier_source.subtotal).toBe(100);
    // ...while the supplier's printed (mismatched) figure is kept for the record.
    expect(quoteData.supplier_source.source_subtotal).toBe(102);
    // And the send gate the quote will actually meet raises no supplier complaint.
    const safety = assessQuoteTakeoffSafety(quoteData);
    expect(safety.block_reasons.join(" ")).not.toMatch(/supplier/i);
  });
});
