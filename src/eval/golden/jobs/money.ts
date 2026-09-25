// ─────────────────────────────────────────────────────────────────────────
// Golden jobs — the money path on its own.
//
// Rules assumed (NZ practice; each is also what the code claims):
//   cents        every money figure is rounded HALF-UP to the cent
//                (quote-defaults.round2: "exact half-up"); 2.675 → 2.68,
//                1.005 → 1.01, 0.375 → 0.38, never float-truncated
//   line total   round2(quantity × unit price)
//   subtotals    sum of the ROUNDED line totals (material + other lines form
//                the materials subtotal; labour lines the labour subtotal)
//   markup       on the materials subtotal (material + other), not labour
//   GST          15 % of (materials + markup + labour), rounded half-up
//   GST-incl     a GST-inclusive supplier price carries 3/23 GST: the GST in
//                an inclusive total T is T × 3/23 (= T − T ÷ 1.15), and the
//                ex-GST value is T minus that. A faithful mirror (markup 0)
//                charges the customer exactly the supplier's total T
//                (scanToQuote.ts claims exactly this)
//   deposit      the deposit % of the quote total, in cents, half-up
//   labour       the AI-prices-off policy (quote-generation/pricing.ts):
//                a rate stated in the transcript survives; an hour line with
//                no stated rate takes the profile hourly rate; a day line
//                survives only if it is a whole 4–12 h day at the tradie's own
//                hourly rate; anything else is price-pending ($0) —
//                non-labour lines keep a price only from a verified library
//                match
// ─────────────────────────────────────────────────────────────────────────

import { runInvoiceAgent } from "@/lib/agents/invoice";
import { libraryPriceForLine } from "@/lib/materials";
import { buildScanQuote } from "@/lib/materials/scanToQuote";
import { depositCents } from "@/lib/payments";
import {
  addGst,
  computeQuoteTotals,
  gstInclusiveBreakdown,
  round2,
  splitDisplaySubtotals,
} from "@/lib/quote-defaults";
import { applyPricingPolicy, extractStatedAmounts } from "@/lib/quote-generation/pricing";
import type { LibraryMaterial, QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { assessQuoteTotalsIntegrity } from "@/lib/quote-validation";
import { quoteJob } from "../build";
import { count, money, text, type Actuals, type Expected, type GoldenJob } from "../types";

// ── Supplier-scan (1:1 mirror) jobs ─────────────────────────────────────

/** [description, unit, quantity, printed unit price, printed line total] */
type ScanRow = [string, string, number, number, number];

function supplierScanJob(spec: {
  id: string;
  title: string;
  structured: string;
  gstInclusive: boolean;
  rows: ScanRow[];
  printed: { subtotal: number; gst: number; total: number };
  expect: Record<string, Expected>;
  knownBugs?: Record<string, string>;
}): GoldenJob {
  const compute = (): Actuals => {
    const r = buildScanQuote(
      spec.rows.map(([name, unit, quantity, price, line_total]) => ({ name, unit, quantity, price, line_total })),
      { supplier: "PlaceMakers", gstInclusive: spec.gstInclusive, ...spec.printed },
      { currency: "NZD", taxLabel: "GST", taxRate: 15 },
    );
    if (!r.ok) return { error: r.error };
    const q = r.value.quoteData;
    const actual: Actuals = {
      materials_subtotal: q.materials_subtotal,
      subtotal_before_tax: q.subtotal_before_tax,
      tax_amount: q.tax_amount,
      total: q.total,
      reconciliation: q.supplier_source?.reconciliation_status,
      notes: q.notes.join(" | "),
    };
    q.line_items.forEach((l, i) => {
      actual[`line:${i + 1}`] = l.line_total;
    });
    return actual;
  };
  return {
    id: spec.id,
    trade: "money",
    title: spec.title,
    said: `(scanned supplier quote, ${spec.rows.length} lines, prices ${spec.gstInclusive ? "INCLUDE" : "exclude"} GST)`,
    structured: spec.structured,
    expect: spec.expect,
    knownBugs: spec.knownBugs,
    compute,
  };
}

const M03_ROWS: ScanRow[] = [
  ["Door stop satin chrome", "each", 1, 10.0, 10.0],
  ["Cabinet hinge 35mm pair", "pair", 1, 10.0, 10.0],
  ["Wood filler 250g", "each", 1, 10.0, 10.0],
  ["Sandpaper assorted 5pk", "pack", 1, 10.0, 10.0],
  ["Masking tape 48mm", "roll", 1, 10.0, 10.0],
  ["No More Gaps 450g", "tube", 1, 10.0, 10.0],
  ["Brad nails 40mm 1000pk", "box", 1, 10.0, 10.0],
  ["Paint tray set", "each", 1, 10.0, 10.0],
  ["Drop sheet 3.6x2.7", "each", 1, 10.0, 10.0],
  ["Stanley blades 10pk", "pack", 1, 10.0, 10.0],
];

const M04_ROWS: ScanRow[] = [
  ["90x45 H1.2 SG8 4.8m", "length", 24, 28.75, 690.0],
  ["90x45 H3.2 MSG8 4.8m", "length", 8, 34.9, 279.2],
  ["140x45 H3.2 SG8 4.8m", "length", 6, 52.5, 315.0],
  ["GIB Standard 10mm 2400x1200", "sheet", 28, 36.2, 1013.6],
  ["GIB Aqualine 10mm 2400x1200", "sheet", 6, 58.9, 353.4],
  ["GIB grabber screws 32mm 1000pk", "box", 3, 39.95, 119.85],
  ["GIB-Fix adhesive 375ml", "tube", 8, 14.49, 115.92],
  ["GIB Plus 4 compound 20kg", "bag", 2, 44.95, 89.9],
  ["Paper tape 75m", "roll", 4, 8.49, 33.96],
  ["Pink Batts R2.2 wall", "pack", 9, 69.95, 629.55],
  ["Building wrap 2.7x10m", "roll", 2, 198.0, 396.0],
  ["Weatherboard 180x18 bevel 4.8m", "length", 40, 55.9, 2236.0],
  ["Cavity batten 20x45 H3.1 4.8m", "length", 30, 11.29, 338.7],
  ["Galv clouts 30mm 1kg", "box", 2, 18.99, 37.98],
  ["Framing nails 90x3.15 2500pk", "box", 2, 49.9, 99.8],
  ["Joist hanger 140x45", "each", 18, 4.43, 79.74],
  ["Tek screws 12g 50mm 100pk", "pack", 2, 27.95, 55.9],
  ["Flashing tape 75mm x 25m", "roll", 3, 42.5, 127.5],
  ["Aluminium head flashing 3m", "length", 7, 31.9, 223.3],
  ["Skirting 60x10 FJ pine 5.4m", "length", 12, 24.99, 299.88],
  ["Architrave 42x12 FJ pine 5.4m", "length", 10, 21.49, 214.9],
  ["Liquid Nails 320g", "tube", 6, 12.95, 77.7],
  ["Sealant paintable 300ml", "tube", 5, 9.99, 49.95],
  ["Concrete premix 20kg", "bag", 15, 12.79, 191.85],
  ["Delivery", "each", 1, 65.0, 65.0],
];

const M05_ROWS: ScanRow[] = [
  ["90x45 H3.2 MSG8 6.0m", "length", 12, 41.2, 494.4],
  ["140x45 H3.2 SG8 4.8m", "length", 8, 45.65, 365.2],
  ["Decking 140x32 vitex", "m", 86.4, 12.52, 1081.73],
  ["Joist hanger 140x45", "each", 24, 3.35, 80.4],
  ["Tek screw 12g 50mm 100pk", "pack", 3, 24.3, 72.9],
  ["Stainless deck screw 10g 65mm 500pk", "pack", 2, 77.39, 154.78],
  ["Concrete pile 150x150 900mm", "each", 12, 29.95, 359.4],
  ["Postmix 20kg", "bag", 18, 11.12, 200.16],
  ["Bolt M12x180 galv", "each", 16, 2.785, 44.56],
  ["Delivery", "each", 1, 55.0, 55.0],
];

// ── Library-price matching for AI material lines (run.ts + pricing.ts) ──

const LIB = (id: string, name: string, unit: string, price: number): LibraryMaterial => ({
  id,
  name,
  unit,
  default_unit_price: price,
  supplier: null,
  supplier_url: null,
  notes: null,
  usage_count: 3,
  is_ai_estimated: false,
  last_used_at: null,
});

const MATCH_LIBRARY: LibraryMaterial[] = [
  LIB("stud24", "90x45 H1.2 SG8 stud 2.4m", "each", 12.4),
  LIB("len54", "90x45 H1.2 SG8 5.4m", "length", 30.26),
  LIB("gib24", "GIB Standard 10mm 2400x1200", "sheet", 31.5),
  LIB("gib27", "GIB Standard 10mm 2700x1200", "sheet", 35.9),
  LIB("batts", "Pink Batts R2.2 wall", "pack", 58.0),
  LIB("kwila", "Decking kwila 140x19", "m", 17.95),
];

/** [line description, line unit] — an AI material line as the model wrote it. */
const MATCH_LINES: Array<[string, string]> = [
  ["90x45 H1.2 SG8 5.4m", "length"],
  ["90x45 H1.2 SG8 stud 2.4m", "each"],
  ["90x45 H1.2 SG8 4.8m", "length"],
  ["GIB Standard 10mm 2700x1200", "sheet"],
  ["GIB Standard 10mm 2400x1200", "m2"],
  ["Pink Batts R2.2 wall", "pack"],
  ["Decking kwila 140x19", "m"],
  ["Decking kwila 140x19 5.4m", "length"],
];

/** The final unit price an AI material line carries after run.ts + applyPricingPolicy. */
function priceAiMaterialLine(description: string, unit: string): number {
  const it: QuoteLineItem = {
    type: "material",
    description,
    quantity: 1,
    unit,
    unit_price: 99.99, // whatever the model guessed — must never survive
    line_total: 99.99,
  };
  // run.ts: a strong library match sets the price + provenance.
  const hit = libraryPriceForLine(it, MATCH_LIBRARY);
  if (hit && hit.unitPrice !== null && hit.unitPrice > 0) {
    it.library_id = hit.match.item.id;
    it.unit_price = hit.unitPrice;
    it.price_source = "user_library";
    it.price_confidence = "high";
  }
  // pricing.ts: only a re-verified library price survives.
  applyPricingPolicy([it], { hourlyRate: 85, statedAmounts: [], library: MATCH_LIBRARY });
  return it.unit_price;
}

// ── W01's finished quote, for the invoice checks ─────────────────────────

const W01_LINES: Array<[QuoteLineItem["type"], string, number, string, number]> = [
  ["material", "90x45 SG8 studs", 18, "lengths", 12.4],
  ["material", "90x45 SG8 plates", 7, "lengths", 26.9],
  ["material", "90x45 SG8 nogs", 3, "lengths", 26.9],
  ["material", "10mm GIB", 19, "sheets", 31.5],
  ["material", "GIB screws", 836, "screws", 0.035],
  ["material", "GIB adhesive", 5, "tubes", 12.9],
  ["material", "Framing nails", 1, "box", 69],
  ["labour", "Labour", 2, "days", 600],
];

function w01QuoteData(): QuoteData {
  const line_items: QuoteLineItem[] = W01_LINES.map(([type, description, quantity, unit, unit_price]) => ({
    type,
    description,
    quantity,
    unit,
    unit_price,
    line_total: round2(quantity * unit_price),
  }));
  const t = computeQuoteTotals(line_items, 20, 15);
  return {
    client: { name: "Dave Thompson", address: null, email: null, phone: null, contact: null },
    job_summary: "Frame and GIB a 10 m wall both sides",
    line_items,
    materials_subtotal: t.materials_subtotal,
    labour_subtotal: t.labour_subtotal,
    markup_pct: 20,
    markup_amount: t.markup_amount,
    subtotal_before_tax: t.subtotal_before_tax,
    tax_amount: t.tax_amount,
    total: t.total,
    currency: "NZD",
    tax_label: "GST",
    tax_rate: 15,
    terms: "",
    notes: [],
  };
}

export const MONEY_JOBS: GoldenJob[] = [
  // ───────────────────────────────────────────────────────────────────────
  quoteJob({
    id: "M01-half-cents-everywhere",
    title: "Half-cent traps: 0.125, 1.005, 2.675, 0.335 and 8.345 unit prices, half-cent markup and GST",
    said: "Small leak repair on the deck: 3 tek screws, a galv washer, a tube of sealant, 7 coach bolts, 3 silicone, flashing tape. Hour and a half.",
    structured: "6 material lines with 3-decimal prices, 1.5 h labour at $85, markup 15 %, GST 15 %",
    lines: [
      { type: "material", description: "Tek screws", quantity: 3, unit: "each", price: "0.125", total: money("0.38", "3 × 0.125 = 0.375 → half-up 0.38") },
      { type: "material", description: "Galv washer", quantity: 1, unit: "each", price: "1.005", total: money("1.01", "1.005 → half-up 1.01 (Math.round(1.005 × 100) gives 1.00)") },
      { type: "material", description: "Sealant", quantity: 1, unit: "tube", price: "2.675", total: money("2.68", "2.675 → half-up 2.68 (float gives 2.67)") },
      { type: "material", description: "Coach bolts M10", quantity: 7, unit: "each", price: "0.335", total: money("2.35", "7 × 0.335 = 2.345 → 2.35") },
      { type: "material", description: "Silicone", quantity: 3, unit: "tube", price: "8.345", total: money("25.04", "3 × 8.345 = 25.035 → 25.04") },
      { type: "material", description: "Flashing tape", quantity: 1, unit: "roll", price: "19.84", total: money("19.84", "1 × 19.84") },
      { type: "labour", description: "Labour", quantity: 1.5, unit: "hours", price: "85.00", total: money("127.50", "1.5 h × $85") },
    ],
    markupPct: 15,
    taxRate: 15,
    totals: {
      materials_subtotal: money("51.30", "0.38 + 1.01 + 2.68 + 2.35 + 25.04 + 19.84 (sum of the ROUNDED lines)"),
      labour_subtotal: money("127.50", "1.5 × 85"),
      markup_amount: money("7.70", "15 % × 51.30 = 7.695 — an exact half cent → 7.70"),
      subtotal_before_tax: money("186.50", "51.30 + 7.70 + 127.50"),
      tax_amount: money("27.98", "15 % × 186.50 = 27.975 — an exact half cent → 27.98"),
      total: money("214.48", "186.50 + 27.98"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  // M02 — $1,231.30 can't be charged to the cent, so the expectation is the
  // documented behaviour: the nearest reachable total, 1 c off, with a note.
  //
  // The quote stores its lines ex-GST and adds GST = 15 % of the ex-GST
  // subtotal S (whole cents), rounded half-up, so the total is
  //   T(S) = S + round½↑(0.15 × S).
  // From S to S + 1, S grows by 1 c and the rounded GST by 0 or 1 c (0.15 × S
  // grows by 0.15 < 1 and half-up rounding never goes down), so T never falls
  // and never jumps by more than 2 c. Around the printed total:
  //   S = 107,069 c: 0.15 × 107,069 = 16,060.35 → 16,060 → T = 123,129 c ($1,231.29)
  //   S = 107,070 c: 0.15 × 107,070 = 16,060.50 → 16,061 → T = 123,131 c ($1,231.31)
  // Every S ≤ 107,069 gives T ≤ 123,129 and every S ≥ 107,070 gives
  // T ≥ 123,131, so NO ex-GST subtotal reaches 123,130 c — $1,231.30 is one of
  // the totals the cent rounding skips. Both neighbours are 1 c off; the
  // documented rule (materials/estimateToQuote.exGstSubtotalForTotal) takes
  // the subtotal nearest the exact 1,231.30 ÷ 1.15 = 1,070.6957 → $1,070.70,
  // so the mirror charges $1,231.31, and gstRoundingNotes tells the tradie the
  // printed total can't be matched to the cent. The storage model (ex-GST
  // lines + GST on the subtotal) is deliberately left as it is.
  supplierScanJob({
    id: "M02-supplier-scan-5-lines-gst-inclusive",
    title: "PlaceMakers quote, 5 lines, prices INCLUDE GST — $1,231.30 is unreachable: nearest $1,231.31, with a note",
    structured: "5 GST-inclusive lines, printed total $1,231.30 incl GST ($160.60 GST), markup 0 — a total no ex-GST subtotal + 15 % GST can reach",
    gstInclusive: true,
    rows: [
      ["90x45 H1.2 SG8 framing 4.8m", "length", 12, 28.75, 345.0],
      ["GIB Standard 10mm 2400x1200", "sheet", 20, 36.2, 724.0],
      ["GIB grabber screws 32mm 1000pk", "box", 1, 39.95, 39.95],
      ["GIB-Fix adhesive 375ml", "tube", 5, 14.49, 72.45],
      ["Framing nails 90x3.15 2500pk", "box", 1, 49.9, 49.9],
    ],
    printed: { subtotal: 1231.3, gst: 160.6, total: 1231.3 },
    expect: {
      "line:1": money("300.00", "345.00 incl ÷ 1.15 = 300.00 ex"),
      "line:2": money("629.57", "724.00 ÷ 1.15 = 629.565 → 629.57"),
      "line:3": money("34.74", "39.95 ÷ 1.15 = 34.739 → 34.74"),
      "line:4": money("63.00", "72.45 ÷ 1.15 = 63.00"),
      "line:5": money("43.39", "49.90 ÷ 1.15 = 43.391 → 43.39"),
      materials_subtotal: money("1070.70", "the ex-GST subtotal nearest 1231.30 ÷ 1.15 = 1070.6957 → 107,070 c (= the sum of the five ex-GST lines)"),
      subtotal_before_tax: money("1070.70", "markup 0 → same as materials"),
      tax_amount: money("160.61", "15 % × 1070.70 = 160.605 → half-up 160.61 — the quote's GST is 15 % of its own ex-GST subtotal (the supplier printed 160.60)"),
      total: money("1231.31", "1070.70 + 160.61 — the nearest reachable total: $1,231.30 itself can't be reached (proof above); $1,231.29 and $1,231.31 are both 1 c off and the subtotal nearest the exact value wins"),
      reconciliation: text("ok", "the supplier's own figures add up (lines = subtotal, GST = 3/23 of total)"),
      notes: text(
        "The supplier's printed total of $1,231.30 can't be matched to the cent with 15% GST added to an ex-GST subtotal — the nearest is $1,231.31.",
        "estimateToQuote.gstRoundingNotes — the unavoidable 1 c gap is said out loud on the quote, never hidden",
      ),
    },
  }),

  supplierScanJob({
    id: "M03-supplier-scan-10-lines-gst-inclusive",
    title: "Hardware quote, 10 lines at $10.00 incl GST — mirror must charge $100.00",
    structured: "10 × $10.00 GST-inclusive lines, printed total $100.00 incl ($13.04 GST), markup 0",
    gstInclusive: true,
    rows: M03_ROWS,
    printed: { subtotal: 100.0, gst: 13.04, total: 100.0 },
    expect: {
      materials_subtotal: money("86.96", "ex-GST value of the $100.00 charged: 100.00 − 13.04 (per-line cents must not add up to more than the supplier's ex-GST total)"),
      subtotal_before_tax: money("86.96", "markup 0"),
      tax_amount: money("13.04", "GST inside $100.00 = 100 × 3/23 = 13.043 → 13.04"),
      total: money("100.00", "the supplier's GST-inclusive total"),
      reconciliation: text("ok", "the supplier's printed figures reconcile"),
    },
  }),

  supplierScanJob({
    id: "M04-supplier-scan-25-lines-gst-inclusive",
    title: "Full framing + cladding order, 25 GST-inclusive lines — mirror must charge $8,134.58",
    structured: "25 GST-inclusive lines, printed total $8,134.58 incl ($1,061.03 GST), markup 0",
    gstInclusive: true,
    rows: M04_ROWS,
    printed: { subtotal: 8134.58, gst: 1061.03, total: 8134.58 },
    expect: {
      materials_subtotal: money("7073.55", "8134.58 − 1061.03"),
      subtotal_before_tax: money("7073.55", "markup 0"),
      tax_amount: money("1061.03", "GST inside $8,134.58 = × 3/23 = 1061.032 → 1061.03"),
      total: money("8134.58", "Σ of the 25 printed incl line totals (690.00 + 279.20 + … + 65.00) — the supplier's total"),
      reconciliation: text("ok", "the supplier's printed figures reconcile"),
    },
  }),

  supplierScanJob({
    id: "M05-supplier-scan-10-lines-gst-exclusive",
    title: "ITM deck order, 10 lines EXCLUDING GST (incl. 86.4 m of decking and a $2.785 bolt) — exact mirror",
    structured: "10 ex-GST lines, printed subtotal $2,908.53 + GST $436.28 = $3,344.81, markup 0",
    gstInclusive: false,
    rows: M05_ROWS,
    printed: { subtotal: 2908.53, gst: 436.28, total: 3344.81 },
    expect: {
      "line:1": money("494.40", "12 × 41.20"),
      "line:3": money("1081.73", "86.4 × 12.52 = 1081.728 → 1081.73"),
      "line:9": money("44.56", "16 × 2.785 = 44.56 (a 3-dp unit price kept at full precision)"),
      materials_subtotal: money("2908.53", "494.40 + 365.20 + 1081.73 + 80.40 + 72.90 + 154.78 + 359.40 + 200.16 + 44.56 + 55.00"),
      subtotal_before_tax: money("2908.53", "markup 0"),
      tax_amount: money("436.28", "15 % × 2908.53 = 436.2795 → 436.28"),
      total: money("3344.81", "2908.53 + 436.28 = the supplier's printed total"),
      reconciliation: text("ok", "lines, subtotal, GST and total all agree"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  {
    id: "M06-labour-day-rate-vs-hourly-policy",
    trade: "money",
    title: "Day rates vs hourly: which labour prices survive the AI-prices-off policy",
    said: "Kitchen strip-out and reline. I'll do it for 3 days at $640 a day, apprentice 20 hours, and a flat $450 for the rubbish removal.",
    structured:
      "profile $78/h, markup 20 %; model lines: builder 3 days @ $640, apprentice 20 h @ $42, rubbish 1 lot @ $450, set-up 1 day @ $624, travel 1 day @ $500, skip bin (other) 1 @ $380, GIB 14 sheets (library $31.50), timber 10 @ $12 (AI guess)",
    expect: {
      "price:builder": money("640.00", "$640 a day is stated → the tradie's own rate (rule 1)"),
      "price:apprentice": money("78.00", "20 HOURS, no rate stated → the profile $78/h, not the model's $42 (rule 2)"),
      "price:rubbish": money("450.00", '"a flat $450" stated → kept whatever the unit (rule 1)'),
      "price:setup": money("624.00", "1 day @ $624 = exactly 8 h at the tradie's own $78/h → a whole working day (rule 3)"),
      "price:travel": money("0.00", "1 day @ $500 = 6.41 h at $78 — not a whole day, not stated → price pending"),
      "price:skipbin": money("0.00", "an 'other' line keeps a price only from a verified library match — the model's $380 is dropped (policy: non-labour AI prices never reach a customer)"),
      "price:gib": money("31.50", "GIB 10 mm sheet re-verified against the tradie's library row ($31.50/sheet)"),
      "price:timber": money("0.00", "AI-guessed material price, no library match → pending"),
      labour_subtotal: money("4554.00", "1920.00 + 1560.00 + 450.00 + 624.00 + 0"),
      materials_subtotal: money("441.00", "14 × 31.50 + 0 + 0"),
      markup_amount: money("88.20", "20 % × 441.00"),
      subtotal_before_tax: money("5083.20", "441.00 + 88.20 + 4554.00"),
      tax_amount: money("762.48", "15 % × 5083.20"),
      total: money("5845.68", "5083.20 + 762.48"),
    },
    compute: (): Actuals => {
      const said =
        "Kitchen strip-out and reline. I'll do it for 3 days at $640 a day, apprentice 20 hours, and a flat $450 for the rubbish removal.";
      const L = (type: QuoteLineItem["type"], description: string, quantity: number, unit: string, unit_price: number): QuoteLineItem => ({
        type,
        description,
        quantity,
        unit,
        unit_price,
        line_total: round2(quantity * unit_price),
      });
      const items: Record<string, QuoteLineItem> = {
        builder: L("labour", "Builder — strip-out and reline", 3, "day", 640),
        apprentice: L("labour", "Apprentice", 20, "hours", 42),
        rubbish: L("labour", "Rubbish removal", 1, "lot", 450),
        setup: L("labour", "Site set-up", 1, "day", 624),
        travel: L("labour", "Travel", 1, "day", 500),
        skipbin: L("other", "Skip bin", 1, "each", 380),
        gib: {
          ...L("material", "GIB Standard 10mm 2400x1200", 14, "sheet", 31.5),
          library_id: "gib24",
          price_source: "user_library",
          price_confidence: "high",
        },
        timber: L("material", "Timber", 10, "each", 12),
      };
      const list = Object.values(items);
      applyPricingPolicy(list, {
        hourlyRate: 78,
        statedAmounts: extractStatedAmounts(said),
        library: MATCH_LIBRARY,
      });
      const t = computeQuoteTotals(list, 20, 15);
      const out: Actuals = { ...t };
      for (const [k, it] of Object.entries(items)) out[`price:${k}`] = it.unit_price;
      return out;
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  quoteJob({
    id: "M07-zero-dollar-lines",
    title: "$0 lines: client-supplied tiles, prices still to come, a removed line",
    said: "Tiling job. Client is supplying the tiles, membrane price to come, grout's off the job, rubbish is included. Five hours prep.",
    structured: "7 lines, 5 of them $0 or quantity 0; markup 20 %",
    lines: [
      { type: "material", description: "Tile adhesive 20kg", quantity: 4, unit: "bag", price: "38.90", total: money("155.60", "4 × 38.90") },
      { type: "material", description: "Tiles (client supplied)", quantity: 12.5, unit: "m2", price: "0.00", total: money("0.00", "12.5 × $0 — supplied by the client") },
      { type: "material", description: "Waterproofing membrane (price to come)", quantity: 1, unit: "each", price: "0.00", total: money("0.00", "unpriced") },
      { type: "material", description: "Grout 5kg (removed from scope)", quantity: 0, unit: "bag", price: "24.50", total: money("0.00", "0 × 24.50") },
      { type: "other", description: "Rubbish removal (included)", quantity: 1, unit: "each", price: "0.00", total: money("0.00", "$0") },
      { type: "labour", description: "Tiler (price to come)", quantity: 2, unit: "days", price: "0.00", total: money("0.00", "unpriced") },
      { type: "labour", description: "Prep and set-out", quantity: 5, unit: "hours", price: "85.00", total: money("425.00", "5 × 85") },
    ],
    markupPct: 20,
    taxRate: 15,
    totals: {
      materials_subtotal: money("155.60", "only the adhesive is priced"),
      labour_subtotal: money("425.00", "only the prep is priced"),
      markup_amount: money("31.12", "20 % × 155.60 (markup on $0 lines is $0)"),
      subtotal_before_tax: money("611.72", "155.60 + 31.12 + 425.00"),
      tax_amount: money("91.76", "15 % × 611.72 = 91.758 → 91.76"),
      total: money("703.48", "611.72 + 91.76"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  quoteJob({
    id: "M08-bathroom-laundry-reno-55-lines",
    title: "Bathroom + laundry renovation — 55 lines (40 materials, 10 labour, 5 other)",
    said: "Full bathroom and laundry reno: strip out, reframe, Aqualine, membrane, tiles, fixtures, plumber and sparky, consent. Quote it all up.",
    structured: "55 saved lines as priced by the tradie (decimals, 3-dp screw price, a $0 line, half-cent line), markup 18 %, GST 15 %",
    lines: (
      [
        ["material", "Skip bin 6m3 (supplier)", 1, "each", "485.00", "485.00"],
        ["material", "90x45 H1.2 SG8 4.8m", 14, "length", "26.90", "376.60"],
        ["material", "90x45 H1.2 SG8 stud 2.4m", 22, "each", "12.40", "272.80"],
        ["material", "140x45 H3.2 SG8 4.8m (floor repair)", 3, "length", "45.65", "136.95"],
        ["material", "17mm structural ply T&G 2400x1200", 2, "sheet", "98.50", "197.00"],
        ["material", "GIB Aqualine 10mm 2400x1200", 16, "sheet", "48.20", "771.20"],
        ["material", "GIB Standard 10mm 2400x1200", 9, "sheet", "31.50", "283.50"],
        ["material", "GIB grabber screws", 1280, "each", "0.035", "44.80"],
        ["material", "GIB-Fix adhesive", 6, "tube", "12.90", "77.40"],
        ["material", "GIB Plus 4 compound 20kg", 2, "bag", "39.10", "78.20"],
        ["material", "Paper tape 75m", 3, "roll", "7.38", "22.14"],
        ["material", "Waterproofing membrane system 4L", 3, "each", "189.00", "567.00"],
        ["material", "Membrane reinforcing tape 10m", 2, "roll", "24.95", "49.90"],
        ["material", "Floor tiles 600x600 porcelain", 14.4, "m2", "64.90", "934.56"],
        ["material", "Wall tiles 300x600 gloss", 26.5, "m2", "48.75", "1291.88"],
        ["material", "Tile adhesive 20kg", 9, "bag", "38.90", "350.10"],
        ["material", "Grout 5kg", 4, "bag", "24.50", "98.00"],
        ["material", "Tile trim aluminium 2.5m", 11, "length", "16.45", "180.95"],
        ["material", "Silicone sanitary 300ml", 6, "tube", "14.95", "89.70"],
        ["material", "Shower tray 1200x900", 1, "each", "649.00", "649.00"],
        ["material", "Shower screen 1200 frameless", 1, "each", "1295.00", "1295.00"],
        ["material", "Shower mixer and rail", 1, "each", "389.00", "389.00"],
        ["material", "Vanity 750 wall-hung", 1, "each", "849.00", "849.00"],
        ["material", "Basin mixer", 1, "each", "219.00", "219.00"],
        ["material", "Back-to-wall toilet suite", 1, "each", "729.00", "729.00"],
        ["material", "Heated towel rail 600", 1, "each", "345.00", "345.00"],
        ["material", "Extractor fan 150mm ducted", 1, "each", "189.50", "189.50"],
        ["material", "Ducting 150mm x 3m", 1, "each", "42.95", "42.95"],
        ["material", "LED downlights IP44", 4, "each", "38.40", "153.60"],
        ["material", "Cable TPS 2.5mm 20m", 1, "roll", "89.00", "89.00"],
        ["material", "PEX pipe 16mm 25m", 1, "roll", "79.90", "79.90"],
        ["material", "PEX fittings kit", 1, "each", "118.35", "118.35"],
        ["material", "Waste pipe 40mm 3m", 2, "length", "17.25", "34.50"],
        ["material", "Floor waste 100mm", 1, "each", "56.80", "56.80"],
        ["material", "Paint ceiling 4L", 2, "each", "92.50", "185.00"],
        ["material", "Paint walls bathroom 4L", 2, "each", "109.90", "219.80"],
        ["material", "Primer sealer 4L", 1, "each", "78.00", "78.00"],
        ["material", "Laundry tub 45L with cabinet", 1, "each", "389.00", "389.00"],
        ["material", "Tapware laundry", 1, "each", "149.00", "149.00"],
        ["material", "Skirting tile 100mm (in tile price)", 8.6, "m", "0.00", "0.00"],
        ["labour", "Builder strip-out and framing", 2.5, "days", "640.00", "1600.00"],
        ["labour", "Builder lining and fit-off", 3, "days", "640.00", "1920.00"],
        ["labour", "Apprentice", 32, "hours", "42.00", "1344.00"],
        ["labour", "Tiler (subbie, by the day)", 4, "days", "560.00", "2240.00"],
        ["labour", "Waterproofer", 7.5, "hours", "78.00", "585.00"],
        ["labour", "Plumber rough-in and fit-off", 14, "hours", "98.00", "1372.00"],
        ["labour", "Electrician", 9, "hours", "95.00", "855.00"],
        ["labour", "Painter", 1.5, "days", "520.00", "780.00"],
        ["labour", "Project management", 6, "hours", "85.00", "510.00"],
        ["labour", "Final clean", 3.25, "hours", "45.00", "146.25"],
        ["other", "Building consent fee (council)", 1, "each", "1180.00", "1180.00"],
        ["other", "Plumbing inspections", 2, "each", "215.00", "430.00"],
        ["other", "Waterproofing certificate", 1, "each", "150.00", "150.00"],
        ["other", "Scaffold / edge protection hire", 1, "week", "310.00", "310.00"],
        ["other", "Contingency allowance", 1, "lot", "750.00", "750.00"],
      ] as Array<[QuoteLineItem["type"], string, number, string, string, string]>
    ).map(([type, description, quantity, unit, price, total]) => ({
      type,
      description,
      quantity,
      unit,
      price,
      total: money(total, `${quantity} × ${price}${total === "1291.88" ? " = 1291.875 — exact half cent → 1291.88" : ""}`),
    })),
    markupPct: 18,
    taxRate: 15,
    totals: {
      materials_subtotal: money("15388.08", "Σ of the 40 material + 5 other line totals (12568.08 + 2820.00)"),
      labour_subtotal: money("11352.25", "1600 + 1920 + 1344 + 2240 + 585 + 1372 + 855 + 780 + 510 + 146.25"),
      markup_amount: money("2769.85", "18 % × 15388.08 = 2769.8544 → 2769.85"),
      subtotal_before_tax: money("29510.18", "15388.08 + 2769.85 + 11352.25"),
      tax_amount: money("4426.53", "15 % × 29510.18 = 4426.527 → 4426.53"),
      total: money("33936.71", "29510.18 + 4426.53"),
    },
    extra: {
      expect: {
        "sendGate:totalsIntegrity": text("", "a quote saved with these totals passes the send gate's totals-integrity check (no reasons)"),
        "invoicePdf:materials+other+markup+labour": money("29510.18", "printed rows tie out: 12568.08 materials + 2820.00 other + 2769.85 markup + 11352.25 labour = the subtotal"),
      },
      compute: (items, t) => {
        const split = splitDisplaySubtotals(items);
        const quote_data = {
          line_items: items,
          materials_subtotal: t.materials_subtotal,
          labour_subtotal: t.labour_subtotal,
          markup_pct: 18,
          markup_amount: t.markup_amount,
          subtotal_before_tax: t.subtotal_before_tax,
          tax_amount: t.tax_amount,
          total: t.total,
          tax_rate: 15,
          tax_label: "GST",
        } as unknown as QuoteData;
        return {
          "sendGate:totalsIntegrity": assessQuoteTotalsIntegrity(quote_data).join(" | "),
          "invoicePdf:materials+other+markup+labour": round2(split.materials + split.other + t.markup_amount + t.labour_subtotal),
        };
      },
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  {
    id: "M09-deposits-in-cents",
    trade: "money",
    title: "Deposit-on-accept amounts (Stripe charges these cents)",
    said: "(deposit % set in Settings → Payments; charged via payments.depositCents)",
    structured: "depositCents(quote total, deposit %) — integer cents",
    expect: {
      "3109.77 @ 50%": count(155489, "3109.77 × 50 % = 1554.885 → half-up $1,554.89"),
      "1638.50 @ 35%": count(57348, "1638.50 × 35 % = 573.475 → half-up $573.48"),
      "1638.45 @ 70%": count(114692, "1638.45 × 70 % = 1146.915 → half-up $1,146.92"),
      "2933.33 @ 10%": count(29333, "293.333 → $293.33"),
      "12204.46 @ 30%": count(366134, "3661.338 → $3,661.34"),
      "214.48 @ 100%": count(21448, "the whole total"),
      "214.48 @ 0%": count(0, "no deposit"),
      "214.48 @ 120%": count(21448, "a deposit can't exceed the total — capped at 100 %"),
    },
    knownBugs: {
      "1638.50 @ 35%":
        "KNOWN BUG: payments.depositCents does Math.round(163850 × 0.35) and 163850 × 0.35 = 57347.49999999999 in floats — expected 57348 (573.475 → half-up, the app's round2 rule), code gives 57347",
      "1638.45 @ 70%":
        "KNOWN BUG: same float half-cent in depositCents (163845 × 0.7 = 114691.49999999999) — expected 114692, code gives 114691",
    },
    compute: (): Actuals => ({
      "3109.77 @ 50%": depositCents(3109.77, 50),
      "1638.50 @ 35%": depositCents(1638.5, 35),
      "1638.45 @ 70%": depositCents(1638.45, 70),
      "2933.33 @ 10%": depositCents(2933.33, 10),
      "12204.46 @ 30%": depositCents(12204.46, 30),
      "214.48 @ 100%": depositCents(214.48, 100),
      "214.48 @ 0%": depositCents(214.48, 0),
      "214.48 @ 120%": depositCents(214.48, 120),
    }),
  },

  // ───────────────────────────────────────────────────────────────────────
  {
    id: "M10-gst-helpers-and-invoice",
    trade: "money",
    title: "GST both directions, and an invoice made from W01's quote",
    said: "(W01 quote, marked complete, turned into an invoice)",
    structured: "addGst / gstInclusiveBreakdown at 15 %; runInvoiceAgent on the W01 quote",
    expect: {
      "addGst(3380).gst": money("507.00", "3380 × 15 %"),
      "addGst(3380).inclusive": money("3887.00", "3380 + 507"),
      "gstInclusiveBreakdown(3887).exclusive": money("3380.00", "3887 ÷ 1.15 = 3380 exactly (3380 × 1.15 = 3887)"),
      "gstInclusiveBreakdown(3887).gst": money("507.00", "3887 × 3/23 = 507 exactly"),
      "gstInclusiveBreakdown(100).exclusive": money("86.96", "100 ÷ 1.15 = 86.957 → 86.96"),
      "gstInclusiveBreakdown(100).gst": money("13.04", "100 − 86.96"),
      "gstInclusiveBreakdown(1231.30).gst": money("160.60", "1231.30 × 3/23 = 160.604 → 160.60"),
      "invoice.subtotal": money("2704.15", "W01: 1253.46 materials + 250.69 markup + 1200 labour"),
      "invoice.taxAmount": money("405.62", "15 % × 2704.15 = 405.6225 → 405.62"),
      "invoice.totalAmount": money("3109.77", "2704.15 + 405.62"),
      "invoice.reason": text("ready", "quote completed, has lines, total > 0"),
    },
    compute: (): Actuals => {
      const a = addGst(3380, 15);
      const b = gstInclusiveBreakdown(3887, 15);
      const c = gstInclusiveBreakdown(100, 15);
      const d = gstInclusiveBreakdown(1231.3, 15);
      const inv = runInvoiceAgent("completed", w01QuoteData());
      return {
        "addGst(3380).gst": a.gst,
        "addGst(3380).inclusive": a.inclusive,
        "gstInclusiveBreakdown(3887).exclusive": b.exclusive,
        "gstInclusiveBreakdown(3887).gst": b.gst,
        "gstInclusiveBreakdown(100).exclusive": c.exclusive,
        "gstInclusiveBreakdown(100).gst": c.gst,
        "gstInclusiveBreakdown(1231.30).gst": d.gst,
        "invoice.subtotal": inv.subtotal,
        "invoice.taxAmount": inv.taxAmount,
        "invoice.totalAmount": inv.totalAmount,
        "invoice.reason": inv.reason,
      };
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  {
    id: "M11-library-prices-2400-vs-5400-products",
    trade: "money",
    title: "AI material lines priced from the library: 2.4 m vs 5.4 m, 2400 vs 2700 sheets",
    said: "(AI material lines matched against the tradie's library, then re-verified by the AI-prices-off policy)",
    structured:
      "library: stud 2.4 m $12.40/each, 90x45 5.4 m $30.26/length, GIB 2400x1200 $31.50/sheet, GIB 2700x1200 $35.90/sheet, R2.2 batts $58/pack, kwila 140x19 $17.95/m",
    expect: Object.fromEntries(
      (
        [
          ["90x45 H1.2 SG8 5.4m [length]", money("30.26", "the 5.4 m length row — never the 2.4 m stud ($12.40)")],
          ["90x45 H1.2 SG8 stud 2.4m [each]", money("12.40", "the 2.4 m stud row")],
          ["90x45 H1.2 SG8 4.8m [length]", money("0.00", "no 4.8 m product in the library → price pending (never the 5.4 m price)")],
          ["GIB Standard 10mm 2700x1200 [sheet]", money("35.90", "the 2700 sheet — never the 2400 sheet")],
          ["GIB Standard 10mm 2400x1200 [m2]", money("0.00", "a per-SHEET price can't price m² → pending")],
          ["Pink Batts R2.2 wall [pack]", money("58.00", "same product, same unit")],
          ["Decking kwila 140x19 [m]", money("17.95", "per-metre price on a metre line")],
          ["Decking kwila 140x19 5.4m [length]", money("0.00", "a 5.4 m LENGTH isn't the per-metre row's unit (and names a length the row doesn't) → pending")],
        ] as Array<[string, Expected]>
      ).map(([k, e]) => [k, e]),
    ),
    compute: (): Actuals =>
      Object.fromEntries(MATCH_LINES.map(([d, u]) => [`${d} [${u}]`, priceAiMaterialLine(d, u)])),
  },
];
