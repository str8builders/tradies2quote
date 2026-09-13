import type { CalculatorOutput, CalculatorResult, VerifiedDefinition } from "../verified-calculators";
import { deg, len, lengthUnit, money, n, num, pos, roundedInt, swiftRound } from "./format";
import {
  conversionUnits, converted, fractionApproximation, imageScaleGeometry, metaBase, sigText,
} from "./convert-units";

/**
 * Native-parity ports of ios/T2QCAL/T2QCAL/Models/ToolsConvert.swift.
 * Each entry is keyed by slug and must reproduce the native result rows,
 * marks, diagram values, handoffs and cuts recorded in
 * fixtures/native-reference.json (see native/parity.test.ts).
 */

const row = (label: string, value: string, primary = false): CalculatorResult => ({ label, value, primary });

/** `ToolsLayouts.invalid` — a single explanatory row, never a hard error. */
const invalidOutput = (message: string): CalculatorOutput =>
  ({ results: [row("Check inputs", message, true)], diagramValues: { invalid: 1 } });

export const definitions: Record<string, VerifiedDefinition> = {};

// MARK: Bidirectional unit converters

function unitConverter(slug: string, kind: number): VerifiedDefinition {
  const units = conversionUnits(kind);
  return {
    ...metaBase(slug),
    compute(v) {
      const value = n(v, "value");
      const fromID = roundedInt(n(v, "fromUnit"), 0, units.length - 1);
      const toID = roundedInt(n(v, "toUnit"), 0, units.length - 1);
      const from = units[fromID], to = units[toID];
      const result = converted(value, from, to);
      const results = [row("Converted value", `${sigText(result)} ${to.symbol}`, true)];
      for (const unit of units) results.push(row(unit.label, sigText(converted(value, from, unit))));
      if (kind === 1) {
        const inches = (value * from.base) / 25.4;
        // Split after rounding to avoid displaying e.g. 1 ft 12 in.
        const rounded = swiftRound(inches * 1000) / 1000;
        const feet = Math.floor(rounded / 12);
        results.push(row("Feet and inches", `${Math.trunc(feet)} ft ${num(rounded - feet * 12, 3)} in`));
      }
      return {
        results,
        diagramValues: {
          conversionGeometry: 1, convKind: kind, value,
          fromUnit: fromID, toUnit: toID,
          converted: result, factor: from.base / to.base,
        },
      };
    },
  };
}

definitions["all-unit-converter"] = unitConverter("all-unit-converter", 1);
definitions["length-converter"] = unitConverter("length-converter", 1);
definitions["area-converter"] = unitConverter("area-converter", 2);
definitions["volume-converter"] = unitConverter("volume-converter", 3);
definitions["weight-converter"] = unitConverter("weight-converter", 4);

// MARK: Pitch, rise & angle

definitions["pitch-angle"] = {
  ...metaBase("pitch-angle"),
  compute(v, unit) {
    const metric = unit === "metric";
    const rise = n(v, "rise");
    const run = n(v, "run");
    const safeRun = pos(run);
    const degrees = (Math.atan2(rise, safeRun) * 180) / Math.PI;
    const ratio = rise > 0 ? `1 : ${num(safeRun / rise, 3)}` : "Level";
    return {
      results: [
        row("Angle", deg(degrees, 4), true),
        row("Percent grade", `${num((rise / safeRun) * 100, 3)}%`),
        row("Pitch", `${num((rise / safeRun) * 12, 3)} : 12`),
        row("Rise / run", ratio),
        row("Slope length", len(Math.sqrt(rise * rise + run * run), metric)),
      ],
      diagramValues: { width: run, height: rise, angle: degrees },
    };
  },
};

// MARK: Scale from image

definitions["image-scale"] = {
  ...metaBase("image-scale"),
  compute(v, unit) {
    const metric = unit === "metric";
    const g = imageScaleGeometry(n(v, "known"), n(v, "knownPixels"), n(v, "measuredPixels"));
    if (!g) return invalidOutput("Use a positive known length and reference pixel length.");
    return {
      results: [
        row("Recovered real length", `${sigText(g.targetLength)} ${lengthUnit(metric)}`, true),
        row("Real length per pixel", `${sigText(g.unitsPerPixel)} ${lengthUnit(metric)}/px`),
        row("Target / reference", `${num((g.targetPixels / g.referencePixels) * 100, 3)}%`),
        row("Calibration", "Use lengths from the same image and zoom; perspective must be corrected."),
      ],
      diagramValues: {
        imageScaleGeometry: 1, known: g.known, knownPixels: g.referencePixels,
        measuredPixels: g.targetPixels, recovered: g.targetLength,
      },
    };
  },
};

// MARK: Fraction and decimal

definitions["fraction-decimal"] = {
  ...metaBase("fraction-decimal"),
  compute(v) {
    const value = n(v, "value");
    const limit = roundedInt(n(v, "denominator"), 2, 256);
    const fraction = fractionApproximation(value, limit);
    if (!fraction) return invalidOutput("Enter a positive decimal and a denominator limit between 2 and 256.");
    return {
      results: [
        row("Nearest fraction", `${fraction.mixed} in`, true),
        row("Rounded decimal", `${sigText(fraction.decimal)} in`),
        row("Input minus approximation", `${sigText(value - fraction.decimal)} in`),
        row("Millimetres", `${sigText(value * 25.4)} mm`),
        row("Denominator limit", `Any whole denominator up to ${limit}`),
      ],
      diagramValues: {
        fractionGeometry: 1, value, denominator: limit,
        fractionNumerator: fraction.numerator, fractionDenominator: fraction.denominator,
      },
    };
  },
};

// MARK: Bubble level and grade

definitions["bubble-level"] = {
  ...metaBase("bubble-level"),
  compute(v, unit) {
    const metric = unit === "metric";
    const rise = n(v, "rise"), run = n(v, "run");
    const ratio = rise / pos(run);
    return {
      results: [
        row("Angle", deg((Math.atan(ratio) * 180) / Math.PI, 5), true),
        row("Percent grade", `${num(ratio * 100, 4)}%`),
        row("Pitch", `${num(ratio * 12, 4)} : 12`),
        row("Slope length", len(Math.sqrt(rise * rise + run * run), metric)),
        row("Rise per metre/foot", len(ratio * (metric ? 1000 : 12), metric)),
      ],
      diagramValues: { rise, run },
    };
  },
};

// MARK: Quote markup and GST

definitions["quote-markup"] = {
  ...metaBase("quote-markup"),
  compute(v) {
    const cost = n(v, "cost");
    const markupAmount = (cost * n(v, "markup")) / 100;
    const subtotal = cost + markupAmount;
    const gstAmount = (subtotal * n(v, "gst")) / 100;
    const total = subtotal + gstAmount;
    const margin = subtotal > 0 ? (markupAmount / subtotal) * 100 : 0;
    return {
      results: [
        row("Quote total (incl. GST)", money(total), true),
        row("Subtotal (excl. GST)", money(subtotal)),
        row("Markup", money(markupAmount)),
        row("GST content", money(gstAmount)),
        row("Margin on sell", `${num(margin, 2)}%`),
      ],
      diagramValues: { value: total, cost },
    };
  },
};
