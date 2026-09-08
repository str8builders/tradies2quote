import {balancedSpacing} from "./balanced-spacing";
export function calculateRafter(run: number, angleDegrees: number, overhang: number, depth: number, seat: number, wallHeight: number) {
  const radians = angleDegrees * Math.PI / 180;
  const rise = run * Math.tan(radians);
  const mainLength = run / Math.cos(radians);
  const tail = overhang / Math.cos(radians);
  return {
    radians,
    rise,
    mainLength,
    tail,
    totalLength: mainLength + tail,
    plumbCut: depth / Math.cos(radians),
    birdPlumb: seat * Math.tan(radians),
    pitch12: Math.tan(radians) * 12,
    ridgeElevation: wallHeight + rise,
  };
}

/** A cleared or zero "preferred riser" field must not explode the riser count. */
const MAX_RISERS = 60;

export function calculateStairs(totalRise: number, preferredRise: number, treadRun: number, floorThickness: number, headroom = 0) {
  const raw = Math.round(totalRise / Math.max(preferredRise, 1e-9));
  const risers = Number.isFinite(raw) ? Math.min(MAX_RISERS, Math.max(2, raw)) : 2;
  const actualRise = totalRise / risers;
  const treads = risers - 1;
  const totalRun = treads * treadRun;
  const angle = Math.atan2(actualRise, treadRun) * 180 / Math.PI;
  const bridge = Math.hypot(actualRise, treadRun);
  const stringer = treads * bridge;
  const stockGuide = risers * bridge;
  const openingRun = actualRise > 0 ? (headroom + floorThickness) * treadRun / actualRise : 0;
  return { risers, actualRise, treads, totalRun, angle, stringer, stockGuide, openingRun };
}

/** Cleared inputs collapse the divisor, so counts are capped before any array is built. */
const MAX_MEMBERS = 500;

export function calculateEqualSpacing(span: number, memberWidth: number, targetGap: number) {
  const layout=balancedSpacing(span,memberWidth,targetGap,false,MAX_MEMBERS);
  const count=layout?.count??0,gap=layout?.gap??0;
  const center = memberWidth + gap;
  const marks = Array.from({ length: count }, (_, index) => gap + memberWidth / 2 + index * center);
  return { count, gap, center, marks };
}

export function calculateConcrete(length: number, width: number, thickness: number, wastePercent: number, metric: boolean) {
  const area = metric ? length * width / 1e6 : length * width / 144;
  const rawVolume = metric ? area * thickness / 1000 : area * thickness / 12;
  const orderVolume = rawVolume * (1 + wastePercent / 100);
  const weight = metric ? rawVolume * 2400 : rawVolume * 0.028316846592 * 2400 / 0.45359237;
  return { area, rawVolume, orderVolume, weight };
}

export function calculateTileFit(floorWidth: number, tileWidth: number, jointWidth: number) {
  const rawCount = Math.ceil((floorWidth + jointWidth) / Math.max(tileWidth + jointWidth, 1e-9));
  let count = Number.isFinite(rawCount) ? Math.min(MAX_MEMBERS, Math.max(1, rawCount)) : 1;
  let edge = count === 1 ? floorWidth : (floorWidth - (count - 2) * tileWidth - (count - 1) * jointWidth) / 2;
  if (count > 1 && edge > tileWidth * .75) {
    count += 1;
    edge = (floorWidth - (count - 2) * tileWidth - (count - 1) * jointWidth) / 2;
  }
  edge = Math.max(0, edge);
  // One mark per tile edge, which is one fewer than the tiles: the row is
  // [cut][tile]…[tile][cut], so the last line to snap is the one the closing
  // cut butts against. Running to `count` printed a mark past the far wall —
  // 3,909 mm on a 3,600 mm floor. The Swift engine is corrected to match.
  const marks = Array.from({ length: Math.max(0, count - 1) }, (_, index) => edge + index * (tileWidth + jointWidth));
  return { count, edge, marks };
}

export function calculateCircle(diameter: number, segments: number) {
  const safeSegments = Math.max(3, Math.round(segments));
  const radius = diameter / 2;
  const circumference = Math.PI * diameter;
  const angle = 360 / safeSegments;
  const chord = 2 * radius * Math.sin(Math.PI / safeSegments);
  const sagitta = radius - Math.sqrt(Math.max(0, radius * radius - chord * chord / 4));
  return { radius, circumference, angle, chord, sagitta, halfMiter: 180 / safeSegments };
}

export function convertLength(value: number, sourceMetres: number, targetMetres: number) {
  return value * sourceMetres / targetMetres;
}

export function calculatePitch(rise: number, run: number) {
  const safeRun = Math.max(run, 1e-9);
  return {
    angle: Math.atan2(rise, safeRun) * 180 / Math.PI,
    percent: rise / safeRun * 100,
    pitch12: rise / safeRun * 12,
    slopeLength: Math.hypot(rise, run),
  };
}
