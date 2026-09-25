// ─────────────────────────────────────────────────────────────────────────
// Golden jobs — weatherboard cladding (incl. the 49 / 62 / 101 m runs).
//
// NZ rules assumed (E2/AS1 cavity system; also what
// materialCalculator.calculateCladdingTakeoff claims):
//   net area    run × height − openings (doors 0.82 × 2.04, windows 1.2 × 1.2
//               unless a total opening area is stated)
//   boards      180 bevel-back at 150 mm cover: lineal m = net ÷ 0.150;
//               lengths = ceil(LM × (1 + waste) ÷ stock)
//   battens     20×45 cavity battens at 600 crs: verticals = ceil(run ÷ 0.6)
//               + 1, each full height, plus a head and a sill closure run
//               (2 × run); lengths = ceil(LM × (1 + waste) ÷ stock)
//   wrap        net × (1 + waste) ÷ 27.5 m² per roll, round up
//   flashings   4 m of head/jamb/sill flashing per opening
//   nails       12 per m² × (1 + waste), round up
//   waste 10 %, stock 4.8 m
// A run is a run: 62 m and 101 m of wall are ordinary whole-house
// perimeters, not millimetres.
// ─────────────────────────────────────────────────────────────────────────

import { calculateCladdingTakeoff } from "@/lib/materialCalculator";
import { takeoffJob } from "../build";
import { NZ_PROFILE, PRICE } from "../library";
import { count, decimal, money, text, type GoldenJob } from "../types";

const SCAN_BOILERPLATE =
  "Tradie buys timber in 4.8m lengths. Calculate board / stud / plate counts in whole 4.8m lengths with a 10% waste factor.";

export const CLADDING_JOBS: GoldenJob[] = [
  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "C01-cladding-49m-run-5-openings",
    trade: "cladding",
    title: "49 m of weatherboard (just under the old 50 m trap), 4 windows + 1 door",
    said: "Weatherboard cladding, 49m of wall, 2.4 high, 4 windows, 1 door. 12 days at $640 a day.",
    structured: "cladding run 49 m × 2.4 m, openings 1 door + 4 windows, 150 mm cover",
    source: { kind: "pipeline" },
    parsedType: text("cladding", '"Weatherboard cladding"'),
    inputs: {
      wallLengthM: decimal("49", '"49m of wall"'),
      wallHeightM: decimal("2.4", '"2.4 high"'),
      numberOfOpenings: count(5, "4 windows + 1 door"),
    },
    lines: {
      "cladding-boards": { qty: count(169, "49 × 2.4 = 117.6 − (1.6728 + 4 × 1.44 = 7.4328) = 110.1672 m² ÷ 0.150 = 734.45 m × 1.1 = 807.89 ÷ 4.8 = 168.3 → 169"), price: PRICE.weatherboard48, total: money("8213.40", "169 × $48.60") },
      "cavity-battens": { qty: count(69, "49 000 ÷ 600 = 81.67 → 82 + 1 = 83 verticals × 2.4 = 199.2 + 2 × 49 = 98 → 297.2 m × 1.1 = 326.92 ÷ 4.8 = 68.1 → 69"), price: PRICE.cavityBatten48, total: money("676.20", "69 × $9.80") },
      "building-wrap": { qty: count(5, "110.1672 × 1.1 = 121.18 ÷ 27.5 = 4.41 → 5 rolls"), price: PRICE.wrapRoll, total: money("945.00", "5 × $189.00") },
      flashings: { qty: decimal("20", "5 openings × 4 m = 20 m"), unit: "m", price: PRICE.flashingPerM, total: money("290.00", "20 × $14.50") },
      "cladding-nails": { qty: count(1455, "110.1672 × 12 × 1.1 = 1454.2 → 1455"), price: PRICE.claddingNail, total: money("87.30", "1455 × $0.06") },
    },
    profile: NZ_PROFILE,
    labour: [
      {
        description: "Labour",
        quantity: 12,
        unit: "days",
        modelPrice: 640,
        price: money("640.00", '"$640 a day" stated'),
        total: money("7680.00", "12 × $640"),
      },
    ],
    totals: {
      materials_subtotal: money("10211.90", "8213.40 + 676.20 + 945.00 + 290.00 + 87.30"),
      labour_subtotal: money("7680.00", "12 days × $640"),
      markup_amount: money("2042.38", "20 % × 10211.90"),
      subtotal_before_tax: money("19934.28", "10211.90 + 2042.38 + 7680.00"),
      tax_amount: money("2990.14", "15 % × 19934.28 = 2990.142 → 2990.14"),
      total: money("22924.42", "19934.28 + 2990.14"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "C02-cladding-10m-wall-2400-high-openings-3.5m2",
    trade: "cladding",
    title: "10 m wall, 2400 high, 2 windows totalling 3.5 m²",
    said: "Weatherboard cladding on a 10m wall, 2400 high, 2 windows, openings 3.5m2 total. 16 hours.",
    structured: "cladding run 10 m × 2.4 m, opening area 3.5 m² (2 openings)",
    source: { kind: "pipeline" },
    parsedType: text("cladding", '"Weatherboard cladding"'),
    inputs: {
      wallLengthM: decimal("10", '"a 10m wall"'),
      wallHeightM: decimal("2.4", '"2400 high" → mm → 2.4 m'),
      openingAreaM2: decimal("3.5", '"openings 3.5m2" — a stated area beats the per-window estimate'),
      numberOfOpenings: count(2, '"2 windows"'),
    },
    lines: {
      "cladding-boards": { qty: count(32, "10 × 2.4 = 24 − 3.5 = 20.5 m² ÷ 0.150 = 136.67 m × 1.1 = 150.33 ÷ 4.8 = 31.3 → 32"), price: PRICE.weatherboard48, total: money("1555.20", "32 × $48.60") },
      "cavity-battens": { qty: count(15, "10 000 ÷ 600 = 16.67 → 17 + 1 = 18 × 2.4 = 43.2 + 20 = 63.2 m × 1.1 = 69.52 ÷ 4.8 = 14.48 → 15"), price: PRICE.cavityBatten48, total: money("147.00", "15 × $9.80") },
      "building-wrap": { qty: count(1, "20.5 × 1.1 = 22.55 ÷ 27.5 = 0.82 → 1 roll"), price: PRICE.wrapRoll, total: money("189.00", "1 × $189.00") },
      flashings: { qty: decimal("8", "2 openings × 4 m"), price: PRICE.flashingPerM, total: money("116.00", "8 × $14.50") },
      "cladding-nails": { qty: count(271, "20.5 × 12 × 1.1 = 270.6 → 271"), price: PRICE.claddingNail, total: money("16.26", "271 × $0.06") },
    },
    profile: NZ_PROFILE,
    labour: [
      {
        description: "Labour",
        quantity: 16,
        unit: "hours",
        modelPrice: 70,
        price: money("85.00", "no rate stated → profile $85/h"),
        total: money("1360.00", "16 h × $85"),
      },
    ],
    totals: {
      materials_subtotal: money("2023.46", "1555.20 + 147.00 + 189.00 + 116.00 + 16.26"),
      labour_subtotal: money("1360.00", "16 h × $85"),
      markup_amount: money("404.69", "20 % × 2023.46 = 404.692 → 404.69"),
      subtotal_before_tax: money("3788.15", "2023.46 + 404.69 + 1360.00"),
      tax_amount: money("568.22", "15 % × 3788.15 = 568.2225 → 568.22"),
      total: money("4356.37", "3788.15 + 568.22"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "C03-cladding-scan-62m-whole-house",
    trade: "cladding",
    title: "Whole-house re-clad scan: 62 m of exterior wall (a normal house perimeter)",
    said: [
      "[T2Q_PLAN] type=cladding length_m=62 height_m=2.4",
      "[T2Q_TIMBER] stock_length_m=4.8",
      "Job type: Framing.",
      SCAN_BOILERPLATE,
      "What is being built: weatherboard cladding.",
      "Openings are priced separately.",
    ].join("\n"),
    structured: "cladding run 62 m × 2.4 m, no openings in this run, 150 mm cover, 4.8 m stock",
    source: { kind: "pipeline" },
    lines: {
      "cladding-boards": { qty: count(228, "62 × 2.4 = 148.8 m² ÷ 0.150 = 992 m × 1.1 = 1091.2 ÷ 4.8 = 227.33 → 228"), price: PRICE.weatherboard48, total: money("11080.80", "228 × $48.60") },
      "cavity-battens": { qty: count(87, "62 000 ÷ 600 = 103.33 → 104 + 1 = 105 × 2.4 = 252 + 124 = 376 m × 1.1 = 413.6 ÷ 4.8 = 86.17 → 87"), price: PRICE.cavityBatten48, total: money("852.60", "87 × $9.80") },
      "building-wrap": { qty: count(6, "148.8 × 1.1 = 163.68 ÷ 27.5 = 5.95 → 6 rolls"), price: PRICE.wrapRoll, total: money("1134.00", "6 × $189.00") },
      flashings: { qty: decimal("0", "no openings in this run → 0 m of opening flashings"), price: PRICE.flashingPerM, total: money("0.00", "0 × $14.50") },
      "cladding-nails": { qty: count(1965, "148.8 × 12 × 1.1 = 1964.16 → 1965"), price: PRICE.claddingNail, total: money("117.90", "1965 × $0.06") },
    },
    profile: NZ_PROFILE,
    totals: {
      materials_subtotal: money("13185.30", "11080.80 + 852.60 + 1134.00 + 0 + 117.90"),
      labour_subtotal: money("0.00", "no labour"),
      markup_amount: money("2637.06", "20 % × 13185.30"),
      subtotal_before_tax: money("15822.36", "13185.30 + 2637.06"),
      tax_amount: money("2373.35", "15 % × 15822.36 = 2373.354 → 2373.35"),
      total: money("18195.71", "15822.36 + 2373.35"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "C04-cladding-101m-voice",
    trade: "cladding",
    title: "101 m of weatherboard said out loud",
    said: "Weatherboard cladding for 101m of wall, 2.4 high.",
    structured: "cladding run 101 m × 2.4 m, no openings",
    source: { kind: "pipeline" },
    parsedType: text("cladding", '"Weatherboard cladding"'),
    lines: {
      "cladding-boards": { qty: count(371, "101 × 2.4 = 242.4 m² ÷ 0.150 = 1616 m × 1.1 = 1777.6 ÷ 4.8 = 370.33 → 371") },
      "cavity-battens": { qty: count(140, "101 000 ÷ 600 = 168.33 → 169 + 1 = 170 × 2.4 = 408 + 202 = 610 m × 1.1 = 671 ÷ 4.8 = 139.79 → 140") },
      "building-wrap": { qty: count(10, "242.4 × 1.1 = 266.64 ÷ 27.5 = 9.70 → 10") },
      flashings: { qty: decimal("0", "no openings stated") },
      "cladding-nails": { qty: count(3200, "242.4 × 12 × 1.1 = 3199.68 → 3200") },
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "C05-cladding-scan-12m-no-phantom-framing",
    trade: "cladding",
    title: "Ordinary 12 m cladding scan — cladding lines only",
    said: [
      "[T2Q_PLAN] type=cladding length_m=12 height_m=2.4",
      "[T2Q_TIMBER] stock_length_m=4.8",
      "Job type: Framing.",
      SCAN_BOILERPLATE,
      "What is being built: weatherboard cladding.",
    ].join("\n"),
    structured: "cladding run 12 m × 2.4 m, no openings, 150 mm cover",
    source: { kind: "pipeline" },
    parsedType: text("cladding", "[T2Q_PLAN] type=cladding"),
    inputs: {
      wallLengthM: decimal("12", "marker length_m=12"),
      wallHeightM: decimal("2.4", "marker height_m=2.4"),
    },
    lines: {
      "cladding-boards": { qty: count(44, "12 × 2.4 = 28.8 m² ÷ 0.150 = 192 m × 1.1 = 211.2 ÷ 4.8 = exactly 44"), price: PRICE.weatherboard48, total: money("2138.40", "44 × $48.60") },
      "cavity-battens": { qty: count(18, "12 000 ÷ 600 = 20 → 21 verticals × 2.4 = 50.4 + 24 = 74.4 m × 1.1 = 81.84 ÷ 4.8 = 17.05 → 18"), price: PRICE.cavityBatten48, total: money("176.40", "18 × $9.80") },
      "building-wrap": { qty: count(2, "28.8 × 1.1 = 31.68 ÷ 27.5 = 1.15 → 2"), price: PRICE.wrapRoll, total: money("378.00", "2 × $189.00") },
      flashings: { qty: decimal("0", "no openings"), price: PRICE.flashingPerM, total: money("0.00", "0 m") },
      "cladding-nails": { qty: count(381, "28.8 × 12 × 1.1 = 380.16 → 381"), price: PRICE.claddingNail, total: money("22.86", "381 × $0.06") },
    },
    profile: NZ_PROFILE,
    totals: {
      materials_subtotal: money("2715.66", "2138.40 + 176.40 + 378.00 + 0 + 22.86"),
      labour_subtotal: money("0.00", "no labour"),
      markup_amount: money("543.13", "20 % × 2715.66 = 543.132 → 543.13"),
      subtotal_before_tax: money("3258.79", "2715.66 + 543.13"),
      tax_amount: money("488.82", "15 % × 3258.79 = 488.8185 → 488.82"),
      total: money("3747.61", "3258.79 + 488.82"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "C06-cladding-calculator-101m-structured",
    trade: "cladding",
    title: "101 m run handed straight to the cladding calculator (LLM/scan extraction path)",
    said: "(structured) CladdingTakeoffInput { wallLengthM: 101, wallHeightM: 2.4 }",
    structured: "calculateCladdingTakeoff with a metres value of 101 — what the orchestrator's cladding scope passes for a 101 m extraction",
    source: {
      kind: "structured",
      entryPoint: "takeoff/calculators/cladding.ts → calculateCladdingTakeoff",
      run: () => ({
        lines: calculateCladdingTakeoff({ wallLengthM: 101, wallHeightM: 2.4 }).materials.map((m) => ({
          id: m.id,
          quantity: m.quantity,
          unit: m.unit,
        })),
      }),
    },
    lines: {
      "cladding-boards": { qty: count(371, "101 × 2.4 = 242.4 m² ÷ 0.150 = 1616 m × 1.1 ÷ 4.8 = 370.33 → 371") },
      "cavity-battens": { qty: count(140, "170 verticals × 2.4 + 202 = 610 m × 1.1 ÷ 4.8 = 139.79 → 140") },
      "building-wrap": { qty: count(10, "242.4 × 1.1 ÷ 27.5 = 9.70 → 10") },
      flashings: { qty: decimal("0", "no openings") },
      "cladding-nails": { qty: count(3200, "242.4 × 12 × 1.1 = 3199.68 → 3200") },
    },
  }),
];
