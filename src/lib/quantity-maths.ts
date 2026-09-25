// ─────────────────────────────────────────────────────────────────────────
// Quantity maths — the ONE rounding module every takeoff calculator uses.
//
// materialCalculator.ts, takeoff/normalise.ts (and every calculator under
// takeoff/calculators), takeoff/geometry.ts and takeoff/foundationCalculator.ts
// used to carry their own copies of these two helpers, and the copies used
// plain `Math.round(n * 100) / 100` — which rounds a half-cent DOWN whenever
// the double sits a hair below it (2.01 × 0.5 = 1.00499999999999989… → 1.00).
//
//   round2    — areas, lineal metres, volumes shown to 2 dp. It IS the money
//               `round2` from quote-defaults (exact half-up, float noise
//               stripped), so a quantity and a price round by the same rule.
//   safeCeil  — whole-unit round-ups (sheets, lengths, packs). Rounds to 6 dp
//               first so IEEE-754 noise (22.0000000004) can't add a unit,
//               while any real fraction still does.
// ─────────────────────────────────────────────────────────────────────────

import { round2 as exactHalfUp2 } from "./quote-defaults";

/** Round to 2 dp, exact half-up (1.005 → 1.01). Non-finite → 0. */
export function round2(n: number): number {
  return exactHalfUp2(n);
}

/**
 * Math.ceil with a 6-decimal-place precision guard. Plain Math.ceil on a
 * floating-point result can push a value like 22.0000000004 (mathematically
 * 22) over the integer boundary to 23: a 3.2 m wall needs 9.6 m of plate =
 * exactly 2 × 4.8 m lengths, and 19 GIB sheets need 19 × 40 × 1.1 = 836
 * screws, not 3 lengths / 837. Non-finite → 0.
 */
export function safeCeil(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(Math.round(n * 1e6) / 1e6);
}
