// ─────────────────────────────────────────────────────────────────────────
// Golden jobs — decks and subfloors.
//
// NZ rules assumed (NZS 3604 residential practice; also what
// materialCalculator.calculateDeckTakeoff / calculateSubfloorTakeoff claim):
//   orientation  joists span the WIDTH (short side) and are spaced along the
//                LENGTH; boards run along the length (perpendicular to joists)
//   joists       count = ceil(length ÷ centres) + 1; LM = count × width;
//                lengths = ceil(LM × (1 + waste) ÷ stock) (joins over bearers)
//   bearers      outer bearers set in 100 mm from each edge; the clear span
//                (width − 0.2) is split into bays ≤ 1.8 m (joist span);
//                rows = bays + 1; LM = rows × length → stock as above
//   piles        per bearer row, same set-in rule along the length at
//                ≤ 1.8 m centres; piles = rows × piles per row
//   decking      rows = ceil(width ÷ (board + 5 mm gap)); lineal metres =
//                rows × length × (1 + waste), 2 dp (priced per metre)
//   hangers      one per joist (ledger end); 1 box of hanger nails
//   screws       30 per m² × (1 + waste), sold in packs of 500 (min 1)
//   subfloor ply 17 mm 2400×1200 sheets: area × (1 + waste) ÷ 2.88 m²
//   subfloor scr 8 per m² × (1 + waste)
//   waste 10 %, stock 4.8 m unless the tradie says otherwise
// ─────────────────────────────────────────────────────────────────────────

import { takeoffJob } from "../build";
import { NZ_PROFILE, PRICE } from "../library";
import { bool, count, decimal, money, text, type GoldenJob } from "../types";

export const DECK_JOBS: GoldenJob[] = [
  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "D01-6x4-kwila-deck-450-on-piles",
    trade: "deck",
    title: "6 × 4 m kwila deck, 140×19 boards, joists at 450, on piles",
    said: "6 by 4 metre deck, 140x19 kwila decking, joists at 450 centres, on piles. 3 days for the two of us at $1,200 a day.",
    structured: "deck 6 m × 4 m, joists 450 crs, 140 mm boards + 5 mm gap, piles, waste 10 %, 4.8 m stock",
    source: { kind: "pipeline" },
    parsedType: text("deck", '"deck"'),
    inputs: {
      deckLengthM: decimal("6", '"6 by 4 metre" → long side 6 m'),
      deckWidthM: decimal("4", "short side 4 m"),
      joistSpacingMm: count(450, '"joists at 450 centres"'),
      boardWidthMm: count(140, '"140x19 kwila decking" → 140 mm board'),
      includePiles: bool(true, '"on piles"'),
    },
    lines: {
      "deck-joists": { qty: count(14, "6000 ÷ 450 = 13.33 → 14 spaces → 15 joists × 4 m = 60 m × 1.1 = 66 ÷ 4.8 = 13.75 → 14 lengths"), price: PRICE.deckJoist48, total: money("868.00", "14 × $62.00") },
      "deck-bearers": { qty: count(6, "(4 − 0.2) = 3.8 ÷ 1.8 = 2.11 → 3 bays → 4 rows × 6 m = 24 × 1.1 = 26.4 ÷ 4.8 = 5.5 → 6"), price: PRICE.deckBearer48, total: money("708.00", "6 × $118.00") },
      "decking-boards": { qty: decimal("184.8", "4000 ÷ 145 = 27.59 → 28 rows × 6 m = 168 × 1.1 = 184.8 m"), unit: "m", price: PRICE.kwila14019PerM, total: money("3317.16", "184.8 × $17.95 = 3317.16") },
      "joist-hangers": { qty: count(15, "one per joist = 15"), price: PRICE.joistHanger, total: money("57.75", "15 × $3.85") },
      "deck-piles": { qty: count(20, "(6 − 0.2) = 5.8 ÷ 1.8 = 3.22 → 4 bays → 5 per row × 4 rows = 20"), price: PRICE.concretePile, total: money("690.00", "20 × $34.50") },
      "deck-screws": { qty: count(2, "24 m² × 30 × 1.1 = 792 screws ÷ 500 = 1.58 → 2 packs"), unit: "pack", price: PRICE.deckScrewPack, total: money("178.00", "2 × $89.00") },
      "joist-hanger-nails": { qty: count(1, "1 box"), price: PRICE.hangerNailsBox, total: money("24.90", "1 × $24.90") },
    },
    profile: NZ_PROFILE,
    labour: [
      {
        description: "Labour — 2 builders",
        quantity: 3,
        unit: "days",
        modelPrice: 1200,
        price: money("1200.00", '"$1,200 a day" stated — survives the policy'),
        total: money("3600.00", "3 × $1,200"),
      },
    ],
    totals: {
      materials_subtotal: money("5843.81", "868.00 + 708.00 + 3317.16 + 57.75 + 690.00 + 178.00 + 24.90"),
      labour_subtotal: money("3600.00", "3 days × $1,200"),
      markup_amount: money("1168.76", "20 % × 5843.81 = 1168.762 → 1168.76"),
      subtotal_before_tax: money("10612.57", "5843.81 + 1168.76 + 3600.00"),
      tax_amount: money("1591.89", "15 % × 10612.57 = 1591.8855 → 1591.89"),
      total: money("12204.46", "10612.57 + 1591.89"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "D02-4800x3600-mm-dims-spoken-90-by-19",
    trade: "deck",
    title: "Deck in millimetres (4800 x 3600), spoken 'ninety by nineteen' decking",
    said: "Deck 4800 x 3600, ninety by nineteen H3.2 decking, joists at 450, raised on piles.",
    structured: "deck 4.8 m × 3.6 m, joists 450, 90 mm boards, piles",
    source: { kind: "pipeline" },
    parsedType: text("deck", '"Deck"'),
    inputs: {
      deckLengthM: decimal("4.8", '"4800" bare ≥ 100 → millimetres → 4.8 m'),
      deckWidthM: decimal("3.6", '"3600" → 3.6 m'),
      boardWidthMm: count(90, '"ninety by nineteen" → cleaned to "90x19" → 90 mm'),
    },
    lines: {
      "deck-joists": { qty: count(10, "4800 ÷ 450 = 10.67 → 11 spaces → 12 joists × 3.6 = 43.2 m × 1.1 = 47.52 ÷ 4.8 = 9.9 → 10"), price: PRICE.deckJoist48, total: money("620.00", "10 × $62.00") },
      "deck-bearers": { qty: count(4, "(3.6 − 0.2) = 3.4 ÷ 1.8 = 1.89 → 2 bays → 3 rows × 4.8 = 14.4 × 1.1 = 15.84 ÷ 4.8 = 3.3 → 4"), price: PRICE.deckBearer48, total: money("472.00", "4 × $118.00") },
      "decking-boards": { qty: decimal("200.64", "3600 ÷ 95 = 37.89 → 38 rows × 4.8 = 182.4 × 1.1 = 200.64 m"), price: PRICE.pine9019PerM, total: money("993.17", "200.64 × $4.95 = 993.168 → 993.17") },
      "joist-hangers": { qty: count(12, "12 joists"), price: PRICE.joistHanger, total: money("46.20", "12 × $3.85") },
      "deck-piles": { qty: count(12, "(4.8 − 0.2) = 4.6 ÷ 1.8 = 2.56 → 3 bays → 4 per row × 3 rows = 12"), price: PRICE.concretePile, total: money("414.00", "12 × $34.50") },
      "deck-screws": { qty: count(2, "17.28 m² × 30 × 1.1 = 570.24 → 571 screws ÷ 500 = 1.14 → 2 packs"), price: PRICE.deckScrewPack, total: money("178.00", "2 × $89.00") },
      "joist-hanger-nails": { qty: count(1, "1 box"), price: PRICE.hangerNailsBox, total: money("24.90", "1 × $24.90") },
    },
    profile: NZ_PROFILE,
    labour: [
      {
        description: "Labour",
        quantity: 24,
        unit: "hours",
        modelPrice: 65,
        price: money("85.00", "no rate stated → profile hourly $85 (not the model's $65)"),
        total: money("2040.00", "24 h × $85"),
      },
    ],
    totals: {
      materials_subtotal: money("2748.27", "620.00 + 472.00 + 993.17 + 46.20 + 414.00 + 178.00 + 24.90"),
      labour_subtotal: money("2040.00", "24 h × $85"),
      markup_amount: money("549.65", "20 % × 2748.27 = 549.654 → 549.65"),
      subtotal_before_tax: money("5337.92", "2748.27 + 549.65 + 2040.00"),
      tax_amount: money("800.69", "15 % × 5337.92 = 800.688 → 800.69"),
      total: money("6138.61", "5337.92 + 800.69"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "D03-5400x2400-deck-600crs-5400-stock",
    trade: "deck",
    title: "5.4 × 2.4 m deck, joists at 600, bought in 5.4 m lengths",
    said: "Deck 5.4 by 2.4, joists at 600 centres, 90x19 decking. I buy timber in 5.4m lengths.",
    structured: "deck 5.4 m × 2.4 m, joists 600, 90 mm boards, stock 5.4 m",
    source: { kind: "pipeline" },
    parsedType: text("deck", '"Deck"'),
    inputs: {
      deckLengthM: decimal("5.4", '"5.4 by 2.4"'),
      deckWidthM: decimal("2.4", "short side"),
      joistSpacingMm: count(600, '"joists at 600 centres"'),
      timberStockLengthM: decimal("5.4", '"I buy timber in 5.4m lengths"'),
    },
    lines: {
      "deck-joists": { qty: count(5, "5400 ÷ 600 = 9 spaces → 10 joists × 2.4 = 24 m × 1.1 = 26.4 ÷ 5.4 = 4.89 → 5 (two 2.4 m joists per 5.4 m length)"), price: PRICE.deckJoist54, total: money("348.75", "5 × $69.75") },
      "deck-bearers": { qty: count(4, "(2.4 − 0.2) = 2.2 ÷ 1.8 = 1.22 → 2 bays → 3 rows × 5.4 = 16.2 × 1.1 = 17.82 ÷ 5.4 = 3.3 → 4 (waste is applied to every stock line — the declared convention)"), price: PRICE.deckBearer54, total: money("531.00", "4 × $132.75") },
      "decking-boards": { qty: decimal("154.44", "2400 ÷ 95 = 25.26 → 26 rows × 5.4 = 140.4 × 1.1 = 154.44 m"), price: PRICE.pine9019PerM, total: money("764.48", "154.44 × $4.95 = 764.478 → 764.48") },
      "joist-hangers": { qty: count(10, "10 joists"), price: PRICE.joistHanger, total: money("38.50", "10 × $3.85") },
      "deck-piles": { qty: count(12, "(5.4 − 0.2) = 5.2 ÷ 1.8 = 2.89 → 3 bays → 4 per row × 3 rows = 12 (piles are the default when not stated)"), price: PRICE.concretePile, total: money("414.00", "12 × $34.50") },
      "deck-screws": { qty: count(1, "12.96 m² × 30 × 1.1 = 427.68 → 428 screws → 1 pack of 500"), price: PRICE.deckScrewPack, total: money("89.00", "1 × $89.00") },
      "joist-hanger-nails": { qty: count(1, "1 box"), price: PRICE.hangerNailsBox, total: money("24.90", "1 × $24.90") },
    },
    profile: NZ_PROFILE,
    totals: {
      materials_subtotal: money("2210.63", "348.75 + 531.00 + 764.48 + 38.50 + 414.00 + 89.00 + 24.90"),
      labour_subtotal: money("0.00", "no labour"),
      markup_amount: money("442.13", "20 % × 2210.63 = 442.126 → 442.13"),
      subtotal_before_tax: money("2652.76", "2210.63 + 442.13"),
      tax_amount: money("397.91", "15 % × 2652.76 = 397.914 → 397.91"),
      total: money("3050.67", "2652.76 + 397.91"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "D04-7200x3000-ground-level-vitex-400crs-6m",
    trade: "deck",
    title: "Ground-level 7.2 × 3.0 m vitex deck, joists at 400, 6 m lengths, no piles",
    said: "Deck 7.2 by 3.0 at ground level, 140x32 vitex decking, joists at 400 centres. I buy timber in 6m lengths. 2 days at $650 a day.",
    structured: "deck 7.2 m × 3.0 m, joists 400, 140 mm boards, no piles, stock 6.0 m",
    source: { kind: "pipeline" },
    parsedType: text("deck", '"Deck"'),
    inputs: {
      deckLengthM: decimal("7.2", '"7.2 by 3.0"'),
      deckWidthM: decimal("3", "short side 3.0 m"),
      joistSpacingMm: count(400, '"joists at 400 centres"'),
      boardWidthMm: count(140, '"140x32 vitex decking"'),
      includePiles: bool(false, '"at ground level" → no piles'),
      timberStockLengthM: decimal("6", '"6m lengths"'),
    },
    lines: {
      "deck-joists": { qty: count(11, "7200 ÷ 400 = 18 spaces → 19 joists × 3.0 = 57 m × 1.1 = 62.7 ÷ 6 = 10.45 → 11"), price: PRICE.deckJoist60, total: money("852.50", "11 × $77.50") },
      "deck-bearers": { qty: count(4, "(3.0 − 0.2) = 2.8 ÷ 1.8 = 1.56 → 2 bays → 3 rows × 7.2 = 21.6 × 1.1 = 23.76 ÷ 6 = 3.96 → 4"), price: PRICE.deckBearer60, total: money("590.00", "4 × $147.50") },
      "decking-boards": { qty: decimal("166.32", "3000 ÷ 145 = 20.69 → 21 rows × 7.2 = 151.2 × 1.1 = 166.32 m"), price: PRICE.vitex14032PerM, total: money("2395.01", "166.32 × $14.40 = 2395.008 → 2395.01") },
      "joist-hangers": { qty: count(19, "19 joists"), price: PRICE.joistHanger, total: money("73.15", "19 × $3.85") },
      "deck-screws": { qty: count(2, "21.6 m² × 30 × 1.1 = 712.8 → 713 ÷ 500 = 1.43 → 2 packs"), price: PRICE.deckScrewPack, total: money("178.00", "2 × $89.00") },
      "joist-hanger-nails": { qty: count(1, "1 box"), price: PRICE.hangerNailsBox, total: money("24.90", "1 × $24.90") },
    },
    profile: NZ_PROFILE,
    labour: [
      {
        description: "Labour",
        quantity: 2,
        unit: "days",
        modelPrice: 650,
        price: money("650.00", '"$650 a day" stated'),
        total: money("1300.00", "2 × $650"),
      },
    ],
    totals: {
      materials_subtotal: money("4113.56", "852.50 + 590.00 + 2395.01 + 73.15 + 178.00 + 24.90"),
      labour_subtotal: money("1300.00", "2 days × $650"),
      markup_amount: money("822.71", "20 % × 4113.56 = 822.712 → 822.71"),
      subtotal_before_tax: money("6236.27", "4113.56 + 822.71 + 1300.00"),
      tax_amount: money("935.44", "15 % × 6236.27 = 935.4405 → 935.44"),
      total: money("7171.71", "6236.27 + 935.44"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "S01-subfloor-10x8-joists-400",
    trade: "subfloor",
    title: "10 × 8 m extension subfloor, floor joists at 400, 17 mm ply",
    said: "Subfloor framing for a 10 by 8 extension, floor joists at 400 centres, 17mm ply floor. 5 days at $600 a day.",
    structured: "subfloor 10 m × 8 m, joists 400, piles, 17 mm ply, waste 10 %, 4.8 m stock",
    source: { kind: "pipeline" },
    parsedType: text("subfloor", '"Subfloor"'),
    inputs: {
      floorLengthM: decimal("10", '"10 by 8"'),
      floorWidthM: decimal("8", "short side 8 m"),
      joistSpacingMm: count(400, '"floor joists at 400 centres"'),
    },
    lines: {
      "subfloor-joists": { qty: count(48, "10 000 ÷ 400 = 25 spaces → 26 joists × 8 m = 208 m × 1.1 = 228.8 ÷ 4.8 = 47.67 → 48"), price: PRICE.subfloorJoist48, total: money("2803.20", "48 × $58.40") },
      "subfloor-bearers": { qty: count(14, "(8 − 0.2) = 7.8 ÷ 1.8 = 4.33 → 5 bays → 6 rows × 10 = 60 × 1.1 = 66 ÷ 4.8 = 13.75 → 14"), price: PRICE.deckBearer48, total: money("1652.00", "14 × $118.00") },
      "subfloor-piles": { qty: count(42, "(10 − 0.2) = 9.8 ÷ 1.8 = 5.44 → 6 bays → 7 per row × 6 rows = 42"), price: PRICE.concretePile, total: money("1449.00", "42 × $34.50") },
      "subfloor-plywood": { qty: count(31, "80 m² × 1.1 = 88 ÷ 2.88 = 30.56 → 31 sheets"), price: PRICE.ply17Sheet, total: money("3053.50", "31 × $98.50") },
      "subfloor-joist-hangers": { qty: count(26, "26 joists"), price: PRICE.joistHanger, total: money("100.10", "26 × $3.85") },
      "subfloor-screws": { qty: count(704, "80 m² × 8 × 1.1 = 704"), price: PRICE.subfloorScrew, total: money("84.48", "704 × $0.12") },
    },
    profile: NZ_PROFILE,
    labour: [
      {
        description: "Labour",
        quantity: 5,
        unit: "days",
        modelPrice: 600,
        price: money("600.00", '"$600 a day" stated'),
        total: money("3000.00", "5 × $600"),
      },
    ],
    totals: {
      materials_subtotal: money("9142.28", "2803.20 + 1652.00 + 1449.00 + 3053.50 + 100.10 + 84.48"),
      labour_subtotal: money("3000.00", "5 days × $600"),
      markup_amount: money("1828.46", "20 % × 9142.28 = 1828.456 → 1828.46"),
      subtotal_before_tax: money("13970.74", "9142.28 + 1828.46 + 3000.00"),
      tax_amount: money("2095.61", "15 % × 13970.74 = 2095.611 → 2095.61"),
      total: money("16066.35", "13970.74 + 2095.61"),
    },
  }),
];
