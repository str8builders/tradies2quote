import type { VerifiedDefinition } from "../verified-calculators";
import type { DiagramKind } from "@/t2qcal/components/calculators/technicalDrawing";
import { area, ceilInt, deg, len, n, quantity, ulp } from "./format";
import { invalid, nativeShell, sanitized } from "./drainage-meta";

/**
 * Native-parity ports of ios/T2QCAL/T2QCAL/Models/ToolsDrainage.swift.
 * Each entry is keyed by slug and must reproduce the native result rows,
 * marks, diagram values, handoffs and cuts recorded in
 * fixtures/native-reference.json (see native/parity.test.ts).
 */

/**
 * The web renderer has no `pipefall`/`pipeprofile`/`gutterplan`/`guttersection`
 * sheets yet, so the native kinds map onto the drawings that already exist for
 * these two tools. Everything else comes straight from the catalogue.
 */
const drainageKind = (native: string): DiagramKind => {
  switch (native) {
    case "pipefall":
    case "gutterplan":
      return "nativedrain";
    case "pipeprofile":
    case "guttersection":
      return "nativedrainprofile";
    default:
      return native as DiagramKind;
  }
};

/** Line-for-line port of `DrainageFallGeometry` (Models/DrainageGeometry.swift). */
function drainageFall(run: number, grade: number, startDepth: number, spacing: number) {
  if (![run, grade, startDepth, spacing].every(Number.isFinite)) return null;
  if (Math.min(run, grade, spacing) <= 0 || startDepth < 0) return null;
  const needed = run / spacing;
  if (!Number.isFinite(needed) || needed > 9999 + 8 * ulp(9999)) return null;
  if (!Number.isFinite(startDepth + run / grade) || !Number.isFinite(Math.hypot(run, run / grade))) return null;
  const intervals = ceilInt(needed, 1, 9999);
  const fall = run / grade;
  const position = (index: number) => (index === intervals ? run : index * spacing);
  return {
    run, grade, startDepth, spacing, intervals, fall,
    finishDepth: startDepth + fall,
    pipeLength: Math.hypot(run, fall),
    stationCount: intervals + 1,
    position,
    depth: (index: number) => startDepth + position(index) / grade,
  };
}

/** Line-for-line port of `RoofDrainageGeometry` (Models/DrainageGeometry.swift). */
function roofDrainage(
  eave: number, catchment: number, millimetresPerUnit: number,
  intensity: number, capacity: number,
) {
  const inputs = [eave, catchment, millimetresPerUnit, intensity, capacity];
  if (!inputs.every(Number.isFinite) || Math.min(...inputs) <= 0) return null;
  const areaM2 = ((eave * millimetresPerUnit) / 1000) * ((catchment * millimetresPerUnit) / 1000);
  const flow = (areaM2 * intensity) / 3600;
  const needed = flow / capacity;
  if (!Number.isFinite(areaM2) || !Number.isFinite(flow) || !(flow > 0)) return null;
  if (!Number.isFinite(needed) || needed > 10_000 + 8 * ulp(10_000)) return null;
  const outlets = ceilInt(needed, 1, 10_000);
  const spacing = eave / outlets;
  return {
    eave, catchment, areaM2, intensity, capacity, flow, outlets, spacing,
    outletFlow: flow / outlets,
    position: (index: number) => (index + 0.5) * spacing,
  };
}

const pipeFall: VerifiedDefinition = {
  ...nativeShell("pipe-fall", drainageKind),
  compute(input, unit) {
    const v = sanitized("pipe-fall", input, unit);
    const metric = unit === "metric";
    const g = drainageFall(
      n(v, "run"), n(v, "grade"), n(v, "startInvert"),
      (n(v, "marks") * 1000) / (metric ? 1 : 25.4),
    );
    if (!g) {
      return invalid("Use positive run, grade and peg spacing, with a non-negative start depth. Increase spacing or split runs requiring more than 10,000 stations.");
    }
    return {
      results: [
        { label: "Total fall", value: len(g.fall, metric), primary: true },
        { label: "Finish invert depth below datum", value: len(g.finishDepth, metric) },
        { label: `Fall per ${metric ? "metre" : "foot"}`, value: len((metric ? 1000 : 12) / g.grade, metric) },
        { label: "Grade", value: `1 : ${quantity(g.grade)}` },
        { label: "Percent grade", value: `${quantity(100 / g.grade)}%` },
        { label: "Angle", value: deg((Math.atan(1 / g.grade) * 180) / Math.PI, 4) },
        { label: "Pipe length on the grade", value: len(g.pipeLength, metric) },
        { label: "Set-out stations", value: `${g.stationCount} · includes start and finish` },
        { label: "Datum", value: "Depths increase downwards from one level datum. AR set-out marks horizontal positions only." },
      ],
      marks: Array.from({ length: g.stationCount }, (_, i) =>
        `${len(g.position(i), metric)} · depth ${len(g.depth(i), metric)}`),
      diagramValues: {
        drainageFall: 1, run: g.run, fall: g.fall, grade: g.grade,
        startInvert: g.startDepth, finishInvert: g.finishDepth, pegSpacing: g.spacing,
        // Keys the existing web long-section drawing reads (nativeExtraDrawing).
        nativePipe: 1, finishDepth: g.finishDepth, spacing: g.spacing, intervals: g.intervals,
      },
      handoffs: [{
        key: "pipe-fall.net-pipe-length",
        label: "Pipe length on the grade",
        quantity: g.pipeLength / (metric ? 1000 : 12),
        unit: metric ? "m" : "ft",
        role: "material",
        includeByDefault: false,
        formula: "√(horizontal run² + vertical fall²), where fall = run ÷ grade.",
        assumptions: [
          "Depths are positive below a level datum; finish depth = start depth + fall.",
          "Peg spacing is entered in metres in both display-unit modes; start and finish are included.",
          "Net straight pipe only; diameter, fittings, stock rounding and waste are not included.",
          "Select a grade appropriate to the actual pipe and drainage design.",
        ],
        checks: [
          "All stations are retained up to the explicit 10,000-station limit.",
          "The incomplete material line starts unticked.",
        ],
      }],
    };
  },
};

const spouting: VerifiedDefinition = {
  ...nativeShell("spouting-downpipes", drainageKind),
  compute(input, unit) {
    const v = sanitized("spouting-downpipes", input, unit);
    const metric = unit === "metric";
    const g = roofDrainage(
      n(v, "eave"), n(v, "catchment"), metric ? 1 : 25.4,
      n(v, "intensity"), n(v, "capacity"),
    );
    if (!g) {
      return invalid("Use positive catchment dimensions, rainfall and outlet capacity. Split systems requiring more than 10,000 outlets; counts are never truncated.");
    }
    return {
      results: [
        { label: "Downpipes needed", value: String(g.outlets), primary: true },
        { label: "Horizontal catchment area", value: area(g.eave * g.catchment, metric) },
        { label: "Peak flow", value: `${quantity(g.flow)} L/s` },
        { label: "Tributary width / outlet centres", value: len(g.spacing, metric) },
        { label: "First and last outlet end offsets", value: len(g.spacing / 2, metric) },
        { label: "Flow per outlet", value: `${quantity(g.outletFlow)} L/s` },
        { label: "Capacity remaining per outlet", value: `${quantity(Math.max(0, g.capacity - g.outletFlow))} L/s` },
        { label: "Net spouting length", value: len(g.eave, metric) },
        { label: "Design basis", value: "Complete runoff from one rectangular horizontal roof catchment, divided equally between outlets. Capacity must cover the gutter, outlet and downpipe arrangement; gutter sizing and overflow design are separate." },
      ],
      marks: Array.from({ length: g.outlets }, (_, i) =>
        `${len(g.position(i), metric)} · outlet ${i + 1} · ${quantity(g.outletFlow)} L/s`),
      diagramValues: {
        roofDrainage: 1, eave: g.eave, catchment: g.catchment,
        intensity: g.intensity, capacity: g.capacity, millimetresPerUnit: metric ? 1 : 25.4,
        downpipes: g.outlets, spacing: g.spacing,
        // Keys the existing web outlet-plan drawing reads (nativeExtraDrawing).
        nativeRoofDrain: 1, outlets: g.outlets, flow: g.flow,
      },
      handoffs: [{
        key: "spouting-downpipes.net-spouting-length",
        label: "Net spouting length",
        quantity: g.eave / (metric ? 1000 : 12),
        unit: metric ? "m" : "ft",
        role: "material",
        includeByDefault: false,
        formula: "Entered eave run converted to merchant metres or feet. Flow (L/s) = plan area (m²) × rainfall (mm/hr) ÷ 3600. Outlets = ceiling(flow ÷ supplied capacity).",
        assumptions: [
          "Complete runoff from a rectangular horizontal catchment with equal tributary widths; outlets sit at each tributary's centre.",
          "Select local design rainfall and verify the entire gutter, outlet and downpipe capacity, falls and overflow provisions.",
          "Corners, outlets, stop ends, stock rounding and waste are not included.",
        ],
        checks: [
          "Outlet count is rounded up without a silent cap; excessive systems are refused.",
          "The incomplete material line starts unticked.",
        ],
      }],
    };
  },
};

export const definitions: Record<string, VerifiedDefinition> = {
  "pipe-fall": pipeFall,
  "spouting-downpipes": spouting,
};
