import type { CalculatorField, FieldKind, VerifiedUnit } from "./verified-calculators";

/**
 * Display-unit factor for a field kind, matching the native
 * `Field.displayValue(fromCanonical:unit:)`: catalogue values are metric
 * canonical; imperial display divides lengths by 25.4, areas by 0.09290304,
 * and scales the three rate kinds to their imperial selling unit.
 */
export function displayFactor(kind: FieldKind | undefined, unit: VerifiedUnit): number {
  if (unit !== "imperial") return 1;
  switch (kind) {
    case "length": return 1 / 25.4;
    case "area": return 1 / 0.09290304;
    case "volumeRate": return 0.764554857984;
    case "linearRate": return 0.3048;
    case "cubicFootRate": return 0.028316846592;
    default: return 1;
  }
}

export function fieldBounds(field: CalculatorField, unit: VerifiedUnit) {
  const factor = displayFactor(field.kind, unit);
  return { min: field.min === undefined ? undefined : field.min * factor,
    max: (field.max ?? (field.kind === "length" ? 1_000_000 : 1_000_000_000)) * factor };
}

export function initialCalculatorValues(fields: CalculatorField[], unit: VerifiedUnit) {
  return Object.fromEntries(fields.map(field => {
    const value = field.default * displayFactor(field.kind, unit);
    return [field.key, field.kind === "count" ? Math.round(value) : value];
  }));
}

/** Whether a field is shown for the current values (native `Field.when`). */
export function fieldVisible(field: CalculatorField, values: Record<string, number>): boolean {
  if (!field.visibleWhen) return true;
  const value = values[field.visibleWhen.key] ?? 0;
  return Number.isFinite(value) && field.visibleWhen.allowed.includes(Math.round(value));
}

export function calculatorInputErrors(fields: CalculatorField[], values: Record<string, number>, unit: VerifiedUnit): string[] {
  return fields.flatMap(field => {
    const value = values[field.key];
    const { min, max } = fieldBounds(field, unit);
    if (!Number.isFinite(value)) return [`Enter a finite number for ${field.label.toLowerCase()}.`];
    if ((min !== undefined && value < min) || value > max) return [`${field.label} is outside the allowed range (${min ?? "−∞"} to ${max}).`];
    if (field.kind === "count" && !Number.isInteger(value)) return [`${field.label} must be a whole number.`];
    if (field.options && !field.options.some(o => o.id === value)) return [`Choose one of the listed options for ${field.label.toLowerCase()}.`];
    return [];
  });
}
