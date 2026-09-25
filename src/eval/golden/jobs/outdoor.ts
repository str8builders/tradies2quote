// ─────────────────────────────────────────────────────────────────────────
// Golden jobs — roofing, fencing, concrete, insulation, fixings, generic.
// These trades have no legacy calculator: they reach the quote through the
// takeoff orchestrator (routeScope → extractFromText → validate → the
// scope's calculator), exactly as run.ts appends orchestrator-only scopes.
//
// NZ rules assumed (and what the calculators claim):
//   roofing   long-run sheets are laid side by side along the gutter (eave)
//             and cut to the rafter length: sheets = ceil(eave length ÷
//             0.762 m cover); no "waste" on the sheet COUNT (the last sheet
//             is ripped). Roof area = plan ÷ cos(pitch); screws 6 per m² of
//             roof × (1 + waste)
//   fencing   posts = ceil(run ÷ post centres) + 1 (1.8 m centres unless the
//             tradie gives them); 2 rails per bay as lineal metres ×
//             (1 + waste) ÷ stock; palings 100 mm + 5 mm gap = 105 mm cover
//             (count, no waste); 0.05 m³ of concrete per post hole
//   concrete  volume = L × W × thickness (100 mm when not given); order =
//             volume × 1.05 rounded UP ONCE to the supplier's 0.1 m³;
//             SE62 mesh 12.5 m² effective per sheet; DPM 50 m² per roll
//   insulation exterior walls only; 8.8 m² per R2.2 wall pack; 5 % waste
//             (batts are cut to fit)
//   skirting  lineal metres × (1 + waste) ÷ stock length, round up
//   generic   area × (1 + waste), needs review
// ─────────────────────────────────────────────────────────────────────────

import { moneyCascade, takeoffJob } from "../build";
import { NZ_PROFILE, PRICE } from "../library";
import { count, decimal, money, type GoldenJob } from "../types";

const hours = (h: number, guess: number, total: string) => ({
  description: "Labour",
  quantity: h,
  unit: "hours",
  modelPrice: guess,
  price: money("85.00", `no rate stated → profile $85/h, not the model's $${guess}`),
  total: money(total, `${h} h × $85`),
});

const days = (d: number, rate: number, total: string) => ({
  description: "Labour",
  quantity: d,
  unit: "days",
  modelPrice: rate,
  price: money(rate.toFixed(2), `"$${rate} a day" stated — the tradie's own rate`),
  total: money(total, `${d} × $${rate}`),
});

export const OUTDOOR_JOBS: GoldenJob[] = [
  // ── Roofing ────────────────────────────────────────────────────────────
  takeoffJob({
    id: "R01-skillion-reroof-12x8-15deg",
    trade: "roofing",
    title: "Skillion re-roof, 12 × 8 m plan, gutter along the 12 m side, 15°",
    said: "Re-roof a skillion roof in long-run coloursteel. Plan is 12 by 8, gutter runs the 12m side, 15 degree pitch. 2 days at $700 a day.",
    structured: "roof plan 12 m × 8 m, single plane falling across the 8 m, eave 12 m, pitch 15°, 0.762 m cover",
    source: { kind: "pipeline" },
    lines: {
      "roof-sheets": {
        qty: count(16, "sheets lie side by side along the 12 m gutter: 12 ÷ 0.762 = 15.75 → 16 sheets, each cut to 8 ÷ cos 15° = 8.28 m"),
        price: PRICE.longRunSheet,
        total: money("2367.20", "16 × $147.95"),
      },
      "roof-fixings": {
        qty: count(656, "roof area 96 ÷ cos 15° = 99.39 m² × 6 × 1.1 = 655.97 → 656"),
        price: PRICE.roofScrew,
        total: money("295.20", "656 × $0.45"),
      },
    },
    profile: NZ_PROFILE,
    labour: [days(2, 700, "1400.00")],
    totals: {
      materials_subtotal: money("2662.40", "2367.20 + 295.20"),
      labour_subtotal: money("1400.00", "2 days × $700"),
      markup_amount: money("532.48", "20 % × 2662.40"),
      subtotal_before_tax: money("4594.88", "2662.40 + 532.48 + 1400.00"),
      tax_amount: money("689.23", "15 % × 4594.88 = 689.232 → 689.23"),
      total: money("5284.11", "4594.88 + 689.23"),
    },
    knownBugs: {
      "qty:roof-sheets":
        "KNOWN BUG: takeoff/calculators/roofing.ts counts sheets across width_m — the SHORTER plan side after extraction's max/min — and adds 10 % to the sheet count: ceil(8 × 1.1 ÷ 0.762) — expected 16 sheets along the 12 m gutter the tradie named, code gives 12 (a quarter of the roof missing)",
      ...moneyCascade(["roof-sheets"], "KNOWN BUG: cascades from 12 roof sheets instead of 16 — $591.80 of iron short"),
    },
  }),

  takeoffJob({
    id: "R02-carport-lean-to-6x4-10deg",
    trade: "roofing",
    title: "Carport lean-to, 6 × 4 m, gutter on the 4 m side, 10°",
    said: "Carport lean-to off the garage in long-run coloursteel, 6 by 4, gutter along the 4m side, 10 degree pitch. 1 day at $650.",
    structured: "roof plan 6 m × 4 m, one plane falling across the 6 m, eave 4 m, pitch 10°",
    source: { kind: "pipeline" },
    lines: {
      "roof-sheets": {
        qty: count(6, "4 m gutter ÷ 0.762 = 5.25 → 6 sheets, each cut to 6 ÷ cos 10° = 6.09 m"),
        price: PRICE.longRunSheet61,
        total: money("651.60", "6 × $108.60"),
      },
      "roof-fixings": {
        qty: count(161, "24 ÷ cos 10° = 24.370 m² × 6 × 1.1 = 160.84 → 161"),
        price: PRICE.roofScrew,
        total: money("72.45", "161 × $0.45"),
      },
    },
    profile: NZ_PROFILE,
    labour: [
      {
        description: "Labour",
        quantity: 1,
        unit: "day",
        modelPrice: 650,
        price: money("650.00", '"1 day at $650" stated'),
        total: money("650.00", "1 × $650"),
      },
    ],
    totals: {
      materials_subtotal: money("724.05", "651.60 + 72.45"),
      labour_subtotal: money("650.00", "1 day"),
      markup_amount: money("144.81", "20 % × 724.05"),
      subtotal_before_tax: money("1518.86", "724.05 + 144.81 + 650.00"),
      tax_amount: money("227.83", "15 % × 1518.86 = 227.829 → 227.83"),
      total: money("1746.69", "1518.86 + 227.83"),
    },
  }),

  takeoffJob({
    id: "R03-pergola-lean-to-6x4-5deg-screw-count",
    trade: "roofing",
    title: "Pergola lean-to, 6 × 4 m at 5° — round up the screws once, from the real area",
    said: "Pergola roof off the house, trapezoidal long-run, 6 by 4, gutter on the 4m side, 5 degree pitch.",
    structured: "roof plan 6 m × 4 m, eave 4 m, pitch 5°",
    source: { kind: "pipeline" },
    lines: {
      "roof-sheets": { qty: count(6, "4 m gutter ÷ 0.762 = 5.25 → 6 sheets") },
      "roof-fixings": { qty: count(160, "24 ÷ cos 5° = 24.0917 m² × 6 × 1.1 = 159.005 screws → round up → 160") },
    },
    knownBugs: {
      "qty:roof-fixings":
        "KNOWN BUG: normalise.roofAreaFromPitch rounds the roof area to 0.01 m² (24.09) BEFORE roofing.ts multiplies and rounds up (24.09 × 6.6 = 158.994 → 159) — expected 160 (24.0917 × 6.6 = 159.005 → 160), code gives 159 (1 screw; the round-then-ceil pattern)",
    },
  }),

  // ── Fencing ────────────────────────────────────────────────────────────
  takeoffJob({
    id: "FE01-paling-fence-20m-1800-high",
    trade: "fencing",
    title: "20 m paling fence, 1.8 high",
    said: "20m of fencing, 1.8 high, palings. 2 days at $580 a day.",
    structured: "fence run 20 m, height 1.8 m, posts 1.8 m crs, 2 rails, 100 mm palings",
    source: { kind: "pipeline" },
    lines: {
      "fence-posts": { qty: count(13, "20 ÷ 1.8 = 11.11 → 12 bays → 13 posts"), price: PRICE.fencePost24, total: money("375.70", "13 × $28.90") },
      "fence-rails": { qty: count(10, "2 rails × 20 m = 40 m × 1.1 = 44 ÷ 4.8 = 9.17 → 10 lengths"), price: PRICE.fenceRail48, total: money("228.00", "10 × $22.80") },
      "fence-palings": { qty: count(191, "20 000 ÷ 105 = 190.48 → 191 palings"), price: PRICE.paling18, total: money("611.20", "191 × $3.20") },
      "fence-post-concrete": { qty: decimal("0.65", "13 posts × 0.05 m³"), unit: "m³", price: PRICE.postMixPerM3, total: money("273.00", "0.65 × $420") },
    },
    profile: NZ_PROFILE,
    labour: [days(2, 580, "1160.00")],
    totals: {
      materials_subtotal: money("1487.90", "375.70 + 228.00 + 611.20 + 273.00"),
      labour_subtotal: money("1160.00", "2 × $580"),
      markup_amount: money("297.58", "20 % × 1487.90"),
      subtotal_before_tax: money("2945.48", "1487.90 + 297.58 + 1160.00"),
      tax_amount: money("441.82", "15 % × 2945.48 = 441.822 → 441.82"),
      total: money("3387.30", "2945.48 + 441.82"),
    },
  }),

  takeoffJob({
    id: "FE02-low-fence-32.5m-1200-high",
    trade: "fencing",
    title: "32.5 m low fence, 1.2 high (decimal run)",
    said: "32.5m of fencing, 1.2 high.",
    structured: "fence run 32.5 m, height 1.2 m",
    source: { kind: "pipeline" },
    lines: {
      "fence-posts": { qty: count(20, "32.5 ÷ 1.8 = 18.06 → 19 bays → 20 posts"), price: PRICE.fencePost18, total: money("490.00", "20 × $24.50") },
      "fence-rails": { qty: count(15, "2 × 32.5 = 65 m × 1.1 = 71.5 ÷ 4.8 = 14.9 → 15"), price: PRICE.fenceRail48, total: money("342.00", "15 × $22.80") },
      "fence-palings": { qty: count(310, "32 500 ÷ 105 = 309.52 → 310"), price: PRICE.paling12, total: money("651.00", "310 × $2.10") },
      "fence-post-concrete": { qty: decimal("1", "20 × 0.05 = 1.00 m³"), price: PRICE.postMixPerM3, total: money("420.00", "1.00 × $420") },
    },
    profile: NZ_PROFILE,
    totals: {
      materials_subtotal: money("1903.00", "490.00 + 342.00 + 651.00 + 420.00"),
      labour_subtotal: money("0.00", "no labour"),
      markup_amount: money("380.60", "20 % × 1903.00"),
      subtotal_before_tax: money("2283.60", "1903.00 + 380.60"),
      tax_amount: money("342.54", "15 % × 2283.60"),
      total: money("2626.14", "2283.60 + 342.54"),
    },
  }),

  takeoffJob({
    id: "FE03-paling-fence-said-naturally",
    trade: "fencing",
    title: "“20 metres of paling fence” — the way a tradie actually says it",
    said: "20 metres of paling fence, 1.8 high. 2 days at $580 a day.",
    structured: "fence run 20 m, height 1.8 m (same job as FE01, natural phrasing)",
    source: { kind: "pipeline" },
    lines: {
      "fence-posts": { qty: count(13, "20 ÷ 1.8 = 11.11 → 12 bays → 13 posts"), price: PRICE.fencePost24, total: money("375.70", "13 × $28.90") },
      "fence-rails": { qty: count(10, "40 m × 1.1 ÷ 4.8 = 9.17 → 10"), price: PRICE.fenceRail48, total: money("228.00", "10 × $22.80") },
      "fence-palings": { qty: count(191, "20 000 ÷ 105 → 191"), price: PRICE.paling18, total: money("611.20", "191 × $3.20") },
      "fence-post-concrete": { qty: decimal("0.65", "13 × 0.05"), price: PRICE.postMixPerM3, total: money("273.00", "0.65 × $420") },
    },
    profile: NZ_PROFILE,
    labour: [days(2, 580, "1160.00")],
    totals: {
      materials_subtotal: money("1487.90", "as FE01"),
      labour_subtotal: money("1160.00", "2 × $580"),
      markup_amount: money("297.58", "20 % × 1487.90"),
      subtotal_before_tax: money("2945.48", "1487.90 + 297.58 + 1160.00"),
      tax_amount: money("441.82", "15 % × 2945.48 → 441.82"),
      total: money("3387.30", "2945.48 + 441.82"),
    },
    knownBugs: {
      lines:
        "KNOWN BUG: takeoff/extraction.ts extractPerimeterM only reads '<n> m of fence|fencing|perimeter|running' — 'metres of paling fence' has 'paling' in between, so the fence scope is blocked (safe: a clarification note) — expected the 4 fence lines, code emits none",
      "qty:fence-posts": "KNOWN BUG: fence run not read ('20 metres of paling fence') — expected 13 posts, code gives nothing",
      "qty:fence-rails": "KNOWN BUG: fence run not read — expected 10 rails, code gives nothing",
      "qty:fence-palings": "KNOWN BUG: fence run not read — expected 191 palings, code gives nothing",
      "qty:fence-post-concrete": "KNOWN BUG: fence run not read — expected 0.65 m³, code gives nothing",
      ...moneyCascade(["fence-posts", "fence-rails", "fence-palings", "fence-post-concrete"], "KNOWN BUG: cascades from the unread fence run — only the labour reaches the quote"),
    },
  }),

  takeoffJob({
    id: "FE04-fence-24m-posts-at-2400",
    trade: "fencing",
    title: "24 m fence with posts at 2.4 m centres (as the app itself suggests saying)",
    said: "24m of fencing, 1.8 high, posts at 2.4m centres.",
    structured: "fence run 24 m, posts at 2.4 m centres",
    source: { kind: "pipeline" },
    lines: {
      "fence-posts": { qty: count(11, "24 ÷ 2.4 = 10 bays → 11 posts"), price: PRICE.fencePost24, total: money("317.90", "11 × $28.90") },
      "fence-rails": { qty: count(11, "2 × 24 = 48 m × 1.1 = 52.8 ÷ 4.8 = exactly 11"), price: PRICE.fenceRail48, total: money("250.80", "11 × $22.80") },
      "fence-palings": { qty: count(229, "24 000 ÷ 105 = 228.57 → 229"), price: PRICE.paling18, total: money("732.80", "229 × $3.20") },
      "fence-post-concrete": { qty: decimal("0.55", "11 posts × 0.05 m³"), price: PRICE.postMixPerM3, total: money("231.00", "0.55 × $420") },
    },
    profile: NZ_PROFILE,
    totals: {
      materials_subtotal: money("1532.50", "317.90 + 250.80 + 732.80 + 231.00"),
      labour_subtotal: money("0.00", "no labour"),
      markup_amount: money("306.50", "20 % × 1532.50"),
      subtotal_before_tax: money("1839.00", "1532.50 + 306.50"),
      tax_amount: money("275.85", "15 % × 1839.00"),
      total: money("2114.85", "1839.00 + 275.85"),
    },
    knownBugs: {
      "qty:fence-posts":
        "KNOWN BUG: takeoff/calculators/fencing.ts always uses 1.8 m post centres (DEFAULT_POST_SPACING_M) even though its own assumption note says 'say e.g. \"posts at 2.4m centres\" to change it' — expected 11 posts, code gives 15",
      "qty:fence-post-concrete": "KNOWN BUG: cascades from 15 posts — expected 0.55 m³, code gives 0.75",
      ...moneyCascade(["fence-posts", "fence-post-concrete"], "KNOWN BUG: cascades from the ignored 2.4 m post spacing — 4 posts and 0.2 m³ too many"),
    },
  }),

  // ── Concrete ───────────────────────────────────────────────────────────
  takeoffJob({
    id: "CO01-slab-6x4-100-thick",
    trade: "concrete",
    title: "6 × 4 m slab, 100 thick, with pump hire",
    said: "Pour a concrete slab 6 by 4, 100 thick. 1 day at $720.",
    structured: "slab 6 m × 4 m × 100 mm, 5 % waste",
    source: { kind: "pipeline" },
    lines: {
      "concrete-volume": { qty: decimal("2.6", "6 × 4 × 0.1 = 2.4 m³ × 1.05 = 2.52 → up to 2.6 m³"), unit: "m³", price: PRICE.readyMixPerM3, total: money("767.00", "2.6 × $295") },
      "concrete-mesh": { qty: count(2, "24 m² ÷ 12.5 = 1.92 → 2 sheets"), price: PRICE.meshSE62, total: money("158.00", "2 × $79") },
      "concrete-poly": { qty: count(1, "24 m² ÷ 50 = 0.48 → 1 roll"), price: PRICE.dpmRoll, total: money("135.00", "1 × $135") },
    },
    profile: NZ_PROFILE,
    labour: [
      {
        description: "Labour",
        quantity: 1,
        unit: "day",
        modelPrice: 720,
        price: money("720.00", '"1 day at $720" stated'),
        total: money("720.00", "1 × $720"),
      },
    ],
    extras: [
      { type: "other", description: "Concrete pump hire", quantity: 1, unit: "each", price: "450.00", total: money("450.00", "typed by the tradie: 1 × $450 (other lines take markup)") },
    ],
    totals: {
      materials_subtotal: money("1510.00", "767.00 + 158.00 + 135.00 + pump 450.00 (other lines sit in the materials subtotal)"),
      labour_subtotal: money("720.00", "1 day"),
      markup_amount: money("302.00", "20 % × 1510.00"),
      subtotal_before_tax: money("2532.00", "1510.00 + 302.00 + 720.00"),
      tax_amount: money("379.80", "15 % × 2532.00"),
      total: money("2911.80", "2532.00 + 379.80"),
    },
  }),

  takeoffJob({
    id: "CO02-pad-6.7x3-100-thick-single-roundup",
    trade: "concrete",
    title: "6.7 × 3 m pad, 100 thick — round the order up once, not twice",
    said: "Concrete pad 6.7 x 3, 100 thick.",
    structured: "slab 6.7 m × 3.0 m × 100 mm = 2.01 m³, 5 % waste",
    source: { kind: "pipeline" },
    lines: {
      "concrete-volume": { qty: decimal("2.2", "6.7 × 3 × 0.1 = 2.01 m³ × 1.05 = 2.1105 → up to 2.2 m³ (one round-up to the 0.1 m³ order unit)"), price: PRICE.readyMixPerM3, total: money("649.00", "2.2 × $295") },
      "concrete-mesh": { qty: count(2, "20.1 m² ÷ 12.5 = 1.61 → 2"), price: PRICE.meshSE62, total: money("158.00", "2 × $79") },
      "concrete-poly": { qty: count(1, "20.1 ÷ 50 → 1"), price: PRICE.dpmRoll, total: money("135.00", "1 × $135") },
    },
    profile: NZ_PROFILE,
    totals: {
      materials_subtotal: money("942.00", "649.00 + 158.00 + 135.00"),
      labour_subtotal: money("0.00", "no labour"),
      markup_amount: money("188.40", "20 % × 942.00"),
      subtotal_before_tax: money("1130.40", "942.00 + 188.40"),
      tax_amount: money("169.56", "15 % × 1130.40"),
      total: money("1299.96", "1130.40 + 169.56"),
    },
    knownBugs: {
      "qty:concrete-volume":
        "KNOWN BUG: takeoff/calculators/concrete.ts rounds up twice — normalise.concreteVolumeM3 pads 2.01 → 2.1 m³, then waste is added and rounded again (2.1 × 1.05 = 2.205 → 2.3) — expected 2.2 m³ (2.01 × 1.05 = 2.1105 → 2.2), code gives 2.3",
      ...moneyCascade(["concrete-volume"], "KNOWN BUG: cascades from the double round-up — 0.1 m³ ($29.50) over-ordered"),
    },
  }),

  takeoffJob({
    id: "CO03-footings-3.5-cubes",
    trade: "concrete",
    title: "3.5 cubic metres for footings (volume given)",
    said: "3.5 cubic metres of concrete for footings. 6 hours.",
    structured: "volume 3.5 m³, 5 % waste, no slab area",
    source: { kind: "pipeline" },
    lines: {
      "concrete-volume": { qty: decimal("3.7", "3.5 × 1.05 = 3.675 → up to 3.7 m³ (no mesh/DPM: no slab area)"), price: PRICE.readyMixPerM3, total: money("1091.50", "3.7 × $295") },
    },
    profile: NZ_PROFILE,
    labour: [hours(6, 80, "510.00")],
    totals: {
      materials_subtotal: money("1091.50", "3.7 × $295"),
      labour_subtotal: money("510.00", "6 h × $85"),
      markup_amount: money("218.30", "20 % × 1091.50"),
      subtotal_before_tax: money("1819.80", "1091.50 + 218.30 + 510.00"),
      tax_amount: money("272.97", "15 % × 1819.80"),
      total: money("2092.77", "1819.80 + 272.97"),
    },
  }),

  takeoffJob({
    id: "CO04-workshop-slab-8x3.5-150-thick",
    trade: "concrete",
    title: "Workshop slab 8 × 3.5 m, 150 thick (thickness must be read)",
    said: "Workshop slab 8 by 3.5, 150 thick.",
    structured: "slab 8 m × 3.5 m × 150 mm, 5 % waste",
    source: { kind: "pipeline" },
    lines: {
      "concrete-volume": { qty: decimal("4.5", "8 × 3.5 × 0.15 = 4.2 m³ × 1.05 = 4.41 → up to 4.5 m³"), price: PRICE.readyMixPerM3, total: money("1327.50", "4.5 × $295") },
      "concrete-mesh": { qty: count(3, "28 m² ÷ 12.5 = 2.24 → 3"), price: PRICE.meshSE62, total: money("237.00", "3 × $79") },
      "concrete-poly": { qty: count(1, "28 ÷ 50 → 1"), price: PRICE.dpmRoll, total: money("135.00", "1 × $135") },
    },
    profile: NZ_PROFILE,
    totals: {
      materials_subtotal: money("1699.50", "1327.50 + 237.00 + 135.00"),
      labour_subtotal: money("0.00", "no labour"),
      markup_amount: money("339.90", "20 % × 1699.50"),
      subtotal_before_tax: money("2039.40", "1699.50 + 339.90"),
      tax_amount: money("305.91", "15 % × 2039.40"),
      total: money("2345.31", "2039.40 + 305.91"),
    },
    knownBugs: {
      "qty:concrete-volume":
        "KNOWN BUG: the stated thickness is never read — takeoff/extraction.ts has no 'thick' pattern, so the concrete calculator assumes 100 mm — expected 4.5 m³ (150 mm), code gives 3.0 m³ (a third of the pour missing)",
      ...moneyCascade(["concrete-volume"], "KNOWN BUG: cascades from the ignored 150 mm thickness — 1.5 m³ ($442.50) short"),
    },
  }),

  // ── Insulation ─────────────────────────────────────────────────────────
  takeoffJob({
    id: "I01-exterior-walls-42m2-r22",
    trade: "insulation",
    title: "Insulate 42 m² of exterior wall with R2.2 batts",
    said: "Insulate the exterior walls, 42 square metres, R2.2 wall batts. 3 hours.",
    structured: "exterior walls (stated), area 42 m², 8.8 m² packs, 5 % waste",
    source: { kind: "pipeline" },
    lines: {
      "insulation-batts": { qty: count(6, "42 × 1.05 = 44.1 m² ÷ 8.8 = 5.01 → 6 packs"), price: PRICE.battsR22Pack, total: money("348.00", "6 × $58") },
    },
    profile: NZ_PROFILE,
    labour: [hours(3, 75, "255.00")],
    totals: {
      materials_subtotal: money("348.00", "6 × $58"),
      labour_subtotal: money("255.00", "3 h × $85"),
      markup_amount: money("69.60", "20 % × 348.00"),
      subtotal_before_tax: money("672.60", "348.00 + 69.60 + 255.00"),
      tax_amount: money("100.89", "15 % × 672.60"),
      total: money("773.49", "672.60 + 100.89"),
    },
  }),

  // ── Fixings ────────────────────────────────────────────────────────────
  takeoffJob({
    id: "FX01-skirting-18.6m-in-5.4-lengths",
    trade: "fixing",
    title: "Replace lounge skirting, 18.6 m perimeter, 5.4 m lengths",
    said: "Replace the skirting around the lounge, 18.6m perimeter, 5.4m lengths. Three and a half hours.",
    structured: "skirting run 18.6 m, stock 5.4 m, 10 % waste",
    source: { kind: "pipeline" },
    lines: {
      "fixing-skirting": { qty: count(4, "18.6 × 1.1 = 20.46 m ÷ 5.4 = 3.79 → 4 lengths"), price: PRICE.skirting54, total: money("107.80", "4 × $26.95") },
    },
    profile: NZ_PROFILE,
    labour: [hours(3.5, 70, "297.50")],
    totals: {
      materials_subtotal: money("107.80", "4 × $26.95"),
      labour_subtotal: money("297.50", "3.5 h × $85"),
      markup_amount: money("21.56", "20 % × 107.80"),
      subtotal_before_tax: money("426.86", "107.80 + 21.56 + 297.50"),
      tax_amount: money("64.03", "15 % × 426.86 = 64.029 → 64.03"),
      total: money("490.89", "426.86 + 64.03"),
    },
  }),

  // ── Generic ────────────────────────────────────────────────────────────
  takeoffJob({
    id: "G01-pavers-45m2",
    trade: "generic",
    title: "Supply and lay 45 m² of pavers (generic scope)",
    said: "Supply and lay 45 square metres of pavers. 3 days at $560 a day.",
    structured: "generic area 45 m², 10 % waste",
    source: { kind: "pipeline" },
    lines: {
      "generic-quantity": { qty: decimal("49.5", "45 × 1.1 = 49.5 m²"), unit: "m²", price: PRICE.paverPerM2, total: money("3069.00", "49.5 × $62") },
    },
    profile: NZ_PROFILE,
    labour: [days(3, 560, "1680.00")],
    totals: {
      materials_subtotal: money("3069.00", "49.5 × $62"),
      labour_subtotal: money("1680.00", "3 × $560"),
      markup_amount: money("613.80", "20 % × 3069.00"),
      subtotal_before_tax: money("5362.80", "3069.00 + 613.80 + 1680.00"),
      tax_amount: money("804.42", "15 % × 5362.80"),
      total: money("6167.22", "5362.80 + 804.42"),
    },
  }),
];
