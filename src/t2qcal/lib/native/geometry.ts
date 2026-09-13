import type { CalculatorField, CalculatorOutput, CalculatorResult, FieldKind, VerifiedDefinition } from "../verified-calculators";
import type { DiagramKind } from "@/t2qcal/components/calculators/technicalDrawing";
import meta from "./meta.json";
import { area, ceilInt, deg, len, n, num, roundedInt, vol, type Values } from "./format";
import { compoundMiter, gothicArch, segmentedMolding } from "./geometry-shapes";

/**
 * Native-parity ports of ios/T2QCAL/T2QCAL/Models/ToolsGeometry.swift.
 * Each entry is keyed by slug and must reproduce the native result rows,
 * marks, diagram values, handoffs and cuts recorded in
 * fixtures/native-reference.json (see native/parity.test.ts).
 */

type MetaField = {
  key: string; label: string; default: number; kind: string; min: number; max: number;
  options?: { id: number; label: string }[];
  visibleWhen?: { key: string; allowed: number[] };
};
type MetaTool = {
  name: string; summary: string; diagram: string; showsAssembly: boolean;
  sheets: { label: string; kind: string }[]; fields: MetaField[];
};
const catalogue = meta as unknown as Record<string, MetaTool>;

/** Title, note, diagram, sheets and fields straight from the native catalogue. */
function base(slug: string): Omit<VerifiedDefinition, "compute"> {
  const tool = catalogue[slug];
  const fields: CalculatorField[] = tool.fields.map((field) => ({
    key: field.key, label: field.label, default: field.default,
    kind: field.kind as FieldKind, min: field.min, max: field.max,
    ...(field.options ? { options: field.options } : {}),
    ...(field.visibleWhen ? { visibleWhen: field.visibleWhen } : {}),
  }));
  return {
    title: tool.name, note: tool.summary, diagram: tool.diagram as DiagramKind,
    sheets: tool.sheets.filter((sheet) => !sheet.kind.endsWith("3d"))
      .map((sheet) => ({ label: sheet.label, diagram: sheet.kind as DiagramKind })),
    showsAssembly: tool.showsAssembly, fields,
  };
}

/** `ToolsLayouts.invalid` — a guarded tool reports on the result grid, never as an error. */
const invalid = (message: string): CalculatorOutput => ({
  results: [{ label: "Check inputs", value: message, primary: true }],
  diagramValues: { invalid: 1 },
});

/** `rightTriangle` — square-up and diagonal bracing share one closure. */
function rightTriangle(slug: string): VerifiedDefinition {
  const square = slug === "square-up";
  return {
    ...base(slug),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const width = n(v, "width"), height = n(v, "height");
      const diagonal = Math.sqrt(width * width + height * height);
      const angle = Math.atan2(height, width) * 180 / Math.PI;
      const results: CalculatorResult[] = [
        { label: square ? "Correct diagonal" : "Brace length", value: len(diagonal, metric), primary: true },
        { label: "Brace angle", value: deg(angle, 4) },
        { label: "Complementary cut", value: deg(90 - angle, 4) },
        { label: "Perimeter", value: len(2 * (width + height), metric) },
        { label: "Area", value: area(width * height, metric) },
      ];
      if (square) results.push({ label: "Diagonal error", value: len(n(v, "measured") - diagonal, metric) });
      return { results, diagramValues: { run: width, rise: height } };
    },
  };
}

export const definitions: Record<string, VerifiedDefinition> = {
  // MARK: Arc & circle
  "arc-circle": {
    ...base("arc-circle"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const diameter = n(v, "diameter");
      const segments = roundedInt(n(v, "segments"), 3, 96);
      const radius = diameter / 2;
      const circumference = Math.PI * diameter;
      const step = 360 / segments;
      const chord = 2 * radius * Math.sin(Math.PI / segments);
      const sagitta = radius - Math.sqrt(Math.max(0, radius * radius - chord * chord / 4));
      return {
        results: [
          { label: "Circumference", value: len(circumference, metric), primary: true },
          { label: "Radius", value: len(radius, metric) },
          { label: "Angle per segment", value: deg(step, 3) },
          { label: "Chord length", value: len(chord, metric) },
          { label: "Segment rise", value: len(sagitta, metric) },
          { label: "Half miter", value: deg(180 / segments, 3) },
        ],
        diagramValues: {
          segments, count: segments, width: diameter, height: diameter,
          model: 0, radialTemplate: 7,
        },
      };
    },
  },

  // MARK: Square-up and diagonal bracing
  "square-up": rightTriangle("square-up"),
  "diagonal-brace": rightTriangle("diagonal-brace"),

  // MARK: Golden ratio
  "golden-ratio": {
    ...base("golden-ratio"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const length = n(v, "length");
      const phi = (1 + Math.sqrt(5)) / 2;
      return {
        results: [
          { label: "Whole", value: len(length * phi, metric), primary: true },
          { label: "Long", value: len(length, metric) },
          { label: "Short", value: len(length / phi, metric) },
          { label: "Golden ratio", value: num(phi, 12) },
        ],
        diagramValues: { width: length, height: length / phi },
      };
    },
  },

  // MARK: Square pyramid
  pyramid: {
    ...base("pyramid"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const width = n(v, "width"), height = n(v, "height");
      const slant = Math.sqrt(height * height + width * width / 4);
      const edge = Math.sqrt(height * height + width * width / 2);
      const lateral = 2 * width * slant;
      const volume = width * width * height / 3;
      return {
        results: [
          { label: "Face slant height", value: len(slant, metric), primary: true },
          { label: "Apex-to-corner edge", value: len(edge, metric) },
          { label: "Lateral surface", value: area(lateral, metric) },
          { label: "Base area", value: area(width * width, metric) },
          { label: "Volume", value: vol(volume, metric) },
          { label: "Face angle", value: deg(Math.atan2(height, width / 2) * 180 / Math.PI, 3) },
        ],
        diagramValues: { run: width / 2, rise: height },
      };
    },
  },

  // MARK: Gothic pointed arch
  "gothic-arch": {
    ...base("gothic-arch"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const span = n(v, "span"), rise = n(v, "rise");
      if (!(rise >= span / 2)) {
        return invalid("A pointed arch needs a rise at least half its span. Use Arc template for a lower circular arch.");
      }
      const g = gothicArch(span, rise);
      return {
        results: [
          { label: "Arc radius", value: len(g.radius, metric), primary: true },
          { label: "Centre offset from midspan", value: len(g.offset, metric) },
          { label: "Apex height", value: len(rise, metric) },
          { label: "Half span", value: len(span / 2, metric) },
          { label: "Spring-to-apex arc angle", value: deg(g.sweep * 180 / Math.PI, 3) },
          { label: "Total curved length", value: len(2 * g.radius * g.sweep, metric) },
        ],
        diagramValues: { model: 3 },
      };
    },
  },

  // MARK: Curved molding
  "curved-molding": {
    ...base("curved-molding"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const diameter = n(v, "diameter"), sweep = n(v, "sweep");
      const count = Math.max(2, roundedInt(n(v, "count"), 2, 100));
      const g = segmentedMolding(diameter, sweep, count, n(v, "moldingWidth"), n(v, "moldingDepth"));
      if (!g) {
        return invalid("Each segment must turn less than 180°, and the stock width must leave a positive inside edge. Increase the diameter or segment count, or reduce the stock width.");
      }
      const per = sweep / count;
      const chord = 2 * (diameter / 2) * Math.sin(per * Math.PI / 180 / 2);
      const arc = Math.PI * diameter * sweep / 360;
      return {
        results: [
          { label: "Segment chord", value: len(chord, metric), primary: true },
          { label: "Miter each end", value: deg(per / 2, 4) },
          { label: "Arc per segment", value: len(arc / count, metric) },
          { label: "Total arc length", value: len(arc, metric) },
          { label: "Included turn", value: deg(per, 4) },
          { label: "Outside long edge", value: len(g.longEdge, metric) },
          { label: "Inside short edge", value: len(g.shortEdge, metric) },
          { label: "Net trim volume", value: vol(g.netVolume, metric) },
          { label: "Cutting list", value: `${count} blanks, rounded up to whole millimetres. Set stock lengths and kerf in Cutting list.` },
          { label: "Curve basis", value: "Diameter passes through the centre of each miter joint. Straight pieces approximate the curve." },
        ],
        marks: Array.from({ length: count }, (_, i) =>
          `Piece ${i + 1}: long edge ${len(g.longEdge, metric, 5)} · short edge ${len(g.shortEdge, metric, 5)} · ${deg(per / 2, 4)} both ends`),
        diagramValues: g.diagramValues,
        cuts: [{
          mm: ceilInt(g.longEdge * (metric ? 1 : 25.4), 1, 1_000_000_000),
          count, label: "Segmented molding blank",
        }],
      };
    },
  },

  // MARK: Compound miter
  "compound-miter": {
    ...base("compound-miter"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const planAngle = n(v, "planAngle"), slope = n(v, "slope");
      const g = compoundMiter(planAngle, slope, n(v, "width"), n(v, "thickness"), n(v, "tail"));
      if (!g) {
        return invalid("Use a positive included corner up to 180°, a side angle from 0° to 90°, and positive stock dimensions.");
      }
      const wrapCuts = [...g.cuts, g.cuts[0]];
      return {
        results: [
          { label: "Saw table miter", value: deg(g.miter, 4), primary: true },
          { label: "Blade bevel", value: deg(g.bevel, 4) },
          { label: "Flat corner miter", value: deg((180 - planAngle) / 2, 4) },
          { label: "Side angle from horizontal", value: deg(slope, 4) },
          { label: "Cut length along stock", value: len(g.cutExtent, metric) },
          { label: "Minimum blank per panel", value: len(g.blankLength, metric) },
          { label: "Saw setup", value: "Broad face flat on table · base edge against fence" },
          { label: "Matching pair", value: "Equal side angles · mirror the cut for the other panel" },
          { label: "Scope", value: "Geometric settings before kerf and fit allowance. Confirm saw travel and make a test joint." },
        ],
        marks: g.wrapStations.map((station, i) =>
          `Corner ${i + 1}: around section ${len(station, metric, 5)} · cut from long point ${len(wrapCuts[i] - g.minimumCut, metric, 5)}`),
        diagramValues: g.diagramValues,
        cuts: [{
          mm: ceilInt(g.blankLength * (metric ? 1 : 25.4), 1, 1_000_000_000),
          count: 2, label: "Compound-miter panel blank",
        }],
      };
    },
  },
};
