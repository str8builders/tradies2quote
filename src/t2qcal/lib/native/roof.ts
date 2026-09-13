import type { CalculatorOutput, CalculatorResult, VerifiedDefinition, VerifiedUnit } from "../verified-calculators";
import { area, ceilInt, deg, len, n, num, pos, rad } from "./format";
import { invalid, nativeShell, ord, sanitized } from "./roof-meta";

/**
 * Native-parity ports of ios/T2QCAL/T2QCAL/Models/ToolsRoof.swift.
 * Each entry is keyed by slug and must reproduce the native result rows,
 * marks, diagram values, handoffs and cuts recorded in
 * fixtures/native-reference.json (see native/parity.test.ts).
 */

/**
 * The native reference is Swift on Darwin, whose libm `tan` is not correctly
 * rounded — it returns `sin(x) / cos(x)` for every angle in the catalogue
 * (30°, 41.1°, 22.5°, 70°, …), a value up to one ulp away from the correctly
 * rounded result that V8's `Math.tan` produces. One ulp on the pitch survives
 * multiplication into `roofArea` (≈7e7 mm²), so the reference values are only
 * reproducible by taking the same quotient the native run took.
 */
const tan = (radians: number) => Math.sin(radians) / Math.cos(radians);

/** Line-for-line port of `Models/RoofGeometry.swift`. */
function roofGeometry(
  type: string, length: number, width: number,
  angle: number, angle2: number, overhang: number, spacing: number,
) {
  const lean = type === "lean-to-roof", hip = type === "hip-roof";
  const gambrel = type === "gambrel-roof", saltbox = type === "saltbox-roof";
  const a = (angle * Math.PI) / 180, b = (angle2 * Math.PI) / 180;
  const pitch = tan(a), pitch2 = tan(b);
  const run = lean ? width : saltbox ? (width * pitch2) / (pitch + pitch2) : width / 2;
  const run2 = lean ? 0 : width - run;
  const rise = gambrel ? (run / 2) * (pitch + pitch2) : run * pitch;
  const member = gambrel ? run / 2 / Math.cos(a) + run / 2 / Math.cos(b) : Math.hypot(run, rise);
  const secondMember = saltbox ? Math.hypot(run2, rise) : lean ? 0 : member;
  const tail = overhang / Math.cos(gambrel ? b : a);
  const secondTail = lean ? 0 : overhang / Math.cos(saltbox || gambrel ? b : a);
  const hipLength = Math.sqrt(run * run + run * run + rise * rise);
  const hipTail = Math.sqrt(2 * overhang * overhang + (overhang * pitch) ** 2);
  const ridge = hip ? Math.max(0, length - width) : length;
  const roofArea = (length + 2 * overhang) * (member + secondMember + tail + secondTail);
  const positions = ceilInt(length / pos(spacing) - 1e-10, 1, 100_000) + 1;
  const actualSpacing = length / (positions - 1);
  return {
    run, run2, rise, member, secondMember, tail, secondTail,
    hipLength, hipTail, ridge, area: roofArea, positions, actualSpacing,
    diagramValues: {
      run, run2, rise, member, secondMember, tail, secondTail,
      hipLength, hipTail, ridge, roofArea, count: positions, actualSpacing,
    } as Record<string, number>,
  };
}

/** Hip, gable, lean-to, gambrel and saltbox share one Swift factory. */
function framedRoof(slug: string): VerifiedDefinition {
  const hip = slug === "hip-roof";
  const lean = slug === "lean-to-roof";
  const gambrel = slug === "gambrel-roof";
  const saltbox = slug === "saltbox-roof";
  return {
    ...nativeShell(slug),
    compute(input: Record<string, number>, unit: VerifiedUnit): CalculatorOutput {
      const v = sanitized(slug, input, unit);
      const metric = unit === "metric";
      const length = n(v, "length"), width = n(v, "width");
      const angle = n(v, "angle"), overhang = n(v, "overhang"), spacing = n(v, "spacing");
      if (hip && width > length) {
        return invalid("Wall length must be the longer side for a hip roof. Swap length and width.");
      }
      const g = roofGeometry(slug, length, width, angle, v.angle2 ?? angle, overhang, spacing);
      const marks = Array.from({ length: Math.min(g.positions, 1000) }, (_, i) =>
        `${ord(i + 1)} · ${len(i * g.actualSpacing, metric)}`);
      const results: CalculatorResult[] = [
        { label: hip ? "Common rafter" : "Rafter length", value: len(g.member, metric), primary: true },
        { label: "Roof rise", value: len(g.rise, metric) },
        { label: "Tail length", value: len(g.tail, metric) },
        { label: hip ? "Hip rafter" : "Ridge length", value: len(hip ? g.hipLength : g.ridge, metric) },
        { label: "Rafter positions", value: String(g.positions) },
        { label: "Roof surface", value: area(g.area, metric) },
        { label: "Pitch", value: `${num(tan(rad(angle)) * 12, 3)} : 12` },
        { label: "Stock length", value: len(g.member + g.tail, metric) },
        { label: "Actual rafter centres", value: len(g.actualSpacing, metric) },
      ];
      if (saltbox) {
        results.push(
          { label: "Second rafter", value: len(g.secondMember, metric) },
          { label: "Second stock length", value: len(g.secondMember + g.secondTail, metric) },
          { label: "Main run", value: len(g.run, metric) },
          { label: "Second run", value: len(g.run2, metric) },
        );
      }
      if (g.positions > 1000) {
        results.push({ label: "Set-out preview", value: "First 1,000 positions; reduce the run for a complete list" });
      }
      const diagramValues = {
        ...g.diagramValues,
        oneSide: lean ? 1 : 0,
        roofType: hip ? 1 : lean ? 2 : gambrel ? 3 : saltbox ? 4 : 0,
      };
      return { results, marks, diagramValues };
    },
  };
}

const commonRafter: VerifiedDefinition = {
  ...nativeShell("common-rafter"),
  compute(input, unit) {
    const v = sanitized("common-rafter", input, unit);
    const metric = unit === "metric";
    const run = n(v, "run"), overhang = n(v, "overhang"), depth = n(v, "depth");
    const seat = n(v, "seat"), wallHeight = n(v, "wallHeight"), degrees = n(v, "angle");
    const theta = rad(degrees);
    const cosine = pos(Math.cos(theta), 1e-6);
    const rise = run * tan(theta);
    const toRidge = run / cosine;
    const tail = overhang / cosine;
    const total = toRidge + tail;
    const pitch12 = tan(theta) * 12;
    return {
      results: [
        { label: "Rafter length to ridge", value: len(toRidge, metric), primary: true },
        { label: "Overall stock length", value: len(total, metric) },
        { label: "Roof rise", value: len(rise, metric) },
        { label: "Plumb cut length", value: len(depth / cosine, metric) },
        { label: "Birdsmouth plumb", value: len(seat * tan(theta), metric) },
        { label: "Ridge elevation", value: len(wallHeight + rise, metric) },
        { label: "Pitch ratio", value: `${num(pitch12, 2)} : 12` },
        { label: "Tail length", value: len(tail, metric) },
      ],
      diagramValues: {
        run, rise, angle: degrees,
        width: run * 2, length: run * 2, span: run * 2,
        height: rise, thickness: depth, gap: overhang,
        model: 1,
      },
    };
  },
};

const rafterTemplates: VerifiedDefinition = {
  ...nativeShell("rafter-templates"),
  compute(input, unit) {
    const v = sanitized("rafter-templates", input, unit);
    const metric = unit === "metric";
    const run = n(v, "run"), angle = n(v, "angle"), depth = n(v, "depth"), seat = n(v, "seat");
    const rise = run * tan(rad(angle));
    const rafter = run / Math.cos(rad(angle));
    const plumb = depth / Math.cos(rad(angle));
    const bird = seat * tan(rad(angle));
    return {
      results: [
        { label: "Rafter line", value: len(rafter, metric), primary: true },
        { label: "Plumb-cut face", value: len(plumb, metric) },
        { label: "Seat width", value: len(seat, metric) },
        { label: "Birdsmouth plumb", value: len(bird, metric) },
        { label: "Saw angle from square", value: deg(90 - angle, 2) },
      ],
      diagramValues: { rise, overhang: 0, roofType: 0 },
    };
  },
};

const soffitDrop: VerifiedDefinition = {
  ...nativeShell("soffit-drop"),
  compute(input, unit) {
    const v = sanitized("soffit-drop", input, unit);
    const metric = unit === "metric";
    const run = n(v, "run"), angle = n(v, "angle"), fascia = n(v, "fascia");
    const rise = run * tan(rad(angle));
    const slope = run / Math.cos(rad(angle));
    return {
      results: [
        { label: "Soffit width", value: len(run, metric), primary: true },
        { label: "Roof-line drop", value: len(rise, metric) },
        { label: "Sloping overhang", value: len(slope, metric) },
        { label: "Fascia plumb depth", value: len(fascia / Math.cos(rad(angle)), metric) },
        { label: "Pitch", value: `${num(tan(rad(angle)) * 12, 3)} : 12` },
      ],
      diagramValues: { rise, model: 2 },
    };
  },
};

const hipValleySheet: VerifiedDefinition = {
  ...nativeShell("hip-valley-sheet"),
  compute(input, unit) {
    const v = sanitized("hip-valley-sheet", input, unit);
    const metric = unit === "metric";
    const length = n(v, "length"), width = n(v, "width");
    const sheetWidth = n(v, "sheetWidth"), angle = n(v, "angle");
    const slopeWidth = width / Math.cos(rad(angle));
    const sheets = ceilInt(length / pos(sheetWidth), 0, 100_000);
    const diagonal = Math.sqrt(sheetWidth * sheetWidth + slopeWidth * slopeWidth);
    return {
      results: [
        { label: "Sheet count", value: String(sheets), primary: true },
        { label: "Slope sheet length", value: len(slopeWidth, metric) },
        { label: "Hip/valley cut edge", value: len(diagonal, metric) },
        { label: "Last sheet cover", value: len(length - (sheets - 1) * sheetWidth, metric) },
        { label: "Roof-plane area", value: area(length * slopeWidth, metric) },
      ],
      diagramValues: {
        run: width, rise: width * tan(rad(angle)), columns: sheets,
        model: 5,
      },
    };
  },
};

const bullnoseRoof: VerifiedDefinition = {
  ...nativeShell("bullnose-roof"),
  compute(input, unit) {
    const v = sanitized("bullnose-roof", input, unit);
    const metric = unit === "metric";
    const radius = n(v, "radius"), angle = n(v, "angle");
    const straight = n(v, "straight"), width = n(v, "width");
    const arc = radius * rad(angle);
    const drop = radius * (1 - Math.cos(rad(angle)));
    const projection = radius * Math.sin(rad(angle));
    const sheet = straight + arc;
    return {
      results: [
        { label: "Developed sheet length", value: len(sheet, metric), primary: true },
        { label: "Curved arc length", value: len(arc, metric) },
        { label: "Curve projection", value: len(projection, metric) },
        { label: "Curve drop", value: len(drop, metric) },
        { label: "Roof surface", value: area(sheet * width, metric) },
      ],
      diagramValues: { run: projection, rise: drop, model: 3 },
    };
  },
};

export const definitions: Record<string, VerifiedDefinition> = {
  "common-rafter": commonRafter,
  "hip-roof": framedRoof("hip-roof"),
  "gable-roof": framedRoof("gable-roof"),
  "lean-to-roof": framedRoof("lean-to-roof"),
  "gambrel-roof": framedRoof("gambrel-roof"),
  "saltbox-roof": framedRoof("saltbox-roof"),
  "rafter-templates": rafterTemplates,
  "soffit-drop": soffitDrop,
  "hip-valley-sheet": hipValleySheet,
  "bullnose-roof": bullnoseRoof,
};
