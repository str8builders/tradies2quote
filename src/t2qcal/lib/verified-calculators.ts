import {nativeExtraDefinition} from "./native-extra-calculators";
import {balancedSpacing} from "./balanced-spacing";
import { layoutDefinition } from "./layout-calculators";
import { calculatorInputErrors } from "./calculator-inputs";
import type { DiagramKind } from "@/t2qcal/components/calculators/technicalDrawing";
import { roofGeometry } from "./roof-geometry";
import { tubeCutProfile, tubeCutPeak } from "./tube-cut";
import { nativePortDefinition } from "./native";

export type VerifiedUnit = "metric" | "imperial";
/** Mirrors the native FieldKind; the rate/area kinds convert on the unit switch. */
export type FieldKind = "length" | "area" | "volumeRate" | "linearRate" | "cubicFootRate" | "angle" | "count" | "percent" | "money" | "number";
export type FieldOption = { id: number; label: string };
export type CalculatorField = {
  key: string; label: string; default: number; kind?: FieldKind; min?: number; max?: number; step?: number; hint?: string;
  /** A choice field: the value is one of these ids (stored as a count). */
  options?: FieldOption[];
  /** Only shown while `values[key]` is one of `allowed` (native `Field.when`). */
  visibleWhen?: { key: string; allowed: number[] };
};
export type CalculatorResult = { label: string; value: string; primary?: boolean };
/** Mirrors the native ToolHandoff — a quantity the tradie can carry into a quote. */
export type CalculatorHandoff = {
  key: string; label: string; quantity: number; unit: string;
  role: "material" | "work" | "measurement" | "legacy"; includeByDefault: boolean;
  basisFingerprint?: string | null; formula?: string | null; assumptions?: string[]; checks?: string[];
};
export type CalculatorCut = { mm: number; count: number; label: string };
export type CalculatorOutput = {
  errors?: string[]; results: CalculatorResult[]; marks?: string[]; diagramValues?: Record<string, number>;
  handoffs?: CalculatorHandoff[]; cuts?: CalculatorCut[];
};
export type VerifiedDefinition = {
  title: string;
  note: string;
  diagram: DiagramKind;
  sheets?: { label: string; diagram: DiagramKind }[];
  /** False for tools with no assembly to show — converters, constructions, templates. */
  showsAssembly?: boolean;
  /** The 3D model kind when it differs from the default mapping for `diagram` (native `Tool.assembly`). */
  assembly?: DiagramKind;
  fields: CalculatorField[];
  compute: (values: Record<string, number>, unit: VerifiedUnit) => CalculatorOutput;
};

const length = (key: string, label: string, value: number, min = .001, hint?: string): CalculatorField => ({ key, label, default: value, kind: "length", min, hint });
const angle = (key: string, label: string, value: number, min = 0, max = 89.9): CalculatorField => ({ key, label, default: value, kind: "angle", min, max, step: .1 });
const count = (key: string, label: string, value: number, min = 1, max = 1000): CalculatorField => ({ key, label, default: value, kind: "count", min, max, step: 1 });
const percent = (key: string, label: string, value: number): CalculatorField => ({ key, label, default: value, kind: "percent", min: 0, max: 100, step: .5 });
const number = (key: string, label: string, value: number, min = 0): CalculatorField => ({ key, label, default: value, kind: "number", min });
const money = (key: string, label: string, value: number): CalculatorField => ({ key, label, default: value, kind: "money", min: 0, step: .01 });
const safe = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const positive = (value: number, fallback = 1e-9) => Math.max(fallback, safe(value, fallback));
const f = (value: number, digits = 2) => new Intl.NumberFormat("en-NZ", { maximumFractionDigits: digits }).format(safe(value));
const lu = (unit: VerifiedUnit) => unit === "metric" ? "mm" : "in";
const areaUnit = (unit: VerifiedUnit) => unit === "metric" ? "m²" : "ft²";
const volumeUnit = (unit: VerifiedUnit) => unit === "metric" ? "m³" : "ft³";
const areaFromLengths = (area: number, unit: VerifiedUnit) => area / (unit === "metric" ? 1e6 : 144);
const volumeFromLengths = (volume: number, unit: VerifiedUnit) => volume / (unit === "metric" ? 1e9 : 1728);
const L = (value: number, unit: VerifiedUnit, digits = 2) => `${f(value, digits)} ${lu(unit)}`;
const A = (value: number, unit: VerifiedUnit, digits = 3) => `${f(areaFromLengths(value, unit), digits)} ${areaUnit(unit)}`;
const V = (value: number, unit: VerifiedUnit, digits = 4) => `${f(volumeFromLengths(value, unit), digits)} ${volumeUnit(unit)}`;
const radians = (degrees: number) => degrees * Math.PI / 180;

function spacingDefinition(title: string, note: string, memberName = "member"): VerifiedDefinition {
  return {
    title, note, diagram: "spacing", sheets: [{ label: "Plan", diagram: "spacing" }],
    fields: [length("span", "Overall span", 3600), length("memberWidth", `${memberName} width`, 45, 0), length("targetGap", "Target clear gap", 450, 0)],
    compute(v, unit) {
      const span = positive(v.span), width = Math.max(0, v.memberWidth), target = Math.max(0, v.targetGap);
      const layout=balancedSpacing(span,width,target,memberName === "baluster");
      if(!layout)return {errors:["The members and target gaps must fit within the span, with at most 1,000 members."],results:[]};
      const memberCount=layout.count,gap=layout.gap;
      const centres = width + gap;
      const marks = Array.from({ length: Math.min(memberCount, 1000) }, (_, index) => gap + width / 2 + index * centres);
      return { diagramValues: { ...v, count: memberCount, gap }, results: [
        { label: "Balanced clear gap", value: L(gap, unit), primary: true }, { label: `${memberName} count`, value: String(memberCount) },
        { label: "Centre to centre", value: L(centres, unit) }, { label: "Equal end margins", value: L(gap, unit) },
        { label: "Occupied material", value: L(memberCount * width, unit) }, { label: "Open space", value: L((memberCount + 1) * gap, unit) },
      ], marks: marks.map((mark, index) => `${String(index + 1).padStart(2, "0")} · centre ${L(mark, unit)}`) };
    },
  };
}

function roofDefinition(slug: string): VerifiedDefinition {
  if (slug === "soffit-drop") return {
    title: "Soffit and fascia geometry", note: "Sets the horizontal soffit width, roof-line drop and fascia cut from pitch.", diagram: "roof",
    fields: [length("run", "Horizontal overhang", 600), angle("angle", "Roof angle", 30), length("fascia", "Fascia depth", 190, 0)],
    compute(v, unit) { const rise = v.run * Math.tan(radians(v.angle)); const slope = v.run / Math.cos(radians(v.angle)); return { diagramValues: { ...v, rise , model: 2 }, results: [{ label: "Soffit width", value: L(v.run, unit), primary: true }, { label: "Roof-line drop", value: L(rise, unit) }, { label: "Sloping overhang", value: L(slope, unit) }, { label: "Fascia plumb depth", value: L(v.fascia / Math.cos(radians(v.angle)), unit) }, { label: "Pitch", value: `${f(Math.tan(radians(v.angle)) * 12, 3)} : 12` }] }; },
  };
  if (slug === "bullnose-roof") return {
    title: "Bullnose curved roof", note: "Develops a tangent circular eave transition and sheet length.", diagram: "bullnoseprofile", sheets: [{ label: "Profile", diagram: "bullnoseprofile" }, { label: "Roof line", diagram: "roof" }],
    fields: [length("radius", "Curve radius", 900), angle("angle", "Arc sweep", 70, 1, 170), length("straight", "Straight roof length", 2400, 0), length("width", "Roof width", 6000)],
    compute(v, unit) { const arc = v.radius * radians(v.angle); const drop = v.radius * (1 - Math.cos(radians(v.angle))); const projection = v.radius * Math.sin(radians(v.angle)); const sheet = v.straight + arc; return { diagramValues: { ...v, run: projection, rise: drop , model: 3 }, results: [{ label: "Developed sheet length", value: L(sheet, unit), primary: true }, { label: "Curved arc length", value: L(arc, unit) }, { label: "Curve projection", value: L(projection, unit) }, { label: "Curve drop", value: L(drop, unit) }, { label: "Roof surface", value: A(sheet * v.width, unit) }] }; },
  };
  if (slug === "hip-valley-sheet") return {
    title: "Hip and valley sheeting", note: "Sets sheet counts and diagonal cut lengths on a pitched roof plane.", diagram: "roof", sheets: [{ label: "Roof plane", diagram: "roof" }, { label: "Sheet plan", diagram: "sheetlayout" }],
    fields: [length("length", "Roof length", 8000), length("width", "Roof width", 6000), length("sheetWidth", "Sheet cover width", 762), angle("angle", "Roof angle", 30)],
    compute(v, unit) { const slopeWidth = v.width / Math.cos(radians(v.angle)); const sheets = Math.ceil(v.length / positive(v.sheetWidth)); const diagonal = Math.hypot(v.sheetWidth, slopeWidth); return { diagramValues: { ...v, run: v.width, rise: v.width * Math.tan(radians(v.angle)), columns: sheets , model: 5 }, results: [{ label: "Sheet count", value: String(sheets), primary: true }, { label: "Slope sheet length", value: L(slopeWidth, unit) }, { label: "Hip/valley cut edge", value: L(diagonal, unit) }, { label: "Last sheet cover", value: L(v.length - (sheets - 1) * v.sheetWidth, unit) }, { label: "Roof-plane area", value: A(v.length * slopeWidth, unit) }] }; },
  };
  if (slug === "rafter-templates") return {
    title: "Rafter cut template", note: "Calculates plumb, seat and edge lengths for a full-scale cutting reference.", diagram: "roof",
    fields: [length("run", "Roof run", 3000), angle("angle", "Roof angle", 30), length("depth", "Rafter depth", 190), length("seat", "Seat width", 90)],
    compute(v, unit) { const rise = v.run * Math.tan(radians(v.angle)); const rafter = v.run / Math.cos(radians(v.angle)); const plumb = v.depth / Math.cos(radians(v.angle)); const bird = v.seat * Math.tan(radians(v.angle)); return { diagramValues: { ...v, rise }, results: [{ label: "Rafter line", value: L(rafter, unit), primary: true }, { label: "Plumb-cut face", value: L(plumb, unit) }, { label: "Seat width", value: L(v.seat, unit) }, { label: "Birdsmouth plumb", value: L(bird, unit) }, { label: "Saw angle from square", value: `${f(90 - v.angle, 2)}°` }] }; },
  };
  const hip = slug === "hip-roof"; const lean = slug === "lean-to-roof"; const gambrel = slug === "gambrel-roof"; const saltbox = slug === "saltbox-roof";
  return {
    title: hip ? "Hip roof geometry" : lean ? "Lean-to roof geometry" : gambrel ? "Gambrel roof geometry" : saltbox ? "Saltbox roof geometry" : "Gable roof geometry",
    note: "Generates plan, profile, member lengths, roof area and running rafter set-out.", diagram: "roof", sheets: [{ label: "Profile", diagram: "roof" }, { label: "Framing plan", diagram: "roofplan" }, { label: "Member detail", diagram: "raftercut" }],
    fields: [length("length", "Wall length", 8000), length("width", "Wall width", 6000), angle("angle", "Main roof angle", 30, 1, 75), ...(gambrel || saltbox ? [angle("angle2", "Secondary roof angle", gambrel ? 60 : 22, 1, 80)] : []), length("overhang", "Horizontal overhang", 450, 0), length("spacing", "Rafter spacing", 600)],
    compute(v, unit) {
      const g = roofGeometry(slug, v.length, v.width, v.angle, v.angle2 ?? v.angle, v.overhang, v.spacing);
      const marks = Array.from({ length: Math.min(g.positions, 1000) }, (_, i) => i * g.actualSpacing);
      return { diagramValues: { ...v, ...g, roofArea: g.area, count: g.positions, oneSide: lean ? 1 : 0, roofType: hip ? 1 : lean ? 2 : gambrel ? 3 : saltbox ? 4 : 0 }, results: [
        { label: hip ? "Common rafter" : "Rafter length", value: L(g.member, unit), primary: true },
        { label: "Roof rise", value: L(g.rise, unit) }, { label: "Tail length", value: L(g.tail, unit) },
        { label: hip ? "Hip rafter" : "Ridge length", value: L(hip ? g.hipLength : g.ridge, unit) },
        { label: "Rafter positions", value: String(g.positions) }, { label: "Roof surface", value: A(g.area, unit) },
        { label: "Pitch", value: `${f(Math.tan(radians(v.angle)) * 12, 3)} : 12` },
        { label: "Stock length", value: L(g.member + g.tail, unit) },
        { label: "Actual rafter centres", value: L(g.actualSpacing, unit) },
        ...(saltbox ? [{ label: "Second rafter", value: L(g.secondMember, unit) }, { label: "Second stock length", value: L(g.secondMember + g.secondTail, unit) }, { label: "Main run", value: L(g.run, unit) }, { label: "Second run", value: L(g.run2, unit) }] : []),
        ...(g.positions > 1000 ? [{ label: "Set-out preview", value: "First 1,000 positions; reduce the run for a complete list" }] : []),
      ], marks: marks.map((mark, i) => `${String(i + 1).padStart(2, "0")} · ${L(mark, unit)}`) };
    },
  };
}

function stairDefinition(slug: string): VerifiedDefinition {
  if (slug === "spiral-stairs") return {
    title: "Spiral stair geometry", note: "Balances tread rotation and rise around the centre column with a walk-line going.", diagram: "spiralplan", sheets: [{ label: "Tread plan", diagram: "spiralplan" }, { label: "Rise", diagram: "stairs" }],
    fields: [length("totalRise", "Floor-to-floor rise", 2800), length("diameter", "Outside diameter", 1800), length("column", "Column diameter", 150), count("count", "Number of risers", 16, 3, 40), length("walkLine", "Walk-line radius", 600)],
    compute(v, unit) { const risers = Math.max(3, Math.round(v.count)); const rise = v.totalRise / risers; const turn = 360 / risers; const going = 2 * Math.PI * v.walkLine / risers; const inner = Math.PI * v.column / risers; return { diagramValues: { ...v, segments: risers, risers }, results: [{ label: "Actual rise", value: L(rise, unit), primary: true }, { label: "Rotation per tread", value: `${f(turn, 3)}°` }, { label: "Walk-line going", value: L(going, unit) }, { label: "Inner going", value: L(inner, unit) }, { label: "Tread count", value: String(risers - 1) }, { label: "Total rotation", value: `${f(turn * (risers - 1), 2)}°` }] }; },
  };
  if (slug === "steel-spine-stairs") return {
    title: "Steel spine stair", note: "Sets equal tread brackets and spine length from total rise and going.", diagram: "stairs",
    fields: [length("totalRise", "Total rise", 2800), length("going", "Tread going", 270), count("count", "Riser count", 16, 2, 40), length("width", "Tread width", 1000)],
    compute(v, unit) { const risers = Math.max(2, Math.round(v.count)); const rise = v.totalRise / risers; const totalRun = (risers - 1) * v.going; const spine = (risers - 1) * Math.hypot(rise, v.going); const angleValue = Math.atan2(rise, v.going) * 180 / Math.PI; return { diagramValues: { ...v, risers, totalRun , model: 1 }, results: [{ label: "Spine centre length", value: L(spine, unit), primary: true }, { label: "Actual rise", value: L(rise, unit) }, { label: "Total run", value: L(totalRun, unit) }, { label: "Spine angle", value: `${f(angleValue, 3)}°` }, { label: "Bracket count", value: String(risers - 1) }, { label: "Clear half tread", value: L(v.width / 2, unit) }] }; },
  };
  return {
    title: "Angled stair panel layout", note: "Calculates diminishing panel heights along a stair pitch.", diagram: "stairs",
    fields: [length("totalRise", "Panel rise", 2400), length("run", "Panel run", 3600), count("count", "Equal panels", 6, 1, 30), length("rail", "Rail/stile width", 70, 0)],
    compute(v, unit) { const panels = Math.max(1, Math.round(v.count)); const pitch = Math.atan2(v.totalRise, v.run); const step = v.run / panels; const sloping = Math.hypot(v.totalRise, v.run); const marks = Array.from({ length: panels + 1 }, (_, i) => ({ x: i * step, y: i * step * Math.tan(pitch) })); return { diagramValues: { ...v, risers: panels, count: panels , model: 3 }, results: [{ label: "Slope rail length", value: L(sloping, unit), primary: true }, { label: "Panel pitch", value: `${f(pitch * 180 / Math.PI, 3)}°` }, { label: "Horizontal module", value: L(step, unit) }, { label: "Rise per panel", value: L(v.totalRise / panels, unit) }, { label: "Plumb stile cut", value: `${f(90 - pitch * 180 / Math.PI, 2)}°` }], marks: marks.map((m, i) => `${String(i + 1).padStart(2, "0")} · run ${L(m.x, unit)} · rise ${L(m.y, unit)}`) }; },
  };
}

function masonryDefinition(slug: string): VerifiedDefinition {
  if (slug === "slab-edge-beams") return {
    title: "Slab with edge beams", note: "Combines the slab body and four thickened edge beams without double-counting slab thickness.", diagram: "edgebeamplan",
    fields: [length("length", "Slab length", 6000), length("width", "Slab width", 4000), length("thickness", "Slab thickness", 100), length("beamWidth", "Edge beam width", 300), length("beamDepth", "Total beam depth", 450), percent("waste", "Order allowance", 8)],
    compute(v, unit) { const slab = v.length * v.width * v.thickness; const perimeter = 2 * (v.length + v.width); const beamArea = v.length * v.width - Math.max(0, v.length - 2 * v.beamWidth) * Math.max(0, v.width - 2 * v.beamWidth); const beam = beamArea * Math.max(0, v.beamDepth - v.thickness); const net = slab + beam; const order = net * (1 + v.waste / 100); return { diagramValues: { ...v, rows: 6, columns: 9 , model: 1 }, results: [{ label: "Order volume", value: V(order, unit), primary: true }, { label: "Net concrete", value: V(net, unit) }, { label: "Slab body", value: V(slab, unit) }, { label: "Edge beam addition", value: V(beam, unit) }, { label: "Perimeter", value: L(perimeter, unit) }, { label: "Plan area", value: A(v.length * v.width, unit) }] }; },
  };
  if (slug === "circular-block-wall") return {
    title: "Circular block wall", note: "Calculates units, subtended angle and tapered joint geometry around a circular wall.", diagram: "blockring",
    fields: [length("diameter", "Wall centre diameter", 6000), length("blockLength", "Block length", 390), length("joint", "Nominal joint", 10, 0), count("courses", "Courses", 10, 1, 100)],
    compute(v, unit) { const circumference = Math.PI * v.diameter; const perCourse = Math.max(3, Math.round(circumference / positive(v.blockLength + v.joint))); const moduleWidth = circumference / perCourse; const joint = moduleWidth - v.blockLength; const unitAngle = 360 / perCourse; return { diagramValues: { ...v, count: perCourse , model: 4 }, results: [{ label: "Blocks per course", value: String(perCourse), primary: true }, { label: "Total blocks", value: String(perCourse * Math.round(v.courses)) }, { label: "Actual joint", value: L(joint, unit) }, { label: "Unit angle", value: `${f(unitAngle, 4)}°` }, { label: "Centre circumference", value: L(circumference, unit) }, { label: "Half cut angle", value: `${f(unitAngle / 2, 4)}°` }] }; },
  };
  if (slug === "masonry-arch") return {
    title: "Masonry arch", note: "Divides a semicircular arch ring into equal voussoirs and calculates taper angles.", diagram: "arch",
    fields: [length("span", "Clear span", 1800), length("ringDepth", "Arch ring depth", 230), count("count", "Voussoir count", 17, 3, 99), length("joint", "Joint at intrados", 10, 0)],
    compute(v, unit) { const units = Math.max(3, Math.round(v.count)); const innerR = v.span / 2; const outerR = innerR + v.ringDepth; const angleValue = 180 / units; const innerArc = Math.PI * innerR / units; const outerArc = Math.PI * outerR / units; return { diagramValues: { ...v, rise: innerR }, results: [{ label: "Voussoir wedge angle", value: `${f(angleValue, 4)}°`, primary: true }, { label: "Inner face module", value: L(innerArc, unit) }, { label: "Outer face module", value: L(outerArc, unit) }, { label: "Inner brick width", value: L(Math.max(0, innerArc - v.joint), unit) }, { label: "Outer taper growth", value: L(outerArc - innerArc, unit) }, { label: "Arch rise", value: L(innerR, unit) }] }; },
  };
  if (slug === "starter-bars") return withDiagram(spacingDefinition("Starter bar alignment", "Places starter bars on block-core centres with equal end adjustment.", "bar"), "rebarplan", [{ label: "Plan", diagram: "rebarplan" }, { label: "Bar shape", diagram: "barbend" }], { both: 0, model: 3 });
  if (slug === "brick-gauge") return {
    title: "Brick gauge and bond", note: "Balances course gauge and horizontal bond modules against the available dimensions.", diagram: "masonry",
    fields: [length("height", "Wall height", 2700), length("brickHeight", "Brick height", 76), length("length", "Wall length", 6000), length("brickLength", "Brick length", 230), length("targetJoint", "Target joint", 10, 0)],
    compute(v, unit) { const courses = Math.max(1, Math.round(v.height / positive(v.brickHeight + v.targetJoint))); const bed = (v.height - courses * v.brickHeight) / Math.max(courses - 1, 1); const modules = Math.max(1, Math.round(v.length / positive(v.brickLength + v.targetJoint))); const perp = (v.length - modules * v.brickLength) / Math.max(modules - 1, 1); return { diagramValues: { ...v, rows: courses, columns: modules , model: 1 }, results: [{ label: "Course count", value: String(courses), primary: true }, { label: "Actual bed joint", value: L(bed, unit) }, { label: "Horizontal modules", value: String(modules) }, { label: "Actual perp joint", value: L(perp, unit) }, { label: "Course gauge", value: L(v.height / courses, unit) }, { label: "Half-bond offset", value: L((v.brickLength + perp) / 2, unit) }] }; },
  };
  return {
    title: "Concrete block quantities", note: "Calculates block count by modular wall area, including openings and waste.", diagram: "masonry",
    fields: [length("length", "Wall length", 6000), length("height", "Wall height", 2400), length("blockLength", "Block length", 390), length("blockHeight", "Block height", 190), length("joint", "Joint", 10, 0), number("openingArea", "Openings area (m²/ft²)", 2), percent("waste", "Waste allowance", 5)],
    compute(v, unit) { const gross = areaFromLengths(v.length * v.height, unit); const net = Math.max(0, gross - v.openingArea); const moduleArea = areaFromLengths((v.blockLength + v.joint) * (v.blockHeight + v.joint), unit); const netBlocks = Math.ceil(net / positive(moduleArea)); const order = Math.ceil(netBlocks * (1 + v.waste / 100)); const rows = Math.max(1, Math.floor(v.height / positive(v.blockHeight + v.joint))); return { diagramValues: { ...v, rows, columns: Math.ceil(v.length / positive(v.blockLength + v.joint)) }, results: [{ label: "Order quantity", value: `${order} blocks`, primary: true }, { label: "Net blocks", value: String(netBlocks) }, { label: "Gross wall area", value: `${f(gross, 3)} ${areaUnit(unit)}` }, { label: "Net wall area", value: `${f(net, 3)} ${areaUnit(unit)}` }, { label: "Courses", value: String(rows) }, { label: "Allowance", value: `${order - netBlocks} blocks` }] }; },
  };
}

function tubeDefinition(slug: string): VerifiedDefinition {
  if (slug === "tube-bend") return {
    title: "Tube bend set-out", note: "Calculates centre-line arc, tangent set-back and outside/inside developed lengths.", diagram: "bendarc", sheets: [{ label: "Bend set-out", diagram: "bendarc" }, { label: "Wrap", diagram: "tube" }],
    fields: [length("diameter", "Tube outside diameter", 60), length("radius", "Centre-line radius", 180), angle("angle", "Bend angle", 90, 0, 180), length("straight", "Straight each side", 300, 0)],
    compute(v, unit) { const rad = radians(v.angle); const arc = v.radius * rad; const tangent = v.radius * Math.tan(rad / 2); const outer = (v.radius + v.diameter / 2) * rad; const inner = Math.max(0, v.radius - v.diameter / 2) * rad; return { diagramValues: { ...v , model: 4 }, results: [{ label: "Centre-line bend allowance", value: L(arc, unit), primary: true }, { label: "Tangent set-back", value: L(tangent, unit) }, { label: "Outer arc", value: L(outer, unit) }, { label: "Inner arc", value: L(inner, unit) }, { label: "Total developed centre-line", value: L(arc + 2 * v.straight, unit) }] }; },
  };
  if (slug === "pie-cut-bend") return {
    title: "Pie-cut tube bend", note: "Divides a total bend into equal welded wedges and gives the per-cut angle.", diagram: "piecutwedges", sheets: [{ label: "Wedges", diagram: "piecutwedges" }, { label: "Bend", diagram: "bendarc" }],
    fields: [length("diameter", "Tube diameter", 76), length("radius", "Target bend radius", 250), angle("angle", "Total bend", 90, 0, 180), count("count", "Pie segments", 6, 1, 40)],
    compute(v, unit) { const segments = Math.max(1, Math.round(v.count)); const included = v.angle / segments; const saw = included / 2; const arc = v.radius * radians(v.angle); const chord = 2 * v.radius * Math.sin(radians(included) / 2); return { diagramValues: { ...v , model: 5 }, results: [{ label: "Saw cut angle", value: `${f(saw, 4)}°`, primary: true }, { label: "Included angle per pie", value: `${f(included, 4)}°` }, { label: "Centre-line arc", value: L(arc, unit) }, { label: "Segment chord", value: L(chord, unit) }, { label: "Weld seams", value: String(Math.max(0, segments - 1)) }] }; },
  };
  if (slug === "round-square-reducer") return {
    title: "Round-to-square reducer", note: "Develops transition slant dimensions from a round inlet to a square outlet.", diagram: "reducerelev", sheets: [{ label: "Elevation", diagram: "reducerelev" }, { label: "Development", diagram: "cone" }],
    fields: [length("diameter", "Round diameter", 600), length("square", "Square side", 450), length("height", "Transition height", 700)],
    compute(v, unit) { const radial = Math.abs(v.diameter / 2 - v.square / 2); const faceSlant = Math.hypot(v.height, radial); const cornerRadial = Math.abs(v.diameter / 2 - v.square / Math.sqrt(2)); const cornerSlant = Math.hypot(v.height, cornerRadial); const perimeters = Math.PI * v.diameter + 4 * v.square; const area = perimeters / 2 * (faceSlant + cornerSlant) / 2; return { diagramValues: { ...v, bottomDiameter: v.diameter, topDiameter: v.square, slant: cornerSlant , model: 1 }, results: [{ label: "Corner slant", value: L(cornerSlant, unit), primary: true }, { label: "Face slant", value: L(faceSlant, unit) }, { label: "Round circumference", value: L(Math.PI * v.diameter, unit) }, { label: "Square perimeter", value: L(4 * v.square, unit) }, { label: "Approx. sheet area", value: A(area, unit) }] }; },
  };
  if (slug === "square-tube-miter" || slug === "three-way-joint") return {
    title: slug === "three-way-joint" ? "Three-way tube joint" : "Square tube miter", note: "Calculates equal-joint saw settings, long point and short point offsets.",
    diagram: slug === "three-way-joint" ? "threewayjoint" : "sqtubemiter",
    sheets: slug === "three-way-joint"
      ? [{ label: "Hub", diagram: "threewayjoint" }, { label: "Arm end", diagram: "tubeend" }]
      : [{ label: "Faces", diagram: "sqtubemiter" }, { label: "Joint", diagram: "miterend" }],
    fields: [length("width", "Section width", 50), length("height", "Section depth", 50), angle("angle", "Included joint angle", 90, 1, 179)],
    compute(v, unit) { const cut = (180 - v.angle) / 2; const offsetW = v.width * Math.tan(radians(cut)); const offsetH = v.height * Math.tan(radians(cut)); return { diagramValues: { ...v, diameter: v.width, model: slug === "three-way-joint" ? 3 : 6 }, results: [{ label: "Miter saw angle", value: `${f(cut, 4)}°`, primary: true }, { label: "Width-face offset", value: L(offsetW, unit) }, { label: "Depth-face offset", value: L(offsetH, unit) }, { label: "Included joint", value: `${f(v.angle, 3)}°` }, { label: "Long diagonal", value: L(Math.hypot(v.width, offsetW), unit) }] }; },
  };
  const through = slug === "tube-through-sheet"; const miter = slug === "tube-miter";
  return {
    title: through ? "Tube through sloped sheet" : miter ? "Round tube miter" : "Round tube notch", note: "Generates a full-circumference wrap set-out with angular cut depths and plot stations.", diagram: "tube", sheets: [{ label: "Wrap template", diagram: "tube" }, { label: "End view", diagram: through ? "sheetpierce" : miter ? "miterend" : "tubeend" }],
    fields: [length("diameter", "Cut tube diameter", 60), length("parentDiameter", through ? "Sheet reference width" : "Parent tube diameter", through ? 300 : 90), angle("angle", through ? "Sheet angle" : "Intersection angle", 45, 1, 179), count("stations", "Plot stations", 24, 8, 96)],
    compute(v, unit) { const wrap = Math.PI * v.diameter; const cut = (180 - v.angle) / 2; const jointKind = through ? 2 : miter ? 1 : 0; const depthAt = tubeCutProfile(jointKind, v.diameter, v.parentDiameter, v.angle); const maxDepth = tubeCutPeak(depthAt); const station = wrap / Math.max(8, Math.round(v.stations)); const marks = Array.from({ length: Math.round(v.stations) + 1 }, (_, i) => { const theta = i / Math.round(v.stations) * Math.PI * 2; return `${String(i + 1).padStart(2, "0")} · wrap ${L(i * station, unit)} · depth ${L(depthAt(theta), unit)}`; }); return { diagramValues: { ...v, tubeDiameter: v.diameter, jointKind, model: jointKind }, results: [{ label: "Wrap circumference", value: L(wrap, unit), primary: true }, { label: "Maximum cut depth", value: L(maxDepth, unit) }, { label: "Station spacing", value: L(station, unit) }, { label: "Saw reference angle", value: `${f(cut, 3)}°` }, { label: "Plot points", value: String(marks.length) }], marks }; },
  };
}


function circleDefinition(slug: string): VerifiedDefinition {
  if (slug === "cone-pattern") return {
    title: "Cone and frustum pattern", note: "Uses true radial development to flatten a cone or frustum for printing and fabrication.", diagram: "cone",
    fields: [length("bottomDiameter", "Bottom diameter", 900), length("topDiameter", "Top diameter", 300, 0), length("height", "Vertical height", 800), length("seam", "Seam allowance", 20, 0)],
    compute(v, unit) { const deltaR = Math.max(.001, (v.bottomDiameter - v.topDiameter) / 2); const slant = Math.hypot(v.height, deltaR); const outer = slant * v.bottomDiameter / positive(v.bottomDiameter - v.topDiameter); const inner = outer - slant; const sweep = 360 * v.bottomDiameter / positive(2 * outer); const area = Math.PI * (outer * outer - inner * inner) * sweep / 360; return { diagramValues: { ...v, slant }, results: [{ label: "Pattern sweep", value: `${f(sweep, 4)}°`, primary: true }, { label: "Slant height", value: L(slant, unit) }, { label: "Outer pattern radius", value: L(outer, unit) }, { label: "Inner pattern radius", value: L(inner, unit) }, { label: "Net sheet area", value: A(area, unit) }, { label: "Seam edge", value: L(slant + v.seam, unit) }] }; },
  };
  if (slug === "oval-template") return {
    title: "True ellipse template", note: "Calculates ellipse axes, foci and an accurate Ramanujan perimeter for layout.", diagram: "ovalplan",
    fields: [length("diameter", "Major axis", 1600), length("minor", "Minor axis", 1000)],
    compute(v, unit) { const a = v.diameter / 2, b = v.minor / 2, c = Math.sqrt(Math.max(0, a * a - b * b)); const h = (a - b) ** 2 / (a + b) ** 2; const perimeter = Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h))); return { diagramValues: { ...v, count: 4 , model: 8 }, results: [{ label: "Ellipse perimeter", value: L(perimeter, unit), primary: true }, { label: "Focal distance from centre", value: L(c, unit) }, { label: "Major radius", value: L(a, unit) }, { label: "Minor radius", value: L(b, unit) }, { label: "Foci separation", value: L(2 * c, unit) }] }; },
  };
  if (slug === "arc-template") return {
    title: "Large-radius arc template", note: "Solves an arc from span and rise, including radius, chord angle and arc length.", diagram: "arch",
    fields: [length("span", "Chord span", 2400), length("rise", "Arc rise", 400)],
    compute(v, unit) { const radius = v.span * v.span / positive(8 * v.rise) + v.rise / 2; const theta = 2 * Math.asin(Math.min(1, v.span / (2 * radius))); const arc = radius * theta; return { diagramValues: { ...v , model: 1 }, results: [{ label: "Arc radius", value: L(radius, unit), primary: true }, { label: "Arc length", value: L(arc, unit) }, { label: "Included angle", value: `${f(theta * 180 / Math.PI, 4)}°` }, { label: "Half chord", value: L(v.span / 2, unit) }, { label: "Centre below chord", value: L(radius - v.rise, unit) }] }; },
  };
  if (slug === "diameter-tape") return {
    title: "Direct-reading diameter tape", note: "Maps diameter increments to circumference positions for a printable wrap tape.", diagram: "tapewrap", sheets: [{ label: "Tape", diagram: "tapewrap" }, { label: "Reference scale", diagram: "scale" }],
    fields: [length("diameter", "Maximum diameter", 1000), length("increment", "Diameter increment", 10), length("overlap", "Tape overlap", 50, 0)],
    compute(v, unit) { const wrap = Math.PI * v.diameter; const step = Math.PI * v.increment; const ticks = Math.floor(v.diameter / positive(v.increment)) + 1; return { diagramValues: { ...v, value: v.diameter , model: 7 }, results: [{ label: "Tape length", value: L(wrap + v.overlap, unit), primary: true }, { label: "Maximum circumference", value: L(wrap, unit) }, { label: "Tick spacing", value: L(step, unit) }, { label: "Numbered ticks", value: String(ticks) }, { label: "Overlap", value: L(v.overlap, unit) }] }; },
  };
  const protractor = slug === "protractor"; const bolt = slug === "bolt-circle"; const divider = slug === "circle-divider";
  return {
    title: protractor ? "Custom-size protractor" : bolt ? "Bolt-circle drill template" : divider ? "Circle divider" : "Full-scale circle template",
    note: "Creates exact angular divisions, chord dimensions, centre marks and a print-ready circular set-out.",
    // three tools share this arithmetic but none of the drawings: the divider
    // steps a chord, the bolt circle drills holes, the template strikes the
    // curve off ordinates
    diagram: bolt ? "boltring" : divider ? "dividerstep" : "circlequad",
    sheets: bolt ? [{ label: "Bolt circle", diagram: "boltring" as const }]
      : divider ? [{ label: "Stepping the chord", diagram: "dividerstep" as const }]
      : [{ label: "Ordinates", diagram: "circlequad" as const }],
    fields: [length("diameter", bolt ? "Pitch circle diameter" : "Diameter", 1200), count("count", protractor ? "Degree increment" : bolt ? "Hole count" : "Equal divisions", protractor ? 5 : 12, protractor ? 1 : 3, 360), ...(bolt ? [length("holeDiameter", "Hole diameter", 12)] : [])],
    compute(v, unit) { const divisions = Math.max(protractor ? 1 : 3, Math.round(v.count)); const countValue = protractor ? Math.floor(180 / divisions) + 1 : divisions; const radius = v.diameter / 2; const angleValue = protractor ? divisions : 360 / divisions;
      const discModel = bolt ? 3 : divider ? 1 : 2; const chord = 2 * radius * Math.sin(radians(angleValue) / 2); return { diagramValues: { ...v, count: Math.min(72, countValue), model: discModel }, results: [{ label: protractor ? "Major marks" : "Division chord", value: protractor ? String(countValue) : L(chord, unit), primary: true }, { label: "Radius", value: L(radius, unit) }, { label: "Circumference", value: L(Math.PI * v.diameter, unit) }, { label: "Angle increment", value: `${f(angleValue, 4)}°` }, { label: "Half miter", value: `${f(angleValue / 2, 4)}°` }, ...(bolt ? [{ label: "Hole edge clearance", value: L(Math.max(0, chord - v.holeDiameter) / 2, unit) }] : [])] }; },
  };
}

function deckDefinition(slug: string): VerifiedDefinition {
  if (slug === "arched-fence") return {
    title: "Arched fence paling heights", note: "Calculates every paling height along a circular segment from chord and rise.", diagram: "arch",
    fields: [length("span", "Fence span", 3600), length("baseHeight", "Spring height", 1200), length("rise", "Arch rise", 450), count("count", "Paling count", 21, 3, 99)],
    compute(v, unit) { const n = Math.max(3, Math.round(v.count)); const radius = v.span * v.span / positive(8 * v.rise) + v.rise / 2; const offset = radius - v.rise; const marks = Array.from({ length: n }, (_, i) => { const x = -v.span / 2 + i * v.span / (n - 1); return v.baseHeight + Math.sqrt(Math.max(0, radius * radius - x * x)) - offset; }); return { diagramValues: { ...v , model: 2 }, results: [{ label: "Centre paling", value: L(Math.max(...marks), unit), primary: true }, { label: "End paling", value: L(marks[0], unit) }, { label: "Arc radius", value: L(radius, unit) }, { label: "Paling centres", value: L(v.span / (n - 1), unit) }, { label: "Paling count", value: String(n) }], marks: marks.map((height, i) => `${String(i + 1).padStart(2, "0")} · ${L(height, unit)}`) }; },
  };
  if (slug === "gazebo") return {
    title: "Polygon gazebo roof and floor", note: "Solves regular-polygon perimeter, floor area, roof hip length and segment angle.", diagram: "circle", sheets: [{ label: "Plan", diagram: "circle" }, { label: "Roof", diagram: "roof" }],
    fields: [length("diameter", "Across-corners diameter", 4000), count("count", "Number of sides", 8, 3, 16), angle("angle", "Roof angle", 30)],
    compute(v, unit) { const sides = Math.max(3, Math.round(v.count)); const radius = v.diameter / 2; const side = 2 * radius * Math.sin(Math.PI / sides); const apothem = radius * Math.cos(Math.PI / sides); const floorArea = sides * side * apothem / 2; const hip = radius / Math.cos(radians(v.angle)); return { diagramValues: { ...v, polygon: 1, run: radius, rise: radius * Math.tan(radians(v.angle)) , model: 4 }, results: [{ label: "Roof hip length", value: L(hip, unit), primary: true }, { label: "Side length", value: L(side, unit) }, { label: "Floor area", value: A(floorArea, unit) }, { label: "Perimeter", value: L(sides * side, unit) }, { label: "Corner angle", value: `${f((sides - 2) * 180 / sides, 3)}°` }, { label: "Roof rise", value: L(radius * Math.tan(radians(v.angle)), unit) }] }; },
  };
  if (slug === "deck-subframe") return {
    title: "Deck subframe", note: "Counts boards, joists, bearers and support points from cover widths and maximum centres.", diagram: "deck",
    fields: [length("length", "Deck length", 6000), length("width", "Deck width", 4000), length("boardWidth", "Board width", 140), length("gap", "Board gap", 5, 0), length("joistSpacing", "Joist max centres", 450), length("bearerSpacing", "Bearer max centres", 1800)],
    compute(v, unit) { const boards = Math.ceil((v.width + v.gap) / positive(v.boardWidth + v.gap)); const joists = Math.ceil(v.length / positive(v.joistSpacing)) + 1; const bearers = Math.ceil(v.width / positive(v.bearerSpacing)) + 1; const boardLength = boards * v.length; const joistLength = joists * v.width; return { diagramValues: { ...v, count: joists, spacing: v.joistSpacing }, results: [{ label: "Deck boards", value: String(boards), primary: true }, { label: "Joists", value: String(joists) }, { label: "Bearers", value: String(bearers) }, { label: "Board lineal total", value: L(boardLength, unit) }, { label: "Joist lineal total", value: L(joistLength, unit) }, { label: "Deck area", value: A(v.length * v.width, unit) }] }; },
  };
  if (slug === "deck-boards") return {
    title: "Deck board layout", note: "Balances full boards and equal edge cuts across the deck width.", diagram: "deck",
    fields: [length("length", "Board run length", 6000), length("width", "Deck width", 4000), length("boardWidth", "Board width", 140), length("gap", "Gap", 5, 0), percent("waste", "Waste allowance", 10), money("rate", "Price per lineal unit", 8)],
    compute(v, unit) { const boards = Math.max(1, Math.ceil((v.width + v.gap) / positive(v.boardWidth + v.gap))); const edges = Math.max(0, (v.width - (boards - 2) * v.boardWidth - (boards - 1) * v.gap) / 2); const lineal = boards * v.length * (1 + v.waste / 100); const linealBase = lineal / (unit === "metric" ? 1000 : 12); return { diagramValues: { ...v, count: boards, span: v.width, gap: v.gap , model: 1 }, results: [{ label: "Board count", value: String(boards), primary: true }, { label: "Equal edge boards", value: L(edges, unit) }, { label: "Order lineal length", value: `${f(linealBase, 2)} ${unit === "metric" ? "m" : "ft"}` }, { label: "Deck area", value: A(v.length * v.width, unit) }, { label: "Estimated material", value: `$${f(linealBase * v.rate, 2)}` }] }; },
  };
  if (slug === "fence-rails") return {
    title: "Paling fence rails", note: "Counts bays, rails, palings and running post positions for a straight fence.", diagram: "balusters", sheets: [{ label: "Elevation", diagram: "balusters" }, { label: "Post housing", diagram: "postmortise" }],
    fields: [length("span", "Fence length", 12000), length("bay", "Maximum post bay", 2400), count("rails", "Rails per bay", 2, 1, 6), length("palingWidth", "Paling width", 100), length("gap", "Paling gap", 10, 0)],
    compute(v, unit) { const bays = Math.ceil(v.span / positive(v.bay)); const actualBay = v.span / bays; const posts = bays + 1; const palings = Math.ceil((v.span + v.gap) / positive(v.palingWidth + v.gap)); return { diagramValues: { ...v, count: posts, gap: 0, spacing: actualBay, center: actualBay, panel: 1, memberWidth: 0 }, results: [{ label: "Post count", value: String(posts), primary: true }, { label: "Actual bay", value: L(actualBay, unit) }, { label: "Rail pieces", value: String(bays * Math.round(v.rails)) }, { label: "Paling count", value: String(palings) }, { label: "Rail lineal total", value: L(v.span * Math.round(v.rails), unit) }] }; },
  };
  return withDiagram(spacingDefinition("Fence posts and panels", "Balances fence bays and gives post centres with equal panel widths.", "post"), "fencebay", [{ label: "Bay elevation", diagram: "fencebay" }, { label: "Plan", diagram: "fenceplan" }], { panel: 1, model: 3 });
}

function converterDefinition(slug: string): VerifiedDefinition {
  if (slug === "fraction-decimal") return {
    title: "Fraction and decimal", note: "Converts a decimal inch to its nearest practical fractional increment and back.", diagram: "rulerin", showsAssembly: false, sheets: [{ label: "Inch rule", diagram: "rulerin" }, { label: "Halving down", diagram: "sixteenthrule" }],
    fields: [number("value", "Decimal inches", 0.6875), count("denominator", "Maximum denominator", 64, 2, 256)],
    compute(v) { const d = Math.max(2, Math.round(v.denominator)); const numerator = Math.round(v.value * d); const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : Math.abs(a); const divisor = gcd(numerator, d) || 1; const n = numerator / divisor, den = d / divisor; const error = v.value - numerator / d; return { diagramValues: { ...v }, results: [{ label: "Nearest fraction", value: `${n}/${den} in`, primary: true }, { label: "Rounded decimal", value: `${f(numerator / d, 8)} in` }, { label: "Rounding error", value: `${f(error, 8)} in` }, { label: "Millimetres", value: `${f(v.value * 25.4, 5)} mm` }] }; },
  };
  if (slug === "image-scale") return {
    title: "Scale from image", note: "Recovers any real dimension using one known feature measured in the same image.", diagram: "scaledraw", showsAssembly: false, sheets: [{ label: "From the image", diagram: "scaledraw" }, { label: "Reference scale", diagram: "scale" }],
    fields: [length("known", "Known real length", 2400), number("knownPixels", "Known image length", 820, .001), number("measuredPixels", "Target image length", 475)],
    compute(v, unit) { const scale = v.known / positive(v.knownPixels); const real = v.measuredPixels * scale; return { diagramValues: { ...v, value: v.known }, results: [{ label: "Recovered real length", value: L(real, unit), primary: true }, { label: "Scale per image unit", value: `${f(scale, 8)} ${lu(unit)}` }, { label: "Image ratio", value: `1 : ${f(1 / positive(scale), 6)}` }, { label: "Target / reference", value: `${f(v.measuredPixels / positive(v.knownPixels) * 100, 3)}%` }] }; },
  };
  if (slug === "bubble-level") return {
    title: "Bubble level and grade", note: "Converts a measured rise and run to angle, percent grade and pitch.", diagram: "levelvial", showsAssembly: false, sheets: [{ label: "Vial", diagram: "levelvial" }, { label: "Fall", diagram: "fallsection" }],
    fields: [length("rise", "Rise", 20, 0), length("run", "Run", 1000)],
    compute(v, unit) { const ratio = v.rise / positive(v.run); return { diagramValues: { ...v }, results: [{ label: "Angle", value: `${f(Math.atan(ratio) * 180 / Math.PI, 5)}°`, primary: true }, { label: "Percent grade", value: `${f(ratio * 100, 4)}%` }, { label: "Pitch", value: `${f(ratio * 12, 4)} : 12` }, { label: "Slope length", value: L(Math.hypot(v.rise, v.run), unit) }, { label: "Rise per metre/foot", value: L(ratio * (unit === "metric" ? 1000 : 12), unit) }] }; },
  };
  const configs = {
    "length-converter": { title: "Length converter", factors: [1, 1 / 25.4], labels: ["millimetres", "inches"] },
    "area-converter": { title: "Area converter", factors: [1, 10.7639104167], labels: ["square metres", "square feet"] },
    "volume-converter": { title: "Volume converter", factors: [1, 35.3146667215], labels: ["cubic metres", "cubic feet"] },
    "weight-converter": { title: "Weight converter", factors: [1, 2.20462262185], labels: ["kilograms", "pounds"] },
  } as const;
  const cfg = configs[slug as keyof typeof configs] || configs["length-converter"];
  const kindIndex = slug === "area-converter" ? 2 : slug === "volume-converter" ? 3 : slug === "weight-converter" ? 4 : 1;
  return { title: cfg.title, note: `Converts ${cfg.labels[0]} to ${cfg.labels[1]} and common job-site equivalents.`, diagram: "dualscale", showsAssembly: false,
    sheets: [{ label: "Scales", diagram: "dualscale" }, { label: slug === "area-converter" ? "Square units" : slug === "volume-converter" ? "Cubic units" : slug === "weight-converter" ? "Balance" : "Both rules", diagram: slug === "area-converter" ? "areasquares" : slug === "volume-converter" ? "volumecubes" : slug === "weight-converter" ? "scalepan" : "rulerpair" }],
    fields: [number("value", `Value in ${cfg.labels[0]}`, 1)], compute(v) { const target = v.value * cfg.factors[1] / cfg.factors[0]; return { diagramValues: { ...v, convKind: kindIndex, factor: cfg.factors[1] }, results: [{ label: cfg.labels[1], value: f(target, 8), primary: true }, { label: cfg.labels[0], value: f(v.value, 8) }, { label: "Conversion factor", value: f(cfg.factors[1], 10) }, { label: "Reverse factor", value: f(1 / cfg.factors[1], 10) }] }; } };
}

function geometryDefinition(slug: string): VerifiedDefinition {
  if (slug === "golden-ratio") return { title: "Golden ratio", note: "Generates the related short, long and whole dimensions from one known long side.", diagram: "goldenspiral", showsAssembly: false, sheets: [{ label: "Spiral", diagram: "goldenspiral" }, { label: "Divided line", diagram: "goldenline" }], fields: [length("length", "Long dimension", 1000)], compute(v, unit) { const phi = (1 + Math.sqrt(5)) / 2; return { diagramValues: { ...v, width: v.length, height: v.length / phi }, results: [{ label: "Whole", value: L(v.length * phi, unit), primary: true }, { label: "Long", value: L(v.length, unit) }, { label: "Short", value: L(v.length / phi, unit) }, { label: "Golden ratio", value: f(phi, 12) }] }; } };
  if (slug === "pyramid") return { title: "Square pyramid", note: "Solves slant height, face edge, surface area and volume from base and vertical height.", diagram: "pyramidplan", fields: [length("width", "Square base side", 2000), length("height", "Vertical height", 1800)], compute(v, unit) { const slant = Math.hypot(v.height, v.width / 2); const edge = Math.hypot(v.height, v.width / Math.sqrt(2)); const lateral = 2 * v.width * slant; const volume = v.width * v.width * v.height / 3; return { diagramValues: { ...v, run: v.width / 2, rise: v.height }, results: [{ label: "Face slant height", value: L(slant, unit), primary: true }, { label: "Apex-to-corner edge", value: L(edge, unit) }, { label: "Lateral surface", value: A(lateral, unit) }, { label: "Base area", value: A(v.width * v.width, unit) }, { label: "Volume", value: V(volume, unit) }, { label: "Face angle", value: `${f(Math.atan2(v.height, v.width / 2) * 180 / Math.PI, 3)}°` }] }; } };
  if (slug === "gothic-arch") return { title: "Gothic pointed arch", note: "Locates two-centre arch points and radius for a symmetrical pointed opening.", diagram: "arch", fields: [length("span", "Opening span", 1800), length("rise", "Rise above spring", 1200)], compute(v, unit) { const half = v.span / 2; const centreOffset = (v.rise * v.rise - half * half) / positive(2 * half); const radius = half + centreOffset; return { diagramValues: { ...v , model: 3 }, results: [{ label: "Arc radius", value: L(Math.abs(radius), unit), primary: true }, { label: "Centre offset", value: L(centreOffset, unit) }, { label: "Apex height", value: L(v.rise, unit) }, { label: "Half span", value: L(half, unit) }, { label: "Spring-to-apex angle", value: `${f(Math.atan2(v.rise, half + centreOffset) * 180 / Math.PI, 3)}°` }] }; } };
  if (slug === "curved-molding") return { title: "Curved molding segments", note: "Divides a circular molding into equal straight segments and gives each miter setting.", diagram: "segmentarc", fields: [length("diameter", "Curve diameter", 2400), angle("sweep", "Arc sweep", 180, 1, 360), count("count", "Segments", 12, 2, 100)], compute(v, unit) { const n = Math.max(2, Math.round(v.count)); const per = v.sweep / n; const chord = 2 * (v.diameter / 2) * Math.sin(radians(per) / 2); const arc = Math.PI * v.diameter * v.sweep / 360; return { diagramValues: { ...v, segments: n , model: 6 }, results: [{ label: "Segment chord", value: L(chord, unit), primary: true }, { label: "Miter each end", value: `${f(per / 2, 4)}°` }, { label: "Arc per segment", value: L(arc / n, unit) }, { label: "Total arc length", value: L(arc, unit) }, { label: "Included turn", value: `${f(per, 4)}°` }] }; } };
  if (slug === "compound-miter") return { title: "Compound miter", note: "Calculates saw-table miter and blade bevel for two equal-sloped pieces meeting at an included plan angle.", diagram: "miterjoint", fields: [angle("planAngle", "Included plan angle", 90, 1, 179), angle("slope", "Piece slope", 35, 0, 89)], compute(v) { const p = radians(v.planAngle / 2), s = radians(v.slope); const miter = Math.atan(Math.sin(p) / positive(Math.tan(s))) * 180 / Math.PI; const bevel = Math.asin(Math.cos(p) * Math.cos(s)) * 180 / Math.PI; return { diagramValues: { ...v, run: 1000, rise: 1000 * Math.tan(s), model: 4 }, results: [{ label: "Saw table miter", value: `${f(miter, 4)}°`, primary: true }, { label: "Blade bevel", value: `${f(bevel, 4)}°` }, { label: "Plan half-angle", value: `${f(v.planAngle / 2, 4)}°` }, { label: "Piece slope", value: `${f(v.slope, 4)}°` }] }; } };
  const square = slug === "square-up"; return { title: square ? "Square-up diagonal" : "Diagonal bracing", note: "Uses exact right-triangle geometry to verify a rectangle or size a diagonal brace.", diagram: "bracedframe", showsAssembly: false,
    sheets: square ? [{ label: "Frame", diagram: "bracedframe" }, { label: "3-4-5 check", diagram: "diagcheck" }] : [{ label: "Frame", diagram: "bracedframe" }, { label: "End cut", diagram: "bracecut" }], fields: [length("width", square ? "Rectangle width" : "Horizontal run", 4000), length("height", square ? "Rectangle length" : "Vertical rise", 3000), ...(square ? [length("measured", "Measured second diagonal", 5000)] : [])], compute(v, unit) { const diagonal = Math.hypot(v.width, v.height); const angleValue = Math.atan2(v.height, v.width) * 180 / Math.PI; return { diagramValues: { ...v, run: v.width, rise: v.height }, results: [{ label: square ? "Correct diagonal" : "Brace length", value: L(diagonal, unit), primary: true }, { label: "Brace angle", value: `${f(angleValue, 4)}°` }, { label: "Complementary cut", value: `${f(90 - angleValue, 4)}°` }, { label: "Perimeter", value: L(2 * (v.width + v.height), unit) }, { label: "Area", value: A(v.width * v.height, unit) }, ...(square ? [{ label: "Diagonal error", value: L(v.measured - diagonal, unit) }] : [])] }; } };
}

function materialDefinition(slug: string): VerifiedDefinition {
  if (slug === "circular-paving") return { title: "Circular paving", note: "Calculates circular area, ring circumference and paver quantity with waste.", diagram: "paving", fields: [length("diameter", "Paved diameter", 5000), length("paverLength", "Paver length", 200), length("paverWidth", "Paver width", 100), percent("waste", "Waste allowance", 10)], compute(v, unit) { const area = Math.PI * v.diameter * v.diameter / 4; const paverArea = v.paverLength * v.paverWidth; const net = Math.ceil(area / positive(paverArea)); const order = Math.ceil(net * (1 + v.waste / 100)); return { diagramValues: { ...v, count: Math.min(48, Math.ceil(Math.PI * v.diameter / positive(v.paverLength))) , model: 5 }, results: [{ label: "Order quantity", value: `${order} pavers`, primary: true }, { label: "Net pavers", value: String(net) }, { label: "Paved area", value: A(area, unit) }, { label: "Outer circumference", value: L(Math.PI * v.diameter, unit) }, { label: "Waste pieces", value: String(order - net) }] }; } };
  if (slug === "timber-volume") return { title: "Timber linear to cubic", note: "Converts a timber section and total lineal length to solid volume and optional cost.", diagram: "timberstack", fields: [length("width", "Section width", 90), length("height", "Section depth", 45), length("length", "Total lineal length", 24000), money("rate", "Price per cubic unit", 1200)], compute(v, unit) { const volume = volumeFromLengths(v.width * v.height * v.length, unit); return { diagramValues: { ...v, rows: 4, columns: 9 }, results: [{ label: "Solid volume", value: `${f(volume, 5)} ${volumeUnit(unit)}`, primary: true }, { label: "Cross-section area", value: A(v.width * v.height, unit, 6) }, { label: "Lineal length", value: L(v.length, unit) }, { label: "Estimated material", value: `$${f(volume * v.rate, 2)}` }] }; } };
  if (slug === "board-foot") return { title: "Lumber board-foot price", note: "Uses the North American board-foot definition: thickness × width × length in inches divided by 144.", diagram: "timberstack", fields: [length("thickness", "Thickness", 50.8), length("width", "Width", 203.2), length("length", "Length", 2438.4), count("count", "Piece count", 10), money("rate", "Price per 1000 board feet", 2400)], compute(v, unit) { const pieces = Math.max(1, Math.round(v.count)); const per = v.thickness * v.width * v.length / (144 * (unit === "metric" ? 25.4 ** 3 : 1)); const total = per * pieces; return { diagramValues: { ...v, columns: pieces, rows: 2 }, results: [{ label: "Total board feet", value: `${f(total, 3)} bd ft`, primary: true }, { label: "Per piece", value: `${f(per, 3)} bd ft` }, { label: "Price per piece", value: `$${f(per * v.rate / 1000, 2)}` }, { label: "Total price", value: `$${f(total * v.rate / 1000, 2)}` }] }; } };
  if (slug === "weatherboard") return { title: "Weatherboard cladding", note: "Balances course cover, overlap, board length and waste for a rectangular wall.", diagram: "cladding", fields: [length("length", "Wall length", 6000), length("height", "Wall height", 2700), length("boardWidth", "Board width", 180), length("overlap", "Overlap", 30, 0), percent("waste", "Waste allowance", 10)], compute(v, unit) { const cover = positive(v.boardWidth - v.overlap); const courses = Math.ceil(v.height / cover); const actualCover = v.height / courses; const lineal = courses * v.length * (1 + v.waste / 100); return { diagramValues: { ...v, rows: courses, columns: 8 , model: 3 }, results: [{ label: "Course count", value: String(courses), primary: true }, { label: "Actual cover", value: L(actualCover, unit) }, { label: "Actual overlap", value: L(v.boardWidth - actualCover, unit) }, { label: "Order lineal length", value: L(lineal, unit) }, { label: "Wall area", value: A(v.length * v.height, unit) }] }; } };
  if (slug === "floor-area") return { title: "Floor area", note: "Calculates rectangular floor area, perimeter and diagonal from entered dimensions.", diagram: "roomplan", fields: [length("length", "Room length", 6000), length("width", "Room width", 4000), percent("waste", "Material allowance", 10)], compute(v, unit) { const area = v.length * v.width; return { diagramValues: { ...v, rows: 6, columns: 9 , model: 5 }, results: [{ label: "Order area", value: A(area * (1 + v.waste / 100), unit), primary: true }, { label: "Net floor area", value: A(area, unit) }, { label: "Perimeter", value: L(2 * (v.length + v.width), unit) }, { label: "Diagonal", value: L(Math.hypot(v.length, v.width), unit) }, { label: "Allowance area", value: A(area * v.waste / 100, unit) }] }; } };
  return { title: "Tile quantity and cost", note: "Calculates floor area, net tile quantity, boxes, waste and budget.", diagram: "sheetlayout", fields: [length("length", "Floor length", 6000), length("width", "Floor width", 4000), length("tileLength", "Tile length", 600), length("tileWidth", "Tile width", 600), count("boxQty", "Tiles per box", 4), percent("waste", "Waste allowance", 10), money("boxPrice", "Price per box", 55)], compute(v, unit) { const area = v.length * v.width; const tileArea = v.tileLength * v.tileWidth; const net = Math.ceil(area / positive(tileArea)); const order = Math.ceil(net * (1 + v.waste / 100)); const boxes = Math.ceil(order / Math.max(1, Math.round(v.boxQty))); return { diagramValues: { ...v, rows: Math.ceil(v.length / v.tileLength), columns: Math.ceil(v.width / v.tileWidth) , model: 4 }, results: [{ label: "Boxes to order", value: String(boxes), primary: true }, { label: "Tiles to order", value: String(boxes * Math.round(v.boxQty)) }, { label: "Net tile count", value: String(net) }, { label: "Floor area", value: A(area, unit) }, { label: "Estimated tile cost", value: `$${f(boxes * v.boxPrice, 2)}` }] }; } };
}

/// Re-dresses a definition with the sheet family that actually shows its
/// subject — a balustrade elevation, a stud wall, a rebar plan — while the
/// compute underneath stays the shared, verified one.
function withDiagram(def: VerifiedDefinition, diagram: DiagramKind, sheets: { label: string; diagram: DiagramKind }[], flags: Record<string, number> = {}): VerifiedDefinition {
  return {
    ...def, diagram, sheets,
    compute: (v, unit) => { const o = def.compute(v, unit); return { ...o, diagramValues: { ...(o.diagramValues || {}), ...flags } }; },
  };
}

function tradeDefinition(slug: string): VerifiedDefinition {
  if (slug === "post-holes") return {
    title: "Post holes and concrete", note: "Concrete per hole and for the run, with the set-out of the post centres.", diagram: "postholes",
    fields: [count("count", "Number of posts", 6, 2, 60), length("diameter", "Hole diameter", 300), length("depth", "Hole depth", 600), length("spacing", "Post centres", 1800)],
    compute(v, unit) { const holes = Math.max(2, Math.round(v.count)); const r = v.diameter / 2; const each = Math.PI * r * r * v.depth; const total = each * holes; const run = (holes - 1) * v.spacing; const m3 = unit === "metric" ? total / 1e9 : total * 0.000016387064; const bags = Math.ceil(m3 / 0.011); return { diagramValues: { ...v, span: run , model: 4 }, results: [{ label: "Total concrete", value: V(total, unit), primary: true }, { label: "Concrete per hole", value: V(each, unit) }, { label: "20 kg bags (approx.)", value: String(bags) }, { label: "Overall run", value: L(run, unit) }, { label: "Hole plan area", value: A(Math.PI * r * r, unit) }] }; },
  };
  if (slug === "quote-markup") return {
    title: "Quote markup and GST", note: "Builds a quoted price from cost, markup and GST, with the margin on sell.", diagram: "moneybar",
    fields: [money("cost", "Job cost", 1000), percent("markup", "Markup", 30), percent("gst", "GST", 15)],
    compute(v) { const markupAmt = v.cost * v.markup / 100; const sub = v.cost + markupAmt; const gstAmt = sub * v.gst / 100; const total = sub + gstAmt; const margin = sub > 0 ? markupAmt / sub * 100 : 0; return { diagramValues: { ...v, value: total }, results: [{ label: "Quote total (incl. GST)", value: `$${f(total, 2)}`, primary: true }, { label: "Subtotal (excl. GST)", value: `$${f(sub, 2)}` }, { label: "Markup", value: `$${f(markupAmt, 2)}` }, { label: "GST content", value: `$${f(gstAmt, 2)}` }, { label: "Margin on sell", value: `${f(margin, 2)}%` }] }; },
  };
  if (slug === "paint-coverage") return {
    title: "Paint coverage", note: "Litres and cans for a wall from area, coats and the paint's spread rate.", diagram: "paintwall",
    fields: [length("length", "Wall length", 12000), length("height", "Wall height", 2400), count("coats", "Coats", 2, 1, 6), number("coverage", "Coverage per litre (m²)", 11, 1)],
    compute(v, unit) { const area = v.length * v.height; const m2 = unit === "metric" ? area / 1e6 : area * 0.00064516; const litres = m2 * Math.round(v.coats) / positive(v.coverage); const cans = Math.ceil(litres / 4); return { diagramValues: { ...v, rows: 6, columns: 9 , model: 5 }, results: [{ label: "Paint needed", value: `${f(litres, 2)} L`, primary: true }, { label: "Wall area", value: A(area, unit) }, { label: "Coats", value: String(Math.round(v.coats)) }, { label: "4 L cans", value: String(cans) }] }; },
  };
  if (slug === "plasterboard") return {
    title: "Plasterboard sheets", note: "Sheet count for a wall or ceiling, with fixings and compound estimated.", diagram: "sheetlayout",
    fields: [length("length", "Wall length", 6000), length("height", "Wall height", 2400), length("sheetLength", "Sheet length", 2400), length("sheetWidth", "Sheet width", 1200), percent("waste", "Waste allowance", 10)],
    compute(v, unit) { const area = v.length * v.height; const net = Math.ceil(area / positive(v.sheetLength * v.sheetWidth)); const order = Math.ceil(net * (1 + v.waste / 100)); const m2 = unit === "metric" ? area / 1e6 : area * 0.00064516; return { diagramValues: { ...v, rows: Math.ceil(v.height / positive(v.sheetWidth)), columns: Math.ceil(v.length / positive(v.sheetLength)) , model: 3 }, results: [{ label: "Sheets to order", value: String(order), primary: true }, { label: "Net sheets", value: String(net) }, { label: "Wall area", value: A(area, unit) }, { label: "Screws (approx.)", value: String(order * 32) }, { label: "Compound (approx.)", value: `${f(m2 * 0.4, 1)} kg` }] }; },
  };
  if (slug === "concrete-bags") return {
    title: "Concrete by the bag", note: "Bagged-mix count for small pours, from the pour size and the bag's yield.", diagram: "slabpour",
    fields: [length("length", "Pour length", 2000), length("width", "Pour width", 1000), length("thickness", "Thickness", 100), number("bagYield", "Bag yield (m³)", 0.011, 0.001)],
    compute(v, unit) { const vol = v.length * v.width * v.thickness; const m3 = unit === "metric" ? vol / 1e9 : vol * 0.000016387064; const bags = Math.ceil(m3 / positive(v.bagYield)); return { diagramValues: { ...v, bags, rows: 3, columns: 5 , model: 0 }, results: [{ label: "Bags needed", value: String(bags), primary: true }, { label: "Net volume", value: V(vol, unit) }, { label: "Plan area", value: A(v.length * v.width, unit) }, { label: "Mixed weight (approx.)", value: `${f(m3 * 2400, 0)} kg` }] }; },
  };
  if (slug === "access-ramp") return {
    title: "Access ramp", note: "Run, length and angle for a ramp built to a gradient rule like 1:14.", diagram: "rampside",
    fields: [length("rise", "Total rise", 450, 0), number("gradient", "Gradient 1 in", 14, 1)],
    compute(v, unit) { const run = v.rise * v.gradient; const len = Math.hypot(v.rise, run); const angle = Math.atan2(v.rise, positive(run)) * 180 / Math.PI; return { diagramValues: { ...v, run , model: 2 }, results: [{ label: "Required run", value: L(run, unit), primary: true }, { label: "Ramp length", value: L(len, unit) }, { label: "Angle", value: `${f(angle, 2)}°` }, { label: "Grade", value: `${f(v.rise / positive(run) * 100, 2)}%` }, { label: "Gradient", value: `1 : ${f(v.gradient, 0)}` }] }; },
  };
  if (slug === "excavation") return {
    title: "Excavation and truck loads", note: "Bank and loose volumes with truck loads, from the dig size and swell.", diagram: "trench",
    fields: [length("length", "Dig length", 6000), length("width", "Dig width", 4000), length("depth", "Dig depth", 300), percent("swell", "Swell factor", 25), number("truck", "Truck capacity (m³)", 6, 0.5)],
    compute(v, unit) { const bank = v.length * v.width * v.depth; const m3 = unit === "metric" ? bank / 1e9 : bank * 0.000016387064; const loose = m3 * (1 + v.swell / 100); const loads = Math.ceil(loose / positive(v.truck)); return { diagramValues: { ...v, rows: 4, columns: 8 , model: 4 }, results: [{ label: "Loose volume", value: `${f(loose, 3)} m³`, primary: true }, { label: "Bank volume", value: V(bank, unit) }, { label: "Truck loads", value: String(loads) }, { label: "Plan area", value: A(v.length * v.width, unit) }, { label: "Depth", value: L(v.depth, unit) }] }; },
  };
  if (slug === "strip-footing") return {
    title: "Strip footing", note: "Concrete volume for a footing trench, with readymix and bag equivalents.", diagram: "trench",
    fields: [length("length", "Footing length", 12000), length("width", "Footing width", 300), length("depth", "Footing depth", 300)],
    compute(v, unit) { const vol = v.length * v.width * v.depth; const m3 = unit === "metric" ? vol / 1e9 : vol * 0.000016387064; return { diagramValues: { ...v, concrete: 1, rows: 2, columns: 9 , model: 6 }, results: [{ label: "Net volume", value: V(vol, unit), primary: true }, { label: "Readymix order (+5%)", value: `${f(m3 * 1.05, 2)} m³` }, { label: "20 kg bags (approx.)", value: String(Math.ceil(m3 / 0.011)) }, { label: "Trench wall area", value: A(v.length * v.depth * 2, unit) }] }; },
  };
  if (slug === "brick-quantities") return {
    title: "Brick quantities", note: "Bricks by modular wall area with courses, joints and waste.", diagram: "masonry",
    fields: [length("length", "Wall length", 6000), length("height", "Wall height", 2400), length("brickLength", "Brick length", 230), length("brickHeight", "Brick height", 76), length("joint", "Joint", 10, 0), percent("waste", "Waste allowance", 5)],
    compute(v, unit) { const gross = areaFromLengths(v.length * v.height, unit); const moduleArea = areaFromLengths((v.brickLength + v.joint) * (v.brickHeight + v.joint), unit); const net = Math.ceil(gross / positive(moduleArea)); const order = Math.ceil(net * (1 + v.waste / 100)); const rows = Math.max(1, Math.floor(v.height / positive(v.brickHeight + v.joint))); return { diagramValues: { ...v, rows, columns: Math.ceil(v.length / positive(v.brickLength + v.joint)), courseHeight: v.brickHeight + v.joint, memberWidth: v.brickLength, gap: v.joint , model: 1 }, results: [{ label: "Order quantity", value: `${order} bricks`, primary: true }, { label: "Net bricks", value: String(net) }, { label: "Wall area", value: `${f(gross, 3)} ${areaUnit(unit)}` }, { label: "Courses", value: String(rows) }, { label: "Allowance", value: `${order - net} bricks` }] }; },
  };
  if (slug === "insulation-batts") return {
    title: "Insulation batts", note: "Batts and packs for a wall or ceiling area with waste.", diagram: "sheetlayout",
    fields: [length("length", "Area length", 6000), length("height", "Area width", 2400), length("battLength", "Batt length", 1160), length("battWidth", "Batt width", 580), count("pack", "Batts per pack", 10), percent("waste", "Waste allowance", 8)],
    compute(v, unit) { const area = v.length * v.height; const net = Math.ceil(area / positive(v.battLength * v.battWidth)); const order = Math.ceil(net * (1 + v.waste / 100)); const packs = Math.ceil(order / Math.max(1, Math.round(v.pack))); return { diagramValues: { ...v, rows: Math.ceil(v.height / positive(v.battWidth)), columns: Math.ceil(v.length / positive(v.battLength)) , model: 6 }, results: [{ label: "Packs to order", value: String(packs), primary: true }, { label: "Batts to order", value: String(order) }, { label: "Net batts", value: String(net) }, { label: "Area", value: A(area, unit) }] }; },
  };
  if (slug === "wallpaper-rolls") return {
    title: "Wallpaper rolls", note: "Drops and rolls for a run of wall from roll size and wall height.", diagram: "cladding",
    fields: [length("span", "Wall run (total)", 14000), length("height", "Wall height", 2400), length("rollLength", "Roll length", 10050), length("rollWidth", "Roll width", 530)],
    compute(v, unit) { const drops = Math.ceil(v.span / positive(v.rollWidth)); const perRoll = Math.max(1, Math.floor(v.rollLength / positive(v.height))); const rolls = Math.ceil(drops / perRoll); return { diagramValues: { ...v, vertical: 1, count: Math.min(40, drops), memberWidth: v.rollWidth, gap: 0 , model: 7 }, results: [{ label: "Rolls to order", value: String(rolls), primary: true }, { label: "Drops", value: String(drops) }, { label: "Drops per roll", value: String(perRoll) }, { label: "Wall area", value: A(v.span * v.height, unit) }] }; },
  };
  if (slug === "decking-screws") return {
    title: "Decking screws", note: "Fixings from the board and joist grid, in boxes.", diagram: "deck",
    fields: [length("length", "Deck length", 6000), length("width", "Deck width", 4000), length("boardWidth", "Board width", 140), length("gap", "Board gap", 5, 0), length("joistSpacing", "Joist centres", 450), count("perJunction", "Screws per junction", 2, 1, 4), count("box", "Screws per box", 500, 50, 5000)],
    compute(v, _unit) { const boards = Math.ceil((v.width + v.gap) / positive(v.boardWidth + v.gap)); const joists = Math.ceil(v.length / positive(v.joistSpacing)) + 1; const screws = boards * joists * Math.round(v.perJunction); const boxes = Math.ceil(screws / Math.max(50, Math.round(v.box))); const centres = v.length / Math.max(joists - 1, 1); return { diagramValues: { ...v, span: v.length, count: joists, spacing: centres, center: centres , model: 2 }, results: [{ label: "Screws needed", value: String(screws), primary: true }, { label: "Boxes", value: String(boxes) }, { label: "Boards", value: String(boards) }, { label: "Joists", value: String(joists) }, { label: "Junctions", value: String(boards * joists) }] }; },
  };
  if (slug === "soil-mulch") return {
    title: "Soil and mulch", note: "Cubic metres, bags and approximate tonnes for a spread area.", diagram: "slabpour",
    fields: [length("length", "Area length", 5000), length("width", "Area width", 3000), length("depth", "Spread depth", 100), count("bagLitres", "Bag size (litres)", 25, 5, 100)],
    compute(v, unit) { const vol = v.length * v.width * v.depth; const m3 = unit === "metric" ? vol / 1e9 : vol * 0.000016387064; const bags = Math.ceil(m3 * 1000 / Math.max(5, Math.round(v.bagLitres))); return { diagramValues: { ...v, bags, rows: 4, columns: 7 , model: 7 }, results: [{ label: "Volume", value: `${f(m3, 2)} m³`, primary: true }, { label: "Bags", value: String(bags) }, { label: "Approx. weight", value: `${f(m3 * 1.4, 2)} t` }, { label: "Area", value: A(v.length * v.width, unit) }] }; },
  };
  return {
    title: "Skirting and trim", note: "Lineal metres of trim around a room, less door openings, in stock lengths.", diagram: "roomplan",
    fields: [length("length", "Room length", 4000), length("width", "Room width", 3000), count("doors", "Door openings", 1, 0, 20), length("doorWidth", "Door width", 820), length("stock", "Stock length", 5400), percent("waste", "Waste allowance", 10)],
    compute(v, unit) { const perimeter = 2 * (v.length + v.width); const net = Math.max(0, perimeter - Math.round(v.doors) * v.doorWidth); const order = net * (1 + v.waste / 100); const sticks = Math.ceil(order / positive(v.stock)); return { diagramValues: { ...v, rows: 4, columns: 6 , model: 9 }, results: [{ label: "Lineal to order", value: L(order, unit), primary: true }, { label: "Net lineal", value: L(net, unit) }, { label: "Stock lengths", value: String(sticks) }, { label: "Perimeter", value: L(perimeter, unit) }] }; },
  };
}

const tradeSlugs = new Set(["post-holes", "quote-markup", "paint-coverage", "plasterboard", "concrete-bags", "access-ramp", "excavation", "skirting", "strip-footing", "brick-quantities", "insulation-batts", "wallpaper-rolls", "decking-screws", "soil-mulch"]);

const spacingSlugs = new Set(["baluster-spacing", "board-batten", "glass-panels", "wainscoting", "shelf-spacing", "opening-layout", "kerf-bending", "rebar-spacing", "fastener-spacing"]);
const roofSlugs = new Set(["hip-roof", "gable-roof", "lean-to-roof", "gambrel-roof", "saltbox-roof", "rafter-templates", "soffit-drop", "hip-valley-sheet", "bullnose-roof"]);
const stairSlugs = new Set(["spiral-stairs", "steel-spine-stairs", "stair-panels"]);
const masonrySlugs = new Set(["slab-edge-beams", "block-quantities", "circular-block-wall", "masonry-arch", "starter-bars", "brick-gauge"]);
const tubeSlugs = new Set(["tube-notch", "tube-miter", "tube-through-sheet", "tube-bend", "pie-cut-bend", "round-square-reducer", "square-tube-miter", "three-way-joint"]);
const circleSlugs = new Set(["protractor", "circle-divider", "circle-template", "arc-template", "oval-template", "cone-pattern", "bolt-circle", "diameter-tape"]);
const deckSlugs = new Set(["deck-subframe", "deck-boards", "fence-panels", "arched-fence", "fence-rails", "gazebo"]);
const converterSlugs = new Set(["length-converter", "area-converter", "volume-converter", "weight-converter", "image-scale", "fraction-decimal", "bubble-level"]);
const geometrySlugs = new Set(["square-up", "golden-ratio", "pyramid", "gothic-arch", "curved-molding", "diagonal-brace", "compound-miter"]);
const materialSlugs = new Set(["floor-area", "tile-quantity", "weatherboard", "circular-paving", "timber-volume", "board-foot"]);

function rawDefinition(slug: string): VerifiedDefinition {
  // One-for-one ports of the native calculators win over the older web ones.
  const ported = nativePortDefinition(slug); if (ported) return ported;
  const nativeExtra=nativeExtraDefinition(slug);if(nativeExtra)return nativeExtra;
  const layout = layoutDefinition(slug);
  if (layout) return layout;
  if (spacingSlugs.has(slug)) {
    const base = spacingDefinition(slug === "baluster-spacing" ? "Baluster spacing" : slug === "board-batten" ? "Board and batten layout" : slug === "glass-panels" ? "Glass panel layout" : slug === "wainscoting" ? "Wainscoting layout" : slug === "shelf-spacing" ? "Shelf and drawer spacing" : slug === "opening-layout" ? "Opening layout" : slug === "kerf-bending" ? "Kerf bending set-out" : slug === "rebar-spacing" ? "Rebar spacing" : "Fastener set-out", "Balances the field into equal gaps and produces a running centre-mark list.", slug === "rebar-spacing" ? "bar" : slug === "baluster-spacing" ? "baluster" : "member");
    // Each trade's tool draws its own subject, not the generic spacing plan.
    if (slug === "baluster-spacing") return withDiagram(base, "balusters", [{ label: "Elevation", diagram: "balusters" }, { label: "Rail section", diagram: "railsection" }], { model: 1 });
    // a balustrade panel is a sheet of glass, not a 45 mm stick
    if (slug === "glass-panels") return withDiagram({ ...base, fields: [length("span", "Overall span", 3600), length("memberWidth", "member width", 1000, 0), length("targetGap", "Target clear gap", 20, 0)] }, "glasspanel", [{ label: "Elevation", diagram: "glasspanel" }, { label: "Spigot plan", diagram: "glassplan" }], { panel: 1, model: 4 });
    if (slug === "board-batten") return withDiagram(base, "cladding", [{ label: "Elevation", diagram: "cladding" }, { label: "Section", diagram: "battensection" }], { vertical: 1, model: 2 });
    if (slug === "opening-layout") return withDiagram(base, "studwall", [{ label: "Framing", diagram: "studwall" }, { label: "Head detail", diagram: "openingdetail" }], { opening: 1, model: 2 });
    if (slug === "kerf-bending") return withDiagram(base, "kerf", [{ label: "Section", diagram: "kerf" }, { label: "Bent", diagram: "kerfbent" }], { model: 1 });
    if (slug === "rebar-spacing") return withDiagram(base, "rebarplan", [{ label: "Plan", diagram: "rebarplan" }, { label: "Slab section", diagram: "barsection" }], { both: 1, model: 2 });
    if (slug === "wainscoting") return withDiagram({ ...base, fields: [length("span", "Wall length", 3600), length("memberWidth", "Stile width", 45, 0), length("targetGap", "Target panel width", 450, 0), length("height", "Height to cap", 1000)] }, "wainscotelev", [{ label: "Elevation", diagram: "wainscotelev" }, { label: "Section", diagram: "wainscotsection" }], { model: 7 });
    if (slug === "shelf-spacing") return withDiagram(base, "shelfbay", [{ label: "Elevation", diagram: "shelfbay" }, { label: "Side section", diagram: "shelfsection" }], { model: 6 });
    if (slug === "fastener-spacing") return withDiagram(base, "fastenrow", [{ label: "Fixing run", diagram: "fastenrow" }, { label: "Edge distance", diagram: "fastendetail" }], { model: 5 });
    return base;
  }
  if (slug === "wall-framing") return withDiagram({ ...spacingDefinition("Wall framing quantities", "Balances stud centres and estimates plates and noggins.", "stud"), fields: [length("span", "Wall length", 6000), length("memberWidth", "Stud width", 45), length("targetGap", "Maximum stud centres", 600), length("height", "Wall height", 2400), count("plates", "Plate runs", 3, 2, 4)] }, "studwall", [{ label: "Framing", diagram: "studwall" }, { label: "Plate mark-out", diagram: "platemark" }], { model: 8 });
  if (tradeSlugs.has(slug)) return tradeDefinition(slug);
  if (roofSlugs.has(slug)) return roofDefinition(slug);
  if (stairSlugs.has(slug)) return stairDefinition(slug);
  if (masonrySlugs.has(slug)) return masonryDefinition(slug);
  if (tubeSlugs.has(slug)) return tubeDefinition(slug);
  if (slug === "protractor") {
    const base = circleDefinition(slug);
    return { ...base, diagram: "protractorface", showsAssembly: false, sheets: [{ label: "Face", diagram: "protractorface" }, { label: "Angle set-out", diagram: "anglelegs" }], compute: (v, unit) => { const o = base.compute(v, unit); return { ...o, diagramValues: { ...(o.diagramValues || {}), tick: Math.max(1, Math.round(v.count)) } }; } };
  }
  if (circleSlugs.has(slug)) return circleDefinition(slug);
  if (deckSlugs.has(slug)) return deckDefinition(slug);
  if (converterSlugs.has(slug)) return converterDefinition(slug);
  if (geometrySlugs.has(slug)) return geometryDefinition(slug);
  if (materialSlugs.has(slug)) return materialDefinition(slug);
  throw new Error(`Unknown calculator: ${slug}`);
}

export function expectedVerifiedSlugs() {
  return [...spacingSlugs, "wall-framing", ...tradeSlugs, ...roofSlugs, ...stairSlugs, ...masonrySlugs, ...tubeSlugs, ...circleSlugs, ...deckSlugs, ...converterSlugs, ...geometrySlugs, ...materialSlugs];
}

/** Validate before allocating set-out arrays or presenting a cutting dimension. */
export function getVerifiedDefinition(slug: string): VerifiedDefinition {
  if(slug==="plan-takeoff")return {title:"Plan measurement",note:"Reopen Plan takeoff to change marked points or calibration.",diagram:"rulerin",showsAssembly:false,fields:[{key:"quantity",label:"Measured quantity",default:1,kind:"number",min:0.000001,max:1e9}],compute:values=>({results:[{label:"Measured quantity",value:String(values.quantity)}]})};
  const definition = rawDefinition(slug);
  const isPort = nativePortDefinition(slug) !== null;
  return { ...definition, compute(values, unit) {
    const errors = calculatorInputErrors(definition.fields, values, unit);
    // The cross-checks below belong to the older web definitions; a native
    // port carries the native app's own guards inside its compute.
    if(!isPort && slug === "wallpaper-rolls" && values.height > values.rollLength) errors.push("The roll must be long enough for one full-height drop. Choose a longer roll or calculate a seamed layout separately.");
    if (!isPort && slug === "tube-notch" && values.diameter > values.parentDiameter) errors.push("Branch diameter must not exceed the parent tube diameter for this coping template.");
    if (!isPort && slug === "opening-layout" && (values.openLeft < 3 * values.memberWidth || values.openLeft + values.openWidth + 3 * values.memberWidth > values.span || values.openBottom + values.openHeight + values.headerDepth > values.height - (values.plates - 1) * values.memberWidth || (values.openBottom > 0 && values.openBottom < 2 * values.memberWidth) || values.targetGap <= values.memberWidth || values.span / values.targetGap > 1000)) errors.push("The opening, header, king studs and plates must fit inside the wall. Keep stud centres larger than timber thickness (up to 1,000 bays).");
    if (!isPort && slug === "wall-framing" && (values.height <= values.plates * values.memberWidth || values.targetGap <= values.memberWidth || values.span <= values.memberWidth)) errors.push("Wall height must exceed plate thickness; stud centres must exceed timber thickness.");
    if (!isPort && slug === "rebar-spacing" && (Math.min(values.span, values.width) <= 2 * values.cover + values.memberWidth || values.targetGap < values.memberWidth)) errors.push("The bars and edge cover must fit inside the slab, with centres at least the bar diameter.");
    if (!isPort && slug === "kerf-bending" && (values.skin >= values.thickness || values.radius <= values.thickness)) errors.push("Remaining skin must be less than board thickness, and outside radius must exceed board thickness.");
    if (!isPort && slug === "weatherboard" && values.overlap >= values.boardWidth) errors.push("Overlap must be smaller than board width.");
    if (!isPort && slug === "hip-roof" && values.width > values.length) errors.push("Wall length must be the longer side for a hip roof. Swap length and width.");
    if (!isPort && slug === "spiral-stairs" && (values.walkLine <= values.column / 2 || values.walkLine >= values.diameter / 2)) errors.push("The walk line must be between the column and the outside edge.");
    if (!isPort && definition.fields.some(f => f.key === "memberWidth") && values.memberWidth > values.span) errors.push("Member width cannot exceed the overall span.");
    if (!isPort && values.memberWidth === 0 && values.targetGap === 0) errors.push("Enter a positive member width or clear gap.");
    if (errors.length) return { errors, results: errors.map((value, i) => ({ label: `Check input ${i + 1}`, value, primary: i === 0 })) };
    const output = definition.compute(values, unit);
    if (output.diagramValues && Object.values(output.diagramValues).some(value => !Number.isFinite(value))) {
      return {errors: ["These dimensions do not form a valid geometry."], results: [{label: "Check inputs", value: "These dimensions do not form a valid geometry.", primary: true}]};
    }
    return output;
  } };
}
