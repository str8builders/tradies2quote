import type { DiagramKind } from "@/t2qcal/components/calculators/technicalDrawing";
import type {
  CalculatorField, CalculatorOutput, FieldKind, VerifiedDefinition,
} from "../verified-calculators";
import meta from "./meta.json";
import {
  area, areaUnit, areaValue, ceilInt, deg, len, lengthUnit, money, n, num, pos,
  quantity, roundedInt, ulp, vol, volValue, volumeUnit,
} from "./format";
import {
  BOARD_RUN_INVALID, SHEET_CUT_INVALID, bestSheetCutLayout, boardRun,
  circularPavingLayout, packageFingerprint, paintCoverage, pavingDiagramValues,
  pavingRingDiagramValues, pavingRingGeometry, sheetCutList, sheetDiagramValues,
  timberDiagramValues, timberGeometry, wallpaperLayout, weatherboardLayout,
} from "./materials-geometry";

/**
 * Native-parity ports of ios/T2QCAL/T2QCAL/Models/ToolsMaterials.swift.
 * Each entry is keyed by slug and must reproduce the native result rows,
 * marks, diagram values, handoffs and cuts recorded in
 * fixtures/native-reference.json (see native/parity.test.ts).
 */

type MetaField = {
  key: string; label: string; default: number; kind: string; min?: number; max?: number;
  options?: { id: number; label: string }[];
  visibleWhen?: { key: string; allowed: number[] };
};
type MetaTool = {
  name: string; summary: string; diagram: string; showsAssembly: boolean;
  sheets: { label: string; kind: string }[]; fields: MetaField[];
};

const catalogue = meta as unknown as Record<string, MetaTool>;

/** title, note, diagram, sheets, showsAssembly and fields all come from the catalogue meta. */
function shell(slug: string): Omit<VerifiedDefinition, "compute"> {
  const tool = catalogue[slug];
  const fields: CalculatorField[] = tool.fields.map((field) => ({
    key: field.key,
    label: field.label,
    default: field.default,
    kind: field.kind as FieldKind,
    ...(field.min === undefined ? {} : { min: field.min }),
    ...(field.max === undefined ? {} : { max: field.max }),
    ...(field.options ? { options: field.options } : {}),
    ...(field.visibleWhen ? { visibleWhen: field.visibleWhen } : {}),
  }));
  return {
    title: tool.name,
    note: tool.summary,
    diagram: tool.diagram as DiagramKind,
    // The 3D assembly sheet rides along from `Tool.assembly` in native/index.ts.
    sheets: tool.sheets
      .filter((sheet) => !sheet.kind.endsWith("3d"))
      .map((sheet) => ({ label: sheet.label, diagram: sheet.kind as DiagramKind })),
    showsAssembly: tool.showsAssembly,
    fields,
  };
}

// Native `ToolsLayouts.invalid`: a single primary "Check inputs" row, never an error.
const invalid = (message: string): CalculatorOutput => ({ results: [{ label: "Check inputs", value: message, primary: true }], diagramValues: { invalid: 1 } });

export const definitions: Record<string, VerifiedDefinition> = {};

// MARK: Tile layout (balanced edge cuts)

definitions["tile-layout"] = {
  ...shell("tile-layout"),
  compute(v, unit) {
    const metric = unit === "metric";
    const floorWidth = n(v, "floorWidth"), tileWidth = n(v, "tileWidth"), joint = n(v, "joint");
    const waste = n(v, "waste");
    const rows = roundedInt(n(v, "rows"), 1, 24);
    const run = boardRun(floorWidth, tileWidth, joint);
    if (!run) return invalid(BOARD_RUN_INVALID);
    const across = run.count, edge = run.edge;
    const drawn = across * rows;
    const order = ceilInt(drawn * (1 + waste / 100), 1, 1_000_000);
    const lu = lengthUnit(metric);
    // One mark per tile edge, and a row of tiles has one fewer edge than tiles.
    const marks = Array.from({ length: Math.max(0, across - 1) },
      (_, i) => `${num(edge + i * (tileWidth + joint), 2)} ${lu}`);
    return {
      results: [
        { label: "Equal end cuts", value: len(edge, metric), primary: true },
        { label: "Tiles across", value: String(across) },
        { label: "Drawn tile count", value: String(drawn) },
        { label: "Order with waste", value: `${order} tiles` },
        { label: "Joint width", value: len(joint, metric) },
      ],
      marks,
      diagramValues: {
        length: floorWidth, width: floorWidth, span: floorWidth,
        count: across, rows, columns: across,
        gap: joint, memberWidth: tileWidth,
        model: 5, deckLayout: 4, edgeCut: edge,
      },
    };
  },
};

// MARK: Floor area

definitions["floor-area"] = {
  ...shell("floor-area"),
  compute(v, unit) {
    const metric = unit === "metric";
    const length = n(v, "length"), width = n(v, "width"), waste = n(v, "waste");
    const floor = length * width;
    return {
      results: [
        { label: "Order area", value: area(floor * (1 + waste / 100), metric), primary: true },
        { label: "Net floor area", value: area(floor, metric) },
        { label: "Perimeter", value: len(2 * (length + width), metric) },
        { label: "Diagonal", value: len(Math.sqrt(length * length + width * width), metric) },
        { label: "Allowance area", value: area((floor * waste) / 100, metric) },
      ],
      diagramValues: { pourGeometry: 5 },
      handoffs: [{
        key: "floor-area.order-area", label: "Order area",
        quantity: areaValue(floor * (1 + waste / 100), metric),
        unit: areaUnit(metric), role: "material", includeByDefault: true,
        formula: "(room length × room width) × (1 + allowance ÷ 100).",
        assumptions: ["The entered rectangle is the net floor area before allowance."],
        checks: ["Area and allowance are finite and non-negative.",
          "The result stays in area units and is not inferred from display text."],
      }],
    };
  },
};

// MARK: Tile quantity and cost

definitions["tile-quantity"] = {
  ...shell("tile-quantity"),
  compute(v, unit) {
    const metric = unit === "metric";
    const layout = bestSheetCutLayout(
      n(v, "length"), n(v, "width"), n(v, "tileLength"), n(v, "tileWidth"), n(v, "cutKerf"),
    );
    if (!layout) return invalid(SHEET_CUT_INVALID);

    const length = n(v, "length"), width = n(v, "width");
    const tileLength = n(v, "tileLength"), tileWidth = n(v, "tileWidth");
    const waste = n(v, "waste"), boxPrice = n(v, "boxPrice");
    const boxQty = Math.max(1, roundedInt(n(v, "boxQty"), 1, 1000));
    const floor = length * width;
    const tileArea = tileLength * tileWidth;
    const net = layout.stockCount;
    const areaMinimum = ceilInt(floor / pos(tileArea), 0, 100_000_000);
    const order = ceilInt(net * (1 + waste / 100), 0, 200_000_000);
    const boxes = ceilInt(order / boxQty, 0, 100_000_000);
    return {
      results: [
        { label: "Boxes to order", value: String(boxes), primary: true },
        { label: "Tiles to order", value: String(boxes * boxQty) },
        { label: "Net stock tiles", value: String(net) },
        { label: "Installed cut pieces", value: String(layout.pieces.length) },
        { label: "Area minimum", value: String(areaMinimum) },
        { label: "Floor area", value: area(floor, metric) },
        { label: "Estimated tile cost", value: money(boxes * boxPrice) },
      ],
      marks: sheetCutList(layout, metric),
      diagramValues: { ...sheetDiagramValues(layout), coverWall: 0, coverKind: 1 },
      handoffs: [{
        key: "tile-quantity.boxes-order", label: "Boxes to order",
        quantity: boxes, unit: "box", role: "material", includeByDefault: true,
        basisFingerprint: packageFingerprint("tile-box", metric,
          [tileLength, tileWidth, n(v, "materialDepth")], [boxQty]),
        formula: "ceil(ceil(feasible cutting-plan stock tiles × (1 + waste ÷ 100)) ÷ tiles per box).",
        assumptions: [
          "The cut plan covers the entered rectangle; no grout or perimeter gap is deducted.",
          "Offcuts are reused only where shown in the feasible cutting plan. This heuristic does not guarantee minimum waste.",
          "One box contains the entered number of the entered tile size.",
        ],
        checks: ["Tile and floor areas are positive.",
          "The order is rounded up twice: whole tiles, then whole boxes."],
      }],
    };
  },
};

// MARK: Weatherboard cladding

definitions.weatherboard = {
  ...shell("weatherboard"),
  compute(v, unit) {
    const metric = unit === "metric";
    const length = n(v, "length"), height = n(v, "height");
    const boardWidth = n(v, "boardWidth"), overlap = n(v, "overlap"), waste = n(v, "waste");
    const g = weatherboardLayout(length, height, boardWidth, overlap);
    if (!g) {
      return invalid("Overlap must be smaller than the board width. This layout supports up to 10,000 complete courses.");
    }
    const grossArea = length * height;
    const openingArea = n(v, "openingArea") * (metric ? 1e6 : 144);
    const areaDifference = grossArea - openingArea;
    const tolerance = Math.max(ulp(grossArea), ulp(openingArea)) * 8;
    if (!(areaDifference >= -tolerance)) {
      return invalid("Opening deductions cannot exceed the rectangular wall area.");
    }
    const netArea = Math.abs(areaDifference) <= tolerance ? 0 : areaDifference;
    const netLineal = netArea / g.cover;
    const lineal = netLineal * (1 + waste / 100);
    return {
      results: [
        { label: "Course count", value: String(g.courses), primary: true },
        { label: "Actual cover", value: len(g.cover, metric) },
        { label: "Actual overlap", value: len(g.overlap, metric) },
        { label: "Gross course lineal", value: len(g.grossLineal, metric) },
        { label: "Net lineal estimate", value: len(netLineal, metric) },
        { label: "Order lineal length", value: len(lineal, metric) },
        { label: "Gross wall area", value: area(grossArea, metric) },
        { label: "Net wall area", value: area(netArea, metric) },
        { label: "Set-out datum", value: "Zero is the bottom of the exposed wall face. Top edges finish at the listed heights. The first full-width board extends below zero by the actual overlap." },
        { label: "Profile and cuts", value: "Check the actual overlap against your product's permitted lap range. Openings deduct area only; positions, end joints, gables, fixings and flashings require a project layout." },
      ],
      marks: Array.from({ length: g.courses },
        (_, i) => `Course ${i + 1}: top ${len(g.top(i), metric)} · lower edge ${len(g.bottom(i), metric)}`),
      diagramValues: { weatherboardLayout: 1 },
      handoffs: [{
        key: "weatherboard.lineal-order", label: "Order lineal length",
        quantity: lineal / (metric ? 1000 : 12),
        unit: metric ? "m" : "ft", role: "material", includeByDefault: true,
        basisFingerprint: packageFingerprint("weatherboard-profile", metric, [boardWidth, overlap]),
        formula: "courses = ceil(wall height ÷ (board width − minimum overlap)); actual cover = wall height ÷ courses; order = (wall area − openings) ÷ actual cover × (1 + waste ÷ 100).",
        assumptions: [
          "Equal exposed course heights; first board extends one actual overlap below the wall-face datum.",
          "Opening deductions are an area-based estimate, without a cut layout.",
          "The selected profile must permit the calculated actual overlap.",
        ],
        checks: ["Effective cover is positive.",
          "Course count is rounded up before lineal allowance is applied."],
      }],
      cuts: openingArea === 0
        ? [{ mm: ceilInt(length * (metric ? 1 : 25.4), 1, 1_000_000_000), count: g.courses, label: "Full weatherboard course" }]
        : [],
    };
  },
};

// MARK: Circular paving

definitions["circular-paving"] = {
  ...shell("circular-paving"),
  compute(v, unit) {
    const metric = unit === "metric";
    const diameter = n(v, "diameter");
    const paverLength = n(v, "paverLength"), paverWidth = n(v, "paverWidth");
    const waste = n(v, "waste");
    const paved = (Math.PI * diameter * diameter) / 4;
    const g = circularPavingLayout(diameter, paverLength, paverWidth, n(v, "paverThickness"),
      n(v, "joint"), n(v, "bond") === 1, n(v, "origin") === 1);
    if (!g) {
      return invalid("Use a joint smaller than both paver dimensions and a layout of at most 10,000 pavers. Increase paver size or reduce the patio diameter.");
    }
    const net = g.pieces.length;
    const order = ceilInt(net * (1 + waste / 100), 0, 200_000_000);
    return {
      results: [
        { label: "Order quantity", value: `${order} pavers`, primary: true },
        { label: "Net pavers", value: String(net) },
        { label: "Full pavers", value: String(g.fullCount) },
        { label: "Edge-cut pavers", value: String(g.edgeCount) },
        { label: "Paved area", value: area(paved, metric) },
        { label: "Outer circumference", value: len(Math.PI * diameter, metric) },
        { label: "Waste pieces", value: String(order - net) },
        { label: "Layout basis", value: "Enter actual paver face dimensions; joints are added separately. One stock paver per shown position, without curved offcut reuse. Pattern and centre alignment affect the count." },
      ],
      marks: g.pieces.map((p, index) => `Paver ${index + 1}: centre X ${len(p.x, metric, 3)}, Y ${len(p.y, metric, 3)} · ${p.full ? "full" : "cut to circle"}`),
      diagramValues: pavingDiagramValues(g),
      handoffs: [{
        key: "circular-paving.pavers-order", label: "Pavers to order", quantity: order,
        unit: "paver", role: "material", includeByDefault: true,
        basisFingerprint: packageFingerprint("paver", metric, [paverLength, paverWidth, g.thickness]),
        formula: "ceil(number of rectangular grid cells with positive circle intersection × (1 + waste ÷ 100)).",
        assumptions: [
          "One stock paver per full or edge-cut position; no curved offcut reuse.",
          "Inputs are actual paver face dimensions, excluding the separately entered joint.",
          "The entered joint, pattern and centre alignment define this layout; it is not a minimum-waste search.",
          "Set-out coordinates use the circle centre as X = 0, Y = 0.",
        ],
        checks: ["Diameter and paver dimensions are positive.",
          "All drawn paver positions are counted, with allowance applied once."],
      }],
    };
  },
};

// MARK: Circular paving ring

definitions["paving-ring"] = {
  ...shell("paving-ring"),
  compute(v, unit) {
    const metric = unit === "metric";
    const g = pavingRingGeometry(n(v, "diameter"), n(v, "unitDepth"), n(v, "paverThickness"),
      roundedInt(n(v, "count"), 3, 360), n(v, "joint"));
    if (!g) {
      return invalid("The paver must have a positive inner edge and a joint narrower than its sector. Increase the diameter or reduce depth, piece count or joint width.");
    }
    const order = ceilInt(g.count * (1 + n(v, "waste") / 100), 1, 1000);
    return {
      results: [
        { label: "Order quantity", value: `${order} pavers`, primary: true },
        { label: "Pavers in ring", value: String(g.count) },
        { label: "Outer face width", value: len(g.outerWidth, metric) },
        { label: "Inner face width", value: len(g.innerWidth, metric) },
        { label: "Miter from square", value: deg((g.halfAngle * 180) / Math.PI, 4) },
        { label: "Clear opening across flats", value: len(2 * g.innerApothem, metric) },
        { label: "Inner corner diameter", value: len(2 * g.innerCornerRadius, metric) },
        { label: "Net paver face area", value: area(g.faceArea * g.count, metric) },
        { label: "Net paver volume", value: vol(g.faceArea * g.thickness * g.count, metric) },
        { label: "Layout basis", value: "One complete ring of straight-sided tapered pavers. Diameter passes through outer corners. Side joint is measured perpendicular to the cut faces." },
        { label: "Stock blank required", value: `At least ${len(g.outerWidth, metric, 3)} × ${len(g.depth, metric, 3)} × ${len(g.thickness, metric, 3)} per paver, plus kerf.` },
      ],
      marks: Array.from({ length: g.count }, (_, i) => {
        const p = g.face(i);
        const cx = (p[0].x + p[1].x + p[2].x + p[3].x) / 4;
        const cy = (p[0].y + p[1].y + p[2].y + p[3].y) / 4;
        return `Paver ${i + 1}: centre X ${len(cx, metric, 3)}, Y ${len(cy, metric, 3)} · rotation ${deg((i * 360) / g.count, 3)}`;
      }),
      diagramValues: pavingRingDiagramValues(g),
      handoffs: [{
        key: "paving-ring.pavers-order", label: "Tapered pavers to order", quantity: order,
        unit: "paver", role: "material", includeByDefault: true,
        basisFingerprint: packageFingerprint("tapered-paver", metric,
          [g.outerWidth, g.innerWidth, g.depth, g.thickness]),
        formula: "ceil(pavers in one complete ring × (1 + waste ÷ 100)).",
        assumptions: [
          "Pavers are cut or supplied to the calculated taper; stock must fit the reported blank dimensions.",
          "One ring only. No centre infill, base, bedding or adjacent rings included.",
        ],
        checks: ["Inner edge remains positive; parallel side faces leave the entered perpendicular joint.",
          "All outer corners lie on the entered diameter."],
      }],
    };
  },
};

// MARK: Timber linear to cubic

definitions["timber-volume"] = {
  ...shell("timber-volume"),
  compute(v, unit) {
    const metric = unit === "metric";
    const width = n(v, "width"), height = n(v, "height");
    const length = n(v, "length"), rate = n(v, "rate");
    const pieces = roundedInt(n(v, "count"), 1, 1000);
    const g = timberGeometry(length / pieces, width, height, pieces);
    if (!g) return invalid("Enter positive section dimensions and total length, with 1 to 1,000 equal pieces.");
    const volume = volValue(width * height * length, metric);
    return {
      results: [
        { label: "Solid volume", value: `${num(volume, 5)} ${volumeUnit(metric)}`, primary: true },
        { label: "Cross-section area", value: area(width * height, metric, 6) },
        { label: "Lineal length", value: len(length, metric) },
        { label: "Equal pieces", value: String(pieces) },
        { label: "Length per piece", value: len(g.length, metric) },
        { label: "Estimated material", value: money(volume * rate) },
        { label: "Piece basis", value: "The total lineal length is divided equally between the entered piece count. Display-stack gaps are excluded from solid volume. Cutting-list blanks round up to whole millimetres." },
      ],
      diagramValues: timberDiagramValues(g),
      handoffs: [{
        key: "timber-volume.solid-volume", label: "Solid timber volume", quantity: volume,
        unit: volumeUnit(metric), role: "material", includeByDefault: false,
        basisFingerprint: packageFingerprint("timber-section", metric, [width, height]),
        formula: "section width × section depth × total lineal length.",
        assumptions: ["The full entered lineal length uses one constant section."],
        checks: ["All three dimensions are positive.",
          "The raw solid volume is converted once into m³ or ft³."],
      }],
      cuts: [{
        mm: ceilInt(g.length * (metric ? 1 : 25.4), 1, 1_000_000_000),
        count: pieces, label: "Equal timber length",
      }],
    };
  },
};

// MARK: Lumber board-foot price

definitions["board-foot"] = {
  ...shell("board-foot"),
  compute(v, unit) {
    const metric = unit === "metric";
    const inches = metric ? 25.4 : 1;
    const thickness = n(v, "thickness") / inches;
    const width = n(v, "width") / inches;
    const length = n(v, "length") / inches;
    const rate = n(v, "rate");
    const pieces = Math.max(1, roundedInt(n(v, "count"), 1, 1000));
    const g = timberGeometry(n(v, "length"), n(v, "width"), n(v, "thickness"), pieces);
    if (!g) return invalid("Enter positive piece dimensions and a count from 1 to 1,000.");
    const per = (thickness * width * length) / 144;
    const total = per * pieces;
    return {
      results: [
        { label: "Total board feet", value: `${num(total, 3)} bd ft`, primary: true },
        { label: "Per piece", value: `${num(per, 3)} bd ft` },
        { label: "Price per piece", value: money((per * rate) / 1000) },
        { label: "Total price", value: money((total * rate) / 1000) },
        { label: "Cutting list", value: "Piece quantities are retained; stock-cut blanks round up to whole millimetres. Board-foot volume and price use the exact entered dimensions." },
      ],
      diagramValues: timberDiagramValues(g),
      cuts: [{
        mm: ceilInt(g.length * (metric ? 1 : 25.4), 1, 1_000_000_000),
        count: pieces, label: "Board-foot timber piece",
      }],
    };
  },
};

// MARK: Paint coverage

definitions["paint-coverage"] = {
  ...shell("paint-coverage"),
  compute(v, unit) {
    const metric = unit === "metric";
    const wall = n(v, "length") * n(v, "height");
    const m2 = metric ? wall / 1e6 : wall * 0.00064516;
    const coats = roundedInt(n(v, "coats"), 1, 6);
    const openings = n(v, "openingArea") * (metric ? 1 : 0.09290304);
    const g = paintCoverage(m2, openings, coats, n(v, "coverage"), n(v, "waste"), n(v, "canLitres"));
    if (!g) {
      return invalid("Openings must not exceed the wall area. Enter positive coverage and can size, with an order below one billion cans.");
    }
    const displayedArea = (squareMetres: number) =>
      `${quantity(squareMetres / (metric ? 1 : 0.09290304))} ${metric ? "m²" : "ft²"}`;
    return {
      results: [
        { label: "Paint needed", value: `${quantity(g.requiredLitres)} L`, primary: true },
        { label: "Gross wall area", value: displayedArea(g.grossArea) },
        { label: "Opening deduction", value: displayedArea(g.openingArea) },
        { label: "Net paint area", value: displayedArea(g.netArea) },
        { label: "Coats", value: String(coats) },
        { label: "Paint before allowance", value: `${quantity(g.theoreticalLitres)} L` },
        { label: "Whole cans", value: String(g.cans) },
        { label: "Can size", value: `${quantity(g.canLitres)} L` },
        { label: "Purchased paint", value: `${quantity(g.purchasedLitres)} L` },
        { label: "Spare after allowance", value: `${quantity(g.surplusLitres)} L` },
        { label: "Coverage basis", value: "Use the selected product's coverage for one coat on the actual surface. Primer, undercoat and different products need separate calculations. Openings are an area deduction; their positions are not entered." },
      ],
      diagramValues: { paintCoverage: 1 },
      handoffs: [{
        key: "paint-coverage.litres-required", label: "Paint needed",
        quantity: g.requiredLitres, unit: "L", role: "material", includeByDefault: false,
        basisFingerprint: packageFingerprint("paint-coverage", metric, [], [n(v, "coverage")]),
        formula: "(gross wall area − unpainted openings) × coats ÷ coverage per litre × (1 + extra paint allowance ÷ 100).",
        assumptions: [
          "Coverage is the product's stated coverage for one coat.",
          "One product only; primer and undercoat are calculated separately.",
          "Quote quantity is required litres, including the entered allowance; the whole-can purchase is shown separately.",
        ],
        checks: [
          "Coverage is positive and coats are whole.",
          "Opening deductions cannot exceed gross area.",
          "Imperial wall and opening areas are converted to m² before litres are calculated.",
        ],
      }],
    };
  },
};

// MARK: Plasterboard sheets

definitions.plasterboard = {
  ...shell("plasterboard"),
  compute(v, unit) {
    const metric = unit === "metric";
    const layout = bestSheetCutLayout(
      n(v, "length"), n(v, "height"), n(v, "sheetLength"), n(v, "sheetWidth"), n(v, "cutKerf"),
    );
    if (!layout) return invalid(SHEET_CUT_INVALID);

    const wall = n(v, "length") * n(v, "height");
    const net = layout.stockCount;
    const order = ceilInt(net * (1 + n(v, "waste") / 100), 0, 200_000_000);
    const m2 = metric ? wall / 1e6 : wall * 0.00064516;
    return {
      results: [
        { label: "Sheets to order", value: String(order), primary: true },
        { label: "Net stock sheets", value: String(net) },
        { label: "Installed cut pieces", value: String(layout.pieces.length) },
        { label: "Wall area", value: area(wall, metric) },
        { label: "Screws (approx.)", value: String(order * 32) },
        { label: "Compound (approx.)", value: `${num(m2 * 0.4, 1)} kg` },
      ],
      marks: sheetCutList(layout, metric),
      diagramValues: { ...sheetDiagramValues(layout), coverWall: 1, coverKind: 2 },
      handoffs: [{
        key: "plasterboard.sheets-order", label: "Sheets to order", quantity: order,
        unit: "sheet", role: "material", includeByDefault: true,
        basisFingerprint: packageFingerprint("plasterboard-sheet", metric,
          [n(v, "sheetLength"), n(v, "sheetWidth"), n(v, "materialDepth")]),
        formula: "ceil(feasible cutting-plan stock sheets × (1 + waste ÷ 100)).",
        assumptions: [
          "The geometric cut plan reuses shown offcuts; confirm orientation, joints and fixings against the selected lining system.",
          "This feasible heuristic does not guarantee the minimum sheet count.",
        ],
        checks: ["Wall and sheet dimensions are positive.",
          "Net sheets and allowance-adjusted order both round up."],
      }],
    };
  },
};

// MARK: Skirting and trim

definitions.skirting = {
  ...shell("skirting"),
  compute(v, unit) {
    const metric = unit === "metric";
    const perimeter = 2 * (n(v, "length") + n(v, "width"));
    const deduction = roundedInt(n(v, "doors"), 0, 20) * n(v, "doorWidth");
    if (!(deduction <= perimeter)) return invalid("Door deductions cannot exceed the room perimeter.");
    const net = perimeter - deduction;
    const order = net * (1 + n(v, "waste") / 100);
    const sticks = ceilInt(order / pos(n(v, "stock")), 0, 1_000_000_000);
    return {
      results: [
        { label: "Lineal to order", value: len(order, metric), primary: true },
        { label: "Net lineal", value: len(net, metric) },
        { label: "Stock lengths (length minimum)", value: String(sticks) },
        { label: "Door deduction", value: len(deduction, metric) },
        { label: "Cut allowance", value: "Check individual wall cuts against stock lengths; door positions are not entered." },
        { label: "Perimeter", value: len(perimeter, metric) },
      ],
      diagramValues: { pourGeometry: 9 },
      handoffs: [{
        key: "skirting.lineal-order", label: "Lineal trim to order",
        quantity: order / (metric ? 1000 : 12),
        unit: metric ? "m" : "ft", role: "material", includeByDefault: true,
        formula: "(2 × (room length + room width) − door count × door width) × (1 + waste ÷ 100).",
        assumptions: ["Only the entered door openings are omitted."],
        checks: ["Door deductions cannot make net lineal length negative.",
          "The lineal result is converted to merchant metres or feet."],
      }],
    };
  },
};

// MARK: Insulation batts

definitions["insulation-batts"] = {
  ...shell("insulation-batts"),
  compute(v, unit) {
    const metric = unit === "metric";
    const layout = bestSheetCutLayout(
      n(v, "length"), n(v, "height"), n(v, "battLength"), n(v, "battWidth"), n(v, "cutKerf"),
    );
    if (!layout) return invalid(SHEET_CUT_INVALID);

    const covered = n(v, "length") * n(v, "height");
    const net = layout.stockCount;
    const order = ceilInt(net * (1 + n(v, "waste") / 100), 0, 200_000_000);
    const pack = Math.max(1, roundedInt(n(v, "pack"), 1, 1000));
    const packs = ceilInt(order / pack, 0, 100_000_000);
    return {
      results: [
        { label: "Packs to order", value: String(packs), primary: true },
        { label: "Batts supplied in packs", value: String(packs * pack) },
        { label: "Batts needed with waste", value: String(order) },
        { label: "Installed cut pieces", value: String(layout.pieces.length) },
        { label: "Net batts", value: String(net) },
        { label: "Area", value: area(covered, metric) },
      ],
      marks: sheetCutList(layout, metric),
      diagramValues: { ...sheetDiagramValues(layout), coverWall: 1, coverKind: 3 },
      handoffs: [{
        key: "insulation-batts.packs-order", label: "Packs to order", quantity: packs,
        unit: "pack", role: "material", includeByDefault: true,
        basisFingerprint: packageFingerprint("insulation-pack", metric,
          [n(v, "battLength"), n(v, "battWidth"), n(v, "materialDepth")], [pack]),
        formula: "ceil(ceil(feasible cutting-plan stock batts × (1 + waste ÷ 100)) ÷ batts per pack).",
        assumptions: [
          "The rectangle is the net area to cover. No framing area is deducted automatically.",
          "Shown offcuts are reused without stretching; this feasible heuristic does not guarantee minimum stock.",
          "One pack contains the entered number of the entered batt size.",
        ],
        checks: ["Batt area and pack quantity are positive.",
          "The order rounds up to whole batts and then whole packs."],
      }],
    };
  },
};

// MARK: Wallpaper rolls

definitions["wallpaper-rolls"] = {
  ...shell("wallpaper-rolls"),
  compute(v, unit) {
    const metric = unit === "metric";
    const g = wallpaperLayout(v);
    if (!g) {
      return invalid("A trimmed, pattern-matched drop must fit the usable roll length. Use positive dimensions and at most 10,000 drops per section.");
    }
    const { drops, perRoll, rolls } = g;
    return {
      results: [
        { label: "Rolls to order", value: String(rolls), primary: true },
        { label: "Drops", value: String(drops) },
        { label: "Drops per roll", value: String(perRoll) },
        { label: "Cut length per drop", value: len(g.dropLength, metric) },
        { label: "Last drop width", value: len(g.span - (g.drops - 1) * g.rollWidth, metric) },
        { label: "Pattern basis", value: "Straight match only; enter any lead-in needed to align the first motif on each roll." },
        { label: "Wall area", value: area(n(v, "span") * n(v, "height"), metric) },
      ],
      marks: g.patterns.map((p) => `${p.copies} × roll: ${p.drops} drops at ${len(g.dropLength, metric)}`),
      diagramValues: { wallpaperGeometry: 1 },
      handoffs: [{
        key: "wallpaper-rolls.rolls-order", label: "Rolls to order", quantity: rolls,
        unit: "roll", role: "material", includeByDefault: false,
        basisFingerprint: packageFingerprint("wallpaper-roll", metric,
          [g.rollLength, g.rollWidth, g.repeatLength]),
        formula: "ceil(drops ÷ floor((roll length − lead-in loss) ÷ cut length)); cut length is wall height plus total trim, rounded up to a full straight-match repeat when entered.",
        assumptions: ["The wall run has one uniform height. Straight-match repeat, total trim per drop and lead-in loss per roll use the entered values; half-drop and reverse-hang patterns need a separate layout. This line starts unticked."],
        checks: ["At least one full-height drop fits per roll.",
          "Drops and rolls are rounded to whole units."],
      }],
    };
  },
};

// MARK: Soil and mulch

definitions["soil-mulch"] = {
  ...shell("soil-mulch"),
  compute(v, unit) {
    const metric = unit === "metric";
    const volume = n(v, "length") * n(v, "width") * n(v, "depth");
    const m3 = metric ? volume / 1e9 : volume * 0.000016387064;
    const bags = ceilInt((m3 * 1000) / Math.max(5, roundedInt(n(v, "bagLitres"), 5, 100)), 0, 100_000_000);
    return {
      results: [
        { label: "Volume", value: `${num(m3, 2)} m³`, primary: true },
        { label: "Bags", value: String(bags) },
        { label: "Approx. weight", value: `${num((m3 * n(v, "density")) / 1000, 2)} t` },
        { label: "Area", value: area(n(v, "length") * n(v, "width"), metric) },
      ],
      diagramValues: { bags, pourGeometry: 7 },
      handoffs: [{
        key: "soil-mulch.bulk-volume", label: "Bulk volume", quantity: m3,
        unit: "m³", role: "material", includeByDefault: false,
        formula: "area length × area width × spread depth, converted to m³.",
        assumptions: ["The spread has a uniform depth; compaction and settlement are not added."],
        checks: ["All dimensions are positive.",
          "This is a bulk-volume alternative and starts unticked."],
      }],
    };
  },
};
