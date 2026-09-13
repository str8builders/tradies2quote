import type { CalculatorHandoff, CalculatorResult, VerifiedDefinition } from "../verified-calculators";
import { area, ceilInt, len, money, n, num, roundedInt, vol, volValue, volumeUnit } from "./format";
import {
  BALANCED_SPACING_INVALID, BOARD_RUN_INVALID, arcHeight, arcRadius, balancedSpacingSolve,
  boardRun, fingerprintPackage, framingRun, gazeboGeometry, invalidOutput, metaBase, ord, postHoleGeometry,
} from "./deck-geometry";

/**
 * Native-parity ports of ios/T2QCAL/T2QCAL/Models/ToolsDeck.swift.
 * Each entry is keyed by slug and must reproduce the native result rows,
 * marks, diagram values, handoffs and cuts recorded in
 * fixtures/native-reference.json (see native/parity.test.ts).
 */

const row = (label: string, value: string, primary = false): CalculatorResult => ({ label, value, primary });

export const definitions: Record<string, VerifiedDefinition> = {};

// MARK: Deck subframe

definitions["deck-subframe"] = {
  ...metaBase("deck-subframe"),
  compute(v, unit) {
    const metric = unit === "metric";
    const length = n(v, "length"), width = n(v, "width");
    const board = boardRun(width, n(v, "boardWidth"), n(v, "gap"));
    if (!board) return invalidOutput(BOARD_RUN_INVALID);
    const joistRun = framingRun(length, n(v, "joistWidth"), n(v, "joistSpacing"));
    const bearerRun = framingRun(width, n(v, "bearerWidth"), n(v, "bearerSpacing"));
    if (!joistRun || !bearerRun) {
      return invalidOutput("Framing must fit within the deck without overlapping. Use a maximum spacing at least as large as the member width, and no more than 10,000 members per direction.");
    }
    const boards = board.count, joists = joistRun.count, bearers = bearerRun.count;
    const joistCentres = joistRun.centres;
    return {
      results: [
        row("Deck boards", String(boards), true),
        row("Joists", String(joists)),
        row("Bearers", String(bearers)),
        row("Joist centres", len(joistCentres, metric)),
        row("Bearer centres", len(bearerRun.centres, metric)),
        row("Equal edge boards", len(board.edge, metric)),
        row("Bearer lineal total", len(bearers * length, metric)),
        row("Board lineal total", len(boards * length, metric)),
        row("Joist lineal total", len(joists * width, metric)),
        row("Deck area", area(length * width, metric)),
      ],
      diagramValues: {
        // The plan draws joists, so it takes the resolved centres — not
        // the maximum, and not the board width or board gap.
        count: joists, spacing: joistCentres, center: joistCentres,
        rows: bearers, columns: joists,
        span: length,
        model: 0, deckLayout: 1, boardCount: boards,
        bearerCentres: bearerRun.centres, edgeCut: board.edge,
      },
    };
  },
};

// MARK: Deck board layout

definitions["deck-boards"] = {
  ...metaBase("deck-boards"),
  compute(v, unit) {
    const metric = unit === "metric";
    const length = n(v, "length"), width = n(v, "width");
    const boardWidth = n(v, "boardWidth"), gap = n(v, "gap");
    const waste = n(v, "waste"), rate = n(v, "rate");
    const board = boardRun(width, boardWidth, gap);
    if (!board) return invalidOutput(BOARD_RUN_INVALID);
    const boards = board.count, edges = board.edge;
    const lineal = boards * length * (1 + waste / 100);
    // Lineal timber is ordered in metres or feet, not the drawing unit.
    const ordered = lineal / (metric ? 1000 : 12);
    const orderUnit = metric ? "m" : "ft";
    const handoff: CalculatorHandoff = {
      key: "deck-boards.lineal-order",
      label: "Decking lineal length to order",
      quantity: ordered,
      unit: orderUnit,
      role: "material",
      includeByDefault: true,
      basisFingerprint: fingerprintPackage("deck-board", metric, [boardWidth, n(v, "boardDepth")]),
      formula: "ceil((deck width + gap) ÷ (board width + gap)) × board run length × (1 + waste ÷ 100).",
      assumptions: ["Boards run the full entered length and use one entered width/gap."],
      checks: [
        "Board module is positive.",
        "Board runs round up before the lineal allowance is applied.",
      ],
    };
    return {
      results: [
        row("Board count", String(boards), true),
        row("Equal edge boards", len(edges, metric)),
        row("Order lineal length", `${num(ordered, 2)} ${orderUnit}`),
        row("Deck area", area(length * width, metric)),
        row("Estimated material", money(ordered * rate)),
      ],
      diagramValues: {
        span: width, count: boards,
        memberWidth: boardWidth,
        spacing: boardWidth + gap, center: boardWidth + gap,
        model: 1, deckLayout: 2, boardCount: boards, edgeCut: edges,
      },
      handoffs: [handoff],
    };
  },
};

// MARK: Fence posts and panels

definitions["fence-panels"] = {
  ...metaBase("fence-panels"),
  compute(v, unit) {
    const metric = unit === "metric";
    const span = Math.max(1e-9, Number.isFinite(n(v, "span")) ? n(v, "span") : 1e-9);
    const width = Math.max(0, n(v, "memberWidth"));
    const target = Math.max(0, n(v, "targetGap"));
    const layout = balancedSpacingSolve(span, width, target);
    if (!layout) return BALANCED_SPACING_INVALID;
    const count = layout.count, gap = layout.gap;
    const centres = width + gap;
    return {
      results: [
        row("Balanced clear gap", len(gap, metric), true),
        row("post count", String(count)),
        row("Centre to centre", len(centres, metric)),
        row("Equal end margins", len(gap, metric)),
        row("Occupied material", len(count * width, metric)),
        row("Open space", len((count + 1) * gap, metric)),
      ],
      marks: Array.from({ length: count }, (_, i) => `${ord(i + 1)} · centre ${len(gap + width / 2 + i * centres, metric)}`),
      diagramValues: {
        count, gap, spacing: centres, center: centres,
        spacingGeometry: 1, panel: 1, model: 3,
      },
    };
  },
};

// MARK: Arched fence palings

definitions["arched-fence"] = {
  ...metaBase("arched-fence"),
  compute(v, unit) {
    const metric = unit === "metric";
    const span = n(v, "span"), baseHeight = n(v, "baseHeight"), rise = n(v, "rise");
    const count = Math.max(3, roundedInt(n(v, "count"), 3, 99));
    if (!(rise <= span / 2)) return invalidOutput("The rise must not exceed half the span for a single-valued fence crown.");
    if (!(n(v, "palingWidth") <= span / (count - 1))) return invalidOutput("The paling width exceeds the centre spacing. Reduce the width or paling count.");
    const radius = arcRadius(span, rise);
    const heights = Array.from({ length: count }, (_, i) => baseHeight + arcHeight(span, rise, (i * span) / (count - 1)));
    return {
      results: [
        row("Tallest paling", len(heights.length ? Math.max(...heights) : 0, metric), true),
        row("Crown height", len(baseHeight + rise, metric)),
        row("Overall outside width", len(span + n(v, "palingWidth"), metric)),
        row("End paling", len(heights[0], metric)),
        row("Arc radius", len(radius, metric)),
        row("Paling centres", len(span / (count - 1), metric)),
        row("Paling count", String(count)),
      ],
      marks: heights.map((height, index) => `${ord(index + 1)} · ${len(height, metric)}`),
      diagramValues: { model: 2, count },
    };
  },
};

// MARK: Paling fence rails

definitions["fence-rails"] = {
  ...metaBase("fence-rails"),
  compute(v, unit) {
    const metric = unit === "metric";
    const span = n(v, "span"), bay = n(v, "bay");
    const palingWidth = n(v, "palingWidth"), gap = n(v, "gap");
    const bays = ceilInt(span / Math.max(1e-9, bay), 1, 100_000);
    const actualBay = span / bays;
    const posts = bays + 1;
    const palings = ceilInt((span + gap) / Math.max(1e-9, palingWidth + gap), 1, 1_000_000);
    const rails = roundedInt(n(v, "rails"), 1, 6);
    return {
      results: [
        row("Post count", String(posts), true),
        row("Actual bay", len(actualBay, metric)),
        row("Rail pieces", String(bays * rails)),
        row("Paling count", String(palings)),
        row("Rail lineal total", len(span * rails, metric)),
      ],
      diagramValues: {
        count: posts, gap: 0, spacing: actualBay,
        center: actualBay, panel: 1, memberWidth: 0,
        rows: rails, model: 3,
      },
    };
  },
};

// MARK: Gazebo roof and floor

definitions["gazebo"] = {
  ...metaBase("gazebo"),
  compute(v, unit) {
    const metric = unit === "metric";
    const g = gazeboGeometry(n(v, "diameter"), roundedInt(n(v, "count"), 3, 16), n(v, "angle"));
    if (!g) return invalidOutput("Use a positive diameter, 3–16 sides and a roof pitch below 90°.");
    const sides = g.sides, side = g.side;
    return {
      results: [
        row("Roof hip length", len(g.hip, metric), true),
        row("Centre rafter length", len(g.common, metric)),
        row("Side length", len(side, metric)),
        row("Centre rafter run", len(g.apothem, metric)),
        row("Roof surface area", area(g.roofArea, metric)),
        row("Floor area", area(g.floorArea, metric)),
        row("Perimeter", len(sides * side, metric)),
        row("Corner angle", `${num(((sides - 2) * 180) / sides, 3)}°`),
        row("Roof rise", len(g.rise, metric)),
        row("Geometry basis", "Roof pitch is measured at the centre of a side. Lengths run to an ideal apex; overhangs, member thickness and connections are not entered."),
      ],
      diagramValues: { gazeboGeometry: 1, count: sides, rise: g.rise, run: g.apothem },
    };
  },
};

// MARK: Post holes and concrete

definitions["post-holes"] = {
  ...metaBase("post-holes"),
  compute(v, unit) {
    const metric = unit === "metric";
    const post = roundedInt(n(v, "postShape"), 0, 2);
    const g = postHoleGeometry(
      roundedInt(n(v, "count"), 1, 60), n(v, "diameter"), n(v, "depth"), n(v, "spacing"), post,
      n(v, "postWidth"), n(v, "postDepth"), n(v, "postDiameter"), n(v, "embedment"),
    );
    if (!g) return invalidOutput("Holes must not overlap. The post must fit inside the hole, and its embedded length cannot exceed the hole depth.");
    const order = g.net * (1 + n(v, "waste") / 100);
    const cubicMetres = metric ? order / 1e9 : order * 0.000016387064;
    const bags = ceilInt(cubicMetres / n(v, "bagYield"), 0, 1_000_000_000);
    return {
      results: [
        row("Concrete to order", vol(order, metric), true),
        row("Net concrete", vol(g.net, metric)),
        row("Gross hole volume", vol(g.gross, metric)),
        row("Post displacement", vol(g.displacement, metric)),
        row("Net concrete per hole", vol(g.net / g.count, metric)),
        row("Bags including allowance", String(bags)),
        row("First-to-last centre run", len(g.run, metric)),
        row("Quantity basis", post === 0
          ? "Gross cylindrical fill; no post displacement is deducted. Choose a post section to deduct it."
          : "Cylindrical holes with centred posts. Only the embedded post volume is deducted; order allowance is added afterward."),
      ],
      marks: Array.from({ length: g.count }, (_, i) => `Hole ${i + 1} centre: ${len(i * g.spacing, metric)}`),
      diagramValues: g.diagramValues,
      handoffs: [
        {
          key: "post-holes.concrete-order",
          label: "Concrete to order",
          quantity: volValue(order, metric),
          unit: volumeUnit(metric),
          role: "material",
          includeByDefault: true,
          formula: "(cylindrical hole volume − embedded post volume) × number of holes × (1 + order allowance ÷ 100).",
          assumptions: [post === 0
            ? "No post displacement is deducted."
            : "The selected post section is centred inside each cylindrical hole."],
          checks: ["No overlapping holes.", "The post fits the hole and embedment stays within its depth."],
        },
        {
          key: "post-holes.bags-order",
          label: "Bagged concrete alternative",
          quantity: bags,
          unit: "bag",
          role: "material",
          includeByDefault: false,
          basisFingerprint: fingerprintPackage("concrete-bag", metric, [], [n(v, "bagYield")]),
          formula: "ceil(concrete order volume in m³ ÷ entered mixed yield per bag).",
          assumptions: ["Use this instead of the bulk concrete line, not in addition to it."],
          checks: ["Bag yield is positive.", "The bag order includes the same order allowance as bulk concrete."],
        },
      ],
    };
  },
};

// MARK: Decking screws

definitions["decking-screws"] = {
  ...metaBase("decking-screws"),
  compute(v) {
    const board = boardRun(n(v, "width"), n(v, "boardWidth"), n(v, "gap"));
    if (!board) return invalidOutput(BOARD_RUN_INVALID);
    const joistRun = framingRun(n(v, "length"), n(v, "joistWidth"), n(v, "joistSpacing"));
    if (!joistRun) return invalidOutput("Joists must fit within the deck and must not overlap. Check the deck length, joist width and maximum spacing.");
    const boards = board.count, joists = joistRun.count;
    if (!(boards * joists <= 100_000)) return invalidOutput("This fixing layout supports up to 100,000 board-to-joist junctions. Split larger decks into separate sections.");
    const screws = boards * joists * roundedInt(n(v, "perJunction"), 1, 4);
    const boxes = ceilInt(screws / Math.max(50, roundedInt(n(v, "box"), 50, 5000)), 0, 100_000_000);
    const centres = joistRun.centres;
    return {
      results: [
        row("Screws needed", String(screws), true),
        row("Boxes", String(boxes)),
        row("Boards", String(boards)),
        row("Joists", String(joists)),
        row("Junctions", String(boards * joists)),
      ],
      diagramValues: {
        span: n(v, "length"), count: joists,
        spacing: centres, center: centres,
        model: 2, deckLayout: 3, boardCount: boards, edgeCut: board.edge,
      },
    };
  },
};
