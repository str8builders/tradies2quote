// ─────────────────────────────────────────────────────────────────────────
// Plan-reader — scale parsing (Phase 2, pure + deterministic).
//
// Turns a scale label found on a sheet ("1:100", "1:50 @ A3", '1/4" = 1'-0"')
// into a structured ratio + units + a confidence. This feeds the SCALE gate:
//   confidence == 0  ⇒  scale is unknown  ⇒  pixel measurement is FORBIDDEN.
// We never invent a scale; an unrecognized label yields confidence 0, not a
// hopeful default.
// ─────────────────────────────────────────────────────────────────────────

export type ScaleSystem = "metric" | "imperial";

export type ParsedScale = {
  /** The raw label we matched, normalized (e.g. "1:100"). null if none. */
  scale_text: string | null;
  /** Drawing units of "1" map to this many real-world mm. null if unknown. */
  mm_per_drawing_unit: number | null;
  system: ScaleSystem | null;
  /** [0,1]. 0 = no usable scale found (gate will forbid pixel measurement). */
  confidence: number;
  notes: string[];
};

const NONE: ParsedScale = {
  scale_text: null,
  mm_per_drawing_unit: null,
  system: null,
  confidence: 0,
  notes: [],
};

// Common architectural ratios — used only to sanity-rank a parsed ratio,
// never to override what's actually printed.
const COMMON_METRIC = new Set([5, 10, 20, 25, 50, 100, 200, 500, 1000]);

/**
 * Parse a metric ratio scale like "1:100" or "1 : 50".
 */
function parseMetricRatio(text: string): ParsedScale | null {
  // Not when the "ratio" is really a date or a clock time: 1:20/08/2026,
  // 1:20.08.26, 1:30:00, 1:30 pm. A ratio at a sentence end ("1:100.") or
  // before a sheet size ("1:50 @ A3") still parses.
  const m = text.match(/\b1\s*[:：]\s*(\d{1,4})\b(?![/.:]\d)(?!\s*[ap]\.?\s?m\b)/i);
  if (!m) return null;
  const denom = Number(m[1]);
  if (!Number.isFinite(denom) || denom <= 0) return null;
  // On a 1:100 drawing, 1 drawing-mm = 100 real mm.
  const mm_per_drawing_unit = denom;
  const notes: string[] = [];
  let confidence = 0.8;
  if (COMMON_METRIC.has(denom)) confidence = 0.92;
  else notes.push(`uncommon ratio 1:${denom} — double-check`);
  return {
    scale_text: `1:${denom}`,
    mm_per_drawing_unit,
    system: "metric",
    confidence,
    notes,
  };
}

/**
 * Parse an imperial scale like '1/4" = 1'-0"' or '1/2"=1ft'.
 * We resolve it to mm-per-drawing-inch for downstream consistency.
 */
function parseImperial(text: string): ParsedScale | null {
  // e.g. 1/4" = 1'-0"  →  fraction inch equals one foot
  const m = text.match(
    /\b(\d+)\s*\/\s*(\d+)\s*"?\s*=\s*1\s*['′]/,
  );
  if (!m) return null;
  const num = Number(m[1]);
  const den = Number(m[2]);
  if (!num || !den) return null;
  const drawingInches = num / den; // inches on paper that equal 1 real foot
  if (drawingInches <= 0) return null;
  // 1 real foot = 304.8 mm spread over `drawingInches` paper-inches.
  const mm_per_drawing_inch = 304.8 / drawingInches;
  return {
    scale_text: `${num}/${den}" = 1'-0"`,
    mm_per_drawing_unit: mm_per_drawing_inch,
    system: "imperial",
    confidence: 0.85,
    notes: [],
  };
}

/**
 * Parse a scale label. Returns confidence 0 (NONE) when nothing usable is
 * found — the caller must treat that as "scale unknown" and refuse to measure
 * from pixels until the user calibrates the sheet.
 */
export function parseScale(raw: string | null | undefined): ParsedScale {
  if (!raw || typeof raw !== "string") return NONE;
  const text = raw.trim();
  if (!text) return NONE;

  // "NTS" / "not to scale" is an explicit, confident statement that pixel
  // measurement is invalid.
  if (/\bN\.?T\.?S\.?\b/i.test(text) || /not\s+to\s+scale/i.test(text)) {
    return {
      scale_text: "NTS",
      mm_per_drawing_unit: null,
      system: null,
      confidence: 0,
      notes: ["sheet marked not-to-scale — pixel measurement forbidden"],
    };
  }

  return parseMetricRatio(text) ?? parseImperial(text) ?? NONE;
}
