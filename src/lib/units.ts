import { round2 } from "./quote-defaults";

/**
 * Selling-unit normalisation + compatibility for PRICES.
 *
 * A price is per a unit. Applying a library/catalogue price to a line in a
 * different unit is only valid when the two units measure the same thing
 * and a fixed conversion exists (m ↔ mm, L ↔ mL, kg ↔ g). A price per
 * sheet can never be applied to m², nor a per-pack price to m² of batts —
 * those need a coverage the unit alone doesn't carry, so they are
 * INCOMPATIBLE and the line stays price-pending for the tradie.
 *
 * Pure; safe on server and client.
 */

type UnitInfo = {
  /** What the unit measures. Package units are each their own dimension. */
  dimension: string;
  /** How many base units (m, m², m³, kg, each, hour, day) one of this unit is. */
  factor: number;
};

const UNIT_TABLE: Array<[string[], UnitInfo]> = [
  [["each", "ea", "no", "nos", "number", "pc", "pcs", "piece", "pieces", "item", "items", "unit", "units", "qty"], { dimension: "count", factor: 1 }],
  [["m", "metre", "metres", "meter", "meters", "mtr", "mtrs", "lm", "l/m", "lin m", "lineal m", "linear m", "lineal metre", "lineal metres", "linear metre", "linear metres", "lineal meter", "lineal meters", "linear meter", "linear meters", "per m", "m run"], { dimension: "length", factor: 1 }],
  [["mm", "millimetre", "millimetres", "millimeter", "millimeters"], { dimension: "length", factor: 0.001 }],
  [["cm", "centimetre", "centimetres", "centimeter", "centimeters"], { dimension: "length", factor: 0.01 }],
  [["ft", "foot", "feet", "lf", "lin ft", "linear ft", "linear foot", "linear feet", "lineal ft", "lineal foot", "lineal feet"], { dimension: "length", factor: 0.3048 }],
  [["in", "inch", "inches"], { dimension: "length", factor: 0.0254 }],
  [["yd", "yard", "yards"], { dimension: "length", factor: 0.9144 }],
  [["m2", "sqm", "sq m", "sq metre", "sq metres", "sq meter", "sq meters", "square metre", "square metres", "square meter", "square meters", "m sq"], { dimension: "area", factor: 1 }],
  [["ft2", "sqft", "sq ft", "square foot", "square feet"], { dimension: "area", factor: 0.09290304 }],
  [["m3", "cu m", "cubic metre", "cubic metres", "cubic meter", "cubic meters", "cube", "cubes"], { dimension: "volume", factor: 1 }],
  [["l", "litre", "litres", "liter", "liters", "ltr", "ltrs"], { dimension: "volume", factor: 0.001 }],
  [["ml", "millilitre", "millilitres", "milliliter", "milliliters"], { dimension: "volume", factor: 0.000001 }],
  [["yd3", "cu yd", "cubic yard", "cubic yards"], { dimension: "volume", factor: 0.764554857984 }],
  [["ft3", "cu ft", "cubic foot", "cubic feet"], { dimension: "volume", factor: 0.028316846592 }],
  [["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"], { dimension: "mass", factor: 1 }],
  [["g", "gram", "grams"], { dimension: "mass", factor: 0.001 }],
  [["t", "tonne", "tonnes"], { dimension: "mass", factor: 1000 }],
  [["h", "hr", "hrs", "hour", "hours", "hourly", "man hour", "man hours", "manhour", "manhours", "labour hour", "labour hours"], { dimension: "hour", factor: 1 }],
  [["day", "days", "man day", "man days", "day rate"], { dimension: "day", factor: 1 }],
];

/** Package units: comparable only with themselves (a pack of batts ≠ each batt). */
const PACKAGE_UNITS: Array<[string, string[]]> = [
  ["sheet", ["sheet", "sheets", "sht", "shts"]],
  ["pack", ["pack", "packs", "pk", "pks", "pkt", "pkts", "packet", "packets"]],
  ["bag", ["bag", "bags"]],
  ["box", ["box", "boxes", "bx"]],
  ["roll", ["roll", "rolls"]],
  ["bundle", ["bundle", "bundles", "bdl"]],
  ["tin", ["tin", "tins", "can", "cans"]],
  ["tube", ["tube", "tubes", "cartridge", "cartridges"]],
  ["bucket", ["bucket", "buckets", "pail", "pails"]],
  ["drum", ["drum", "drums"]],
  ["carton", ["carton", "cartons", "ctn", "ctns"]],
  ["pallet", ["pallet", "pallets"]],
  ["length", ["length", "lengths", "len", "lgth", "lgths"]],
  ["pair", ["pair", "pairs", "pr"]],
  ["set", ["set", "sets"]],
  ["kit", ["kit", "kits"]],
  ["lot", ["lot", "lots", "lump sum", "ls", "job", "fixed"]],
  ["visit", ["visit", "visits", "call out", "callout", "call-out"]],
];

const LOOKUP = new Map<string, UnitInfo>();
for (const [names, info] of UNIT_TABLE) for (const n of names) LOOKUP.set(n, info);
for (const [dim, names] of PACKAGE_UNITS) {
  for (const n of names) LOOKUP.set(n, { dimension: `package:${dim}`, factor: 1 });
}

function unitKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/^per\s+/, "")
    .replace(/^\/\s*/, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalise a unit string. Returns null for a blank or unrecognised unit —
 * callers must treat null as "cannot compare" (never as compatible).
 */
export function normaliseUnit(raw: string | null | undefined): UnitInfo | null {
  if (typeof raw !== "string") return null;
  const key = unitKey(raw);
  if (!key) return null;
  return LOOKUP.get(key) ?? LOOKUP.get(key.replace(/\s+/g, "")) ?? null;
}

/** A library/catalogue row with no unit is sold "each" (the prompt's convention). */
export function normaliseLibraryUnit(raw: string | null | undefined): UnitInfo | null {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return LOOKUP.get("each") ?? null;
  }
  return normaliseUnit(raw);
}

export function isHourUnit(raw: string | null | undefined): boolean {
  return normaliseUnit(raw)?.dimension === "hour";
}

export function isDayUnit(raw: string | null | undefined): boolean {
  return normaliseUnit(raw)?.dimension === "day";
}

/**
 * Convert a price quoted per `priceUnit` into a price per `lineUnit`.
 *
 * Returns null when the units are incompatible, either is unknown, or the
 * conversion would leave a sub-cent unit price (e.g. $/m → $/mm) that the
 * quote can't carry exactly — the caller then leaves the line unpriced
 * rather than applying a wrong or truncated number. Same-unit prices are
 * returned unchanged.
 */
export function convertUnitPrice(
  price: number,
  priceUnit: string | null | undefined,
  lineUnit: string | null | undefined,
): number | null {
  if (!Number.isFinite(price)) return null;
  const from = normaliseLibraryUnit(priceUnit);
  const to = normaliseUnit(lineUnit);
  if (!from || !to || from.dimension !== to.dimension) return null;
  if (from.factor === to.factor) return price;
  const converted = price * (to.factor / from.factor);
  const cents = round2(converted);
  return Math.abs(cents - converted) < 1e-9 ? cents : null;
}

export function unitsCompatible(
  priceUnit: string | null | undefined,
  lineUnit: string | null | undefined,
): boolean {
  const from = normaliseLibraryUnit(priceUnit);
  const to = normaliseUnit(lineUnit);
  return !!from && !!to && from.dimension === to.dimension;
}
