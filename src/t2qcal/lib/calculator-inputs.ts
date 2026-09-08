import type { CalculatorField, VerifiedUnit } from "./verified-calculators";

export function fieldBounds(field: CalculatorField, unit: VerifiedUnit) {
  const factor = field.kind === "length" && unit === "imperial" ? 1 / 25.4 : 1;
  return { min: field.min === undefined ? undefined : field.min * factor,
    max: (field.max ?? (field.kind === "length" ? 1_000_000 : 1_000_000_000)) * factor };
}

export function initialCalculatorValues(fields: CalculatorField[], unit: VerifiedUnit) {
  return Object.fromEntries(fields.map(field => [field.key,
    field.default / (field.kind === "length" && unit === "imperial" ? 25.4 : 1)]));
}

export function calculatorInputErrors(fields: CalculatorField[], values: Record<string, number>, unit: VerifiedUnit): string[] {
  return fields.flatMap(field => {
    const value = values[field.key];
    const { min, max } = fieldBounds(field, unit);
    if (!Number.isFinite(value)) return [`Enter a finite number for ${field.label.toLowerCase()}.`];
    if ((min !== undefined && value < min) || value > max) return [`${field.label} is outside the allowed range (${min ?? "−∞"} to ${max}).`];
    if (field.kind === "count" && !Number.isInteger(value)) return [`${field.label} must be a whole number.`];
    return [];
  });
}
