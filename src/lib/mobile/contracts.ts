import { MAX_MARKUP_PCT, MAX_TAX_RATE } from "@/lib/quote-defaults";
import type { QuoteData } from "@/lib/quote-types";

export class MobileError extends Error {
  constructor(public status: number, message: string, public code = "request_failed") { super(message); }
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MobileError(400, "Expected an object.");
  return value as Record<string, unknown>;
}

export function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new MobileError(400, "Invalid record identifier.");
  return value.toLowerCase();
}

export function text(value: unknown, maximum = 20000, required = false): string {
  if (value == null && !required) return "";
  if (typeof value !== "string" || value.length > maximum || (required && !value.trim())) throw new MobileError(400, "Enter valid text within the allowed length.");
  return value.trim();
}

export function quoteData(value: unknown): QuoteData {
  const input = record(value);
  if (!Array.isArray(input.line_items) || input.line_items.length > 400) throw new MobileError(400, "A quote supports up to 400 lines.");
  text(input.job_summary, 20000); text(input.currency, 3, true);
  if (input.client !== undefined) {
    const client = record(input.client);
    for (const key of ["name", "email", "phone", "address"]) text(client[key], 2000);
  }
  text(input.terms, 30000); text(input.tax_label, 40);
  if (input.notes !== undefined && (!Array.isArray(input.notes) || input.notes.length > 200 || input.notes.some(note => typeof note !== "string" || note.length > 4000))) throw new MobileError(400, "Invalid quote notes.");
  if (!/^[A-Z]{3}$/.test(String(input.currency))) throw new MobileError(400, "Invalid currency.");
  for (const raw of input.line_items) {
    const line = record(raw);
    text(line.description, 2000, true); text(line.unit, 40, true);
    if (!["material", "labour", "other"].includes(String(line.type))) throw new MobileError(400, "Invalid line type.");
    for (const name of ["quantity", "unit_price"]) {
      if (typeof line[name] !== "number" || !Number.isFinite(line[name]) || line[name] < 0 || line[name] > 1e6) throw new MobileError(400, "Quantities and prices must be valid non-negative numbers.");
    }
  }
  for (const name of ["markup_pct", "tax_rate"]) if (typeof input[name] !== "number" || !Number.isFinite(input[name]) || input[name] < 0 || input[name] > (name === "markup_pct" ? MAX_MARKUP_PCT : MAX_TAX_RATE)) throw new MobileError(400, "Invalid markup or tax rate.");
  return input as unknown as QuoteData;
}

export function pageOffset(value: string | null): number {
  if (value === null) return 0;
  if (!/^\d+$/.test(value) || Number(value) > 1000000) throw new MobileError(400, "Invalid page.");
  return Number(value);
}

export function formData(input: Record<string, unknown>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") form.set(key, String(value));
  }
  return form;
}
