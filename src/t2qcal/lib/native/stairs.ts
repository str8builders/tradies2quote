import type { CalculatorCut, CalculatorOutput, VerifiedDefinition, VerifiedUnit } from "../verified-calculators";
import { baseFromMeta } from "./stairs-meta";
import { layoutInvalid, verifiedSpacing } from "./spacing-balanced";
import {
  area,
  ceilInt,
  deg,
  len,
  lengthUnit,
  n,
  num,
  pos,
  quantity,
  roundedInt,
  type Values,
} from "./format";

/**
 * Native-parity ports of ios/T2QCAL/T2QCAL/Models/ToolsStairs.swift.
 * Each entry is keyed by slug and must reproduce the native result rows,
 * marks, diagram values, handoffs and cuts recorded in
 * fixtures/native-reference.json (see native/parity.test.ts).
 */

// MARK: Models/StairGeometry.swift

type StairGeometry = {
  treads: number;
  pitch: number;
  bridge: number;
  pitchLineLength: number;
  stockGuide: number;
  notchDepth: number;
  opening: (headroom: number, floor: number) => number;
};

function stairGeometry(risers: number, rise: number, going: number): StairGeometry {
  const treads = risers - 1;
  const bridge = Math.hypot(rise, going);
  return {
    treads,
    pitch: Math.atan2(rise, going),
    bridge,
    pitchLineLength: treads * bridge,
    stockGuide: risers * bridge,
    notchDepth: (rise * going) / bridge,
    opening: (headroom, floor) => ((headroom + floor) * going) / rise,
  };
}

// MARK: Models/StairPanelGeometry.swift

type StairPanelGeometry = {
  run: number;
  rise: number;
  height: number;
  columns: number;
  rows: number;
  rail: number;
  slope: number;
  angle: number;
  railVertical: number;
  clearWidth: number;
  clearHeight: number;
  railEdge: number;
  railBlank: number;
  stileBlank: number;
  panelBlankHeight: number;
  stileX: (column: number) => number;
  rowBottom: (row: number) => number;
};

function stairPanelGeometry(
  run: number,
  rise: number,
  height: number,
  columns: number,
  rows: number,
  rail: number,
  thickness: number,
): StairPanelGeometry | null {
  if (![run, rise, height, rail, thickness].every((value) => Number.isFinite(value))) return null;
  if (!(Math.min(run, height, thickness) > 0)) return null;
  if (!(rise >= 0) || !(rail >= 0)) return null;
  if (!(columns >= 1 && columns <= 30) || !(rows >= 1 && rows <= 20)) return null;
  const vertical = rail * Math.hypot(1, rise / run);
  if (!(run > (columns + 1) * rail) || !(height > (rows + 1) * vertical)) return null;
  if (!Number.isFinite(Math.hypot(run, rise) + (rail * rise) / run) || !Number.isFinite(run * height)) return null;

  const slope = rise / run;
  const angle = Math.atan(slope);
  const railVertical = rail / Math.cos(angle);
  const clearWidth = (run - (columns + 1) * rail) / columns;
  const clearHeight = (height - (rows + 1) * railVertical) / rows;
  const railEdge = Math.hypot(run, rise);
  return {
    run,
    rise,
    height,
    columns,
    rows,
    rail,
    slope,
    angle,
    railVertical,
    clearWidth,
    clearHeight,
    railEdge,
    railBlank: railEdge + rail * slope,
    stileBlank: clearHeight + rail * slope,
    panelBlankHeight: clearHeight + clearWidth * slope,
    stileX: (column) => column * (clearWidth + rail),
    rowBottom: (row) => row * (clearHeight + railVertical) + railVertical,
  };
}

// MARK: Models/RampGeometry.swift

type RampGeometry = {
  rise: number;
  gradient: number;
  width: number;
  run: number;
  slopeLength: number;
  totalRun: number;
  surfaceArea: number;
  planArea: number;
  angle: number;
};

function rampGeometry(
  rise: number,
  gradient: number,
  width: number,
  bottomLanding: number,
  topLanding: number,
): RampGeometry | null {
  if (![rise, gradient, width, bottomLanding, topLanding].every((value) => Number.isFinite(value))) return null;
  if (!(rise >= 0) || !(gradient > 0) || !(width > 0) || !(bottomLanding >= 0) || !(topLanding >= 0)) return null;
  const run = rise * gradient;
  const total = bottomLanding + run + topLanding;
  const slopeLength = Math.hypot(run, rise);
  if (!Number.isFinite(total) || !(total > 0)) return null;
  if (!Number.isFinite(slopeLength + bottomLanding + topLanding)) return null;
  if (!Number.isFinite((slopeLength + bottomLanding + topLanding) * width)) return null;
  return {
    rise,
    gradient,
    width,
    run,
    slopeLength,
    totalRun: total,
    surfaceArea: (bottomLanding + slopeLength + topLanding) * width,
    planArea: total * width,
    angle: rise === 0 ? 0 : (Math.atan(1 / gradient) * 180) / Math.PI,
  };
}

// MARK: Straight stairs

const straightStairs: VerifiedDefinition = {
  ...baseFromMeta("straight-stairs"),
  compute(v: Values, unit: VerifiedUnit): CalculatorOutput {
    const metric = unit === "metric";
    const totalRise = n(v, "totalRise");
    const preferred = n(v, "preferredRise");
    const run = n(v, "run");
    const width = n(v, "width");
    const floor = n(v, "floorThickness");
    const risers = roundedInt(totalRise / pos(preferred), 2, 60);
    const actualRise = totalRise / risers;
    const treads = risers - 1;
    const totalRun = treads * run;
    const degrees = (Math.atan2(actualRise, pos(run)) * 180) / Math.PI;
    const geometry = stairGeometry(risers, actualRise, run);
    const opening = geometry.opening(n(v, "headroom"), floor);
    if (!(n(v, "treadThickness") < actualRise) || !(n(v, "stringerWidth") > geometry.notchDepth)) {
      return {
        results: [
          {
            label: "Check stair dimensions",
            value: "Treads must be thinner than the rise, and the stringer wider than the notch depth.",
            primary: true,
          },
        ],
        marks: [],
        diagramValues: { invalid: 1 },
      };
    }
    const lu = lengthUnit(metric);
    const marks = Array.from(
      { length: Math.max(0, treads) },
      (_, i) =>
        `Tread ${i + 1} · nose at ${num(i * run, 2)} ${lu} · height ${num((i + 1) * actualRise, 2)} ${lu}` +
        ` · along pitch ${num(i * geometry.bridge, 2)} ${lu}`,
    );
    return {
      results: [
        { label: "Actual rise", value: len(actualRise, metric), primary: true },
        { label: "Number of rises", value: String(risers) },
        { label: "Number of treads", value: String(treads) },
        { label: "Total run", value: len(totalRun, metric) },
        { label: "Stair angle", value: deg(degrees) },
        { label: "Stringer pitch-line span", value: len(geometry.pitchLineLength, metric) },
        { label: "Stringer stock guide", value: len(geometry.stockGuide, metric) },
        { label: "Clear width", value: len(width, metric) },
        { label: "Required floor opening", value: len(opening, metric) },
        { label: "Vertical headroom", value: len(n(v, "headroom"), metric) },
        { label: "Unit bridge on stringer", value: len(geometry.bridge, metric) },
        { label: "Notch depth normal to board", value: len(geometry.notchDepth, metric) },
        { label: "Remaining stringer throat", value: len(n(v, "stringerWidth") - geometry.notchDepth, metric) },
        { label: "First riser before tread", value: len(actualRise - n(v, "treadThickness"), metric) },
        {
          label: "Layout basis",
          value: "Top tread one rise below landing. Size stringers and connections from the project design.",
        },
        {
          label: "Opening position",
          value:
            opening <= totalRun
              ? "Within the flight"
              : "Extends beyond the first nosing; include the lower approach in the opening.",
        },
      ],
      marks,
      diagramValues: {
        risers,
        count: risers,
        totalRise,
        totalRun,
        rise: actualRise,
        run,
        width,
        angle: degrees,
        thickness: floor,
        floorThickness: floor,
        openingRun: opening,
        stairGeometry: 1,
        stringerLength: geometry.pitchLineLength,
      },
    };
  },
};

// MARK: Spiral stairs

const spiralStairs: VerifiedDefinition = {
  ...baseFromMeta("spiral-stairs"),
  compute(v: Values, unit: VerifiedUnit): CalculatorOutput {
    const metric = unit === "metric";
    const risers = Math.max(3, roundedInt(n(v, "count"), 3, 40));
    if (
      !(n(v, "column") < n(v, "diameter")) ||
      !(n(v, "walkLine") > n(v, "column") / 2) ||
      !(n(v, "walkLine") < n(v, "diameter") / 2)
    ) {
      return {
        results: [
          {
            label: "Check spiral dimensions",
            value: "The walking line must lie between the centre column and the outside edge.",
            primary: true,
          },
        ],
        marks: [],
        diagramValues: { invalid: 1 },
      };
    }
    const rise = n(v, "totalRise") / risers;
    const turn = 360 / risers;
    const going = (2 * Math.PI * n(v, "walkLine")) / risers;
    const inner = (Math.PI * n(v, "column")) / risers;
    return {
      results: [
        { label: "Actual rise", value: len(rise, metric), primary: true },
        { label: "Rotation per tread", value: deg(turn, 3) },
        { label: "Walk-line going", value: len(going, metric) },
        { label: "Inner going", value: len(inner, metric) },
        { label: "Tread count", value: String(risers - 1) },
        { label: "Total rotation", value: deg(turn * (risers - 1), 2) },
      ],
      marks: [],
      diagramValues: {
        segments: risers,
        risers,
        rise,
        run: going,
        totalRun: going * (risers - 1),
        width: (n(v, "diameter") - n(v, "column")) / 2,
        stairGeometry: 3,
      },
    };
  },
};

// MARK: Steel spine stairs

const steelSpineStairs: VerifiedDefinition = {
  ...baseFromMeta("steel-spine-stairs"),
  compute(v: Values, unit: VerifiedUnit): CalculatorOutput {
    const metric = unit === "metric";
    const totalRise = n(v, "totalRise");
    const going = n(v, "going");
    const width = n(v, "width");
    const risers = roundedInt(n(v, "count"), 2, 40);
    const actualRise = totalRise / risers;
    const totalRun = (risers - 1) * going;
    const geometry = stairGeometry(risers, actualRise, going);
    const spine = geometry.pitchLineLength;
    const degrees = (geometry.pitch * 180) / Math.PI;
    return {
      results: [
        { label: "Spine pitch-line span", value: len(spine, metric), primary: true },
        {
          label: "Support basis",
          value: "Pitch span only; end supports and bracket offsets require the connection design.",
        },
        { label: "Actual rise", value: len(actualRise, metric) },
        { label: "Total run", value: len(totalRun, metric) },
        { label: "Spine angle", value: deg(degrees, 3) },
        { label: "Bracket count", value: String(risers - 1) },
        { label: "Clear half tread", value: len(width / 2, metric) },
      ],
      marks: [],
      diagramValues: {
        risers,
        count: risers,
        totalRise,
        totalRun,
        rise: actualRise,
        run: going,
        width,
        angle: degrees,
        model: 1,
        stairGeometry: 2,
      },
    };
  },
};

// MARK: Baluster spacing

const balusterSpacing = verifiedSpacing({
  slug: "baluster-spacing",
  noun: "baluster",
  maximumGap: true,
  flags: { model: 1 },
});

// MARK: Stair panel layout

const stairPanels: VerifiedDefinition = {
  ...baseFromMeta("stair-panels"),
  compute(v: Values, unit: VerifiedUnit): CalculatorOutput {
    const metric = unit === "metric";
    const g = stairPanelGeometry(
      n(v, "run"),
      n(v, "totalRise"),
      n(v, "panelHeight"),
      roundedInt(n(v, "count"), 1, 30),
      roundedInt(n(v, "rows"), 1, 20),
      n(v, "rail"),
      n(v, "thickness"),
    );
    if (!g) {
      return layoutInvalid(
        "The rails and stiles must leave positive clear openings. Increase the run or panel height, reduce rail width, or use fewer columns/rows.",
      );
    }
    const marks: string[] = [];
    for (let r = 0; r < g.rows; r += 1) {
      for (let c = 0; c <= g.columns; c += 1) {
        const x = g.stileX(c);
        const z = g.slope * x + g.rowBottom(r);
        marks.push(
          `Row ${r + 1}, stile ${c + 1} · left edge ${len(x, metric)} · bottom left ${len(z, metric)}` +
            " above the lower-rail origin",
        );
      }
    }
    const cuts: CalculatorCut[] =
      g.rail === 0
        ? []
        : [
            {
              mm: ceilInt(g.railBlank * (metric ? 1 : 25.4), 1, 1_000_000_000),
              count: g.rows + 1,
              label: "Continuous slope rail blank",
            },
            {
              mm: ceilInt(g.stileBlank * (metric ? 1 : 25.4), 1, 1_000_000_000),
              count: (g.columns + 1) * g.rows,
              label: "Plumb stile segment blank",
            },
          ];
    return {
      results: [
        { label: "Clear openings", value: `${g.columns} × ${g.rows} = ${g.columns * g.rows}`, primary: true },
        { label: "Clear horizontal panel width", value: len(g.clearWidth, metric) },
        { label: "Clear vertical panel height", value: len(g.clearHeight, metric) },
        {
          label: "Opening blank before fit allowance",
          value: `${len(g.clearWidth, metric)} × ${len(g.panelBlankHeight, metric)}`,
        },
        { label: "Panel pitch", value: deg((g.angle * 180) / Math.PI, 4) },
        { label: "Continuous slope rail edge", value: len(g.railEdge, metric) },
        { label: "Rail stock blank", value: `${g.rail === 0 ? 0 : g.rows + 1} × ${len(g.railBlank, metric)}` },
        {
          label: "Stile stock blank",
          value: `${g.rail === 0 ? 0 : (g.columns + 1) * g.rows} × ${len(g.stileBlank, metric)}`,
        },
        { label: "End-cut angle from square", value: deg((g.angle * 180) / Math.PI, 4) },
        {
          label: "Frame basis",
          value:
            "Continuous raked rails have plumb end cuts. Stiles fit between them with parallel raked ends. Rail width is measured perpendicular to its slope; height is vertical. Opening dimensions exclude grooves, rebates and fitting clearance.",
        },
      ],
      marks,
      diagramValues: { stairPanelGeometry: 1, model: 3 },
      cuts,
    };
  },
};

// MARK: Access ramp

const accessRamp: VerifiedDefinition = {
  ...baseFromMeta("access-ramp"),
  compute(v: Values, unit: VerifiedUnit): CalculatorOutput {
    const metric = unit === "metric";
    const g = rampGeometry(
      v.rise ?? 0,
      v.gradient ?? 0,
      v.rampWidth ?? 0,
      v.bottomLanding ?? 0,
      v.topLanding ?? 0,
    );
    if (!g) {
      return layoutInvalid(
        "Use a positive gradient and width with non-negative rise and landing lengths. The overall run must be positive.",
      );
    }
    return {
      results: [
        { label: "Ramp run between landings", value: len(g.run, metric), primary: true },
        { label: "Ramp surface length", value: len(g.slopeLength, metric) },
        { label: "Overall footprint length", value: len(g.totalRun, metric) },
        { label: "Clear ramp width", value: len(g.width, metric) },
        { label: "Walking surface area including landings", value: area(g.surfaceArea, metric) },
        { label: "Horizontal footprint area", value: area(g.planArea, metric) },
        { label: "Angle", value: deg(g.angle, 3) },
        { label: "Grade", value: `${quantity(g.rise === 0 ? 0 : 100 / g.gradient)}%` },
        { label: "Gradient", value: g.rise === 0 ? "Level · no ramp rise" : `1 : ${quantity(g.gradient)}` },
        {
          label: "Design basis",
          value:
            "One straight flight using the entered clear width and level landings. Check allowable flight rise, intermediate landings, turning space, handrails, barriers and surface requirements for the actual project.",
        },
      ],
      marks: [],
      diagramValues: { rampGeometry: 1, run: g.run, totalRun: g.totalRun, model: 2 },
    };
  },
};

export const definitions: Record<string, VerifiedDefinition> = {
  "straight-stairs": straightStairs,
  "spiral-stairs": spiralStairs,
  "steel-spine-stairs": steelSpineStairs,
  "baluster-spacing": balusterSpacing,
  "stair-panels": stairPanels,
  "access-ramp": accessRamp,
};
