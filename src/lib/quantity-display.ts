import { formatCurrency } from "./quote-defaults";

/** Display precision only. Never feed this value back into a saved takeoff.
 * Start at six decimal places and retain more when rounding would change the
 * line's cents. Very small quantities must never appear as a zero order.
 */
export function formatQuantity(value: unknown, unitPrice = 0): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const cents = Math.round(n * unitPrice * 100);
  for (let digits = 6; digits <= 12; digits++) {
    const scale = 10 ** digits;
    const rounded = Math.round(n * scale) / scale;
    if (Number.isFinite(rounded) && rounded !== 0 && Math.round(rounded * unitPrice * 100) === cents) {
      return String(rounded);
    }
  }
  return String(n);
}

/** Rates may contain fractions of a cent; only extended totals round to cents. */
export function formatUnitPrice(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 1e-20) return `${value} ${currency}`;
  return formatCurrency(value, currency, 20);
}
