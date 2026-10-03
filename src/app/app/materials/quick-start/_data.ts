/**
 * Curated NZ starter materials, one list per trade (Builder, Plumber,
 * Electrician). The builder list is Wave 41 Stage 4's original twelve.
 *
 * The 12 items below are the materials a typical NZ tradie touches
 * on most jobs across decks, fences, framing, GIB lining, concrete
 * and roofing. They were picked specifically so a tradie can fill
 * in five or six prices in 60 seconds and immediately have most
 * future AI-generated quotes resolve against their library instead
 * of asking Claude for an estimate.
 *
 * Suggested prices are deliberately omitted — we don't want to
 * anchor the tradie to a possibly-stale national average. They
 * skip the rows they don't use; the rows they DO fill in become
 * the source of truth for every subsequent quote.
 *
 * `category` mirrors the values used by the rest of the materials
 * module so the items list in the table groups them sensibly after
 * the bulk insert.
 */

export interface StarterMaterial {
  slug: string;
  name: string;
  unit: string;
  category: string;
  trade_hint: string;
}

const BUILDER: StarterMaterial[] = [
  {
    slug: "framing-90x45-h12-48",
    name: "Framing 90x45 H1.2 4.8m",
    unit: "each",
    category: "Timber",
    trade_hint: "Framing studs and plates",
  },
  {
    slug: "joist-140x45-h32-54",
    name: "Joist 140x45 H3.2 5.4m",
    unit: "each",
    category: "Timber",
    trade_hint: "Deck and subfloor joists",
  },
  {
    slug: "decking-140x19-h32-54",
    name: "Decking 140x19 H3.2 5.4m",
    unit: "each",
    category: "Timber",
    trade_hint: "Deck boards",
  },
  {
    slug: "post-100x100-h5-24",
    name: "Post 100x100 H5 2.4m",
    unit: "each",
    category: "Timber",
    trade_hint: "Deck posts and fence posts",
  },
  {
    slug: "gib-standard-10mm",
    name: "GIB Standard 10mm 1200x2400",
    unit: "sheet",
    category: "Plasterboard",
    trade_hint: "Wall lining",
  },
  {
    slug: "gib-standard-13mm",
    name: "GIB Standard 13mm 1200x2400",
    unit: "sheet",
    category: "Plasterboard",
    trade_hint: "Ceiling lining (anti-sag)",
  },
  {
    slug: "gib-aqualine-10mm",
    name: "GIB Aqualine 10mm 1200x2400",
    unit: "sheet",
    category: "Plasterboard",
    trade_hint: "Wet area lining (bathrooms, laundries)",
  },
  {
    slug: "pink-batts-r32-wall",
    name: "Pink Batts R3.2 wall insulation",
    unit: "pack",
    category: "Insulation",
    trade_hint: "Wall insulation per pack",
  },
  {
    slug: "stainless-decking-screws-box",
    name: "Stainless decking screws 75mm (box 500)",
    unit: "box",
    category: "Fixings",
    trade_hint: "Deck fixings",
  },
  {
    slug: "joist-hanger-90x45",
    name: "Joist hanger 90x45",
    unit: "each",
    category: "Fixings",
    trade_hint: "Ledger fixings",
  },
  {
    slug: "concrete-mix-20kg",
    name: "Concrete mix 20kg",
    unit: "bag",
    category: "Concrete",
    trade_hint: "Post footings",
  },
  {
    slug: "reo-mesh-se62-sheet",
    name: "Reinforcing mesh SE62 (3.0m x 1.5m sheet)",
    unit: "sheet",
    category: "Concrete",
    trade_hint: "Slab reinforcing",
  },
  {
    slug: "coloursteel-04mm-24m",
    name: "Coloursteel 0.4mm corrugate 2.4m sheet",
    unit: "sheet",
    category: "Roofing",
    trade_hint: "Long-run iron roofing",
  },
];

/**
 * Everyday plumbing supplies. Materials only: every non-labour quote line
 * takes the materials markup (computeQuoteTotals), so a call-out fee or an
 * all-in "supplied and installed" price saved here would be marked up and
 * could get labour added on top. Those need a no-markup line type first.
 */
const PLUMBER: StarterMaterial[] = [
  { slug: "pex-pipe-16mm-m", name: "PEX pipe 16mm", unit: "m", category: "Plumbing", trade_hint: "Hot and cold water supply" },
  { slug: "pex-pipe-20mm-m", name: "PEX pipe 20mm", unit: "m", category: "Plumbing", trade_hint: "Mains and larger runs" },
  { slug: "copper-pipe-15mm-m", name: "Copper pipe 15mm", unit: "m", category: "Plumbing", trade_hint: "Exposed and cylinder runs" },
  { slug: "pvc-dwv-pipe-50mm-3m", name: "PVC DWV pipe 50mm 3m length", unit: "length", category: "Drainage", trade_hint: "Waste pipe" },
  { slug: "pvc-dwv-pipe-100mm-6m", name: "PVC DWV pipe 100mm 6m length", unit: "length", category: "Drainage", trade_hint: "Soil and stormwater" },
  { slug: "mixer-tap-kitchen", name: "Kitchen sink mixer tap", unit: "each", category: "Tapware", trade_hint: "Kitchen tap swaps" },
  { slug: "mixer-tap-basin", name: "Basin mixer tap", unit: "each", category: "Tapware", trade_hint: "Bathroom tap swaps" },
  { slug: "toilet-suite", name: "Toilet suite with cistern", unit: "each", category: "Sanitaryware", trade_hint: "Toilet replacements" },
  { slug: "isolation-valve-15mm", name: "Isolation valve 15mm", unit: "each", category: "Valves", trade_hint: "Isolating fixtures" },
  { slug: "tempering-valve-15mm", name: "Tempering valve 15mm", unit: "each", category: "Valves", trade_hint: "Hot water to bathrooms" },
  { slug: "hot-water-cylinder-180l", name: "Electric hot water cylinder 180L", unit: "each", category: "Hot water", trade_hint: "Cylinder replacements" },
  { slug: "flexible-tap-connector-300mm", name: "Braided flexible tap connector 300mm", unit: "each", category: "Fittings", trade_hint: "Tap and toilet connections" },
];

/** Everyday electrical supplies. Materials only, as for the plumber list. */
const ELECTRICIAN: StarterMaterial[] = [
  { slug: "tps-cable-2-5mm-m", name: "TPS cable 2.5mm twin and earth", unit: "m", category: "Cable", trade_hint: "Power circuits" },
  { slug: "tps-cable-1-5mm-m", name: "TPS cable 1.5mm twin and earth", unit: "m", category: "Cable", trade_hint: "Lighting circuits" },
  { slug: "double-power-point", name: "Double power point", unit: "each", category: "Fittings", trade_hint: "General power outlets" },
  { slug: "double-power-point-usb", name: "Double power point with USB", unit: "each", category: "Fittings", trade_hint: "Kitchen and bedside outlets" },
  { slug: "light-switch-1-gang", name: "Light switch 1 gang", unit: "each", category: "Fittings", trade_hint: "Lighting control" },
  { slug: "led-downlight", name: "LED downlight", unit: "each", category: "Lighting", trade_hint: "Ceiling lights" },
  { slug: "rcd-40a-30ma", name: "RCD 2 pole 40A 30mA", unit: "each", category: "Switchboard", trade_hint: "Circuit protection" },
  { slug: "mcb-20a", name: "MCB circuit breaker 20A", unit: "each", category: "Switchboard", trade_hint: "Power circuit breakers" },
  { slug: "smoke-alarm-10yr", name: "Smoke alarm photoelectric 10 year battery", unit: "each", category: "Safety", trade_hint: "Smoke alarm installs" },
  { slug: "bathroom-extractor-fan", name: "Bathroom extractor fan", unit: "each", category: "Ventilation", trade_hint: "Bathroom ventilation" },
  { slug: "conduit-20mm-4m", name: "Conduit 20mm 4m length", unit: "length", category: "Cable management", trade_hint: "Exposed and outdoor runs" },
  { slug: "junction-box", name: "Junction box", unit: "each", category: "Fittings", trade_hint: "Cable joins" },
];

export type StarterTrade = "builder" | "plumber" | "electrician";

export const STARTER_TRADES: ReadonlyArray<{ id: StarterTrade; label: string; items: readonly StarterMaterial[] }> = [
  { id: "builder", label: "Builder", items: BUILDER },
  { id: "plumber", label: "Plumber", items: PLUMBER },
  { id: "electrician", label: "Electrician", items: ELECTRICIAN },
];

/** Every starter item across the trades (the save action reads prices for any of them). */
export const ALL_STARTER_MATERIALS: readonly StarterMaterial[] = STARTER_TRADES.flatMap((t) => t.items);

/** The builder list, under its original name. */
export const STARTER_MATERIALS: StarterMaterial[] = BUILDER;

/** A trade from a URL (?trade=plumber); anything unknown is the builder list. */
export function starterTradeFrom(raw: string | string[] | null | undefined): StarterTrade {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const found = STARTER_TRADES.find((t) => t.id === value?.toLowerCase().trim());
  return found ? found.id : "builder";
}
