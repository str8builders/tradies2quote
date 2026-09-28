import { describe, expect, it } from "vitest";
import { computeQuoteTotals, round2 } from "./quote-defaults";
import type { PublicQuotePayload, QuoteData, QuoteLineItem } from "./quote-types";
import {
  allocateCents,
  foldMarkupIntoLines,
  publicQuoteForClient,
  quoteDataForClient,
  unitPriceFor,
} from "./quote-client-view";

const cents = (n: number) => Math.round(round2(n) * 100);
const line = (type: QuoteLineItem["type"], description: string, quantity: number, unit_price: number): QuoteLineItem => ({
  type, description, quantity, unit: "each", unit_price, line_total: round2(quantity * unit_price),
});

function quoteOf(items: QuoteLineItem[], markup_pct: number, tax_rate = 15): QuoteData {
  return {
    client: { name: "Sam Taylor", address: null, email: null, phone: null },
    job_summary: "Deck",
    line_items: items,
    ...computeQuoteTotals(items, markup_pct, tax_rate),
    markup_pct,
    tax_rate,
    tax_label: "GST",
    currency: "NZD",
    terms: "",
    notes: [],
  };
}

/** Every promise the client view makes, for one quote. */
function expectClientView(tradie: QuoteData) {
  const client = quoteDataForClient(tradie);
  // Totals never change.
  expect(client.subtotal_before_tax).toBe(tradie.subtotal_before_tax);
  expect(client.tax_amount).toBe(tradie.tax_amount);
  expect(client.total).toBe(tradie.total);
  // No markup left to show.
  expect(client.markup_amount).toBe(0);
  expect(client.markup_pct).toBe(0);
  // The lines add up to exactly the tradie's subtotal, and so do the rows.
  const sum = client.line_items.reduce((s, l) => s + cents(l.line_total), 0);
  expect(sum).toBe(cents(tradie.subtotal_before_tax));
  expect(cents(client.materials_subtotal) + cents(client.labour_subtotal)).toBe(cents(tradie.subtotal_before_tax));
  client.line_items.forEach((l, i) => {
    const before = tradie.line_items[i];
    expect(l.description).toBe(before.description);
    expect(l.quantity).toBe(before.quantity);
    if (l.type === "labour") {
      // Labour is shown as priced.
      expect(l.unit_price).toBe(before.unit_price);
      expect(l.line_total).toBe(before.line_total);
    } else if (Number(l.quantity) !== 0) {
      // Quantity × the shown price is the shown total.
      expect(cents(l.quantity * l.unit_price)).toBe(cents(l.line_total));
    }
  });
  // Every marked-up line carries its share: within a cent of base × ratio.
  const markedBase = tradie.line_items.filter((l) => l.type !== "labour").reduce((s, l) => s + cents(l.line_total), 0);
  if (markedBase !== 0) {
    const ratio = (markedBase + cents(tradie.markup_amount)) / markedBase;
    client.line_items.forEach((l, i) => {
      if (l.type === "labour") return;
      expect(Math.abs(cents(l.line_total) - cents(tradie.line_items[i].line_total) * ratio)).toBeLessThan(1);
    });
  }
  return client;
}

describe("quoteDataForClient — the markup folded into the client's prices", () => {
  it("folds 20% into materials and other, never labour, and the lines add up", () => {
    const tradie = quoteOf(
      [
        line("material", "Decking boards", 20, 12.5),
        line("material", "Screws", 2, 40),
        line("other", "Skip hire", 1, 120),
        line("labour", "Deck build", 10, 85),
      ],
      20,
    );
    expect(tradie.markup_amount).toBe(90);
    const client = expectClientView(tradie);
    expect(client.line_items.map((l) => [l.unit_price, l.line_total])).toEqual([
      [15, 300],
      [48, 96],
      [144, 144],
      [85, 850],
    ]);
    expect(client.materials_subtotal).toBe(540);
    expect(client.labour_subtotal).toBe(850);
  });

  it("keeps cents exact with awkward quantities and rates", () => {
    const tradie = quoteOf(
      [
        line("material", "Kwila decking 140x19", 184.8, 17.95),
        line("material", "Joist hangers", 7, 3.33),
        line("material", "Post-hole concrete", 0.237504404611388, 400),
        line("material", "Fixings", 1299999.9999999998, 0.123456789012345),
        line("other", "Delivery", 3, 33.333),
        line("labour", "Labour — 2 builders", 3, 1200),
      ],
      17.5,
    );
    const client = expectClientView(tradie);
    // A short rate, close to 17.95 × 1.175, that reproduces the line's cents.
    const decking = client.line_items[0];
    expect(decking.unit_price).toBeCloseTo(21.09125, 4);
    expect(String(decking.unit_price).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(5);
  });

  it("holds its promises across many random quotes", () => {
    let seed = 20260929;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const types = ["material", "material", "other", "labour"] as const;
    for (let trial = 0; trial < 400; trial++) {
      const items = Array.from({ length: 1 + Math.floor(random() * 9) }, (_, i) =>
        line(
          types[Math.floor(random() * types.length)],
          `Line ${i}`,
          Math.round(random() * 5000) / (random() < 0.5 ? 1 : 1000),
          Math.round(random() * 100000) / (random() < 0.5 ? 100 : 1000),
        ),
      );
      const markup = [0, 5, 10, 12.5, 15, 17.5, 20, 25, 33.3, 200][Math.floor(random() * 10)];
      expectClientView(quoteOf(items, markup, [0, 10, 15, 20][Math.floor(random() * 4)]));
    }
  });

  it("changes nothing when there is no markup", () => {
    const tradie = quoteOf([line("material", "Timber", 3, 9.99), line("labour", "Labour", 2, 70)], 0);
    const client = quoteDataForClient(tradie);
    expect(client.line_items).toEqual(tradie.line_items);
    expect(client.total).toBe(tradie.total);
  });

  it("is idempotent", () => {
    const tradie = quoteOf([line("material", "Timber", 7, 3.33), line("other", "Skip", 1, 99.99), line("labour", "Labour", 5, 85)], 20);
    const once = quoteDataForClient(tradie);
    expect(quoteDataForClient(once)).toEqual(once);
  });

  it("never touches the tradie's own copy", () => {
    const tradie = quoteOf([line("material", "Timber", 7, 3.33)], 20);
    const snapshot = JSON.stringify(tradie);
    quoteDataForClient(tradie);
    expect(JSON.stringify(tradie)).toBe(snapshot);
  });

  it("folds a small drift in the stored figures so the lines still add up to what the client is billed", () => {
    const tradie = quoteOf([line("material", "Timber", 3, 10), line("labour", "Labour", 1, 100)], 10);
    const drifted = { ...tradie, subtotal_before_tax: round2(tradie.subtotal_before_tax + 0.01) };
    const client = quoteDataForClient(drifted);
    expect(client.line_items[0].line_total).toBe(33.01);
    expect(client.line_items[1].line_total).toBe(100);
  });

  it("leaves lines alone when the stored figures can't be trusted", () => {
    const tradie = quoteOf([line("material", "Timber", 3, 10), line("labour", "Labour", 1, 100)], 10);
    for (const subtotal of [undefined, null, Number.NaN, 0, 5000]) {
      const client = quoteDataForClient({ ...tradie, subtotal_before_tax: subtotal as unknown as number });
      expect(client.line_items.map((l) => l.line_total)).toEqual([30, 100]);
      expect(client.markup_amount).toBe(0);
    }
  });
});

describe("publicQuoteForClient — the public page payload", () => {
  const payload = (): PublicQuotePayload => ({
    id: "q-1", status: "sent", created_at: "2026-09-01T00:00:00Z", sent_at: null, expires_at: null,
    accepted_at: null, accepted_name: null, accepted_quote_version: 1, version: 1, currency: "NZD",
    has_pdf: true, has_signature: false, has_logo: false, business_name: "Bayside Builders",
    business_email: null, business_phone: null,
    client: { name: "Dave", address: null, email: null, phone: null },
    job_summary: "Deck",
    line_items: [
      { type: "material", description: "Deck joists", quantity: 14, unit: "lengths", unit_price: 62, line_total: 868 },
      { type: "material", description: "Kwila decking", quantity: 184.8, unit: "m", unit_price: 17.95, line_total: 3317.16 },
      { type: "material", description: "Joist hanger nails", quantity: 1, unit: "box", unit_price: 24.9, line_total: 24.9 },
      { type: "labour", description: "Labour", quantity: 3, unit: "days", unit_price: 1200, line_total: 3600 },
    ],
    materials_subtotal: 4210.06,
    labour_subtotal: 3600,
    markup_amount: 842.01,
    subtotal_before_tax: 8652.07,
    tax_amount: 1297.81,
    total: 9949.88,
    tax_label: "GST",
    tax_rate: 15,
    terms: null,
  });

  it("shows no markup and the same total the client accepts", () => {
    const client = publicQuoteForClient(payload());
    expect(client.markup_amount).toBe(0);
    expect(client.total).toBe(9949.88);
    expect(client.subtotal_before_tax).toBe(8652.07);
    const sum = client.line_items.reduce((s, l) => s + cents(l.line_total), 0);
    expect(sum).toBe(865207);
    expect(client.materials_subtotal).toBe(5052.07);
    expect(client.line_items[3]).toEqual(payload().line_items[3]);
    expect(client.line_items[0]).toMatchObject({ unit_price: 74.4, line_total: 1041.6 });
  });

  it("copes with a payload that has no lines or totals", () => {
    const bare = { ...payload(), line_items: undefined, subtotal_before_tax: undefined } as unknown as PublicQuotePayload;
    const client = publicQuoteForClient(bare);
    expect(client.line_items).toEqual([]);
    expect(client.markup_amount).toBe(0);
  });
});

describe("allocateCents", () => {
  it("adds up exactly, each share within a cent, zero weights stay zero", () => {
    const weights = [2331, 331716, 0, 9500, -1200, 12000];
    const total = 423457;
    const shares = allocateCents(weights, total);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
    const sum = weights.reduce((a, b) => a + b, 0);
    shares.forEach((s, i) => expect(Math.abs(s - (weights[i] * total) / sum)).toBeLessThan(1));
    expect(shares[2]).toBe(0);
  });

  it("stays exact for very large quotes", () => {
    const shares = allocateCents([987654321012, 123456789098, 1], 1333333333333);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1333333333333);
  });
});

describe("unitPriceFor", () => {
  it("prefers the shortest price that reproduces the total", () => {
    expect(unitPriceFor(20, 30000, 0)).toBe(15);
    expect(unitPriceFor(7, 2797, 0)).toBe(3.996);
    expect(unitPriceFor(0, 0, 12.3456789)).toBe(12.3457);
  });
});

describe("foldMarkupIntoLines", () => {
  it("returns copies", () => {
    const lines = [line("material", "A", 1, 10)];
    const out = foldMarkupIntoLines(lines, 12);
    expect(out[0]).not.toBe(lines[0]);
    expect(lines[0].line_total).toBe(10);
    expect(out[0].line_total).toBe(12);
  });
});
