// ─────────────────────────────────────────────────────────────────────────
// Structured extraction layer.
//
// Two entry points:
//
//   extractFromText(text, scope)
//     — Pure regex extraction. Same approach as aiTakeoffParser.ts
//       (we deliberately don't import it; we want this module to be
//       independent and self-contained), generalised to all scopes.
//
//   extractFromLLM(llmJson)
//     — Validates LLM-emitted structured JSON. The LLM is told to emit
//       extraction-only output (no quantities). This function calls
//       parseExtractedExtraction from schemas.ts and adds clarification
//       questions for any nulls.
//
// CRITICAL RULES (also enforced in the prompt at quote-prompt.ts):
//   - Unknown values must be EXPLICIT (null). Never silently guess.
//   - Core geometry missing → mark needs_clarification.
//   - The extraction NEVER produces final quantities; that's the
//     calculator's job.
// ─────────────────────────────────────────────────────────────────────────

import type {
  ExtractedDimensions,
  ExtractedExtraction,
  ExtractedOpening,
  ScopeType,
} from "./schemas";
import { parseExtractedExtraction } from "./schemas";
import { toMetres } from "./normalise";
import { METRES_BANDS, isPlausibleMetres } from "./plausibility";

// ─────────────────────────────────────────────────────────────────────────
// Regex utilities — replicated here intentionally so the takeoff module
// doesn't reach into aiTakeoffParser.ts internals.
// ─────────────────────────────────────────────────────────────────────────

/** A free-text "A x B" pair is only a plan footprint when its short side is at least this. */
const MIN_PLAN_M = 1;
/** …and its long side is inside the shared plausible edge band. */
const MAX_PLAN_M = METRES_BANDS.edge.max;

/**
 * One side of an "A x B" pair, in metres, via the normalisation layer: a
 * written unit is honoured; a bare number follows the shared convention
 * (100 or more is mm, smaller is metres as stated). Never the old "over 50
 * means mm" clamp that read 62 m as 0.062 m.
 */
function parseLength(value: string, unit: string | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return NaN;
  return toMetres(n, unit);
}

/**
 * A bare 51–99 beside an "x" is a timber section (90x45, 75x50) far more
 * often than a plan side, and it can't be told apart from a plan metre
 * figure — so the pair is not read at all (the scope then asks for the
 * size) rather than guessed either way. It was never usable before either:
 * the old clamp shrank it below the 1 m footprint floor.
 */
function isAmbiguousBareSide(value: string | undefined, unit: string | undefined): boolean {
  if (unit) return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 50 && n < 100;
}

function extractRectangle(
  text: string,
): { length_m: number; width_m: number } | null {
  const re =
    /(\d+(?:\.\d+)?)\s*(mm|cm|m|metres?|meters?)?\s*(?:by|x|×|\*)\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|metres?|meters?)?/gi;
  for (const m of text.matchAll(re)) {
    if (isAmbiguousBareSide(m[1], m[2]) || isAmbiguousBareSide(m[3], m[4])) continue;
    const a = parseLength(m[1] ?? "", m[2]);
    const b = parseLength(m[3] ?? "", m[4]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const length_m = Math.max(a, b);
    const width_m = Math.min(a, b);
    if (width_m < MIN_PLAN_M || length_m > MAX_PLAN_M) continue;
    return { length_m, width_m };
  }
  return null;
}

function extractSinglePattern(
  text: string,
  patterns: RegExp[],
): number | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function extractAreaM2(text: string): number | null {
  // "30 m²", "30m²", "30 square metres", "30 square meters", "30 sqm"
  // The trailing boundary is a negative lookahead, NOT \b: `\b` after the
  // superscript `²` (a non-word char) never matches when followed by a space,
  // so "30 m²" silently failed. `(?![a-z0-9])` accepts the superscript while
  // still rejecting partials like "m20"/"sqmeter". Equivalent to \b for the
  // m2/sqm/square forms; additionally fixes the m² form.
  const re =
    /(\d+(?:\.\d+)?)\s*(?:m²|m\^2|m2|square\s+(?:metres?|meters?)|sqm)(?![a-z0-9])/i;
  const m = text.match(re);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function extractVolumeM3(text: string): number | null {
  const re = /(\d+(?:\.\d+)?)\s*(?:m³|m\^3|m3|cubic\s+(?:metres?|meters?))\b/i;
  const m = text.match(re);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Words that describe a fence between "<n> m of" and "fence" — "20 metres of
 * paling fence", "30m of new timber paling fencing", "15 m of post and rail
 * fence". Only fence words: "6m of deck and a fence" is not a 6 m fence.
 */
const FENCE_DESCRIPTORS = String.raw`(?:(?:new|timber|wooden|wood|paling|palings|picket|pool|boundary|lapped|capped|slatted|horizontal|vertical|board|panel|privacy|garden|colou?rsteel|colorbond|post[-\s]+and[-\s]+rail)[\s-]+){0,3}`;

function extractPerimeterM(text: string): number | null {
  const re = new RegExp(
    String.raw`(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\s+(?:of\s+)?(?:perimeter|running|${FENCE_DESCRIPTORS}(?:fence|fencing)\b)`,
    "i",
  );
  const m = text.match(re);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Fence post centres, in mm — only with "post" in the phrase, so no other
 * spacing (rails, palings, joists) is read as one: "posts at 2.4m centres",
 * "posts at 2400 centres", "posts every 2.4 m", "posts 2.4m apart", "post
 * spacing 2.4m", "2.4m post centres". A post's own size or length ("125x125
 * posts 2.4m long") is never read. The fencing calculator decides whether
 * the figure can be right.
 */
function extractPostSpacingMm(text: string): number | null {
  const NUM_UNIT = String.raw`(\d+(?:\.\d+)?)\s*(mm|cm|m|metres?|meters?)?`;
  const SPACING = String.raw`(?:centres?|centers?|crs|c\/c|apart|spacings?)`;
  const patterns = [
    new RegExp(String.raw`\bposts?\s+(?:are\s+)?(?:at|@|every|on|spaced(?:\s+at)?)\s*${NUM_UNIT}(?![\dx×])`, "i"),
    new RegExp(String.raw`\bposts?\s+${NUM_UNIT}\s*${SPACING}\b`, "i"),
    new RegExp(String.raw`\bpost\s+(?:spacings?|centres?|centers?)\s*(?:of\s+|at\s+|is\s+|=\s*|:\s*)?${NUM_UNIT}`, "i"),
    new RegExp(String.raw`${NUM_UNIT}\s*post\s+(?:centres?|centers?|spacings?)\b`, "i"),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const metres = toMetres(Number(m[1]), m[2]);
    if (Number.isFinite(metres) && metres > 0) return Math.round(metres * 1000);
  }
  return null;
}

/**
 * The gutter (eave) length of a roof — long-run sheets are laid side by side
 * along it: "gutter runs the 12m side", "gutter along the 4m side", "spouting
 * on the 6 m side", "gutter length 12m", "14.4m of spouting". A bare "eaves"
 * figure is NOT read as a length ("600mm eaves" is the overhang), and a value
 * under 1 m or outside the shared edge band is ignored.
 */
function extractEaveM(text: string): number | null {
  const UNIT = String.raw`(mm|cm|m|metres?|meters?)`;
  const patterns = [
    new RegExp(
      String.raw`\b(?:gutters?|guttering|spouting|eaves?)\s+(?:(?:runs?|goes|is|sits)\s+)?(?:(?:along|on|down|across|at)\s+)?(?:the\s+)?(\d+(?:\.\d+)?)\s*${UNIT}?\s+(?:long\s+)?(?:side|edge|end|length|wall)\b`,
      "i",
    ),
    new RegExp(
      String.raw`\b(?:gutters?|guttering|spouting)\s+(?:length\s+|run\s+)?(?:is\s+|of\s+|=\s*|:\s*)?(\d+(?:\.\d+)?)\s*${UNIT}(?![a-z0-9²³])`,
      "i",
    ),
    new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${UNIT}\s+(?:of\s+)?(?:gutters?|guttering|spouting)\b`, "i"),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const v = toMetres(Number(m[1]), m[2]);
    if (Number.isFinite(v) && v >= 1 && isPlausibleMetres(v, "edge")) return v;
  }
  return null;
}

/**
 * A slab / pad thickness in mm: "150 thick", "150mm thick", "15cm thick",
 * "0.15m thick", "thickness 125mm". A bare figure is mm (under 1, metres).
 * Anything outside 25–1000 mm isn't a slab thickness and isn't read (the
 * concrete calculator then uses its default and says so).
 */
function extractSlabThicknessMm(text: string): number | null {
  const NUM_UNIT = String.raw`(\d+(?:\.\d+)?)\s*(millimet(?:re|er)s?|mm|cm|metres?|meters?|m)?`;
  const patterns = [
    new RegExp(String.raw`(?:^|[^\w.])${NUM_UNIT}\s*thick\b`, "i"),
    new RegExp(String.raw`\bthickness\s*(?:of\s+|is\s+|=\s*|:\s*)?${NUM_UNIT}`, "i"),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) continue;
    const u = (m[2] ?? "").toLowerCase();
    const mm =
      u === "mm" || u.startsWith("millimet")
        ? n
        : u === "cm"
          ? n * 10
          : u
            ? n * 1000
            : n < 1
              ? n * 1000
              : n;
    const rounded = Math.round(mm * 1000) / 1000;
    if (rounded >= 25 && rounded <= 1000) return rounded;
  }
  return null;
}

function extractPitch(text: string): number | null {
  const re = /(\d+(?:\.\d+)?)\s*(?:deg(?:rees)?|°)\s*(?:pitch|roof)?/i;
  const m = text.match(re);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 70) return n;
  }
  return null;
}

function extractSpacing(text: string): number | null {
  // "450mm centres", "joists at 450", "stud spacing 600", "@ 600"
  const patterns = [
    /(\d{3})\s*mm\s*(?:centres|centers|c\/c|cc|spacing)/i,
    /(?:centres?|spacing|@)\s*(\d{3})\s*mm?\b/i,
    /\b(\d{3})\s+(?:centres|cc)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 100 && n <= 1200) return n;
    }
  }
  return null;
}

function extractWastePercent(text: string): number | null {
  const re =
    /(?:(\d+(?:\.\d+)?)\s*(?:%|percent)\s*waste|waste\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:%|percent)?)/i;
  const m = text.match(re);
  if (m) {
    const raw = m[1] ?? m[2];
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 50) return n;
  }
  return null;
}

function extractStockLengthM(text: string): number | null {
  // Match in priority order:
  //   "stock 6m" / "stock length 6m"
  //   "buy timber in 6m lengths" / "buys 6m timber"
  //   "6m timber" / "6m stock" / "6m lengths"
  // The clamp 2.4–7.2 m is the NZ trade range (anything outside is
  // almost certainly a dimension that's not a stock length).
  const patterns: RegExp[] = [
    /(?:stock|stock\s+length)\s+(\d+(?:\.\d+)?)\s*(?:m|metres?)\b/i,
    /(?:buy(?:s)?\s+(?:timber\s+in|in))\s+(\d+(?:\.\d+)?)\s*(?:m|metres?)\b/i,
    /(\d+(?:\.\d+)?)\s*(?:m|metres?)\s+(?:timber|stock|lengths?)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 2.4 && n <= 7.2) return n;
    }
  }
  return null;
}

function extractCoverageMm(text: string): number | null {
  const re = /(\d{2,3})\s*mm\s*(?:cover(?:age)?|exposed|to\s+the\s+weather)/i;
  const m = text.match(re);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function extractOpenings(text: string): ExtractedOpening[] {
  const openings: ExtractedOpening[] = [];
  const NUMBER_WORDS: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const tally = (noun: "door" | "window") => {
    const re = new RegExp(
      `\\b(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\s+${noun}s?\\b`,
      "i",
    );
    const m = text.match(re);
    if (!m) return;
    const raw = (m[1] ?? "").toLowerCase();
    const count = NUMBER_WORDS[raw] ?? Number(raw);
    if (Number.isFinite(count) && count > 0) {
      openings.push({
        kind: noun,
        count,
        width_m: noun === "door" ? 0.82 : 1.2,
        height_m: noun === "door" ? 2.04 : 1.2,
      });
    }
  };
  tally("door");
  tally("window");
  return openings;
}

/**
 * How many faces the tradie says a lining job covers: "GIB both sides",
 * "two sides", "double sided" → 2; "one side", "single sided" → 1; nothing
 * said → null (the lining calculator then assumes one side and says so).
 * Same wording the legacy wall parser reads.
 */
function extractLinedFaces(text: string): 1 | 2 | null {
  if (/\b(?:both\s+sides?|two\s+sides?|gib\s+both|double[-\s]+sided?)\b/i.test(text)) return 2;
  if (/\b(?:one\s+side(?:\s+only)?|single[-\s]+sided?|gib\s+one\s+side)\b/i.test(text)) return 1;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Wall-kind detection (exterior-only insulation rule).
//
// "exterior" requires the tradie to have SAID it (or a scan marker to
// carry exterior_wall_run_m). No statement → "unknown", which blocks
// the insulation calculator — we never assume walls are exterior.
// ─────────────────────────────────────────────────────────────────────────

const EXTERIOR_WALL_RE =
  /\b(?:exterior|external|outside|outdoor|perimeter)\s+walls?\b/i;
const INTERIOR_WALL_RE =
  /\b(?:interior|internal|partition|dividing)\s+walls?\b|\bpartitions?\b/i;

export function detectWallKind(
  text: string,
): "exterior" | "interior" | "mixed" | "unknown" {
  const ext = EXTERIOR_WALL_RE.test(text);
  const int = INTERIOR_WALL_RE.test(text);
  if (ext && int) return "mixed";
  if (ext) return "exterior";
  if (int) return "interior";
  return "unknown";
}

/**
 * Pull a structured plan marker emitted by /api/quotes/scan-drawing
 * (the existing `[T2Q_PLAN] key=value …` format). Returns null if no
 * marker is present.
 */
function extractMarker(
  text: string,
): {
  length_m?: number;
  width_m?: number;
  height_m?: number;
  spacing_mm?: number;
  /** Total wall run (Wave 44) — sum of every wall segment on the plan. */
  wall_run_m?: number;
  /** Exterior (perimeter) wall run — positive evidence for insulation. */
  exterior_wall_run_m?: number;
  door_count?: number;
  window_count?: number;
} | null {
  const re = /\[T2Q_PLAN\]\s+([^\n\r]+)/i;
  const match = text.match(re);
  if (!match) return null;
  const out: {
    length_m?: number;
    width_m?: number;
    height_m?: number;
    spacing_mm?: number;
    wall_run_m?: number;
    exterior_wall_run_m?: number;
    door_count?: number;
    window_count?: number;
  } = {};
  const pairs = (match[1] ?? "").split(/\s+/);
  // A cladding marker's length is the building's whole exterior wall run
  // added together — the whole-run band, like the legacy marker reader.
  const isCladding = pairs.some((p) => /^type=cladding$/i.test(p));
  for (const part of pairs) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).toLowerCase();
    const raw = part.slice(eq + 1);
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) continue;
    if (n <= 0 && key !== "door_count" && key !== "window_count") continue;
    // Plan edges: the ONE shared plausibility band (the legacy marker reader
    // uses the same). Out of band → dropped, never rescaled.
    if (key === "length_m" && isPlausibleMetres(n, isCladding ? "wallRun" : "edge")) out.length_m = n;
    if (key === "width_m" && isPlausibleMetres(n, "edge")) out.width_m = n;
    if (key === "height_m" && n >= 0.5 && n <= 20) out.height_m = n;
    if ((key === "joist_spacing_mm" || key === "stud_spacing_mm") && n >= 100 && n <= 1200) {
      out.spacing_mm = n;
    }
    // Wall run is a SUM of segments, so it can exceed the single-edge
    // envelope — clamp to a whole-house band (2m–1000m) instead.
    if (key === "wall_run_m" && n >= 2 && n <= 1000) out.wall_run_m = n;
    // Exterior run is bounded by the total run — same band.
    if (key === "exterior_wall_run_m" && n >= 2 && n <= 1000) {
      out.exterior_wall_run_m = n;
    }
    if (key === "door_count" && n >= 0 && n <= 200) out.door_count = Math.round(n);
    if (key === "window_count" && n >= 0 && n <= 200) out.window_count = Math.round(n);
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry — regex extraction.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Extract a structured ExtractedExtraction from a description for a
 * given scope. Pure regex — no LLM. Unknown values are left as null
 * (per CRITICAL RULES at top of file).
 */
export function extractFromText(
  description: string,
  scope: ScopeType,
): ExtractedExtraction {
  const text = description ?? "";
  const marker = extractMarker(text);
  const rect = extractRectangle(text);

  // For framing/lining the load-bearing dimension is the TOTAL wall run
  // (every wall summed), not a bounding-box edge. When the marker carries
  // it, use it as length_m so the framing/lining calculators size off the
  // whole plan. Other scopes (deck/roofing/…) keep using the edge length.
  const wallScopes: ScopeType[] = ["framing", "lining"];
  const lengthForScope =
    wallScopes.includes(scope) && marker?.wall_run_m !== undefined
      ? marker.wall_run_m
      : (marker?.length_m ?? rect?.length_m ?? null);

  const dimensions: ExtractedDimensions = {
    length_m: lengthForScope,
    width_m: marker?.width_m ?? rect?.width_m ?? null,
    height_m: marker?.height_m ?? null,
    area_m2: extractAreaM2(text),
    perimeter_m: extractPerimeterM(text),
    pitch_deg: extractPitch(text),
    volume_m3: extractVolumeM3(text),
    eave_m: extractEaveM(text),
  };

  // Height-specific regex (separate from any rectangle).
  if (dimensions.height_m === null) {
    const heightPatterns = [
      /(\d+(?:\.\d+)?)\s*(?:m|metres?)\s+high\b/i,
      /(?:wall|ceiling|fence)\s+height\s+(?:is\s+)?(\d+(?:\.\d+)?)\s*(?:m|metres?)?\b/i,
      /(\d+(?:\.\d+)?)\s+high\b/i,
    ];
    const h = extractSinglePattern(text, heightPatterns);
    if (h !== null && h > 0 && h < 20) dimensions.height_m = h;
  }
  // Concrete: the scope's height_m is its slab thickness in mm (the clarify
  // question asks for it there, and the calculator reads it so) — a stated
  // thickness ("150 thick") beats the 100 mm default.
  if (scope === "concrete") {
    const thicknessMm = extractSlabThicknessMm(text);
    if (thicknessMm !== null) dimensions.height_m = thicknessMm;
  }

  // Openings — the marker's whole-plan door/window counts (read off the
  // entire drawing) are more reliable than the prose regex, which only
  // catches the first "<n> doors" mention. Prefer the marker per-kind.
  const openings = extractOpenings(text);
  const applyMarkerCount = (kind: "door" | "window", count: number | undefined) => {
    if (count === undefined || count <= 0) return;
    const existing = openings.find((o) => o.kind === kind);
    if (existing) {
      existing.count = count;
    } else {
      openings.push({
        kind,
        count,
        width_m: kind === "door" ? 0.82 : 1.2,
        height_m: kind === "door" ? 2.04 : 1.2,
      });
    }
  };
  applyMarkerCount("door", marker?.door_count);
  applyMarkerCount("window", marker?.window_count);
  // A fence's spacing is its POST centres, read only with "post" in the
  // phrase — never another member's "600 centres".
  const spacing_mm =
    scope === "fencing"
      ? extractPostSpacingMm(text)
      : (extractSpacing(text) ?? marker?.spacing_mm ?? null);
  const waste_percent = extractWastePercent(text);
  const stock_length_m = extractStockLengthM(text);
  const coverage_mm = extractCoverageMm(text);

  // The lining calculator reads the lined faces from the notes (the LLM
  // extraction writes them there); the regex extraction records what the
  // tradie said, so "GIB both sides" isn't lost on an area-only lining job.
  const notes: string[] = [];
  if (scope === "lining") {
    const faces = extractLinedFaces(text);
    if (faces === 2) notes.push("Lined both sides (as stated).");
    if (faces === 1) notes.push("Lined one side (as stated).");
  }

  const needs_clarification: string[] = [];
  const dimensionRequirementByScope: Record<ScopeType, string[]> = {
    deck: ["length_m", "width_m"],
    cladding: ["length_m"],
    framing: ["length_m", "height_m"],
    roofing: ["area_m2"],
    lining: ["area_m2"],
    insulation: ["area_m2"],
    fencing: ["length_m"],
    concrete: ["length_m"],
    fixing: ["length_m"],
    generic: [],
  };
  for (const field of dimensionRequirementByScope[scope]) {
    const v = (dimensions as Record<string, number | null | undefined>)[field];
    if (v === null || v === undefined) needs_clarification.push(field);
  }

  return {
    confidence: marker ? 0.85 : rect ? 0.6 : 0.4,
    project_type: null,
    scope_type: scope,
    sub_scopes: [],
    dimensions,
    openings,
    spacing_mm,
    material_spec: null,
    stock_length_m,
    coverage_mm,
    waste_percent,
    // Exterior-only insulation rule: only the insulation scope carries
    // wall context, and "exterior" needs a positive statement or the
    // scan's exterior_wall_run_m marker. Everything else stays null.
    wall_kind: scope === "insulation" ? detectWallKind(text) : null,
    exterior_wall_run_m: marker?.exterior_wall_run_m ?? null,
    notes,
    needs_clarification,
    clarification_questions: [],
    source_basis: marker ? "marker" : "regex",
  };
}

/**
 * Parse LLM-emitted structured JSON. Returns either a validated
 * extraction or a failure result.
 */
export function extractFromLLM(
  rawJson: unknown,
): { ok: true; extraction: ExtractedExtraction } | { ok: false; errors: string[] } {
  const parsed = parseExtractedExtraction(rawJson);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  return { ok: true, extraction: { ...parsed.value, source_basis: "llm" } };
}
