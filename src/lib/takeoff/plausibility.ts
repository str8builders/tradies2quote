// ─────────────────────────────────────────────────────────────────────────
// THE plausibility rule for metre dimensions that drive a calculator.
//
// Every path that hands a length / width / height to a takeoff calculator
// checks it against the SAME bands, from this one module:
//   - the calculators themselves (materialCalculator deck / cladding /
//     subfloor, as defence in depth),
//   - the legacy voice/scan parser and its gate (aiTakeoffParser:
//     canRunCalculator, the cladding run check, the [T2Q_PLAN] marker),
//   - the orchestrator (takeoff/validate.ts and the extraction marker),
//   - the drawing dimension-confirmation recompute.
//
//   footprint   a deck or floor side (length / width)            1 – 30 m
//               (the residential footprint envelope every plan reader
//               already used — a 54 m deck side is a misread)
//   edge        one straight run — a single wall               0.1 – 100 m
//   wallRun     a whole wall run added together: every wall on
//               a floor plan, or a building's cladding run (its
//               whole exterior wall run — a 101 m re-clad is an
//               ordinary house)                               0.1 – 1000 m
//   wallHeight  a wall / stud height                          1.8 – 6 m
//
// A value inside its band is taken EXACTLY as stated. A value outside it is
// NEVER rescaled: nothing divides a metres value by 1000 because it "looks
// like millimetres" (that rule — "over 50 m means mm" — turned a real 62 m
// cladding run into 0.062 m and quoted one weatherboard). The caller refuses
// to calculate and shows the tradie the plain reason written here, e.g.
// "Cladding wall length 4800 m is more than 1000 m — check it. If you meant
// 4800 mm, that's 4.8 m."
//
// Text with NO unit written is read before any of this (bareLengthToMetres):
// NZ plans and tradies drop the "mm", so a bare 100 or more is millimetres
// ("2400 high", "4800 x 3820"), and a bare number under 100 is metres, as
// stated ("62 of weatherboard" is 62 m).
// ─────────────────────────────────────────────────────────────────────────

export type MetresKind = "footprint" | "edge" | "wallRun" | "wallHeight";

export const METRES_BANDS: Readonly<Record<MetresKind, { min: number; max: number }>> = {
  footprint: { min: 1, max: 30 },
  edge: { min: 0.1, max: 100 },
  wallRun: { min: 0.1, max: 1000 },
  wallHeight: { min: 1.8, max: 6 },
};

/** A bare (unit-less) length of this or more is millimetres. */
export const BARE_MM_FROM = 100;

/** Round to 6 dp so a unit conversion never carries float noise. */
function micro(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * A length written with NO unit, in metres: 100 or more is millimetres (the NZ
 * drawing convention), anything smaller is metres as stated. NaN for a
 * non-positive or non-numeric value.
 */
export function bareLengthToMetres(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return Number.NaN;
  return n >= BARE_MM_FROM ? micro(n / 1000) : n;
}

/** A metres figure as the tradie would read it (up to 3 dp, no trailing zeros). */
export function showMetres(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}
const show = showMetres;

/**
 * When an over-the-band metres value only makes sense as millimetres, the
 * metres it would be (4800 → 4.8) — offered to the tradie as a question,
 * never applied. Null when the mm reading isn't a real size either (a
 * 150 m run as mm is 0.15 m: no hint).
 */
export function millimetreReading(value: number, kind: MetresKind): number | null {
  const { min, max } = METRES_BANDS[kind];
  if (!Number.isFinite(value) || value <= max) return null;
  const asMm = micro(value / 1000);
  return asMm >= Math.max(min, 1) && asMm <= max ? asMm : null;
}

export type MetresCheck =
  | { ok: true; value: number }
  | { ok: false; reason: string };

/**
 * Check one metres value against its band. `label` names the field the way
 * the tradie would say it ("Cladding wall length", "Deck width"). Never
 * converts: an out-of-band value comes back `ok: false` with a plain reason.
 */
export function checkMetres(label: string, value: unknown, kind: MetresKind): MetresCheck {
  if (value === null || value === undefined || value === "") {
    return { ok: false, reason: `${label} is missing.` };
  }
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) {
    return { ok: false, reason: `${label} must be a number of metres above 0.` };
  }
  const { min, max } = METRES_BANDS[kind];
  if (v > max) {
    const asMm = millimetreReading(v, kind);
    const hint = asMm !== null ? ` If you meant ${show(v)} mm, that's ${show(asMm)} m.` : "";
    return {
      ok: false,
      reason: `${label} ${show(v)} m is more than ${show(max)} m — check it.${hint}`,
    };
  }
  if (v < min) {
    return {
      ok: false,
      reason: `${label} ${show(v)} m is less than ${show(min)} m — check it.`,
    };
  }
  return { ok: true, value: v };
}

/** True when `value` is a number of metres inside the band for `kind`. */
export function isPlausibleMetres(value: unknown, kind: MetresKind): boolean {
  return checkMetres("", value, kind).ok;
}
