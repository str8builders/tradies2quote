// ─────────────────────────────────────────────────────────────────────────
// The golden tradie's own price library (ex-GST, NZ, 2026). These are the
// numbers a tradie types onto calculator lines in Review Quote — the golden
// jobs price every takeoff line from here. Fixed on purpose: a price change
// here is a fixture change, never a code change.
// ─────────────────────────────────────────────────────────────────────────

export const PRICE = {
  // Framing timber — 90×45 H1.2 SG8
  stud24: "12.40", // precut stud 2.4 m, each
  stud27: "13.95", // stud 2.7 m, each
  stud30: "15.50", // stud 3.0 m, each
  length48: "26.90", // 4.8 m length (plates, nogs)
  length54: "30.26", // 5.4 m length (plates, nogs)
  framingNailsBox: "69.00", // 90×3.15 gun nails, box

  // Lining
  gib10: "31.50", // GIB Standard 10 mm 2400×1200, sheet
  gibScrew: "0.035", // GIB grabber screw, each ($35 per 1000)
  gibAdhesive: "12.90", // tube
  battsR22Pack: "58.00", // R2.2 wall batts, pack (8.8 m²)
  skirting48: "22.40", // 4.8 m length
  architrave48: "18.60", // 4.8 m length
  skirting54: "26.95", // 5.4 m length

  // Deck / subfloor
  deckJoist48: "62.00", // H3.2 SG8 joist, 4.8 m length
  deckJoist54: "69.75", // 5.4 m length
  deckJoist60: "77.50", // 6.0 m length
  deckBearer48: "118.00", // H4 bearer, 4.8 m length
  deckBearer54: "132.75", // 5.4 m length
  deckBearer60: "147.50", // 6.0 m length
  kwila14019PerM: "17.95", // kwila 140×19 decking, per lineal metre
  pine9019PerM: "4.95", // H3.2 90×19 decking, per lineal metre
  vitex14032PerM: "14.40", // vitex 140×32 decking, per lineal metre
  joistHanger: "3.85", // each
  concretePile: "34.50", // each
  deckScrewPack: "89.00", // stainless decking screws, pack of 500
  hangerNailsBox: "24.90", // box
  subfloorJoist48: "58.40", // H1.2 SG8 floor joist, 4.8 m length
  ply17Sheet: "98.50", // 17 mm structural ply T&G 2400×1200
  subfloorScrew: "0.12", // each

  // Cladding
  weatherboard48: "48.60", // 180×18 bevel-back, 4.8 m length
  cavityBatten48: "9.80", // 20×45 H3.1, 4.8 m length
  wrapRoll: "189.00", // building wrap roll
  flashingPerM: "14.50", // aluminium flashing, per metre
  claddingNail: "0.06", // galv cladding nail, each

  // Roofing
  longRunSheet: "147.95", // 0.40 corrugate cut to 8.3 m, per sheet
  longRunSheet61: "108.60", // 0.40 corrugate cut to 6.1 m, per sheet
  roofScrew: "0.45", // each

  // Fencing
  fencePost24: "28.90", // 125×125 H4 2.4 m post
  fencePost18: "24.50", // 125×125 H4 1.8 m post (low fence)
  fenceRail48: "22.80", // 100×50 H3.2 rail, 4.8 m length
  paling18: "3.20", // 1.8 m paling
  paling12: "2.10", // 1.2 m paling
  postMixPerM3: "420.00", // bagged post-hole concrete, per m³

  // Concrete
  readyMixPerM3: "295.00",
  meshSE62: "79.00", // sheet
  dpmRoll: "135.00", // roll

  // Generic
  paverPerM2: "62.00",
} as const;

/** The golden tradie's profile (profiles row). */
export const NZ_PROFILE = { hourlyRate: 85, markupPct: 20, taxRate: 15 } as const;
