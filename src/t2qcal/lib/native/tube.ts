import type { CalculatorField, CalculatorOutput, CalculatorResult, FieldKind, VerifiedDefinition } from "../verified-calculators";
import type { DiagramKind } from "@/t2qcal/components/calculators/technicalDrawing";
import meta from "./meta.json";
import { deg, len, area, n, rad, roundedInt, type Values } from "./format";
import {
  RoundSquareGeometry,
  SquareTubeMiterGeometry,
  TubeBendGeometry,
  tubeCutMaximumDepth,
  tubeCutProfile,
} from "./tube-geometry";

/**
 * Native-parity ports of ios/T2QCAL/T2QCAL/Models/ToolsTube.swift.
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

/** ToolsLayouts.invalid — a guard the native app prints as a result row, never an error. */
const invalid = (message: string) => ({
  results: [{ label: "Check inputs", value: message, primary: true }],
  diagramValues: { invalid: 1 },
});

/** Two-digit running index for the set-out lists: "01", "02", … */
const ord = (index: number) => String(index).padStart(2, "0");

// MARK: Wrap templates (notch, miter, through-sheet)

function wrapTemplate(slug: string): VerifiedDefinition {
  const through = slug === "tube-through-sheet";
  const miter = slug === "tube-miter";
  return {
    ...shell(slug),
    compute(values: Values, unit): CalculatorOutput {
      const metric = unit === "metric";
      const diameter = n(values, "diameter");
      const parent = n(values, "parentDiameter");
      const angle = n(values, "angle");
      if (!miter && !through && diameter > parent) {
        return invalid("The branch diameter must not exceed the parent tube diameter for this coping template.");
      }
      const wrap = Math.PI * diameter;
      const cut = (180 - angle) / 2;
      // Every station comes from the same cut profile the template plots, so
      // a coped branch is figured as a fishmouth rather than a plane miter.
      const jointKind = through ? 2 : miter ? 1 : 0;
      const depthAt = tubeCutProfile(jointKind, diameter, parent, angle);
      const maxDepth = tubeCutMaximumDepth(jointKind, diameter, parent, angle);
      const stations = roundedInt(n(values, "stations"), 8, 96);
      const stationSpacing = wrap / Math.max(8, stations);
      const marks = Array.from({ length: stations + 1 }, (_, i) => {
        const theta = (i / stations) * Math.PI * 2;
        const depth = depthAt(theta);
        return `${ord(i + 1)} · wrap ${len(i * stationSpacing, metric)} · depth ${len(depth, metric)}`;
      });
      const results: CalculatorResult[] = [
        { label: "Wrap circumference", value: len(wrap, metric), primary: true },
        { label: "Maximum cut depth", value: len(maxDepth, metric) },
        { label: "Station spacing", value: len(stationSpacing, metric) },
        {
          label: miter ? "Saw reference angle" : through ? "Plane bevel from square" : "Branch inclination",
          value: deg(miter ? cut : through ? Math.abs(90 - angle) : angle, 3),
        },
        { label: "Plot points", value: String(marks.length) },
      ];
      if (through) {
        results.push({ label: "Hole major axis", value: len(diameter / Math.abs(Math.sin(rad(angle))), metric) });
        results.push({ label: "Hole minor axis", value: len(diameter, metric) });
      }
      return {
        results,
        marks,
        diagramValues: {
          tubeDiameter: diameter,
          maxDepth,
          // 0 notch · 1 miter · 2 through a sheet — each unrolls differently
          jointKind,
          model: jointKind,
        },
      };
    },
  };
}

// MARK: Tube bend

const tubeBend: VerifiedDefinition = {
  ...shell("tube-bend"),
  compute(values: Values, unit): CalculatorOutput {
    const metric = unit === "metric";
    const diameter = n(values, "diameter");
    const radius = n(values, "radius");
    const angle = n(values, "angle");
    const straight = n(values, "straight");
    if (!(radius > diameter / 2)) {
      return invalid("The centre-line bend radius must exceed half the tube diameter for this bend model.");
    }
    const theta = rad(angle);
    const arc = radius * theta;
    const tangent = radius * Math.tan(theta / 2);
    const outer = (radius + diameter / 2) * theta;
    const inner = Math.max(0, radius - diameter / 2) * theta;
    return {
      results: [
        { label: "Centre-line bend allowance", value: len(arc, metric), primary: true },
        {
          label: "Tangent set-back",
          value: angle === 180 ? "Parallel tangents — no finite intersection" : len(tangent, metric),
        },
        { label: "Outer arc", value: len(outer, metric) },
        { label: "Inner arc", value: len(inner, metric) },
        { label: "Total developed centre-line", value: len(arc + 2 * straight, metric) },
      ],
      diagramValues: { model: 4 },
    };
  },
};

// MARK: Pie-cut bend

const pieCutBend: VerifiedDefinition = {
  ...shell("pie-cut-bend"),
  compute(values: Values, unit): CalculatorOutput {
    const metric = unit === "metric";
    const diameter = n(values, "diameter");
    const radius = n(values, "radius");
    const angle = n(values, "angle");
    const joints = roundedInt(n(values, "count"), 1, 40);
    if (!(radius > diameter / 2)) {
      return invalid("The centre-line radius must exceed half the tube diameter to leave a positive inner edge.");
    }
    if (!(angle / joints < 180)) {
      return invalid("A 180° bend needs at least two weld joints; a single 90° saw cut has no finite length.");
    }
    const g = new TubeBendGeometry(diameter, radius, angle, 0);
    const turn = angle / joints;
    const k = Math.tan(rad(turn) / 2);
    const half = g.halfPiece(joints);
    return {
      results: [
        { label: "Saw cut angle", value: deg(turn / 2, 4), primary: true },
        { label: "Turn per weld", value: deg(turn, 4) },
        { label: "Weld seams", value: String(joints) },
        { label: "Tube pieces", value: String(joints + 1) },
        { label: "Middle pieces", value: String(joints - 1) },
        { label: "Middle centre-line length", value: len(2 * half, metric) },
        {
          label: "Middle long / short edge",
          value: `${len(2 * (radius + diameter / 2) * k, metric)} / ${len(2 * (radius - diameter / 2) * k, metric)}`,
        },
        { label: "End pieces", value: "2 half pieces, one square end each" },
        { label: "End centre-line length", value: len(half, metric) },
        { label: "Total straight tube, net", value: len(2 * joints * half, metric) },
        { label: "Reference centre-line arc", value: len(g.arcLength, metric) },
        {
          label: "Cutting basis",
          value: "Tube axes tangent to the target circle; add cutting kerf and weld allowances.",
        },
      ],
      diagramValues: { model: 5, count: joints },
    };
  },
};

// MARK: Round-to-square reducer

const roundSquareReducer: VerifiedDefinition = {
  ...shell("round-square-reducer"),
  compute(values: Values, unit): CalculatorOutput {
    const metric = unit === "metric";
    const diameter = n(values, "diameter");
    const square = n(values, "square");
    const height = n(values, "height");
    const geometry = new RoundSquareGeometry(diameter, square, height, roundedInt(n(values, "facets"), 2, 48));
    const faceSlant = geometry.faceSlant;
    const cornerSlant = geometry.cornerSlant;
    return {
      results: [
        { label: "Corner slant", value: len(cornerSlant, metric), primary: true },
        { label: "Face slant", value: len(faceSlant, metric) },
        { label: "Round circumference", value: len(Math.PI * diameter, metric) },
        { label: "Square perimeter", value: len(4 * square, metric) },
        { label: "Net faceted sheet area", value: area(geometry.totalSheetArea, metric) },
        { label: "Base facet chord", value: len(geometry.baseChord, metric) },
        { label: "Identical quarter panels", value: "4" },
        {
          label: "Pattern basis",
          value: "Flat corner facets; seam, thickness and forming allowances are additional.",
        },
      ],
      diagramValues: {
        bottomDiameter: diameter,
        topDiameter: square,
        slant: cornerSlant,
        diameter,
        square,
        model: 1,
      },
    };
  },
};

// MARK: Square section miters

function sectionMiter(slug: string): VerifiedDefinition {
  const threeWay = slug === "three-way-joint";
  return {
    ...shell(slug),
    compute(values: Values, unit): CalculatorOutput {
      const metric = unit === "metric";
      const width = n(values, "width");
      const height = n(values, "height");
      const angle = n(values, "angle");
      if (threeWay) {
        if (!(Math.abs(width - height) < Math.max(width, height) * 1e-9 && Math.abs(angle - 90) < 1e-9)) {
          return invalid(
            "This corner joins three equal square tubes at 90°. Set depth equal to width and the corner angle to 90°; other three-way geometries need a different joint layout.",
          );
        }
        return {
          results: [
            { label: "Identical arms", value: "3", primary: true },
            { label: "Section", value: `${len(width, metric)} square` },
            { label: "Angle between each pair", value: "90°" },
            { label: "Cuts per arm", value: "Two 45° planes at right angles" },
            { label: "Long-to-short end offset", value: len(width, metric) },
            { label: "Wrap perimeter", value: len(4 * width, metric) },
            {
              label: "Cutting basis",
              value: "Net outside surface; add wall-thickness, kerf and weld-gap allowances.",
            },
          ],
          diagramValues: { diameter: width, model: 3 },
        };
      }
      const geometry = new SquareTubeMiterGeometry(width, height, angle);
      const cut = geometry.sawAngle;
      const offsetW = geometry.offset;
      // A planar saw cut has no second bevel across the section depth.
      const offsetH = 0;
      return {
        results: [
          { label: "Miter saw angle", value: deg(cut, 4), primary: true },
          { label: "Width-face offset", value: len(offsetW, metric) },
          { label: "Depth-face axial change", value: len(offsetH, metric) },
          { label: "Section depth", value: len(height, metric) },
          { label: "Included joint", value: deg(angle, 3) },
          { label: "Long diagonal", value: len(Math.sqrt(width * width + offsetW * offsetW), metric) },
        ],
        diagramValues: { diameter: width, model: 6 },
      };
    },
  };
}

export const definitions: Record<string, VerifiedDefinition> = {
  "tube-notch": wrapTemplate("tube-notch"),
  "tube-miter": wrapTemplate("tube-miter"),
  "tube-through-sheet": wrapTemplate("tube-through-sheet"),
  "tube-bend": tubeBend,
  "pie-cut-bend": pieCutBend,
  "round-square-reducer": roundSquareReducer,
  "square-tube-miter": sectionMiter("square-tube-miter"),
  "three-way-joint": sectionMiter("three-way-joint"),
};
