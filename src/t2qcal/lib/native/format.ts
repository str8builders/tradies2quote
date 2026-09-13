/**
 * Exact port of the native app's `Fmt` enum and arithmetic guards
 * (ios/T2QCAL/T2QCAL/Models/Catalog.swift). Every web calculator that
 * claims parity with the native app formats through these, so the strings
 * in `fixtures/native-reference.json` compare byte for byte.
 */

const MAX_DIGITS = 12;

const formatters: Intl.NumberFormat[] = Array.from({ length: MAX_DIGITS + 1 }, (_, digits) =>
  new Intl.NumberFormat("en-NZ", {
    style: "decimal",
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
    // NSNumberFormatter .halfUp rounds half away from zero.
    roundingMode: "halfExpand",
  } as Intl.NumberFormatOptions),
);

export function num(value: number, digits = 2): string {
  const places = Math.min(Math.max(digits, 0), MAX_DIGITS);
  let safe = Number.isFinite(value) ? value : 0;
  // Keeps a value that rounds away from printing as "-0".
  if (Math.round(safe * 10 ** places) === 0) safe = 0;
  return formatters[places].format(safe);
}

/** Preserve small orders and enough digits to reconcile the line's cents. */
export function quantity(value: number, unitPrice = 0): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const cents = Math.round(value * unitPrice * 100);
  for (let digits = 6; digits <= MAX_DIGITS; digits += 1) {
    const scale = 10 ** digits;
    const rounded = Math.round(value * scale) / scale;
    if (Number.isFinite(rounded) && rounded !== 0 && Math.round(rounded * unitPrice * 100) === cents) {
      return num(rounded, digits);
    }
  }
  return String(value);
}

const amountFormatter = new Intl.NumberFormat("en-NZ", {
  style: "decimal",
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  roundingMode: "halfExpand",
} as Intl.NumberFormatOptions);

/** An amount on a quote: both cents, always, and no currency sign. */
export function amount(value: number): string {
  let safe = Number.isFinite(value) ? value : 0;
  if (Math.round(safe * 100) === 0) safe = 0;
  return amountFormatter.format(safe);
}

export const lengthUnit = (metric: boolean) => (metric ? "mm" : "in");
export const areaUnit = (metric: boolean) => (metric ? "m²" : "ft²");
export const volumeUnit = (metric: boolean) => (metric ? "m³" : "ft³");

export const len = (value: number, metric: boolean, digits = 2) => `${num(value, digits)} ${lengthUnit(metric)}`;
/** Square millimetres to m², or square inches to ft². */
export const areaValue = (squared: number, metric: boolean) => squared / (metric ? 1e6 : 144);
export const area = (squared: number, metric: boolean, digits = 3) => `${num(areaValue(squared, metric), digits)} ${areaUnit(metric)}`;
/** Cubic millimetres to m³, or cubic inches to ft³. */
export const volValue = (cubic: number, metric: boolean) => cubic / (metric ? 1e9 : 1728);
export const vol = (cubic: number, metric: boolean, digits = 4) => `${num(volValue(cubic, metric), digits)} ${volumeUnit(metric)}`;
export const deg = (value: number, digits = 2) => `${num(value, digits)}°`;
/** Calculator-result money: trimmed like the native reference build. */
export const money = (value: number) => `$${num(value, 2)}`;

// Arithmetic guards — identical semantics to the Swift helpers.

export function pos(value: number, floor = 1e-9): number {
  return Number.isFinite(value) ? Math.max(floor, value) : floor;
}
export const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Swift `Double.rounded()` — schoolbook rounding, half away from zero. */
export function swiftRound(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Rounds, then clamps before crossing into an integer. */
export function roundedInt(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(Math.max(swiftRound(value), low), high);
}

/** Swift `Double.ulp` for finite doubles. */
export function ulp(value: number): number {
  const abs = Math.abs(value);
  if (abs === 0) return Number.MIN_VALUE;
  const exponent = Math.floor(Math.log2(abs));
  // Guard against log2 rounding on exact powers of two.
  const adjusted = 2 ** exponent > abs ? exponent - 1 : exponent;
  return 2 ** (adjusted - 52);
}

/** Remove only binary floating-point noise from exact whole-number boundaries. */
function integerBoundary(value: number): number {
  const nearest = swiftRound(value);
  return Math.abs(value - nearest) <= ulp(value) * 8 ? nearest : value;
}

export function ceilInt(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(Math.max(Math.ceil(integerBoundary(value)), low), high);
}

export function floorInt(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(Math.max(Math.floor(integerBoundary(value)), low), high);
}

export const n = (values: Record<string, number>, key: string): number => values[key] ?? 0;

/** The values a tool receives: `values[key]` in the display unit, never NaN. */
export type Values = Record<string, number>;
