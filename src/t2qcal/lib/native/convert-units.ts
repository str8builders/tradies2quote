import type { CalculatorField, FieldKind } from "../verified-calculators";
import type { DiagramKind } from "@/t2qcal/components/calculators/technicalDrawing";
import meta from "./meta.json";
import { swiftRound } from "./format";

/**
 * Unit tables, significant-figure text and the two small numeric structs
 * behind the ported ToolsConvert.swift calculators
 * (ios/T2QCAL/T2QCAL/Models/UnitConversion.swift).
 */

type MetaSheet = { label: string; kind: string };
type MetaField = {
  key: string; label: string; default: number; kind: string; min?: number; max?: number;
  options?: { id: number; label: string }[];
  visibleWhen?: { key: string; allowed: number[] };
};
type MetaEntry = {
  name: string; summary: string; diagram: string; showsAssembly: boolean;
  sheets: MetaSheet[]; fields: MetaField[];
};

const catalogue = meta as unknown as Record<string, MetaEntry>;

/** Title, note, diagram, measured sheets and fields, straight from the catalogue. */
export function metaBase(slug: string): {
  title: string; note: string; diagram: DiagramKind;
  sheets: { label: string; diagram: DiagramKind }[];
  showsAssembly: boolean; fields: CalculatorField[];
} {
  const entry = catalogue[slug];
  return {
    title: entry.name,
    note: entry.summary,
    diagram: entry.diagram as DiagramKind,
    sheets: entry.sheets
      .filter((sheet) => !sheet.kind.endsWith("3d"))
      .map((sheet) => ({ label: sheet.label, diagram: sheet.kind as DiagramKind })),
    showsAssembly: entry.showsAssembly,
    fields: entry.fields.map((field) => ({
      key: field.key,
      label: field.label,
      default: field.default,
      kind: field.kind as FieldKind,
      min: field.min,
      max: field.max,
      ...(field.options ? { options: field.options } : {}),
      ...(field.visibleWhen ? { visibleWhen: field.visibleWhen } : {}),
    })),
  };
}

// MARK: Significant-figure text

/**
 * Swift `String(format: "%.*g", 12, value)` as Foundation renders it:
 * C `%g` selection between fixed and exponential styles, trailing zeros
 * trimmed, and an upper-case exponent of at least two digits.
 */
export function sigText(value: number, digits = 12): string {
  const precision = Math.max(1, digits);
  if (!Number.isFinite(value)) return Number.isNaN(value) ? "nan" : value > 0 ? "inf" : "-inf";
  if (value === 0) return "0";
  const negative = value < 0;
  const magnitude = Math.abs(value);
  const scientific = magnitude.toExponential(precision - 1);
  const parsed = /^(\d)(?:\.(\d*))?e([+-]\d+)$/.exec(scientific);
  if (!parsed) return String(value);
  const significand = parsed[1] + (parsed[2] ?? "");
  const exponent = Number.parseInt(parsed[3], 10);
  let body: string;
  if (exponent < -4 || exponent >= precision) {
    const fraction = significand.slice(1).replace(/0+$/, "");
    const sign = exponent < 0 ? "-" : "+";
    body = `${significand[0]}${fraction ? `.${fraction}` : ""}E${sign}${String(Math.abs(exponent)).padStart(2, "0")}`;
  } else {
    const whole = exponent >= 0 ? significand.slice(0, exponent + 1) : "0";
    const rest = exponent >= 0 ? significand.slice(exponent + 1) : "0".repeat(-exponent - 1) + significand;
    const fraction = rest.replace(/0+$/, "");
    body = fraction ? `${whole}.${fraction}` : whole;
  }
  return negative ? `-${body}` : body;
}

// MARK: Unit tables

export type ConversionUnit = { label: string; symbol: string; base: number };

/** Stable unit IDs are persisted in saved calculator inputs. Append; do not reorder. */
const lengthUnits: ConversionUnit[] = [
  { label: "Millimetres", symbol: "mm", base: 1 },
  { label: "Inches", symbol: "in", base: 25.4 },
  { label: "Centimetres", symbol: "cm", base: 10 },
  { label: "Metres", symbol: "m", base: 1000 },
  { label: "Feet", symbol: "ft", base: 304.8 },
  { label: "Yards", symbol: "yd", base: 914.4 },
  { label: "Kilometres", symbol: "km", base: 1_000_000 },
  { label: "Miles", symbol: "mi", base: 1_609_344 },
];

const areaUnits: ConversionUnit[] = [
  { label: "Square metres", symbol: "m²", base: 1 },
  { label: "Square feet", symbol: "ft²", base: 0.09290304 },
  { label: "Square millimetres", symbol: "mm²", base: 0.000001 },
  { label: "Square centimetres", symbol: "cm²", base: 0.0001 },
  { label: "Square inches", symbol: "in²", base: 0.00064516 },
  { label: "Square yards", symbol: "yd²", base: 0.83612736 },
  { label: "Hectares", symbol: "ha", base: 10_000 },
  { label: "Acres (international)", symbol: "ac", base: 4046.8564224 },
  { label: "Square kilometres", symbol: "km²", base: 1_000_000 },
];

const volumeUnits: ConversionUnit[] = [
  { label: "Cubic metres", symbol: "m³", base: 1 },
  { label: "Cubic feet", symbol: "ft³", base: 0.028316846592 },
  { label: "Litres", symbol: "L", base: 0.001 },
  { label: "Millilitres / cm³", symbol: "mL", base: 0.000001 },
  { label: "Cubic millimetres", symbol: "mm³", base: 0.000000001 },
  { label: "Cubic inches", symbol: "in³", base: 0.000016387064 },
  { label: "Cubic yards", symbol: "yd³", base: 0.764554857984 },
  { label: "US liquid gallons", symbol: "US gal", base: 0.003785411784 },
  { label: "Imperial gallons", symbol: "Imp gal", base: 0.00454609 },
];

const weightUnits: ConversionUnit[] = [
  { label: "Kilograms", symbol: "kg", base: 1 },
  { label: "Pounds", symbol: "lb", base: 0.45359237 },
  { label: "Grams", symbol: "g", base: 0.001 },
  { label: "Tonnes", symbol: "t", base: 1000 },
  { label: "Ounces", symbol: "oz", base: 0.028349523125 },
  { label: "US short tons", symbol: "US ton", base: 907.18474 },
  { label: "Imperial long tons", symbol: "UK ton", base: 1016.0469088 },
];

export function conversionUnits(kind: number): ConversionUnit[] {
  switch (kind) {
    case 2: return areaUnits;
    case 3: return volumeUnits;
    case 4: return weightUnits;
    default: return lengthUnits;
  }
}

export const converted = (value: number, from: ConversionUnit, to: ConversionUnit) => value * (from.base / to.base);

// MARK: FractionApproximation

export type Fraction = { numerator: number; denominator: number; decimal: number; mixed: string };

/** Exhaustive at most 256 candidates: closest rational with denominator ≤ limit. */
export function fractionApproximation(value: number, maximumDenominator: number): Fraction | null {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) return null;
  if (!(maximumDenominator >= 2 && maximumDenominator <= 256)) return null;
  let bestN = swiftRound(value);
  let bestD = 1;
  let error = Math.abs(value - bestN);
  for (let d = 2; d <= maximumDenominator; d += 1) {
    const candidate = swiftRound(value * d);
    const candidateError = Math.abs(value - candidate / d);
    if (candidateError < error) {
      bestN = candidate;
      bestD = d;
      error = candidateError;
    }
  }
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = Math.max(1, gcd(bestN, bestD));
  const numerator = bestN / divisor;
  const denominator = bestD / divisor;
  const whole = Math.trunc(numerator / denominator);
  const remainder = numerator % denominator;
  const mixed = remainder === 0 ? String(whole) : whole === 0 ? `${remainder}/${denominator}` : `${whole} ${remainder}/${denominator}`;
  return { numerator, denominator, decimal: numerator / denominator, mixed };
}

// MARK: ImageScaleGeometry

export type ImageScale = { known: number; referencePixels: number; targetPixels: number; unitsPerPixel: number; targetLength: number };

export function imageScaleGeometry(known: number, referencePixels: number, targetPixels: number): ImageScale | null {
  if (!Number.isFinite(known) || !Number.isFinite(referencePixels) || !Number.isFinite(targetPixels)) return null;
  if (!(known > 0 && referencePixels > 0 && targetPixels >= 0)) return null;
  const unitsPerPixel = known / referencePixels;
  const targetLength = targetPixels * unitsPerPixel;
  if (!Number.isFinite(targetLength)) return null;
  return { known, referencePixels, targetPixels, unitsPerPixel, targetLength };
}
