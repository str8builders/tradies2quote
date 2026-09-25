// ─────────────────────────────────────────────────────────────────────────
// Golden jobs — wall framing + GIB lining + wall insulation.
//
// NZ rules assumed (each is also the rule the code CLAIMS to implement —
// materialCalculator.calculateMaterialTakeoff / takeoff calculators):
//   studs       ceil(run ÷ centres) + 1 (end-inclusive), plus 4 per opening
//               (a trimmer + a full stud each side of every door/window)
//   plates      3 × run (bottom plate + double top plate) ÷ stock, round up
//   nogs        rows = max(1, ceil(stud height ÷ 1.35 m) − 1) (NZS 3604 max
//               1.35 m dwang centres); run × rows ÷ stock, round up
//   GIB         (run × height − openings) × faces × (1 + waste) ÷ 2.88 m²
//               (1200×2400 sheet), round up; doors 0.82 × 2.04, windows
//               1.2 × 1.2 when no size is given
//   screws      40 per sheet + 10 % (fixed allowance), round up
//   adhesive    1 tube per 4 sheets, round up
//   skirting    (run − door widths) × faces × (1 + waste) ÷ stock, round up
//   architraves doors × (2 legs × 2.04 + head 0.82) × faces × (1 + waste) ÷ stock
//   insulation  EXTERIOR walls only: net exterior area × (1 + waste) ÷ 8.8 m²
//               per R2.2 wall pack, round up
//   nails       1 box
//   waste       10 % unless the tradie says otherwise; timber stock 4.8 m
//   stock maths lineal metres ÷ stock length, round up (joins over studs /
//               offcuts reused — the estimating convention)
// ─────────────────────────────────────────────────────────────────────────

import { calculateMaterialTakeoff } from "@/lib/materialCalculator";
import { moneyCascade, takeoffJob } from "../build";
import { NZ_PROFILE, PRICE } from "../library";
import { bool, count, decimal, money, text, type GoldenJob } from "../types";

const labourStatedDay = (days: number, rate: number, total: string) => ({
  description: "Labour",
  quantity: days,
  unit: "days",
  modelPrice: rate,
  price: money(rate.toFixed(2), `"$${rate} a day" is stated in the transcript — the tradie's own rate survives the AI-prices-off policy (pricing.ts rule 1)`),
  total: money(total, `${days} days × $${rate}`),
});

const labourHours = (hours: number, modelGuess: number, total: string) => ({
  description: "Labour",
  quantity: hours,
  unit: "hours",
  modelPrice: modelGuess,
  price: money("85.00", `no rate stated; an HOUR line takes the profile hourly rate $85, never the model's $${modelGuess} (pricing.ts rule 2)`),
  total: money(total, `${hours} h × $85`),
});

export const WALL_JOBS: GoldenJob[] = [
  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "W01-gib-both-sides-10m-wall-2400-high",
    trade: "framing",
    title: "The classic: GIB both sides for a 10 m wall, 2400 high",
    said: "GIB both sides for a 10m wall, 2400 high. Two days labour at $600 a day.",
    structured: "wall 10 m × 2.4 m, studs 600 crs, GIB 2 faces, no openings, waste 10 %, 4.8 m stock",
    source: { kind: "pipeline" },
    parsedType: text("wall", "GIB → wall framing/lining job"),
    inputs: {
      wallLengthM: decimal("10", '"a 10m wall" → 10 m'),
      wallHeightM: decimal("2.4", '"2400 high" — a bare 2400 is millimetres → 2.4 m (NOT 2400 m: that once made 18,334 sheets)'),
      gibSides: count(2, '"GIB both sides" → 2 faces'),
      studSpacingMm: count(600, "not stated → NZ default 600 mm centres"),
    },
    lines: {
      "studs-90x45": { qty: count(18, "10 000 mm ÷ 600 = 16.67 → 17 spaces → 18 studs; no openings"), unit: "lengths", price: PRICE.stud24, total: money("223.20", "18 × $12.40") },
      "plates-90x45": { qty: count(7, "3 plates × 10 m = 30 m ÷ 4.8 = 6.25 → 7 lengths"), price: PRICE.length48, total: money("188.30", "7 × $26.90") },
      "nogs-90x45": { qty: count(3, "2.4 ÷ 1.35 = 1.78 → 2 bays → 1 row; 10 m ÷ 4.8 = 2.08 → 3 lengths"), price: PRICE.length48, total: money("80.70", "3 × $26.90") },
      "gib-10mm": { qty: count(19, "10 × 2.4 = 24 m² a side × 2 = 48 m² × 1.1 = 52.8 ÷ 2.88 = 18.33 → 19 sheets"), unit: "sheets", price: PRICE.gib10, total: money("598.50", "19 × $31.50") },
      "gib-screws": { qty: count(836, "19 × 40 = 760 × 1.1 = 836"), price: PRICE.gibScrew, total: money("29.26", "836 × $0.035 = 29.26") },
      "gib-adhesive": { qty: count(5, "19 ÷ 4 = 4.75 → 5 tubes"), price: PRICE.gibAdhesive, total: money("64.50", "5 × $12.90") },
      "framing-nails": { qty: count(1, "1 box allowance"), price: PRICE.framingNailsBox, total: money("69.00", "1 × $69.00") },
      // No insulation line: the tradie never asked for batts, and a wall
      // lined BOTH sides is an interior wall — insulation is quoted for
      // exterior walls only.
    },
    profile: NZ_PROFILE,
    labour: [labourStatedDay(2, 600, "1200.00")],
    knownBugs: {
      lines:
        "KNOWN BUG: a wall lined both sides (so an interior wall) that never mentions insulation still gets a BLOCKED 0-pack 'Pink Batts Insulation' line — aiTakeoffParser.parseWallDescription defaults includeInsulation=true ('Assumed insulation is included unless stated otherwise') and the exterior-only rule then blocks it, and any blocked line hard-blocks sending (quote-validation.assessQuoteTakeoffSafety) — expected no insulation line, code emits one",
    },
    totals: {
      materials_subtotal: money("1253.46", "223.20 + 188.30 + 80.70 + 598.50 + 29.26 + 64.50 + 69.00"),
      labour_subtotal: money("1200.00", "2 days × $600"),
      markup_amount: money("250.69", "20 % × 1253.46 = 250.692 → 250.69"),
      subtotal_before_tax: money("2704.15", "1253.46 + 250.69 + 1200.00"),
      tax_amount: money("405.62", "15 % × 2704.15 = 405.6225 → 405.62"),
      total: money("3109.77", "2704.15 + 405.62"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "W02-partition-4800-400crs-door-one-side",
    trade: "framing",
    title: "4.8 m partition, studs at 400, one door, GIB one side",
    said: "Frame and GIB one side a 4.8 metre partition wall, 2.4 high, studs at 400 centres, one door, no insulation. About 6 hours.",
    structured: "wall 4.8 m × 2.4 m, studs 400 crs, 1 door, GIB 1 face, no insulation",
    source: { kind: "pipeline" },
    parsedType: text("wall", "GIB → wall"),
    inputs: {
      wallLengthM: decimal("4.8", '"a 4.8 metre partition wall"'),
      wallHeightM: decimal("2.4", '"2.4 high" — bare 2.4 (< 100) is metres'),
      studSpacingMm: count(400, '"studs at 400 centres"'),
      numberOfDoors: count(1, '"one door"'),
      gibSides: count(1, '"GIB one side"'),
      includeInsulation: bool(false, '"no insulation"'),
    },
    lines: {
      "studs-90x45": { qty: count(17, "4800 ÷ 400 = 12 spaces → 13 studs + 4 for the door = 17"), price: PRICE.stud24, total: money("210.80", "17 × $12.40") },
      "plates-90x45": { qty: count(3, "3 × 4.8 = 14.4 m ÷ 4.8 = exactly 3 (no float creep to 4)"), price: PRICE.length48, total: money("80.70", "3 × $26.90") },
      "nogs-90x45": { qty: count(1, "1 row × 4.8 m ÷ 4.8 = exactly 1"), price: PRICE.length48, total: money("26.90", "1 × $26.90") },
      "gib-10mm": { qty: count(4, "4.8 × 2.4 = 11.52 − door 0.82 × 2.04 = 1.6728 → 9.8472 m² × 1 face × 1.1 = 10.832 ÷ 2.88 = 3.76 → 4"), price: PRICE.gib10, total: money("126.00", "4 × $31.50") },
      "gib-screws": { qty: count(176, "4 × 40 × 1.1 = 176"), price: PRICE.gibScrew, total: money("6.16", "176 × $0.035") },
      "gib-adhesive": { qty: count(1, "4 ÷ 4 = 1"), price: PRICE.gibAdhesive, total: money("12.90", "1 × $12.90") },
      "framing-nails": { qty: count(1, "1 box"), price: PRICE.framingNailsBox, total: money("69.00", "1 × $69.00") },
    },
    profile: NZ_PROFILE,
    labour: [labourHours(6, 70, "510.00")],
    totals: {
      materials_subtotal: money("532.46", "210.80 + 80.70 + 26.90 + 126.00 + 6.16 + 12.90 + 69.00"),
      labour_subtotal: money("510.00", "6 h × $85"),
      markup_amount: money("106.49", "20 % × 532.46 = 106.492 → 106.49"),
      subtotal_before_tax: money("1148.95", "532.46 + 106.49 + 510.00"),
      tax_amount: money("172.34", "15 % × 1148.95 = 172.3425 → 172.34"),
      total: money("1321.29", "1148.95 + 172.34"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "W03-3600-wall-2700-stud-skirting-architraves",
    trade: "framing",
    title: "3.6 m wall on a 2.7 m stud, GIB both sides, door, skirting and architraves",
    said: "3.6m wall, 2.7 high, studs at 600, GIB both sides, 1 door, skirting and architraves, no insulation. One day at $680.",
    structured: "wall 3.6 m × 2.7 m, studs 600, 1 door, GIB 2 faces, skirting + architraves",
    source: { kind: "pipeline" },
    parsedType: text("wall", "GIB → wall"),
    inputs: {
      wallLengthM: decimal("3.6", '"3.6m wall"'),
      wallHeightM: decimal("2.7", '"2.7 high"'),
      numberOfDoors: count(1, '"1 door"'),
      gibSides: count(2, '"GIB both sides"'),
      includeSkirting: bool(true, '"skirting"'),
      includeArchitraves: bool(true, '"architraves"'),
    },
    lines: {
      "studs-90x45": { qty: count(11, "3600 ÷ 600 = 6 spaces → 7 studs + 4 for the door = 11"), price: PRICE.stud27, total: money("153.45", "11 × $13.95 (2.7 m studs)") },
      "plates-90x45": { qty: count(3, "3 × 3.6 = 10.8 m ÷ 4.8 = 2.25 → 3"), price: PRICE.length48, total: money("80.70", "3 × $26.90") },
      "nogs-90x45": { qty: count(1, "2.7 ÷ 1.35 = exactly 2 bays → 1 row; 3.6 ÷ 4.8 = 0.75 → 1"), price: PRICE.length48, total: money("26.90", "1 × $26.90") },
      "gib-10mm": { qty: count(7, "3.6 × 2.7 = 9.72 − 1.6728 = 8.0472 m² × 2 faces = 16.0944 × 1.1 = 17.704 ÷ 2.88 = 6.15 → 7"), price: PRICE.gib10, total: money("220.50", "7 × $31.50") },
      "gib-screws": { qty: count(308, "7 × 40 × 1.1 = 308"), price: PRICE.gibScrew, total: money("10.78", "308 × $0.035") },
      "gib-adhesive": { qty: count(2, "7 ÷ 4 = 1.75 → 2"), price: PRICE.gibAdhesive, total: money("25.80", "2 × $12.90") },
      skirting: { qty: count(2, "(3.6 − 0.82 door) = 2.78 m × 2 faces = 5.56 × 1.1 = 6.116 ÷ 4.8 = 1.27 → 2"), price: PRICE.skirting48, total: money("44.80", "2 × $22.40") },
      architraves: { qty: count(3, "1 door × (2 × 2.04 + 0.82) = 4.9 m × 2 faces = 9.8 × 1.1 = 10.78 ÷ 4.8 = 2.25 → 3"), price: PRICE.architrave48, total: money("55.80", "3 × $18.60") },
      "framing-nails": { qty: count(1, "1 box"), price: PRICE.framingNailsBox, total: money("69.00", "1 × $69.00") },
    },
    profile: NZ_PROFILE,
    labour: [
      {
        description: "Labour",
        quantity: 1,
        unit: "day",
        modelPrice: 680,
        price: money("680.00", '"One day at $680" — stated, survives the policy'),
        total: money("680.00", "1 × $680"),
      },
    ],
    totals: {
      materials_subtotal: money("687.73", "153.45 + 80.70 + 26.90 + 220.50 + 10.78 + 25.80 + 44.80 + 55.80 + 69.00"),
      labour_subtotal: money("680.00", "1 day × $680"),
      markup_amount: money("137.55", "20 % × 687.73 = 137.546 → 137.55"),
      subtotal_before_tax: money("1505.28", "687.73 + 137.55 + 680.00"),
      tax_amount: money("225.79", "15 % × 1505.28 = 225.792 → 225.79"),
      total: money("1731.07", "1505.28 + 225.79"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "W04-6m-wall-3000-stud-two-nog-rows",
    trade: "framing",
    title: "6 m wall on a 3.0 m stud (two rows of nogs)",
    said: "New 6m wall, 3.0m stud height, 600 centres, GIB one side, no insulation.",
    structured: "wall 6 m × 3.0 m, studs 600, GIB 1 face",
    source: { kind: "pipeline" },
    parsedType: text("wall", "GIB → wall"),
    inputs: {
      wallLengthM: decimal("6", '"6m wall"'),
      wallHeightM: decimal("3", '"3.0m stud height"'),
      studSpacingMm: count(600, '"600 centres"'),
    },
    lines: {
      "studs-90x45": { qty: count(11, "6000 ÷ 600 = 10 spaces → 11 studs"), price: PRICE.stud30, total: money("170.50", "11 × $15.50 (3.0 m studs)") },
      "plates-90x45": { qty: count(4, "3 × 6 = 18 m ÷ 4.8 = 3.75 → 4"), price: PRICE.length48, total: money("107.60", "4 × $26.90") },
      "nogs-90x45": { qty: count(3, "3.0 ÷ 1.35 = 2.22 → 3 bays → 2 rows; 2 × 6 = 12 m ÷ 4.8 = 2.5 → 3"), price: PRICE.length48, total: money("80.70", "3 × $26.90") },
      "gib-10mm": { qty: count(7, "6 × 3 = 18 m² × 1.1 = 19.8 ÷ 2.88 = 6.875 → 7 (layout check: 2 rows of 2.5 sheets + 0.6 m strip row from 1.25 sheets = 6.25 → 7)"), price: PRICE.gib10, total: money("220.50", "7 × $31.50") },
      "gib-screws": { qty: count(308, "7 × 44 = 308"), price: PRICE.gibScrew, total: money("10.78", "308 × $0.035") },
      "gib-adhesive": { qty: count(2, "7 ÷ 4 → 2"), price: PRICE.gibAdhesive, total: money("25.80", "2 × $12.90") },
      "framing-nails": { qty: count(1, "1 box"), price: PRICE.framingNailsBox, total: money("69.00", "1 × $69.00") },
    },
    profile: NZ_PROFILE,
    totals: {
      materials_subtotal: money("684.88", "170.50 + 107.60 + 80.70 + 220.50 + 10.78 + 25.80 + 69.00"),
      labour_subtotal: money("0.00", "no labour line"),
      markup_amount: money("136.98", "20 % × 684.88 = 136.976 → 136.98"),
      subtotal_before_tax: money("821.86", "684.88 + 136.98"),
      tax_amount: money("123.28", "15 % × 821.86 = 123.279 → 123.28"),
      total: money("945.14", "821.86 + 123.28"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "W05-5400-wall-in-5400-stock",
    trade: "framing",
    title: "5.4 m wall bought in 5.4 m lengths (2.4 m studs vs 5.4 m stock)",
    said: "5.4m wall, 2.4 high, GIB one side, 600 centres, no insulation. I buy timber in 5.4m lengths.",
    structured: "wall 5.4 m × 2.4 m, studs 600, GIB 1 face, stock 5.4 m, markup 15 %",
    source: { kind: "pipeline" },
    parsedType: text("wall", "GIB → wall"),
    inputs: {
      wallLengthM: decimal("5.4", '"5.4m wall"'),
      wallHeightM: decimal("2.4", '"2.4 high"'),
      timberStockLengthM: decimal("5.4", '"I buy timber in 5.4m lengths"'),
    },
    lines: {
      "studs-90x45": { qty: count(10, "5400 ÷ 600 = 9 spaces → 10 studs (2.4 m precuts)"), price: PRICE.stud24, total: money("124.00", "10 × $12.40") },
      "plates-90x45": { qty: count(3, "3 × 5.4 = 16.2 m ÷ 5.4 = exactly 3 (16.2/5.4 is 2.9999… in floats — must not become 2 or 4)"), price: PRICE.length54, total: money("90.78", "3 × $30.26") },
      "nogs-90x45": { qty: count(1, "1 row × 5.4 ÷ 5.4 = exactly 1"), price: PRICE.length54, total: money("30.26", "1 × $30.26") },
      "gib-10mm": { qty: count(5, "5.4 × 2.4 = 12.96 m² × 1.1 = 14.256 ÷ 2.88 = 4.95 → 5"), price: PRICE.gib10, total: money("157.50", "5 × $31.50") },
      "gib-screws": { qty: count(220, "5 × 44 = 220"), price: PRICE.gibScrew, total: money("7.70", "220 × $0.035") },
      "gib-adhesive": { qty: count(2, "5 ÷ 4 = 1.25 → 2"), price: PRICE.gibAdhesive, total: money("25.80", "2 × $12.90") },
      "framing-nails": { qty: count(1, "1 box"), price: PRICE.framingNailsBox, total: money("69.00", "1 × $69.00") },
    },
    profile: { hourlyRate: 85, markupPct: 15, taxRate: 15 },
    labour: [labourHours(4.5, 72, "382.50")],
    totals: {
      materials_subtotal: money("505.04", "124.00 + 90.78 + 30.26 + 157.50 + 7.70 + 25.80 + 69.00"),
      labour_subtotal: money("382.50", "4.5 h × $85"),
      markup_amount: money("75.76", "15 % × 505.04 = 75.756 → 75.76"),
      subtotal_before_tax: money("963.30", "505.04 + 75.76 + 382.50"),
      tax_amount: money("144.50", "15 % × 963.30 = 144.495 — an EXACT half cent → half-up 144.50 (float maths gives 144.49)"),
      total: money("1107.80", "963.30 + 144.50"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "W06-typed-exterior-wall-with-batts",
    trade: "insulation",
    title: "Typed exterior wall with its exterior run stated — batts must be sized",
    said:
      "Exterior wall 12m long, 2.4 high, 2 windows, GIB one side, pink batts, studs at 600 centres. A day and a half at $640 a day.\nExterior wall run: 12m",
    structured: "exterior wall 12 m × 2.4 m, 2 windows, GIB inside face, R2.2 batts, exterior run 12 m",
    source: { kind: "pipeline" },
    parsedType: text("wall", "GIB → wall"),
    inputs: {
      wallLengthM: decimal("12", '"wall 12m long"'),
      numberOfWindows: count(2, '"2 windows"'),
      includeInsulation: bool(true, '"pink batts"'),
      exteriorWallLengthM: decimal("12", 'the DIMENSIONS-style line "Exterior wall run: 12m" states the exterior run'),
    },
    lines: {
      "studs-90x45": { qty: count(29, "12 000 ÷ 600 = 20 spaces → 21 studs + 2 windows × 4 = 29"), price: PRICE.stud24, total: money("359.60", "29 × $12.40") },
      "plates-90x45": { qty: count(8, "3 × 12 = 36 m ÷ 4.8 = 7.5 → 8"), price: PRICE.length48, total: money("215.20", "8 × $26.90") },
      "nogs-90x45": { qty: count(3, "1 row × 12 m ÷ 4.8 = 2.5 → 3"), price: PRICE.length48, total: money("80.70", "3 × $26.90") },
      "gib-10mm": { qty: count(10, "12 × 2.4 = 28.8 − 2 × 1.44 = 25.92 m² × 1.1 = 28.512 ÷ 2.88 = 9.9 → 10"), price: PRICE.gib10, total: money("315.00", "10 × $31.50") },
      "gib-screws": { qty: count(440, "10 × 44"), price: PRICE.gibScrew, total: money("15.40", "440 × $0.035") },
      "gib-adhesive": { qty: count(3, "10 ÷ 4 = 2.5 → 3"), price: PRICE.gibAdhesive, total: money("38.70", "3 × $12.90") },
      "pink-batts": { qty: count(4, "exterior net 12 × 2.4 − 2.88 = 25.92 m² × 1.1 = 28.512 ÷ 8.8 = 3.24 → 4 packs"), price: PRICE.battsR22Pack, total: money("232.00", "4 × $58.00") },
      "framing-nails": { qty: count(1, "1 box"), price: PRICE.framingNailsBox, total: money("69.00", "1 × $69.00") },
    },
    profile: NZ_PROFILE,
    labour: [labourStatedDay(1.5, 640, "960.00")],
    totals: {
      materials_subtotal: money("1325.60", "359.60 + 215.20 + 80.70 + 315.00 + 15.40 + 38.70 + 232.00 + 69.00"),
      labour_subtotal: money("960.00", "1.5 days × $640"),
      markup_amount: money("265.12", "20 % × 1325.60"),
      subtotal_before_tax: money("2550.72", "1325.60 + 265.12 + 960.00"),
      tax_amount: money("382.61", "15 % × 2550.72 = 382.608 → 382.61"),
      total: money("2933.33", "2550.72 + 382.61"),
    },
    knownBugs: {
      "input:exteriorWallLengthM":
        "KNOWN BUG: a typed/voice 'Exterior wall run: 12m' line is ignored without a scan [T2Q_PLAN] marker (aiTakeoffParser.parseWallDescription only uses textRuns.exterior to cross-check marker.exteriorWallRunM) — expected 12 m because the tradie stated the exterior run, code gives undefined",
      "qty:pink-batts":
        "KNOWN BUG: same root cause — expected 4 packs because the exterior run is stated (25.92 m² × 1.1 ÷ 8.8 = 3.24 → 4), code gives a BLOCKED 0-pack line (safe, but the tradie must re-enter what they already said)",
      ...moneyCascade(["pink-batts"], "KNOWN BUG: cascades from the blocked 0-pack insulation line (exterior run ignored) — $232.00 of batts missing from the total"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "W07-whole-house-scan-52800-run",
    trade: "lining",
    title: "Whole-house floor-plan scan: 52.8 m total run, 36 m exterior",
    said: [
      "[T2Q_PLAN] type=wall wall_run_m=52.8 exterior_wall_run_m=36 height_m=2.4 stud_spacing_mm=600 door_count=5 window_count=6",
      "[T2Q_TIMBER] stock_length_m=4.8",
      "Job type: Framing.",
      "Tradie buys timber in 4.8m lengths. Calculate board / stud / plate counts in whole 4.8m lengths with a 10% waste factor.",
      "What is being built: 3-bedroom house wall framing.",
      "Notes: GIB the inside of the exterior walls and both sides of the interior walls. 2 of the 5 doors are exterior doors. Insulate the exterior walls.",
    ].join("\n"),
    structured:
      "total run 52.8 m (exterior 36 m + interior 16.8 m), 2.4 m stud, 600 crs, 5 doors (2 exterior), 6 windows (exterior), GIB exterior walls inside face only + interior walls both faces, batts to exterior walls",
    source: { kind: "pipeline" },
    parsedType: text("wall", "[T2Q_PLAN] type=wall"),
    inputs: {
      wallLengthM: decimal("52.8", "marker wall_run_m=52.8 (every wall summed)"),
      exteriorWallLengthM: decimal("36", "marker exterior_wall_run_m=36"),
      numberOfDoors: count(5, "marker door_count=5"),
      numberOfWindows: count(6, "marker window_count=6"),
    },
    lines: {
      "studs-90x45": {
        qty: count(133, "52 800 ÷ 600 = 88 spaces → 89 + 11 openings × 4 = 133 (the run is treated as one continuous wall — the calculator's declared rule for a whole-plan run; per-wall end/corner studs aren't derivable from a total run)"),
        price: PRICE.stud24,
        total: money("1649.20", "133 × $12.40"),
      },
      "plates-90x45": { qty: count(33, "3 × 52.8 = 158.4 m ÷ 4.8 = exactly 33"), price: PRICE.length48, total: money("887.70", "33 × $26.90") },
      "nogs-90x45": { qty: count(11, "1 row × 52.8 ÷ 4.8 = exactly 11"), price: PRICE.length48, total: money("295.90", "11 × $26.90") },
      "gib-10mm": {
        qty: count(
          56,
          "GIB is an INTERIOR lining: exterior walls take it on the inside face only. Exterior 36 × 2.4 = 86.4 − 6 windows × 1.44 (8.64) − 2 exterior doors × 1.6728 (3.3456) = 74.4144 m²; interior 16.8 × 2.4 = 40.32 × 2 faces = 80.64 − 3 doors × 2 faces × 1.6728 (10.0368) = 70.6032 m²; total 145.0176 × 1.1 = 159.519 ÷ 2.88 = 55.39 → 56 sheets",
        ),
        price: PRICE.gib10,
        total: money("1764.00", "56 × $31.50"),
      },
      "gib-screws": { qty: count(2464, "56 × 40 × 1.1 = 2464"), price: PRICE.gibScrew, total: money("86.24", "2464 × $0.035") },
      "gib-adhesive": { qty: count(14, "56 ÷ 4 = 14"), price: PRICE.gibAdhesive, total: money("180.60", "14 × $12.90") },
      "pink-batts": {
        qty: count(10, "exterior only: 86.4 − 8.64 − 3.3456 = 74.4144 m² × 1.1 = 81.856 ÷ 8.8 = 9.30 → 10 packs (the code shares openings by run, 17.00 × 36/52.8 = 11.59 → 74.81 m² → also 10)"),
        price: PRICE.battsR22Pack,
        total: money("580.00", "10 × $58.00"),
      },
      "framing-nails": { qty: count(1, "1 box"), price: PRICE.framingNailsBox, total: money("69.00", "1 × $69.00") },
    },
    profile: NZ_PROFILE,
    totals: {
      materials_subtotal: money("5512.64", "1649.20 + 887.70 + 295.90 + 1764.00 + 86.24 + 180.60 + 580.00 + 69.00"),
      labour_subtotal: money("0.00", "no labour line"),
      markup_amount: money("1102.53", "20 % × 5512.64 = 1102.528 → 1102.53"),
      subtotal_before_tax: money("6615.17", "5512.64 + 1102.53"),
      tax_amount: money("992.28", "15 % × 6615.17 = 992.2755 → 992.28"),
      total: money("7607.45", "6615.17 + 992.28"),
    },
    knownBugs: {
      "qty:gib-10mm":
        "KNOWN BUG: 'both sides' is applied to the whole 52.8 m run, so the OUTSIDE face of the 36 m of exterior wall is GIB-lined too (materialCalculator.calculateMaterialTakeoff has one gibSides for the run although it knows exteriorWallLengthM) — expected 56 sheets (exterior walls inside face + interior walls both faces = 145.02 m²), code gives 84 (219.43 m²)",
      "qty:gib-screws": "KNOWN BUG: cascades from the GIB over-count — expected 2464 (56 sheets), code gives 3696 (84 sheets)",
      "qty:gib-adhesive": "KNOWN BUG: cascades from the GIB over-count — expected 14 tubes, code gives 21",
      ...moneyCascade(["gib-10mm", "gib-screws", "gib-adhesive"], "KNOWN BUG: cascades from GIB lined on the outside of exterior walls — 28 sheets ($882 + fixings) too many"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "W08-takeoff-panel-15pc-waste",
    trade: "framing",
    title: "Takeoff assumptions panel: 8.4 m wall, 400 crs, 2 doors + window, 15 % waste",
    said: "(typed into Takeoff assumptions) wall 8.4 m, height 2.4 m, 400 mm centres, 2 doors, 1 window, GIB both sides, skirting + architraves, no insulation, waste 15 %",
    structured: "MaterialTakeoffInput exactly as TakeoffPanel.handleRecalculate builds it",
    source: {
      kind: "structured",
      entryPoint: "TakeoffPanel → calculateMaterialTakeoff",
      run: () => ({
        lines: calculateMaterialTakeoff({
          wallLengthM: 8.4,
          wallHeightM: 2.4,
          studSpacingMm: 400,
          numberOfDoors: 2,
          numberOfWindows: 1,
          gibSides: 2,
          includeInsulation: false,
          includeSkirting: true,
          includeArchitraves: true,
          wastePercent: 15,
        }).materials.map((m) => ({ id: m.id, quantity: m.quantity, unit: m.unit })),
      }),
    },
    lines: {
      "studs-90x45": { qty: count(34, "8400 ÷ 400 = 21 spaces → 22 + 3 openings × 4 = 34"), price: PRICE.stud24, total: money("421.60", "34 × $12.40") },
      "plates-90x45": { qty: count(6, "3 × 8.4 = 25.2 ÷ 4.8 = 5.25 → 6 (plates carry no waste)"), price: PRICE.length48, total: money("161.40", "6 × $26.90") },
      "nogs-90x45": { qty: count(2, "1 row × 8.4 ÷ 4.8 = 1.75 → 2"), price: PRICE.length48, total: money("53.80", "2 × $26.90") },
      "gib-10mm": { qty: count(13, "8.4 × 2.4 = 20.16 − 2 × 1.6728 − 1.44 = 15.3744 m² × 2 = 30.7488 × 1.15 = 35.361 ÷ 2.88 = 12.28 → 13"), price: PRICE.gib10, total: money("409.50", "13 × $31.50") },
      "gib-screws": { qty: count(572, "13 × 40 × 1.1 = 572 (the screw allowance is a fixed +10 %, independent of the 15 % sheet waste)"), price: PRICE.gibScrew, total: money("20.02", "572 × $0.035") },
      "gib-adhesive": { qty: count(4, "13 ÷ 4 = 3.25 → 4"), price: PRICE.gibAdhesive, total: money("51.60", "4 × $12.90") },
      skirting: { qty: count(4, "(8.4 − 2 × 0.82) = 6.76 × 2 faces = 13.52 × 1.15 = 15.548 ÷ 4.8 = 3.24 → 4"), price: PRICE.skirting48, total: money("89.60", "4 × $22.40") },
      architraves: { qty: count(5, "2 doors × 4.9 m = 9.8 × 2 faces = 19.6 × 1.15 = 22.54 ÷ 4.8 = 4.70 → 5"), price: PRICE.architrave48, total: money("93.00", "5 × $18.60") },
      "framing-nails": { qty: count(1, "1 box"), price: PRICE.framingNailsBox, total: money("69.00", "1 × $69.00") },
    },
    profile: NZ_PROFILE,
    totals: {
      materials_subtotal: money("1369.52", "421.60 + 161.40 + 53.80 + 409.50 + 20.02 + 51.60 + 89.60 + 93.00 + 69.00"),
      labour_subtotal: money("0.00", "no labour"),
      markup_amount: money("273.90", "20 % × 1369.52 = 273.904 → 273.90"),
      subtotal_before_tax: money("1643.42", "1369.52 + 273.90"),
      tax_amount: money("246.51", "15 % × 1643.42 = 246.513 → 246.51"),
      total: money("1889.93", "1643.42 + 246.51"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "F01-frame-a-wall-7200-x-2400-high",
    trade: "framing",
    title: "Frame-only wall through the takeoff orchestrator (no GIB words)",
    said: "Frame a wall 7.2 x 2.4 high, studs at 600 centres, 1 window. 8 hours.",
    structured: "orchestrator framing scope: length 7.2 m, height 2.4 m, studs 600, 1 window",
    source: { kind: "pipeline" },
    lines: {
      "studs-90x45": { qty: count(17, "7200 ÷ 600 = 12 spaces → 13 + 4 for the window = 17"), price: PRICE.stud24, total: money("210.80", "17 × $12.40") },
      "plates-90x45": { qty: count(5, "3 × 7.2 = 21.6 ÷ 4.8 = 4.5 → 5"), price: PRICE.length48, total: money("134.50", "5 × $26.90") },
      "nogs-90x45": { qty: count(2, "1 row × 7.2 ÷ 4.8 = 1.5 → 2"), price: PRICE.length48, total: money("53.80", "2 × $26.90") },
      "framing-nails": { qty: count(1, "1 box"), price: PRICE.framingNailsBox, total: money("69.00", "1 × $69.00") },
    },
    profile: NZ_PROFILE,
    labour: [labourHours(8, 75, "680.00")],
    totals: {
      materials_subtotal: money("468.10", "210.80 + 134.50 + 53.80 + 69.00"),
      labour_subtotal: money("680.00", "8 h × $85"),
      markup_amount: money("93.62", "20 % × 468.10"),
      subtotal_before_tax: money("1241.72", "468.10 + 93.62 + 680.00"),
      tax_amount: money("186.26", "15 % × 1241.72 = 186.258 → 186.26"),
      total: money("1427.98", "1241.72 + 186.26"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "L01-ceiling-22.68m2-gib",
    trade: "lining",
    title: "Lounge ceiling, 22.68 m² of 10 mm GIB (area given)",
    said: "Line the lounge ceiling with 10mm GIB, 22.68 square metres. 5 hours.",
    structured: "orchestrator lining scope: area 22.68 m², 1 face",
    source: { kind: "pipeline" },
    lines: {
      "lining-sheets": { qty: count(9, "22.68 m² × 1 face × 1.1 = 24.948 ÷ 2.88 = 8.66 → 9 sheets"), price: PRICE.gib10, total: money("283.50", "9 × $31.50") },
      "lining-screws": { qty: count(396, "9 × 40 × 1.1 = 396"), price: PRICE.gibScrew, total: money("13.86", "396 × $0.035") },
      "lining-adhesive": { qty: count(3, "9 ÷ 4 = 2.25 → 3"), price: PRICE.gibAdhesive, total: money("38.70", "3 × $12.90") },
    },
    profile: NZ_PROFILE,
    labour: [labourHours(5, 80, "425.00")],
    totals: {
      materials_subtotal: money("336.06", "283.50 + 13.86 + 38.70"),
      labour_subtotal: money("425.00", "5 h × $85"),
      markup_amount: money("67.21", "20 % × 336.06 = 67.212 → 67.21"),
      subtotal_before_tax: money("828.27", "336.06 + 67.21 + 425.00"),
      tax_amount: money("124.24", "15 % × 828.27 = 124.2405 → 124.24"),
      total: money("952.51", "828.27 + 124.24"),
    },
  }),

  // ───────────────────────────────────────────────────────────────────────
  takeoffJob({
    id: "L02-partition-24m2-gib-both-sides",
    trade: "lining",
    title: "Partition wall given as an area, GIB both sides",
    said: "Partition wall is 24 square metres, GIB both sides.",
    structured: "orchestrator lining scope: area 24 m², 2 faces",
    source: { kind: "pipeline" },
    inputs: { gibSides: count(2, 'the legacy parser does read "GIB both sides" → 2 (it just has no wall length to run with)') },
    lines: {
      "lining-sheets": { qty: count(19, "24 m² × 2 faces = 48 m² × 1.1 = 52.8 ÷ 2.88 = 18.33 → 19 sheets"), price: PRICE.gib10, total: money("598.50", "19 × $31.50") },
      "lining-screws": { qty: count(836, "19 × 40 × 1.1 = 836"), price: PRICE.gibScrew, total: money("29.26", "836 × $0.035") },
      "lining-adhesive": { qty: count(5, "19 ÷ 4 = 4.75 → 5"), price: PRICE.gibAdhesive, total: money("64.50", "5 × $12.90") },
    },
    profile: NZ_PROFILE,
    totals: {
      materials_subtotal: money("692.26", "598.50 + 29.26 + 64.50"),
      labour_subtotal: money("0.00", "no labour"),
      markup_amount: money("138.45", "20 % × 692.26 = 138.452 → 138.45"),
      subtotal_before_tax: money("830.71", "692.26 + 138.45"),
      tax_amount: money("124.61", "15 % × 830.71 = 124.6065 → 124.61"),
      total: money("955.32", "830.71 + 124.61"),
    },
    knownBugs: {
      "qty:lining-sheets":
        "KNOWN BUG: 'GIB both sides' is lost on the orchestrator lining path — takeoff/calculators/lining.ts reads the faces from ext.notes, which the regex extraction (takeoff/extraction.ts) always leaves empty — expected 19 sheets (48 m²), code gives 10 (24 m², one side)",
      "qty:lining-screws": "KNOWN BUG: cascades from the one-side lining — expected 836, code gives 440",
      "qty:lining-adhesive": "KNOWN BUG: cascades from the one-side lining — expected 5 tubes, code gives 3",
      ...moneyCascade(["lining-sheets", "lining-screws", "lining-adhesive"], "KNOWN BUG: cascades from 'both sides' being dropped — half the lining is missing from the price"),
    },
  }),
];
