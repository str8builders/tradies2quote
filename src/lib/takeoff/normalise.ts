// ─────────────────────────────────────────────────────────────────────────
// Normalisation layer — pure deterministic conversions.
//
// All units, stock lengths, coverage widths and spacings go through
// this layer BEFORE any calculator sees them. Centralising it keeps
// the calculators trivially correct: they take metres and millimetres
// and don't have to second-guess what the upstream caller meant.
//
// Nothing here calls an LLM. Every function is pure and unit-testable.
// ─────────────────────────────────────────────────────────────────────────

import { round2, safeCeil } from "../quantity-maths";
import { bareLengthToMetres } from "./plausibility";

/**
 * Convert a length value to metres. A stated unit is always honoured —
 * "4800 m" stays 4800 m and is then refused by the shared plausibility rule
 * (takeoff/plausibility.ts), never quietly read as 4.8 m. With NO unit the
 * shared bare-number convention applies: 100 or more is millimetres
 * (4800 → 4.8 m), anything smaller is metres as stated (62 → 62 m; the old
 * "over 50 means mm" rule made it 0.062 m).
 *
 * Returns NaN for non-finite or non-positive inputs so callers can
 * branch on Number.isFinite + the validator can flag it.
 */
export function toMetres(value: number, unit?: string): number {
  if (!Number.isFinite(value) || value <= 0) return NaN;
  const u = (unit ?? "").toLowerCase().trim();
  if (u === "mm" || u === "millimetre" || u === "millimetres") {
    return value / 1000;
  }
  if (u === "cm") return value / 100;
  if (u === "m" || u === "metre" || u === "metres" || u === "meter" || u === "meters") {
    return value;
  }
  // No / unknown unit → the shared bare-number convention.
  return bareLengthToMetres(value);
}

/** Convert to millimetres with the same unit handling as toMetres. */
export function toMillimetres(value: number, unit?: string): number {
  if (!Number.isFinite(value) || value <= 0) return NaN;
  const m = toMetres(value, unit);
  return m * 1000;
}

/** Square metres from L × W (both inputs already in metres). */
export function areaM2(lengthM: number, widthM: number): number {
  if (!Number.isFinite(lengthM) || !Number.isFinite(widthM)) return NaN;
  if (lengthM <= 0 || widthM <= 0) return 0;
  return round2(lengthM * widthM);
}

// Area rounding (exact half-up) and the noise-guarded round-up live in the
// one shared quantity-maths module; re-exported so the calculators in this
// folder keep importing them from the normalisation layer.
export { round2, safeCeil };

/**
 * Convert a board nominal width + gap to its effective COVERAGE width.
 * The covering width determines how many boards span a given face.
 *
 *   board 90mm + gap 5mm → coverage 95mm
 *   weatherboard 180mm (bevel-back) → ~150mm coverage (30mm lap)
 *
 * The "lap" subtraction is profile-dependent so we let callers pass it
 * in directly. The default behaviour is gap-based (for decking).
 */
export function boardCoverageMm(opts: {
  nominalWidthMm: number;
  gapMm?: number;
  lapMm?: number;
}): number {
  const { nominalWidthMm, gapMm = 0, lapMm = 0 } = opts;
  if (!Number.isFinite(nominalWidthMm) || nominalWidthMm <= 0) return NaN;
  return Math.max(1, nominalWidthMm + gapMm - lapMm);
}

/**
 * How many stock lengths to buy for a given linear-metre requirement.
 *
 *   linearM    — total LM you need across all members
 *   stockM     — length of a single piece of stock (e.g. 4.8m)
 *   wastePct   — waste % to add before dividing
 *
 * Returns the integer number of stock lengths, rounded up.
 */
export function stockLengthsForLM(
  linearM: number,
  stockM: number,
  wastePct: number,
): number {
  if (!Number.isFinite(linearM) || linearM <= 0) return 0;
  if (!Number.isFinite(stockM) || stockM <= 0) return 0;
  const multiplier = 1 + Math.max(0, wastePct) / 100;
  return safeCeil((linearM * multiplier) / stockM);
}

/**
 * How many sheets cover a given area.
 *
 *   areaM2          — total area to cover
 *   sheetWidthM     — sheet width (e.g. 1.2 for GIB)
 *   sheetHeightM    — sheet height (e.g. 2.4 for GIB)
 *   wastePct        — waste % added before dividing
 */
export function sheetsForArea(
  areaM2: number,
  sheetWidthM: number,
  sheetHeightM: number,
  wastePct: number,
): number {
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return 0;
  const sheetArea = sheetWidthM * sheetHeightM;
  if (!Number.isFinite(sheetArea) || sheetArea <= 0) return 0;
  const multiplier = 1 + Math.max(0, wastePct) / 100;
  return safeCeil((areaM2 * multiplier) / sheetArea);
}

/**
 * Member count along a run at a given centre spacing, end-inclusive.
 *
 *   runM         — total run in metres
 *   spacingMm    — member centres in mm
 *
 * Returns ceil(runM*1000/spacingMm) + 1 (the +1 is the closing member).
 */
export function memberCountAlong(runM: number, spacingMm: number): number {
  if (!Number.isFinite(runM) || runM <= 0) return 0;
  if (!Number.isFinite(spacingMm) || spacingMm <= 0) return 0;
  return safeCeil((runM * 1000) / spacingMm) + 1;
}

/** 1 / cos(pitch), with the pitch clamped to 0..70° (anything outside is
 * almost certainly an extraction error — a vertical "roof" is cladding). */
function pitchFactor(pitchDeg: number): number {
  const clamped = Math.min(70, Math.max(0, pitchDeg));
  return 1 / Math.cos((clamped * Math.PI) / 180);
}

/**
 * Roof plan-area → actual roof area for a given pitch.
 *
 *   plan = area_m2; pitch_deg = roof pitch in degrees
 *
 * actualArea = planArea / cos(pitchRad). Used for sheet/tile/screw counts
 * on pitched roofs, so it is EXACT: rounding it to 0.01 m² before a count
 * rounds up turned 24.0917 m² × 6.6 = 159.005 screws into 24.09 × 6.6 =
 * 158.994 → 159 instead of 160. Round it only to show it.
 */
export function roofAreaFromPitch(planAreaM2: number, pitchDeg: number): number {
  if (!Number.isFinite(planAreaM2) || planAreaM2 <= 0) return 0;
  if (!Number.isFinite(pitchDeg)) return planAreaM2;
  return planAreaM2 * pitchFactor(pitchDeg);
}

/**
 * A plan length measured down the slope — a rafter / long-run sheet length:
 * planLength / cos(pitch). Exact; round it only to show it.
 */
export function slopeLengthFromPitch(planLengthM: number, pitchDeg: number): number {
  if (!Number.isFinite(planLengthM) || planLengthM <= 0) return 0;
  if (!Number.isFinite(pitchDeg)) return planLengthM;
  return planLengthM * pitchFactor(pitchDeg);
}

/**
 * Concrete volume from L × W × thickness (mm).
 *
 *   thicknessMm is the FINISHED slab thickness. We pad to a standard
 *   delivery unit (0.1 m³) because most NZ ready-mix suppliers will
 *   not pour fractional cubes.
 */
export function concreteVolumeM3(
  lengthM: number,
  widthM: number,
  thicknessMm: number,
): number {
  if (!Number.isFinite(lengthM) || lengthM <= 0) return 0;
  if (!Number.isFinite(widthM) || widthM <= 0) return 0;
  if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) return 0;
  const raw = lengthM * widthM * (thicknessMm / 1000);
  // Round up to nearest 0.1 m³ — through safeCeil, so float noise
  // (2 × 1.5 × 0.1 = 0.30000000000000004) can't add a tenth.
  return safeCeil(raw * 10) / 10;
}

/**
 * Family classifier for free-text material descriptions. Maps to one
 * of the catalogue's broad buckets so downstream price-match can
 * narrow its search.
 *
 * Deliberately simple — the normalizer in materialNormalizer.ts does
 * the deep extraction; this is just a coarse bucket.
 */
export function materialFamily(name: string): string {
  const s = (name ?? "").toLowerCase();
  if (/\bgib\b|\bplasterboard\b|\baqualine\b|\bfyreline\b/.test(s)) return "lining";
  if (/\bbatts?\b|\binsulation\b|\bpink\s*batts?\b/.test(s)) return "insulation";
  if (/\b(?:weatherboard|cladding|fibre[-\s]?cement|siding)\b/.test(s)) return "cladding";
  if (/\b(?:joist|bearer|stud|plate|nog|rafter|purlin|fram(?:ing|e))\b/.test(s)) return "timber-structural";
  if (/\b(?:skirting|architrave|scotia|trim)\b/.test(s)) return "timber-finishing";
  if (/\b(?:decking\s+boards?|deck\s+board)\b/.test(s)) return "timber-decking";
  if (/\b(?:concrete|pile|footing|slab|reinforcing\s+mesh|reinforcing|mesh\s+(?:sheet|se\d+))\b/.test(s)) return "concrete";
  if (/\b(?:screws?|nails?|fastener|bolt|adhesive|sealant)\b/.test(s)) return "fixing";
  if (/\b(?:roof|tile|colorsteel|coloursteel|long[-\s]?run|ridge|flashing)\b/.test(s)) return "roofing";
  if (/\b(?:paling|fence|picket|post)\b/.test(s)) return "fencing";
  return "generic";
}
