// ─────────────────────────────────────────────────────────────────────────
// Supplier-quote golden cases — the exact answers for the synthetic supplier
// documents in src/eval/fixtures/supplier-quotes/ (made by
// scripts/make-supplier-fixtures.mjs; made-up merchants, no real branding).
// Change a fixture and its answer here together.
//
// Every line is checked for its name (the words that must appear), quantity,
// unit and NET unit price to the cent, plus the printed totals.
// ─────────────────────────────────────────────────────────────────────────

export type ExpectedLine = {
  /** Words the read name must contain (any case, any order). */
  name: string[];
  quantity: number;
  /** Acceptable units after the parser's normalisation. */
  unit: string[];
  /** The NET unit price, as printed (after any line discount). */
  price: number;
  /** The printed line total. */
  lineTotal: number;
};

export type SupplierQuoteCase = {
  id: string;
  title: string;
  /** Files under src/eval/fixtures/supplier-quotes/, read one call each and merged (like the app does). */
  files: string[];
  /** How many of the lines are on each file (default: all on the one file). */
  linesPerFile?: number[];
  gstInclusive: boolean;
  lines: ExpectedLine[];
  totals: {
    subtotal: number | null;
    discount?: number;
    freight?: number;
    gst: number;
    total: number;
  };
  /** Distinct names once repeats are merged for the library save. */
  libraryNames?: number;
};

const EACH = ["each"];

const CASE_A_LINES: ExpectedLine[] = [
  { name: ["90x45", "H1.2", "SG8"], quantity: 20, unit: ["length"], price: 18.28, lineTotal: 365.6 },
  { name: ["plasterboard", "10mm"], quantity: 12, unit: ["sheet"], price: 25.6, lineTotal: 307.2 },
  { name: ["joist hanger", "190"], quantity: 30, unit: EACH, price: 3.96, lineTotal: 118.8 },
  { name: ["framing nails", "90mm"], quantity: 2, unit: ["box"], price: 63, lineTotal: 126 },
];
const CASE_A_TOTALS = { subtotal: 917.6, gst: 137.64, total: 1055.24 };

export const SUPPLIER_QUOTE_CASES: SupplierQuoteCase[] = [
  {
    id: "a-list-disc-nett",
    title: "List, Disc % and Nett columns: the price is the nett price",
    files: ["a-list-disc-nett.png"],
    gstInclusive: false,
    lines: CASE_A_LINES,
    totals: CASE_A_TOTALS,
  },
  {
    id: "a-list-disc-nett-pdf",
    title: "The same quote as a text PDF",
    files: ["a-list-disc-nett.pdf"],
    gstInclusive: false,
    lines: CASE_A_LINES,
    totals: CASE_A_TOTALS,
  },
  {
    id: "b-freight-discount",
    title: "Freight and an account discount in the totals block",
    files: ["b-freight-discount.png"],
    gstInclusive: false,
    lines: [
      { name: ["post", "100x100", "H4"], quantity: 6, unit: EACH, price: 28.9, lineTotal: 173.4 },
      { name: ["decking", "140x32"], quantity: 10, unit: ["length"], price: 36.5, lineTotal: 365 },
      { name: ["concrete", "20kg"], quantity: 3, unit: ["bag"], price: 11.2, lineTotal: 33.6 },
    ],
    totals: { subtotal: 572, discount: 28.6, freight: 45, gst: 88.26, total: 676.66 },
  },
  {
    id: "c-gst-inclusive-receipt",
    title: "A GST-inclusive retail receipt",
    files: ["c-gst-inclusive-receipt.png"],
    gstInclusive: true,
    lines: [
      { name: ["screws", "40mm"], quantity: 2, unit: ["each", "pack", "pk"], price: 19.99, lineTotal: 39.98 },
      { name: ["filler"], quantity: 1, unit: ["each", "tub"], price: 24.5, lineTotal: 24.5 },
      { name: ["sandpaper", "120"], quantity: 4, unit: ["each", "pack", "pk"], price: 6.49, lineTotal: 25.96 },
    ],
    totals: { subtotal: 90.44, gst: 11.8, total: 90.44 },
  },
  {
    id: "d-two-pages",
    title: "Two pages with the same product on both",
    files: ["d-two-pages-1.png", "d-two-pages-2.png"],
    linesPerFile: [2, 2],
    gstInclusive: false,
    lines: [
      { name: ["90x45", "H3.2"], quantity: 30, unit: ["m"], price: 9.8, lineTotal: 294 },
      { name: ["plasterboard", "13mm"], quantity: 6, unit: ["sheet"], price: 38.5, lineTotal: 231 },
      { name: ["90x45", "H3.2"], quantity: 12, unit: ["m"], price: 9.8, lineTotal: 117.6 },
      { name: ["building paper"], quantity: 1, unit: ["roll"], price: 96, lineTotal: 96 },
    ],
    totals: { subtotal: 738.6, gst: 110.79, total: 849.39 },
    libraryNames: 3,
  },
  {
    id: "e-rotated-photo",
    title: "A slightly rotated phone photo of a simple quote",
    files: ["e-rotated-photo.jpg"],
    gstInclusive: false,
    lines: [
      { name: ["batten", "45x19"], quantity: 5, unit: ["length"], price: 6.4, lineTotal: 32 },
      { name: ["glue"], quantity: 1, unit: EACH, price: 18.9, lineTotal: 18.9 },
      { name: ["hinge", "100mm"], quantity: 2, unit: ["pair"], price: 9.5, lineTotal: 19 },
    ],
    totals: { subtotal: 69.9, gst: 10.49, total: 80.39 },
  },
];
