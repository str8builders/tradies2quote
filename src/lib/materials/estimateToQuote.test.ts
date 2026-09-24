import { describe, expect, it } from "vitest";
import {
  buildMirrorQuoteLines,
  buildQuoteLinesFromEstimate,
  computeQuoteTotals,
  resolveOrderQuantity,
} from "./estimateToQuote";
import type { ExtractedSupplierItem } from "./quoteExtraction";
import type { LibraryMaterial, QuoteLineItem } from "../quote-types";

// Oregon Group ITM "Estimate 5578382" — the repro fixture. Units are the
// NORMALISED forms quoteExtraction emits (LM → "m", EA → "each", etc.).
const item = (
  name: string,
  unit: string,
  quantity: number | null,
  pieces: number | null = null,
): ExtractedSupplierItem => ({
  name,
  unit,
  price: null,
  sku: null,
  quantity,
  pieces,
  source_line_total: null,
  raw_text: null,
  confidence: 0.9,
});

const OREGON_ITM: ExtractedSupplierItem[] = [
  item("Malthoid DPC 50mm x 20m", "each", 2),
  item("Screw bolt CSK galv 8 x 100", "each", 50),
  item("45 x 45 RAD H3.2 wet PG No.1", "m", 50),
  item("L/Lok pile fixing kit SS 12kN", "each", 2),
  item("Square washer S/S 12mm x 50 x 50 x 3 316", "each", 8),
  item("Engineer bolt & nut 316 S/S 12 x 240", "each", 4),
  item("100 x 100 RAD H5 PG SG8 6.0m post", "m", 6, 1),
  item("Ecko 90 x 3.15 D-head galv gas pack 1000", "each", 1),
  item("Deck screw 10 x 65 CSK T25 S/S304 500PK", "pk", 1),
  item("Deck screw 10 x 65 CSK T25 S/S304 1000PK", "pk", 1),
  item("150x40 RAD H3.2 GT premium decking 140x32", "m", 330),
  item("Bowmac Stud-Lok 170mm electro galv screw", "each", 30),
  item("L/Lok concealed purlin cleat SS SSCPC40", "bx", 1),
  item("12 x 35 S/S T316 hex W/F screw 200 box", "bx", 1),
  item("Screws hex 14G x 75mm S/S316 100PK", "pk", 2),
  item("L/Lok Z nail wire dog SS left", "each", 12),
  item("L/Lok Z nail wire dog SS right", "each", 12),
  item("140 x 45 KD 4.8m RAD H3.2 PG SG8", "m", 91.2, 19),
  item("140 x 45 KD 6.0m RAD H3.2 PG SG8", "m", 36, 6),
  item("Dricon Rapidset concrete 25kg", "bag", 60),
  item("125 x 125 RAD H5 Tanapile 2.1m anchor pile", "each", 12),
];

describe("resolveOrderQuantity", () => {
  it("passes EA/PK/BX/BAG counts through unchanged (no waste)", () => {
    expect(resolveOrderQuantity({ unit: "each", quantity: 12, pieces: null }, 6, 10))
      .toEqual({ quantity: 12, unit: "each" });
    expect(resolveOrderQuantity({ unit: "bag", quantity: 60, pieces: null }, 6, 10))
      .toEqual({ quantity: 60, unit: "bag" });
  });

  it("converts lineal metres to whole stock lengths with ceil + waste", () => {
    // 50 LM × 1.10 / 6 = 9.17 → 10 (ceil, not floor/round)
    expect(resolveOrderQuantity({ unit: "m", quantity: 50, pieces: null }, 6, 10).quantity).toBe(10);
    // 330 LM × 1.10 / 6 = 60.5 → 61
    expect(resolveOrderQuantity({ unit: "m", quantity: 330, pieces: null }, 6, 10).quantity).toBe(61);
  });

  it("uses the supplier piece count as-is when given (no re-rounding)", () => {
    expect(resolveOrderQuantity({ unit: "m", quantity: 91.2, pieces: 19 }, 6, 10).quantity).toBe(19);
    expect(resolveOrderQuantity({ unit: "m", quantity: 6, pieces: 1 }, 6, 10).quantity).toBe(1);
  });
});

describe("buildQuoteLinesFromEstimate — Oregon ITM fixture", () => {
  const lines = buildQuoteLinesFromEstimate(OREGON_ITM, { library: [] });
  const row = (re: RegExp): QuoteLineItem | undefined =>
    lines.find((l) => re.test(l.description));

  it("produces exactly one priced row per supplier line (21)", () => {
    expect(lines.length).toBe(21);
    // No duplicate descriptions.
    expect(new Set(lines.map((l) => l.description)).size).toBe(21);
  });

  it("never injects fence/roof/slab/takeoff rows", () => {
    const banned = /fence|paling|colorsteel|long[-\s]?run|roof|reinforcing mesh|polythene|deck joist|deck bearer|decking boards \(/i;
    expect(lines.some((l) => banned.test(l.description))).toBe(false);
    expect(lines.every((l) => l.is_calculated_takeoff === false)).toBe(true);
  });

  it("has the exact expected quantities", () => {
    expect(row(/Engineer bolt/)?.quantity).toBe(4);
    expect(row(/Square washer/)?.quantity).toBe(8);
    expect(row(/12 x 35 S\/S T316 hex/)?.quantity).toBe(1);
    expect(row(/14G x 75mm/)?.quantity).toBe(2);
    expect(row(/45 x 45 RAD/)?.quantity).toBe(10);
    expect(row(/premium decking/)?.quantity).toBe(61);
    expect(row(/140 x 45 KD 4\.8m/)?.quantity).toBe(19);
    expect(row(/140 x 45 KD 6\.0m/)?.quantity).toBe(6);
    expect(row(/Tanapile/)?.quantity).toBe(12);
    expect(row(/Dricon/)?.quantity).toBe(60);
    expect(row(/pile fixing kit/)?.quantity).toBe(2);
    expect(row(/500PK/)?.quantity).toBe(1);
    expect(row(/1000PK/)?.quantity).toBe(1);
    expect(row(/Stud-Lok/)?.quantity).toBe(30);
    expect(row(/purlin cleat/)?.quantity).toBe(1);
    expect(row(/Z nail wire dog SS left/)?.quantity).toBe(12);
    expect(row(/Z nail wire dog SS right/)?.quantity).toBe(12);
    expect(row(/Screw bolt CSK galv 8 x 100/)?.quantity).toBe(50);
    expect(row(/Ecko/)?.quantity).toBe(1);
    expect(row(/100 x 100 RAD H5/)?.quantity).toBe(1);
    expect(row(/Malthoid/)?.quantity).toBe(2);
  });

  it("preserves the counted units (each/pk/bx/bag pass through)", () => {
    expect(row(/Dricon/)?.unit).toBe("bag");
    expect(row(/500PK/)?.unit).toBe("pk");
    expect(row(/12 x 35 S\/S T316 hex/)?.unit).toBe("bx");
    expect(row(/Tanapile/)?.unit).toBe("each");
  });

  it("surfaces the pile-fixing-kit undercount as a row warning", () => {
    const kit = row(/pile fixing kit/);
    expect(kit?.warnings?.length).toBeGreaterThan(0);
    expect(kit?.warnings?.[0]).toMatch(/12 piles/);
  });

  it("marks every unmatched line as needs-price ($0)", () => {
    expect(lines.every((l) => l.is_missing_price === true)).toBe(true);
    expect(lines.every((l) => l.unit_price === 0)).toBe(true);
  });
});

describe("buildQuoteLinesFromEstimate — supplier-price fallback", () => {
  const priced = (
    name: string,
    price: number | null,
    quantity = 1,
  ): ExtractedSupplierItem => ({
    name,
    unit: "each",
    price,
    sku: null,
    quantity,
    pieces: null,
    source_line_total: null,
    raw_text: null,
    confidence: 0.9,
  });

  it("uses the supplier's printed price when the line isn't in the library", () => {
    const lines = buildQuoteLinesFromEstimate([priced("Mystery bracket", 12.5)], {
      library: [],
    });
    expect(lines[0].unit_price).toBe(12.5);
    expect(lines[0].line_total).toBe(12.5);
    expect(lines[0].is_missing_price).toBe(false);
    expect(lines[0].price_source).toBe("supplier_import");
  });

  it("converts GST-inclusive supplier prices to ex-GST", () => {
    const lines = buildQuoteLinesFromEstimate([priced("Mystery bracket", 11.5)], {
      library: [],
      gstInclusive: true,
      taxRate: 0.15,
    });
    expect(lines[0].unit_price).toBe(10); // 11.50 / 1.15
    expect(lines[0].price_source).toBe("supplier_import");
  });

  it("prefers the library price over the supplier price", () => {
    const lib: LibraryMaterial[] = [
      {
        id: "x",
        name: "Mystery bracket",
        unit: "each",
        default_unit_price: 20,
        supplier: null,
        supplier_url: null,
        notes: null,
        usage_count: 0,
        is_ai_estimated: false,
        last_used_at: null,
      },
    ];
    const lines = buildQuoteLinesFromEstimate([priced("Mystery bracket", 12.5)], {
      library: lib,
    });
    expect(lines[0].unit_price).toBe(20);
    expect(lines[0].price_source).toBe("user_library");
  });

  it("still flags lines with no price anywhere as needs-price", () => {
    const lines = buildQuoteLinesFromEstimate([priced("Mystery bracket", null)], {
      library: [],
    });
    expect(lines[0].unit_price).toBe(0);
    expect(lines[0].is_missing_price).toBe(true);
    expect(lines[0].price_source).toBe("missing_price");
  });
});

describe("buildMirrorQuoteLines — faithful ITM mirror", () => {
  const supplierItem = (
    name: string,
    unit: string,
    quantity: number | null,
    price: number | null,
    pieces: number | null = null,
  ): ExtractedSupplierItem => ({
    name,
    unit,
    price,
    sku: null,
    quantity,
    pieces,
    source_line_total: null,
    raw_text: null,
    confidence: 0.9,
  });

  it("keeps quantities exactly as scanned — no waste, no stock-length rounding", () => {
    const lines = buildMirrorQuoteLines(
      [supplierItem("45 x 45 RAD H3.2", "m", 50, 2)],
      {},
    );
    expect(lines[0].quantity).toBe(50); // NOT 10 stock lengths
    expect(lines[0].unit).toBe("m");
    expect(lines[0].unit_price).toBe(2);
    expect(lines[0].line_total).toBe(100); // 50 × 2
    expect(lines[0].price_source).toBe("supplier_import");
  });

  it("uses the scanned price exactly (ex-GST when prices exclude GST)", () => {
    const lines = buildMirrorQuoteLines(
      [supplierItem("Tanapile", "each", 12, 45)],
      { gstInclusive: false },
    );
    expect(lines[0].unit_price).toBe(45);
    expect(lines[0].line_total).toBe(540); // 12 × 45
  });

  it("converts GST-inclusive scanned prices to ex-GST", () => {
    const lines = buildMirrorQuoteLines(
      [supplierItem("Bracket", "each", 2, 11.5)],
      { gstInclusive: true, taxRate: 0.15 },
    );
    expect(lines[0].unit_price).toBe(10); // 11.50 / 1.15
    expect(lines[0].line_total).toBe(20);
  });

  // GST-inclusive scans: the ex-GST figures must come from the printed LINE
  // TOTALS, not from a unit price rounded to the cent first.
  const printed = (
    name: string,
    quantity: number,
    price: number,
    lineTotal: number,
  ): ExtractedSupplierItem => ({
    ...supplierItem(name, "each", quantity, price),
    source_line_total: lineTotal,
  });
  const mirrorTotal = (items: ExtractedSupplierItem[]) =>
    computeQuoteTotals(
      buildMirrorQuoteLines(items, { gstInclusive: true, taxRate: 0.15 }),
      { default_markup_pct: 0, tax_rate: 15 },
    ).total;

  it("10,000 × $0.05 incl GST mirrors to $500.00, not $460", () => {
    expect(mirrorTotal([printed("Staples", 10_000, 0.05, 500)])).toBe(500);
  });

  it("100 × $9.99 incl GST mirrors to $999.00 (±1c GST rounding), not $999.35", () => {
    expect(Math.abs(mirrorTotal([printed("Hinge", 100, 9.99, 999)]) - 999)).toBeLessThanOrEqual(0.01);
  });

  it("10 × $10 incl GST: the live line equals the supplier's ex-GST line total ($86.96, not $87.00)", () => {
    const [line] = buildMirrorQuoteLines([printed("Bracket", 10, 10, 100)], {
      gstInclusive: true,
      taxRate: 0.15,
    });
    expect(line.source_line_total).toBe(86.96);
    expect(line.line_total).toBe(86.96);
    expect(Math.round(line.quantity * line.unit_price * 100) / 100).toBe(86.96);
  });

  it("keeps sub-cent unit prices exact (ex-GST quote: 1000 × $0.125 = $125)", () => {
    const [line] = buildMirrorQuoteLines(
      [{ ...supplierItem("Nails", "each", 1000, 0.125), source_line_total: 125 }],
      { gstInclusive: false },
    );
    expect(line.unit_price).toBe(0.125);
    expect(line.line_total).toBe(125);
  });

  it("carries a supplier discount line through as a negative line", () => {
    const lines = buildMirrorQuoteLines(
      [
        { ...supplierItem("Decking", "m", 50, 10), source_line_total: 500 },
        { ...supplierItem("Trade discount", "each", 1, -25), source_line_total: -25 },
      ],
      { gstInclusive: false },
    );
    expect(lines[1]).toMatchObject({ unit_price: -25, line_total: -25, source_line_total: -25, is_missing_price: false, price_source: "supplier_import" });
    const t = computeQuoteTotals(lines, { default_markup_pct: 0, tax_rate: 15 });
    expect(t.materials_subtotal).toBe(475);
  });

  it("with markup 0, the quote total mirrors the supplier total (+GST)", () => {
    const lines = buildMirrorQuoteLines(
      [
        supplierItem("A", "each", 1, 60),
        supplierItem("B", "each", 1, 40),
      ],
      { gstInclusive: false },
    );
    const t = computeQuoteTotals(lines, { default_markup_pct: 0, tax_rate: 15 });
    expect(t.materials_subtotal).toBe(100);
    expect(t.markup_amount).toBe(0);
    expect(t.subtotal_before_tax).toBe(100); // no markup
    expect(t.total).toBe(115); // 100 + 15% GST
  });
});

describe("pricing from the library + totals", () => {
  const lib: LibraryMaterial[] = [
    {
      id: "m1",
      name: "Dricon Rapidset concrete 25kg",
      unit: "bag",
      default_unit_price: 15,
      supplier: null,
      supplier_url: null,
      notes: null,
      usage_count: 0,
      is_ai_estimated: false,
      last_used_at: null,
    },
  ];

  it("prices matched lines and leaves the rest at $0", () => {
    const lines = buildQuoteLinesFromEstimate(OREGON_ITM, { library: lib });
    const dricon = lines.find((l) => /Dricon/.test(l.description));
    expect(dricon?.unit_price).toBe(15);
    expect(dricon?.line_total).toBe(900); // 60 × 15
    expect(dricon?.is_missing_price).toBe(false);
  });

  it("totals: materials × 1.20 = subtotal, × 1.15 = total", () => {
    const lines: QuoteLineItem[] = [
      { type: "material", description: "A", quantity: 1, unit: "ea", unit_price: 60, line_total: 60 },
      { type: "material", description: "B", quantity: 1, unit: "ea", unit_price: 40, line_total: 40 },
    ];
    const t = computeQuoteTotals(lines, { default_markup_pct: 20, tax_rate: 15 });
    expect(t.materials_subtotal).toBe(100);
    expect(t.subtotal_before_tax).toBe(120); // 100 × 1.20
    expect(t.total).toBe(138); // 120 × 1.15
  });
});
