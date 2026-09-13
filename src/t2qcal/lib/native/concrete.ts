import type { CalculatorField, CalculatorOutput, FieldKind, VerifiedDefinition } from "../verified-calculators";
import type { DiagramKind } from "@/t2qcal/components/calculators/technicalDrawing";
import meta from "./meta.json";
import {
  area, areaUnit, areaValue, ceilInt, deg, len, money, n, num, pos, roundedInt, ulp, vol, volumeUnit, volValue,
  type Values,
} from "./format";
import {
  balancedSpacing, circularBlockWall, closingUnitRun, masonryArch, masonryPanel,
  packageFingerprint, rectangularPourVolume,
} from "./concrete-geometry";

/**
 * Native-parity ports of ios/T2QCAL/T2QCAL/Models/ToolsConcrete.swift.
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

/** `BalancedSpacing.invalid` — the shared spacing guard message. */
const spacingInvalid: CalculatorOutput = {
  results: [{
    label: "Check spacing dimensions",
    value: "Members must fit inside the span. Use a positive member width or gap, and a layout of at most 10,000 members. A maximum gap must be achievable with the entered member width.",
    primary: true,
  }],
  diagramValues: { invalid: 1 },
};

/** Two-digit running index for the set-out lists — Swift `ord`. */
const ord = (index: number) => String(index).padStart(2, "0");

export const definitions: Record<string, VerifiedDefinition> = {
  // MARK: Concrete slab
  "concrete-slab": {
    ...base("concrete-slab"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const length = n(v, "length"), width = n(v, "width"), thickness = n(v, "thickness");
      const waste = n(v, "waste"), rate = n(v, "rate");
      const plan = metric ? length * width / 1e6 : length * width / 144;
      const net = metric ? plan * thickness / 1000 : plan * thickness / 12;
      const order = net * (1 + waste / 100);
      const netM3 = metric ? net : net * 0.028316846592;
      const weightKg = netM3 * n(v, "density");
      const weight = metric ? weightKg : weightKg / 0.45359237;
      const orderShown = metric ? order : order / 27;
      const netShown = metric ? net : net / 27;
      const orderUnit = metric ? "m³" : "yd³";
      const weightUnit = metric ? "kg" : "lb";
      return {
        results: [
          { label: "Order volume", value: `${num(orderShown, 3)} ${orderUnit}`, primary: true },
          { label: "Net volume", value: `${num(netShown, 3)} ${orderUnit}` },
          { label: "Plan area", value: `${num(plan, 2)} ${areaUnit(metric)}` },
          { label: "Approx. weight", value: `${num(weight, 0)} ${weightUnit}` },
          { label: "Order allowance", value: `${num(orderShown - netShown, 3)} ${orderUnit}` },
          { label: "Estimated concrete", value: money(orderShown * rate) },
        ],
        diagramValues: {
          length, width, span: length, thickness, height: thickness, pourGeometry: 0,
        },
        handoffs: [{
          key: "concrete-slab.order-volume", label: "Concrete order volume", quantity: orderShown,
          unit: orderUnit, role: "material", includeByDefault: true,
          formula: "slab length × slab width × thickness × (1 + order allowance ÷ 100).",
          assumptions: ["The slab is a uniform rectangular pour."],
          checks: ["All dimensions are positive.", "The result is converted once to m³ or yd³ after allowance."],
        }],
      };
    },
  },

  // MARK: Slab with edge beams
  "slab-edge-beams": {
    ...base("slab-edge-beams"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const length = n(v, "length"), width = n(v, "width"), thickness = n(v, "thickness");
      const beamWidth = n(v, "beamWidth"), beamDepth = n(v, "beamDepth"), waste = n(v, "waste");
      const net = rectangularPourVolume(length, width, thickness, beamWidth, beamDepth);
      if (net === null) return invalid("Total edge-beam depth must be at least the slab thickness.");
      const slab = length * width * thickness;
      const perimeter = 2 * (length + width);
      const beamArea = length * width
        - Math.max(0, length - 2 * beamWidth) * Math.max(0, width - 2 * beamWidth);
      const beam = beamArea * Math.max(0, beamDepth - thickness);
      const order = net * (1 + waste / 100);
      return {
        results: [
          { label: "Order volume", value: vol(order, metric), primary: true },
          { label: "Net concrete", value: vol(net, metric) },
          { label: "Slab body", value: vol(slab, metric) },
          { label: "Edge beam addition", value: vol(beam, metric) },
          { label: "Perimeter", value: len(perimeter, metric) },
          { label: "Plan area", value: area(length * width, metric) },
        ],
        diagramValues: { pourGeometry: 1 },
        handoffs: [{
          key: "slab-edge-beams.order-volume", label: "Concrete order volume",
          quantity: volValue(order, metric), unit: volumeUnit(metric),
          role: "material", includeByDefault: true,
          formula: "(slab area × slab thickness + (outer area − inner area) × max(0, beam depth − slab thickness)) × (1 + allowance ÷ 100).",
          assumptions: ["Edge beams lie inside the rectangular slab footprint; each corner is counted once."],
          checks: ["Extra beam depth cannot be negative.", "Slab and edge-beam volumes are summed before allowance."],
        }],
      };
    },
  },

  // MARK: Concrete block quantities
  "block-quantities": {
    ...base("block-quantities"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const length = n(v, "length"), height = n(v, "height");
      const blockLength = n(v, "blockLength"), blockHeight = n(v, "blockHeight");
      const joint = n(v, "joint"), openings = n(v, "openingArea"), waste = n(v, "waste");
      const gross = areaValue(length * height, metric);
      if (!(openings <= gross + ulp(gross) * 8)) {
        return invalid("The openings area cannot exceed the gross wall area.");
      }
      const net = Math.max(0, gross - openings);
      const moduleArea = areaValue((blockLength + joint) * (blockHeight + joint), metric);
      const netBlocks = ceilInt(net / pos(moduleArea), 0, 200_000);
      const order = ceilInt(netBlocks * (1 + waste / 100), 0, 400_000);
      const g = masonryPanel({
        length, height, unitLength: blockLength, unitHeight: blockHeight,
        depth: n(v, "wallDepth"), headJoint: joint, bedJoint: joint,
      });
      if (!g) return invalid("Split this wall into sections of no more than 10,000 masonry pieces.");
      return {
        results: [
          { label: "Order quantity", value: `${order} blocks`, primary: true },
          { label: "Net blocks (area estimate)", value: String(netBlocks) },
          { label: "Quantity basis", value: "Module-area estimate. Confirm opening cuts and offcut reuse from the project layout before ordering." },
          { label: "Gross wall area", value: `${num(gross, 3)} ${areaUnit(metric)}` },
          { label: "Net wall area", value: `${num(net, 3)} ${areaUnit(metric)}` },
          { label: "Courses", value: String(g.courses) },
          { label: "Allowance", value: `${order - netBlocks} blocks` },
        ],
        diagramValues: g.diagramValues,
      };
    },
  },

  // MARK: Circular block wall
  "circular-block-wall": {
    ...base("circular-block-wall"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const g = circularBlockWall({
        diameter: n(v, "diameter"), length: n(v, "blockLength"), width: n(v, "blockWidth"),
        height: n(v, "blockHeight"), joint: n(v, "joint"), bed: n(v, "bedJoint"),
        courses: roundedInt(n(v, "courses"), 1, 100), override: roundedInt(n(v, "blockCount"), 0, 10_000),
        originHeight: n(v, "originHeight"),
      });
      if (!g) {
        return invalid("Blocks must fit without overlapping their inner corners. Increase the diameter, reduce the block size/count, or split walls above 10,000 units into sections.");
      }
      const marks = Array.from({ length: g.courses }, (_, row) =>
        `Course ${row + 1}: top ${len(g.courseTop(row), metric)} · diagonal ${len(g.diagonal(row), metric)}`);
      return {
        results: [
          { label: "Blocks per course", value: String(g.count), primary: true },
          { label: "Total blocks", value: String(g.count * g.courses) },
          { label: "Inside joint", value: len(g.innerGap, metric) },
          { label: "Centre joint", value: len(g.centreGap, metric) },
          { label: "Outside joint", value: len(g.outerGap, metric) },
          { label: "Unit angle", value: deg(g.angle * 180 / Math.PI, 4) },
          { label: "Clear inner diameter", value: len(2 * g.innerRadius, metric) },
          { label: "Outside corner diameter", value: len(2 * g.outerRadius, metric) },
          { label: "Outside straight-face module", value: len(g.length + g.outerGap, metric) },
          { label: "Wall height", value: len(g.totalHeight, metric) },
          { label: "Layout basis", value: "Uncut rectangular blocks with alternating half-module bond. Joints are straight corner-to-corner gaps; the count is chosen without inner overlap. Bed joints occur between courses only." },
        ],
        marks,
        diagramValues: g.diagramValues,
        handoffs: [{
          key: "circular-block-wall.blocks-total", label: "Total blocks",
          quantity: g.count * g.courses, unit: "block", role: "material", includeByDefault: false,
          basisFingerprint: packageFingerprint("block", metric, [g.length, g.width, g.height]),
          formula: "feasible blocks per course × course count. The automatic count gives the closest centre joint while keeping all inner joints non-negative.",
          assumptions: ["Uncut rectangular blocks tangent to the entered centre circle; no waste is added."],
          checks: ["No inner-corner overlap.", "Every counted block is represented in the model; the net count starts unticked."],
        }],
      };
    },
  },

  // MARK: Masonry arch
  "masonry-arch": {
    ...base("masonry-arch"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const span = n(v, "span"), ringDepth = n(v, "ringDepth"), joint = n(v, "joint");
      const units = roundedInt(n(v, "count"), 3, 99);
      const inner = span / 2;
      if (!(joint < 2 * inner * Math.sin(Math.PI / units / 2))) {
        return invalid("The inner joint is too wide to leave a positive voussoir. Reduce the joint or unit count.");
      }
      const g = masonryArch(span, ringDepth, units, joint, n(v, "wallDepth"));
      return {
        results: [
          { label: "Net voussoir angle", value: deg(g.unitAngle * 180 / Math.PI, 4), primary: true },
          { label: "Module angle including joint", value: deg(g.module * 180 / Math.PI, 4) },
          { label: "Inner face chord", value: len(g.innerChord, metric) },
          { label: "Outer face chord", value: len(g.outerChord, metric) },
          { label: "Inner face arc", value: len(g.inner * g.unitAngle, metric) },
          { label: "Outer face arc", value: len(g.outer * g.unitAngle, metric) },
          { label: "Radial ring depth", value: len(ringDepth, metric) },
          { label: "Arch rise", value: len(inner, metric) },
          { label: "Net masonry volume", value: vol(g.netArea * g.wallDepth, metric) },
          { label: "Joint layout", value: "Equal radial joints, with a half joint at each spring. Inner joint is the straight gap between unit corners." },
        ],
        diagramValues: {
          rise: inner, height: inner, count: units, segments: units,
          thickness: ringDepth, diameter: span, model: 0,
        },
      };
    },
  },

  // MARK: Starter bars (verifiedSpacing, noun "bar", flags both/model)
  "starter-bars": {
    ...base("starter-bars"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const span = pos(n(v, "span"));
      const width = Math.max(0, n(v, "memberWidth"));
      const target = Math.max(0, n(v, "targetGap"));
      const layout = balancedSpacing(span, width, target);
      if (!layout) return spacingInvalid;
      const count = layout.count, gap = layout.gap;
      const centres = width + gap;
      return {
        results: [
          { label: "Balanced clear gap", value: len(gap, metric), primary: true },
          { label: "bar count", value: String(count) },
          { label: "Centre to centre", value: len(centres, metric) },
          { label: "Equal end margins", value: len(gap, metric) },
          { label: "Occupied material", value: len(count * width, metric) },
          { label: "Open space", value: len((count + 1) * gap, metric) },
        ],
        marks: Array.from({ length: count }, (_, i) =>
          `${ord(i + 1)} · centre ${len(gap + width / 2 + i * centres, metric)}`),
        diagramValues: { count, gap, spacing: centres, center: centres, both: 0, model: 3 },
      };
    },
  },

  // MARK: Brick gauge and bond
  "brick-gauge": {
    ...base("brick-gauge"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const height = n(v, "height"), brickHeight = n(v, "brickHeight");
      const length = n(v, "length"), brickLength = n(v, "brickLength");
      const targetJoint = n(v, "targetJoint");
      const vertical = closingUnitRun(height, brickHeight, targetJoint);
      const horizontal = closingUnitRun(length, brickLength, targetJoint);
      const g = vertical && horizontal
        ? masonryPanel({
          length, height, unitLength: brickLength, unitHeight: brickHeight,
          depth: n(v, "wallDepth"), headJoint: horizontal.gap, bedJoint: vertical.gap, fullFit: true,
        })
        : null;
      if (!vertical || !horizontal || !g) {
        return invalid("Full units with non-negative internal joints must fit the wall. Use a dimension equal to one unit or at least two units, and no more than 10,000 pieces per section.");
      }
      const courses = vertical.count, modules = horizontal.count;
      const bed = vertical.gap, perp = horizontal.gap;
      return {
        results: [
          { label: "Course count", value: String(courses), primary: true },
          { label: "Actual bed joint", value: len(bed, metric) },
          { label: "Horizontal modules", value: String(modules) },
          { label: "Actual perp joint", value: len(perp, metric) },
          { label: "Course gauge", value: len(brickHeight + bed, metric) },
          { label: "Half-bond offset", value: len((brickLength + perp) / 2, metric) },
          { label: "Gauge basis", value: "Joints between full units only. Alternate courses use cut end units; no top or bottom bed is added." },
        ],
        marks: Array.from({ length: courses }, (_, row) =>
          `Course ${row + 1} top: ${len(row * (brickHeight + bed) + brickHeight, metric)}`),
        diagramValues: g.diagramValues,
      };
    },
  },

  // MARK: Concrete by the bag
  "concrete-bags": {
    ...base("concrete-bags"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const volume = n(v, "length") * n(v, "width") * n(v, "thickness");
      const m3 = metric ? volume / 1e9 : volume * 0.000016387064;
      const bags = ceilInt(m3 / pos(n(v, "bagYield")), 0, 1_000_000_000);
      return {
        results: [
          { label: "Bags needed", value: String(bags), primary: true },
          { label: "Net volume", value: vol(volume, metric) },
          { label: "Plan area", value: area(n(v, "length") * n(v, "width"), metric) },
          { label: "Mixed weight (approx.)", value: `${num(m3 * n(v, "density"), 0)} kg` },
        ],
        diagramValues: { bags, pourGeometry: 8 },
        handoffs: [{
          key: "concrete-bags.bags-needed", label: "Bags needed", quantity: bags,
          unit: "bag", role: "material", includeByDefault: true,
          basisFingerprint: packageFingerprint("concrete-bag", metric, [], [n(v, "bagYield")]),
          formula: "ceil(pour volume in m³ ÷ yield per bag).",
          assumptions: ["The entered bag yield is the product's usable mixed yield."],
          checks: ["Bag yield is positive.", "Imperial pour dimensions are converted to m³ before division."],
        }],
      };
    },
  },

  // MARK: Excavation and truck loads
  excavation: {
    ...base("excavation"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const bank = n(v, "length") * n(v, "width") * n(v, "depth");
      const m3 = metric ? bank / 1e9 : bank * 0.000016387064;
      const loose = m3 * (1 + n(v, "swell") / 100);
      const loads = ceilInt(loose / pos(n(v, "truck")), 0, 1_000_000_000);
      return {
        results: [
          { label: "Loose volume", value: `${num(loose, 3)} m³`, primary: true },
          { label: "Bank volume", value: vol(bank, metric) },
          { label: "Truck loads", value: String(loads) },
          { label: "Plan area", value: area(n(v, "length") * n(v, "width"), metric) },
          { label: "Depth", value: len(n(v, "depth"), metric) },
        ],
        diagramValues: { pourGeometry: 4 },
        handoffs: [{
          key: "excavation.loose-volume", label: "Loose excavation volume", quantity: loose,
          unit: "m³", role: "work", includeByDefault: false,
          formula: "bank length × width × depth × (1 + swell ÷ 100), converted to m³.",
          assumptions: ["The excavation is rectangular and swell is uniform."],
          checks: ["Dimensions and swell are finite and non-negative.", "This work quantity starts unticked and is never material-priced."],
        }],
      };
    },
  },

  // MARK: Strip footing
  "strip-footing": {
    ...base("strip-footing"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const volume = n(v, "length") * n(v, "width") * n(v, "depth");
      const m3 = metric ? volume / 1e9 : volume * 0.000016387064;
      return {
        results: [
          { label: "Net volume", value: vol(volume, metric), primary: true },
          { label: "Readymix order", value: `${num(m3 * (1 + n(v, "waste") / 100), 3)} m³` },
          { label: "Bags for net volume", value: String(ceilInt(m3 / n(v, "bagYield"), 0, 1_000_000_000)) },
          { label: "Two long trench sides", value: area(n(v, "length") * n(v, "depth") * 2, metric) },
        ],
        diagramValues: { pourGeometry: 6 },
        handoffs: [{
          key: "strip-footing.readymix-order", label: "Readymix order",
          quantity: m3 * (1 + n(v, "waste") / 100), unit: "m³", role: "material", includeByDefault: true,
          formula: "footing length × width × depth, converted to m³, then × (1 + order allowance ÷ 100).",
          assumptions: ["The footing is a uniform rectangular trench. Bag counts use the entered yield and exclude the readymix allowance."],
          checks: ["All dimensions are positive.", "The approximate bag alternative is not also handed off."],
        }],
      };
    },
  },

  // MARK: Brick quantities
  "brick-quantities": {
    ...base("brick-quantities"),
    compute(v: Values, unit) {
      const metric = unit === "metric";
      const length = n(v, "length"), height = n(v, "height");
      const brickLength = n(v, "brickLength"), brickHeight = n(v, "brickHeight");
      const joint = n(v, "joint"), waste = n(v, "waste");
      const gross = areaValue(length * height, metric);
      const moduleArea = areaValue((brickLength + joint) * (brickHeight + joint), metric);
      const net = ceilInt(gross / pos(moduleArea), 0, 100_000_000);
      const order = ceilInt(net * (1 + waste / 100), 0, 200_000_000);
      const g = masonryPanel({
        length, height, unitLength: brickLength, unitHeight: brickHeight,
        depth: n(v, "wallDepth"), headJoint: joint, bedJoint: joint,
      });
      if (!g) return invalid("Split this wall into sections of no more than 10,000 masonry pieces.");
      return {
        results: [
          { label: "Order quantity", value: `${order} bricks`, primary: true },
          { label: "Net bricks (area estimate)", value: String(net) },
          { label: "Quantity basis", value: "Module-area estimate. Confirm cut pieces and reusable offcuts from the project layout before ordering." },
          { label: "Wall area", value: `${num(gross, 3)} ${areaUnit(metric)}` },
          { label: "Courses", value: String(g.courses) },
          { label: "Allowance", value: `${order - net} bricks` },
        ],
        diagramValues: g.diagramValues,
        handoffs: [{
          key: "brick-quantities.bricks-order", label: "Bricks to order", quantity: order,
          unit: "brick", role: "material", includeByDefault: true,
          basisFingerprint: packageFingerprint("brick", metric, [brickLength, brickHeight, n(v, "wallDepth"), joint]),
          formula: "ceil(ceil(wall area ÷ ((brick length + joint) × (brick height + joint))) × (1 + waste ÷ 100)).",
          assumptions: ["Module-area estimate for a wall without openings. Confirm end cuts and reusable offcuts before ordering; the gross layout includes the top/right module joint."],
          checks: ["Brick module area is positive.", "Net bricks and waste-adjusted order both round up."],
        }],
      };
    },
  },
};
