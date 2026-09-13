import type { CalculatorOutput, VerifiedDefinition, VerifiedUnit } from "../verified-calculators";
import { baseFromMeta } from "./stairs-meta";
import {
  balancedSpacingInvalid,
  layoutInvalid,
  layoutMarks,
  solveBalancedSpacing,
  verifiedSpacing,
} from "./spacing-balanced";
import { openingLayout } from "./spacing-opening";
import { ceilInt, len, lengthUnit, n, num, rad, type Values } from "./format";

/**
 * Native-parity ports of ios/T2QCAL/T2QCAL/Models/ToolsSpacing + ToolsLayouts.swift.
 * Each entry is keyed by slug and must reproduce the native result rows,
 * marks, diagram values, handoffs and cuts recorded in
 * fixtures/native-reference.json (see native/parity.test.ts).
 */

// MARK: Equal spacing (live plan)

const equalSpacing: VerifiedDefinition = {
  ...baseFromMeta("equal-spacing"),
  compute(v: Values, unit: VerifiedUnit): CalculatorOutput {
    const metric = unit === "metric";
    const span = n(v, "span");
    const width = n(v, "memberWidth");
    const target = n(v, "targetGap");
    const layout = solveBalancedSpacing(span, width, target);
    if (!layout) return balancedSpacingInvalid();
    const count = layout.count;
    const gap = layout.gap;
    const centres = width + gap;
    const lu = lengthUnit(metric);
    const marks = Array.from({ length: count }, (_, i) => `${num(gap + width / 2 + i * centres, 2)} ${lu}`);
    return {
      results: [
        { label: "Balanced clear gap", value: len(gap, metric), primary: true },
        { label: "Member count", value: String(count) },
        { label: "Centre to centre", value: len(centres, metric) },
        { label: "Equal end margins", value: len(gap, metric) },
        { label: "Occupied material", value: len(count * width, metric) },
        { label: "Open space", value: len((count + 1) * gap, metric) },
      ],
      marks,
      diagramValues: { count, gap, spacing: centres, center: centres, spacingGeometry: 1 },
    };
  },
};

// MARK: Verified spacing family

const boardBatten = verifiedSpacing({ slug: "board-batten", noun: "member", flags: { vertical: 1, model: 2 } });
const glassPanels = verifiedSpacing({ slug: "glass-panels", noun: "member", flags: { panel: 1, model: 4 } });
const wainscoting = verifiedSpacing({ slug: "wainscoting", noun: "member", flags: { model: 7 } });
const shelfSpacing = verifiedSpacing({ slug: "shelf-spacing", noun: "member", flags: { model: 6 } });
const fastenerSpacing = verifiedSpacing({ slug: "fastener-spacing", noun: "fixing", flags: { model: 5 } });

// MARK: Models/ToolsLayouts.swift — wall framing

const wallFraming: VerifiedDefinition = {
  ...baseFromMeta("wall-framing"),
  compute(v: Values, unit: VerifiedUnit): CalculatorOutput {
    const metric = unit === "metric";
    const span = n(v, "span");
    const thickness = n(v, "memberWidth");
    const height = n(v, "height");
    const plates = n(v, "plates");
    const rows = n(v, "nogRows");
    if (!(height > plates * thickness) || !(n(v, "targetGap") > thickness) || !(span > thickness)) {
      return layoutInvalid(
        "Wall height must exceed plate thickness; centres and wall length must exceed timber thickness.",
      );
    }
    const bays = ceilInt((span - thickness) / n(v, "targetGap") - 1e-10, 1, 100_000);
    const count = bays + 1;
    const centres = (span - thickness) / bays;
    const first = thickness / 2;
    const cut = height - plates * thickness;
    const nogCount = bays * rows;
    const nogLength = centres - thickness;
    const plateLength = span * plates;
    const total = count * cut + nogCount * nogLength + plateLength;
    return {
      results: [
        { label: "Stud count", value: String(count), primary: true },
        { label: "Stud cut length", value: len(cut, metric) },
        { label: "Actual stud centres", value: len(centres, metric) },
        { label: "Plate total", value: len(plateLength, metric) },
        { label: "Noggin count", value: num(nogCount, 0) },
        { label: "Noggin cut length", value: len(nogLength, metric) },
        { label: "Net timber total", value: len(total, metric) },
      ],
      marks: layoutMarks(count, first, centres, metric),
      diagramValues: {
        layoutKind: 1,
        count,
        centres,
        first,
        studLength: cut,
        nogCount,
        nogLength,
        plateLength,
        gap: nogLength,
        totalLength: total,
      },
    };
  },
};

// MARK: Models/ToolsLayouts.swift — rebar spacing

const rebarSpacing: VerifiedDefinition = {
  ...baseFromMeta("rebar-spacing"),
  compute(v: Values, unit: VerifiedUnit): CalculatorOutput {
    const metric = unit === "metric";
    const span = n(v, "span");
    const width = n(v, "width");
    const diameter = n(v, "memberWidth");
    const cover = n(v, "cover");
    const spacing = n(v, "targetGap");
    const layers = n(v, "layers");
    const first = cover + diameter / 2;
    if (!(Math.min(span, width) > 2 * first) || !(spacing >= diameter)) {
      return layoutInvalid(
        "The bars and edge cover must fit inside the slab, with centres at least the bar diameter.",
      );
    }
    const nx = ceilInt((span - 2 * first) / spacing - 1e-10, 1, 100_000) + 1;
    const ny = ceilInt((width - 2 * first) / spacing - 1e-10, 1, 100_000) + 1;
    const sx = (span - 2 * first) / (nx - 1);
    const sy = (width - 2 * first) / (ny - 1);
    const cutX = span - 2 * cover;
    const cutY = width - 2 * cover;
    const total = (nx * cutY + ny * cutX) * layers;
    const factor = metric ? 0.001 : 0.0254;
    const kg = ((total * factor * Math.PI * (diameter * factor) ** 2) / 4) * 7850;
    return {
      results: [
        { label: "Total bars", value: num((nx + ny) * layers, 0), primary: true },
        { label: "Lengthwise bars", value: `${num(ny * layers, 0)} × ${len(cutX, metric)}` },
        { label: "Crosswise bars", value: `${num(nx * layers, 0)} × ${len(cutY, metric)}` },
        { label: "Centres along length", value: len(sx, metric) },
        { label: "Centres across width", value: len(sy, metric) },
        { label: "Net bar length", value: len(total, metric) },
        { label: "Steel mass", value: `${num(kg, 3)} kg` },
      ],
      marks: layoutMarks(nx, first, sx, metric),
      diagramValues: {
        layoutKind: 2,
        first,
        count: nx,
        countX: nx,
        countY: ny,
        spacingX: sx,
        spacingY: sy,
        cutX,
        cutY,
        centres: sx,
        gap: sx - diameter,
        totalLength: total,
      },
    };
  },
};

// MARK: Models/ToolsLayouts.swift — kerf bending

const kerfBending: VerifiedDefinition = {
  ...baseFromMeta("kerf-bending"),
  compute(v: Values, unit: VerifiedUnit): CalculatorOutput {
    const metric = unit === "metric";
    const radius = n(v, "radius");
    const thickness = n(v, "thickness");
    const skin = n(v, "skin");
    const kerf = n(v, "kerf");
    const sweep = rad(n(v, "angle"));
    if (!(skin < thickness) || !(radius > thickness)) {
      return layoutInvalid(
        "Remaining skin must be less than board thickness, and outside radius must exceed board thickness.",
      );
    }
    const depth = thickness - skin;
    const closeAngle = 2 * Math.atan(kerf / (2 * depth));
    const count = ceilInt(sweep / closeAngle - 1e-10, 1, 100_000);
    const neutralRadius = radius - skin / 2;
    const span = neutralRadius * sweep;
    const centres = span / count;
    const remainingGap = kerf - 2 * depth * Math.tan(sweep / (2 * count));
    return {
      results: [
        { label: "Kerf cuts", value: String(count), primary: true },
        { label: "Cut depth", value: len(depth, metric) },
        { label: "Cut centres", value: len(centres, metric) },
        { label: "Bend-zone length", value: len(span, metric) },
        { label: "Inside radius", value: len(radius - thickness, metric) },
        { label: "Residual gap at target bend", value: len(Math.max(0, remainingGap), metric) },
      ],
      marks: layoutMarks(count, centres / 2, centres, metric),
      diagramValues: {
        layoutKind: 3,
        count,
        span,
        centres,
        first: centres / 2,
        depth,
        neutralRadius,
        innerRadius: radius - thickness,
        turn: sweep / count,
        remainingGap,
        memberWidth: kerf,
        gap: centres - kerf,
      },
    };
  },
};

// MARK: Models/OpeningLayout.swift — opening layout

const openingLayoutTool: VerifiedDefinition = {
  ...baseFromMeta("opening-layout"),
  compute(v: Values, unit: VerifiedUnit): CalculatorOutput {
    const metric = unit === "metric";
    const t = n(v, "memberWidth");
    const left = n(v, "openLeft");
    const width = n(v, "openWidth");
    const bottom = n(v, "openBottom");
    if (
      !(left >= 3 * t) ||
      !(left + width + 3 * t <= n(v, "span")) ||
      !(bottom + n(v, "openHeight") + n(v, "headerDepth") <= n(v, "height") - (n(v, "plates") - 1) * t) ||
      !(bottom === 0 || bottom >= 2 * t) ||
      !(n(v, "targetGap") > t) ||
      !(n(v, "span") / n(v, "targetGap") <= 1000)
    ) {
      return layoutInvalid(
        "The opening, header, king studs and plates must fit inside the wall. Keep stud centres larger than timber thickness (up to 1,000 bays).",
      );
    }
    const g = openingLayout(v);
    const positions: [string, number][] = g.regular.map((x): [string, number] => ["Stud", x + t / 2]);
    positions.push(
      ["Left king", left - 1.5 * t],
      ["Left jack", left - 0.5 * t],
      ["Right jack", left + width + 0.5 * t],
      ["Right king", left + width + 1.5 * t],
    );
    const marks = positions
      .slice()
      .sort((a, b) => a[1] - b[1])
      .map(([label, x]) => `${label} centre ${len(x, metric)}`);
    return {
      results: [
        { label: "Full-height studs including kings", value: String(g.regular.length + 2), primary: true },
        { label: "Full-height stud cut", value: len(g.studLength, metric) },
        { label: "Jack studs", value: `2 × ${len(g.jackLength, metric)}` },
        { label: "Header cut length", value: len(g.headerLength, metric) },
        { label: "Top cripples", value: `${g.topCut > 0 ? g.cripples.length : 0} × ${len(g.topCut, metric)}` },
        { label: "Bottom cripples", value: `${g.bottomCut > 0 ? g.cripples.length : 0} × ${len(g.bottomCut, metric)}` },
        { label: "Sill cut length", value: bottom > 0 ? len(width, metric) : "Door opening — no sill" },
        { label: "Plate total", value: len(n(v, "span") * n(v, "plates"), metric) },
      ],
      marks,
      diagramValues: {
        layoutKind: 4,
        centres: g.centres,
        studLength: g.studLength,
        headerBottom: g.headerBottom,
        headerTop: g.headerTop,
        jackLength: g.jackLength,
        topCut: g.topCut,
        bottomCut: g.bottomCut,
        headerLength: g.headerLength,
      },
    };
  },
};

export const definitions: Record<string, VerifiedDefinition> = {
  "equal-spacing": equalSpacing,
  "board-batten": boardBatten,
  "glass-panels": glassPanels,
  "wainscoting": wainscoting,
  "shelf-spacing": shelfSpacing,
  "fastener-spacing": fastenerSpacing,
  "wall-framing": wallFraming,
  "rebar-spacing": rebarSpacing,
  "kerf-bending": kerfBending,
  "opening-layout": openingLayoutTool,
};
