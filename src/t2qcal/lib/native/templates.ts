import type { CalculatorField, CalculatorOutput, CalculatorResult, FieldKind, VerifiedDefinition } from "../verified-calculators";
import type { DiagramKind } from "@/t2qcal/components/calculators/technicalDrawing";
import meta from "./meta.json";
import { area, deg, len, n, pos, rad, roundedInt, type Values } from "./format";
import { DiameterTapeGeometry, RadialTemplateGeometry } from "./templates-geometry";

/**
 * Native-parity ports of ios/T2QCAL/T2QCAL/Models/ToolsTemplates.swift.
 * Each entry is keyed by slug and must reproduce the native result rows,
 * marks, diagram values, handoffs and cuts recorded in
 * fixtures/native-reference.json (see native/parity.test.ts).
 */

type MetaField = { key: string; label: string; default: number; kind: string; min?: number; max?: number };
type MetaTool = {
  name: string;
  summary: string;
  diagram: string;
  sheets: { label: string; kind: string }[];
  showsAssembly: boolean;
  fields: MetaField[];
};
const catalogue = meta as unknown as Record<string, MetaTool>;

/** Title, note, diagram, sheets, showsAssembly and fields all come from the catalogue. */
function shell(slug: string): Omit<VerifiedDefinition, "compute"> {
  const tool = catalogue[slug];
  const fields: CalculatorField[] = tool.fields.map((field) => ({
    key: field.key,
    label: field.label,
    default: field.default,
    kind: field.kind as FieldKind,
    ...(field.min === undefined ? {} : { min: field.min }),
    ...(field.max === undefined ? {} : { max: field.max }),
  }));
  return {
    title: tool.name,
    note: tool.summary,
    diagram: tool.diagram as DiagramKind,
    // the web sheet picker adds the 3D view itself
    sheets: tool.sheets.filter((s) => !s.kind.endsWith("3d")).map((s) => ({ label: s.label, diagram: s.kind as DiagramKind })),
    showsAssembly: tool.showsAssembly,
    fields,
  };
}

// MARK: Divided circles (protractor, divider, template, bolt circle)

function dividedCircle(slug: string): VerifiedDefinition {
  const isProtractor = slug === "protractor";
  const bolt = slug === "bolt-circle";
  const divider = slug === "circle-divider";
  return {
    ...shell(slug),
    compute(values: Values, unit): CalculatorOutput {
      const metric = unit === "metric";
      const diameter = n(values, "diameter");
      const divisions = Math.max(
        isProtractor ? 1 : 3,
        roundedInt(n(values, "count"), 1, isProtractor ? 180 : 360),
      );
      const countValue = isProtractor ? RadialTemplateGeometry.degreeMarks(divisions).length : divisions;
      const radius = diameter / 2;
      const angleValue = isProtractor ? divisions : 360 / divisions;
      const chord = 2 * radius * Math.sin(rad(angleValue) / 2);
      if (bolt && RadialTemplateGeometry.make(diameter, divisions, n(values, "holeDiameter")) === null) {
        return {
          results: [
            {
              label: "Overlapping holes",
              value: "Reduce the hole diameter or hole count, or increase the pitch circle diameter.",
              primary: true,
            },
          ],
          diagramValues: { invalid: 1 },
        };
      }
      const results: CalculatorResult[] = [
        {
          label: isProtractor ? "Major marks" : "Division chord",
          value: isProtractor ? String(countValue) : len(chord, metric),
          primary: true,
        },
        { label: "Radius", value: len(radius, metric) },
        { label: "Circumference", value: len(Math.PI * diameter, metric) },
        { label: "Angle increment", value: deg(angleValue, 4) },
        { label: "Half miter", value: deg(angleValue / 2, 4) },
      ];
      if (bolt) {
        results.push({
          label: "Gap between hole edges",
          value: len(Math.max(0, chord - n(values, "holeDiameter")), metric),
        });
      }
      if (isProtractor && 180 % divisions !== 0) {
        results.push({ label: "Final interval to 180°", value: deg(180 % divisions) });
      }
      const diagramValues: Record<string, number> = {
        count: divisions,
        majorMarks: countValue,
        radialTemplate: isProtractor ? 4 : bolt ? 3 : divider ? 2 : 1,
      };
      if (isProtractor) diagramValues.tick = divisions;
      // the 3D disc reads this so a bolt circle drills holes where a
      // divided circle only strikes spokes
      diagramValues.model = bolt ? 3 : divider ? 1 : 2;
      let marks: string[];
      if (isProtractor) {
        marks = RadialTemplateGeometry.degreeMarks(divisions).map((value) => `${value}°`);
      } else {
        const g = RadialTemplateGeometry.make(diameter, divisions);
        results.push({ label: "Coordinates", value: "Centre origin · X right · Y up · clockwise from top" });
        marks = (g?.centres ?? []).map(
          (p, i) => `${bolt ? "Hole" : "Mark"} ${i + 1}: X ${len(p.x, metric, 5)} · Y ${len(p.y, metric, 5)}`,
        );
      }
      return { results, marks, diagramValues };
    },
  };
}

// MARK: Arc template

const arcTemplate: VerifiedDefinition = {
  ...shell("arc-template"),
  compute(values: Values, unit): CalculatorOutput {
    const metric = unit === "metric";
    const span = n(values, "span");
    const rise = n(values, "rise");
    const radius = (span * span) / pos(8 * rise) + rise / 2;
    const theta = 4 * Math.atan2(2 * rise, span);
    const arc = radius * theta;
    return {
      results: [
        { label: "Arc radius", value: len(radius, metric), primary: true },
        { label: "Arc length", value: len(arc, metric) },
        { label: "Included angle", value: deg((theta * 180) / Math.PI, 4) },
        { label: "Half chord", value: len(span / 2, metric) },
        {
          label: radius >= rise ? "Centre below chord" : "Centre above chord",
          value: len(Math.abs(radius - rise), metric),
        },
      ],
      diagramValues: { model: 1, templateGeometry: 2 },
    };
  },
};

// MARK: Oval template

const ovalTemplate: VerifiedDefinition = {
  ...shell("oval-template"),
  compute(values: Values, unit): CalculatorOutput {
    const metric = unit === "metric";
    const a = n(values, "diameter") / 2;
    const b = n(values, "minor") / 2;
    if (!(a >= b)) {
      return {
        results: [
          {
            label: "Check ellipse axes",
            value: "The major axis must be at least as long as the minor axis.",
            primary: true,
          },
        ],
        diagramValues: { invalid: 1 },
      };
    }
    const c = Math.sqrt(Math.max(0, a * a - b * b));
    const h = (a - b) ** 2 / (a + b) ** 2;
    const perimeter = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    return {
      results: [
        { label: "Ellipse perimeter (approx.)", value: len(perimeter, metric), primary: true },
        { label: "Focal distance from centre", value: len(c, metric) },
        { label: "Major radius", value: len(a, metric) },
        { label: "Minor radius", value: len(b, metric) },
        { label: "Foci separation", value: len(2 * c, metric) },
      ],
      diagramValues: { count: 4, model: 8, radialTemplate: 5 },
    };
  },
};

// MARK: Cone pattern

const conePattern: VerifiedDefinition = {
  ...shell("cone-pattern"),
  compute(values: Values, unit): CalculatorOutput {
    const metric = unit === "metric";
    const bottom = n(values, "bottomDiameter");
    const top = n(values, "topDiameter");
    const height = n(values, "height");
    const seam = n(values, "seam");
    const large = Math.max(bottom, top) / 2;
    const small = Math.min(bottom, top) / 2;
    const delta = large - small;
    const slant = Math.hypot(height, delta);
    const sheetArea = Math.PI * (large + small) * slant;
    const cylinder = delta < 0.000001;
    const outer = cylinder ? 0 : (slant * large) / delta;
    const inner = cylinder ? 0 : (slant * small) / delta;
    const sweep = cylinder ? 360 : (360 * large) / outer;
    return {
      results: [
        { label: "Pattern sweep", value: cylinder ? "Rectangle (cylinder)" : deg(sweep, 4), primary: true },
        { label: "Slant height", value: len(slant, metric) },
        {
          label: cylinder ? "Wrap length" : "Outer pattern radius",
          value: len(cylinder ? 2 * Math.PI * large : outer, metric),
        },
        {
          label: cylinder ? "Rectangle height" : "Inner pattern radius",
          value: len(cylinder ? height : inner, metric),
        },
        { label: "Net sheet area", value: area(sheetArea, metric) },
        { label: "Seam allowance width", value: len(seam, metric) },
      ],
      diagramValues: { slant, templateGeometry: 1 },
    };
  },
};

// MARK: Diameter tape

const diameterTape: VerifiedDefinition = {
  ...shell("diameter-tape"),
  compute(values: Values, unit): CalculatorOutput {
    const metric = unit === "metric";
    const diameter = n(values, "diameter");
    const increment = n(values, "increment");
    const overlap = n(values, "overlap");
    const wrap = Math.PI * diameter;
    const step = Math.PI * increment;
    const tape = DiameterTapeGeometry.make(diameter, increment, overlap);
    if (tape === null) {
      return {
        results: [
          {
            label: "Too many tape marks",
            value:
              "Use no more than 10,000 numbered marks, including zero and the maximum diameter. Increase the increment.",
            primary: true,
          },
        ],
        diagramValues: { invalid: 1 },
      };
    }
    const ticks = tape.labels.length;
    const positions = tape.positions;
    return {
      results: [
        { label: "Tape length", value: len(wrap + overlap, metric), primary: true },
        { label: "Maximum circumference", value: len(wrap, metric) },
        { label: "Tick spacing", value: len(step, metric) },
        { label: "Numbered ticks", value: String(ticks) },
        { label: "Overlap", value: len(overlap, metric) },
      ],
      marks: tape.labels.map(
        (label, i) => `Ø ${len(label, metric, 5)} → tape ${len(positions[i], metric, 5)}`,
      ),
      diagramValues: { value: diameter, model: 7, radialTemplate: 6 },
    };
  },
};

export const definitions: Record<string, VerifiedDefinition> = {
  protractor: dividedCircle("protractor"),
  "circle-divider": dividedCircle("circle-divider"),
  "circle-template": dividedCircle("circle-template"),
  "bolt-circle": dividedCircle("bolt-circle"),
  "arc-template": arcTemplate,
  "oval-template": ovalTemplate,
  "cone-pattern": conePattern,
  "diameter-tape": diameterTape,
};
