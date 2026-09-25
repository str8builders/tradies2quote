import {
  calculateCladdingTakeoff,
  calculateDeckTakeoff,
  calculateMaterialTakeoff,
  calculateSubfloorTakeoff,
  type CladdingTakeoffInput,
  type DeckTakeoffInput,
  type MaterialTakeoffInput,
  type MaterialTakeoffResult,
  type SubfloorTakeoffInput,
} from "./materialCalculator";
import { normalizeSpokenMeasurements } from "./transcript/measureNormalize";
import {
  BARE_MM_FROM,
  METRES_BANDS,
  checkMetres,
  isPlausibleMetres,
} from "./takeoff/plausibility";

/**
 * What kind of job the operator described in voice/text.
 * - "wall":     internal wall framing (the original takeoff)
 * - "deck":     external decking (bearers, joists, boards, piles)
 * - "cladding": exterior weatherboard on a wall
 * - "subfloor": floor framing under the house
 * - "unknown":  no clear signal — falls back to no calculator run
 */
export type TakeoffType =
  | "wall"
  | "deck"
  | "cladding"
  | "subfloor"
  | "unknown";

interface ParsedTakeoffBase {
  missingFields: string[];
  assumptions: string[];
  confidence: number;
  /**
   * Values that WERE read but are implausible after unit conversion (a wall
   * "2400m high", studs at "60 centres"). They are never fed to a
   * calculator: canRunCalculator() is false while any are present, and each
   * message is also in missingFields so a drawing's blocked line tells the
   * tradie exactly what to check.
   */
  reviewFlags?: string[];
}

/**
 * Discriminated union: the `type` field narrows `input` to the right
 * shape automatically, so callers can do `if (r.type === "deck")` and
 * TS will know `r.input` is `Partial<DeckTakeoffInput>`.
 */
export type ParsedTakeoffResult =
  | (ParsedTakeoffBase & { type: "wall"; input: Partial<MaterialTakeoffInput> })
  | (ParsedTakeoffBase & { type: "deck"; input: Partial<DeckTakeoffInput> })
  | (ParsedTakeoffBase & {
      type: "cladding";
      input: Partial<CladdingTakeoffInput>;
    })
  | (ParsedTakeoffBase & {
      type: "subfloor";
      input: Partial<SubfloorTakeoffInput>;
    })
  | (ParsedTakeoffBase & { type: "unknown"; input: Record<string, never> });

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

// ─────────────────────────────────────────────────────────────────────────
// Structured markers (Wave 43)
//
// The scan-drawing route extracts a structured `plan` object from the
// drawing (shape, length_m, width_m, …). That structured data USED to
// be discarded — the ScanPanel built a plain-English transcript and the
// parser had to guess at the deck dimensions by scanning the text for
// "X by Y" patterns. That guess was fragile: if the drawing also had
// a site outline (e.g. 7m × 6m) the parser could grab THAT instead of
// the deck dims (e.g. 4.8m × 3.82m), and the calculator produced a
// 30-m² deck takeoff when the real deck is 18 m². No amount of
// downstream ratio-guarding can fix bad inputs — the dimensions have
// to be right at the source.
//
// The fix: ScanPanel now embeds a deterministic marker line at the top
// of the transcript when the AI produced structured plan data:
//
//   [T2Q_PLAN] type=deck length_m=4.8 width_m=3.82 joist_spacing_mm=450
//   [T2Q_TIMBER] stock_length_m=6
//
// Markers are parsed FIRST, before any loose text matching, so the
// calculator gets the AI's structured guess directly. The free-form
// dimensions textarea stays as-is for AI consumption (it captures
// step heights, post depths, accessories the calculator doesn't model)
// but no longer doubles as the source of truth for the calculator's
// primary plan dimensions.
// ─────────────────────────────────────────────────────────────────────────
const T2Q_PLAN_RE = /\[T2Q_PLAN\]\s+([^\n\r]+)/i;
const T2Q_TIMBER_RE = /\[T2Q_TIMBER\]\s+([^\n\r]+)/i;

function parseMarkerPairs(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.split(/\s+/)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

export interface StructuredPlanMarker {
  type?: string;
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  joistSpacingMm?: number;
  postCount?: number;
  postSpacingM?: number;
  // Wave 44 — whole-drawing wall totals for multi-room floor plans.
  wallRunM?: number;
  // Exterior (perimeter) wall run, when the drawing distinguishes it. Used to
  // size insulation off exterior walls ONLY. Absent → insulation stays
  // review-required (no exterior/interior guess).
  exteriorWallRunM?: number;
  studSpacingMm?: number;
  doorCount?: number;
  windowCount?: number;
  /**
   * Plan fields the tradie corrected on the scan review screen (e.g.
   * `edited=width_m,wall_run_m`). Those values are the tradie's own numbers:
   * the loose DIMENSIONS-text cross-check never overrides them.
   */
  edited?: string[];
}

/**
 * Pull `[T2Q_PLAN] key=value key=value …` off the transcript. Returns
 * undefined if no marker, or if the marker's length/width values are
 * outside the shared plausible edge band (takeoff/plausibility.ts,
 * 0.1–100 m) — a corrupted marker (a 4800 "m" side) can't bypass the
 * safety floor, and is never rescaled.
 */
export function extractStructuredPlanMarker(
  text: string,
): StructuredPlanMarker | undefined {
  const m = text.match(T2Q_PLAN_RE);
  if (!m) return undefined;
  const pairs = parseMarkerPairs(m[1] ?? "");
  const optNum = (key: string): number | undefined => {
    const raw = pairs[key];
    if (raw === undefined) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const rawLength = optNum("length_m");
  const rawWidth = optNum("width_m");
  // Envelope check — the ONE shared plausibility rule for a plan edge
  // (the orchestrator's marker reader uses the same band). The old 1–30 m
  // envelope dropped a real 62 m cladding marker, so the legacy calculator
  // asked for a wall length the drawing already gave. Out-of-band markers
  // are dropped so a corrupted marker can't bypass the safety floor.
  if (rawLength !== undefined && !isPlausibleMetres(rawLength, "edge")) {
    return undefined;
  }
  if (rawWidth !== undefined && !isPlausibleMetres(rawWidth, "edge")) {
    return undefined;
  }
  // NZ convention: length ≥ width. The deck calculator runs joists
  // across width and decking along length — silently swapping the
  // two changes joist count (e.g. 7×6 → 17 joists, 6×7 → 15) so
  // normalising here keeps the result deterministic regardless of
  // how the AI labelled the axes.
  let lengthM = rawLength;
  let widthM = rawWidth;
  if (lengthM !== undefined && widthM !== undefined) {
    lengthM = Math.max(rawLength!, rawWidth!);
    widthM = Math.min(rawLength!, rawWidth!);
  }
  // Total wall run — a SUM of every wall segment, so it legitimately exceeds
  // the single-edge plan envelope. Clamp to a whole-house sane band instead.
  const rawWallRun = optNum("wall_run_m");
  const wallRunM =
    rawWallRun !== undefined && rawWallRun >= 2 && rawWallRun <= 1000
      ? rawWallRun
      : undefined;
  // Exterior (perimeter) wall run — same sane band as the total. Used to size
  // insulation exterior-only. Out-of-band / absent → undefined (no guess).
  const rawExteriorRun = optNum("exterior_wall_run_m");
  const exteriorWallRunM =
    rawExteriorRun !== undefined && rawExteriorRun >= 2 && rawExteriorRun <= 1000
      ? rawExteriorRun
      : undefined;
  const optCount = (key: string): number | undefined => {
    const raw = pairs[key];
    if (raw === undefined) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 200 ? Math.round(n) : undefined;
  };
  return {
    type: pairs["type"]?.toLowerCase(),
    lengthM,
    widthM,
    heightM: optNum("height_m"),
    joistSpacingMm: optNum("joist_spacing_mm"),
    postCount: optNum("post_count"),
    postSpacingM: optNum("post_spacing_m"),
    wallRunM,
    exteriorWallRunM,
    studSpacingMm: optNum("stud_spacing_mm"),
    doorCount: optCount("door_count"),
    windowCount: optCount("window_count"),
    edited: pairs["edited"]
      ?.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[a-z_]+$/.test(s)),
  };
}

/**
 * Pull `[T2Q_TIMBER] stock_length_m=6` off the transcript. Defence
 * against the scan UI's timber-length preference being silently
 * dropped on the way to the calculator. Clamps to the same 2.4–7.2 m
 * band the UI enforces so a bad marker can't produce nonsense.
 */
export function extractTimberStockLengthM(text: string): number | undefined {
  const m = text.match(T2Q_TIMBER_RE);
  if (m) {
    const pairs = parseMarkerPairs(m[1] ?? "");
    const raw = pairs["stock_length_m"];
    if (raw !== undefined) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 2.4 && n <= 7.2) {
        return Math.round(n * 10) / 10;
      }
    }
  }
  // Fallback to the prose hint the ScanPanel writes ("Tradie buys
  // timber in 6m lengths").
  const re = /buys?\s+timber\s+in\s+(\d+(?:\.\d+)?)\s*(?:m|metres?)?\s+length/i;
  const pm = text.match(re);
  if (pm) {
    const n = Number(pm[1]);
    if (Number.isFinite(n) && n >= 2.4 && n <= 7.2) {
      return Math.round(n * 10) / 10;
    }
  }
  return undefined;
}

function readNumberToken(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const lower = token.toLowerCase();
  if (lower in NUMBER_WORDS) return NUMBER_WORDS[lower];
  const n = Number(token);
  return Number.isFinite(n) ? n : undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// Unit-aware dimension reading
//
// One rule for every number the takeoff reads off a transcript:
//   - an explicit unit is always honoured: mm / cm / m (m² / mm² for areas);
//   - a BARE length / width / height / span ≥ 100 is millimetres — NZ plans
//     and tradies drop the "mm" ("2400 high" = 2.4 m, "4800 x 3820"), while a
//     bare value under 100 is metres ("a 10m wall", "2.4 high");
//   - spacings and thicknesses come out in millimetres ("600 centres");
//   - areas come out in m².
// A value that is still outside its kind's sane band AFTER conversion comes
// back plausible=false. Callers flag it for review and never hand it to a
// calculator — "GIB both sides for a 10m wall, 2400 high" once read the 2400
// as metres and produced 18,334 GIB sheets and 806,697 screws.
// ─────────────────────────────────────────────────────────────────────────

export type DimensionKind =
  | "length"
  | "width"
  | "height"
  | "span"
  | "run"
  | "thickness"
  | "spacing"
  | "area";

export type DimensionUnit = "m" | "mm" | "m²";

const DIMENSION_RULES: Record<
  DimensionKind,
  { unit: DimensionUnit; bareMmFrom?: number; min: number; max: number }
> = {
  // One wall / edge / member length, or a plan width. (A reading band: the
  // calculator gate then applies the shared edge / wall-run band.)
  length: { unit: "m", bareMmFrom: BARE_MM_FROM, min: 0.1, max: 200 },
  width: { unit: "m", bareMmFrom: BARE_MM_FROM, min: 0.1, max: 200 },
  // Wall / stud height — the only height the legacy calculators take. The
  // shared wall-height band (takeoff/plausibility.ts).
  height: {
    unit: "m",
    bareMmFrom: BARE_MM_FROM,
    min: METRES_BANDS.wallHeight.min,
    max: METRES_BANDS.wallHeight.max,
  },
  // Joist / bearer span.
  span: { unit: "m", bareMmFrom: BARE_MM_FROM, min: 0.1, max: 30 },
  // TOTAL wall run — every wall on the plan summed, so a bare "120" is 120 m
  // of wall (millimetres only from 1000 up). Same whole-house band as the
  // [T2Q_PLAN] wall_run_m marker.
  run: { unit: "m", bareMmFrom: 1000, min: 2, max: METRES_BANDS.wallRun.max },
  thickness: { unit: "mm", min: 1, max: 600 },
  spacing: { unit: "mm", min: 100, max: 1200 },
  area: { unit: "m²", min: 0.1, max: 5000 },
};

export interface DimensionReading {
  kind: DimensionKind;
  /** The converted value, in `unit`. */
  value: number;
  unit: DimensionUnit;
  /** True when no unit was written and the rule above supplied it. */
  unitInferred: boolean;
  /** False when the converted value is outside [min, max] for the kind. */
  plausible: boolean;
  min: number;
  max: number;
  /** The number (and unit) as written — quoted back in review messages. */
  source: string;
}

type CanonicalUnit = "mm" | "cm" | "m" | "mm2" | "cm2" | "m2";

const UNIT_ALIASES: Array<[RegExp, CanonicalUnit]> = [
  [/^(?:mm|millimet(?:re|er)s?|mils?)$/, "mm"],
  [/^(?:cm|centimet(?:re|er)s?)$/, "cm"],
  [/^(?:m|metres?|meters?|mtrs?)$/, "m"],
  [/^(?:mm2|mm²|mm\^2|square millimet(?:re|er)s?)$/, "mm2"],
  [/^(?:cm2|cm²|cm\^2)$/, "cm2"],
  [/^(?:m2|m²|m\^2|sqm|sq\.? ?m|sq(?:uare)?\.? met(?:re|er)s?)$/, "m2"],
];

/** undefined = no unit written; null = a unit we don't understand. */
function canonicalUnit(raw: string | undefined): CanonicalUnit | undefined | null {
  if (raw === undefined) return undefined;
  const u = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!u) return undefined;
  for (const [re, canon] of UNIT_ALIASES) if (re.test(u)) return canon;
  return null;
}

/** Round to 6 dp so a unit conversion never carries float noise. */
function roundMicro(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Convert one written dimension into its kind's unit (m, mm or m²) using the
 * rule above. Returns undefined for a non-number, a non-positive value, or a
 * unit that doesn't fit the kind (an area unit on a length, …).
 */
export function readDimension(
  raw: string | number,
  unit: string | undefined,
  kind: DimensionKind,
): DimensionReading | undefined {
  const written = typeof raw === "number" ? String(raw) : String(raw).trim();
  const n = Number(written.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const u = canonicalUnit(unit);
  if (u === null) return undefined;
  const rule = DIMENSION_RULES[kind];
  const areaUnit = u === "mm2" || u === "cm2" || u === "m2";
  let value: number | undefined;
  if (rule.unit === "m²") {
    if (u === undefined || u === "m2") value = n;
    else if (u === "mm2") value = n / 1e6;
    else if (u === "cm2") value = n / 1e4;
  } else if (areaUnit) {
    value = undefined;
  } else if (rule.unit === "m") {
    if (u === "mm") value = n / 1000;
    else if (u === "cm") value = n / 100;
    else if (u === "m") value = n;
    else value = n >= (rule.bareMmFrom ?? Infinity) ? n / 1000 : n;
  } else if (u === "mm") {
    value = n;
  } else if (u === "cm") {
    value = n * 10;
  } else if (u === "m") {
    value = n * 1000;
  } else {
    // Bare spacing / thickness: "600 centres" and "90 thick" are mm; a
    // decimal like "0.6 centres" can only be metres.
    value = n < 1 || (kind === "spacing" && n < 10) ? n * 1000 : n;
  }
  if (value === undefined) return undefined;
  value = roundMicro(value);
  const unitText = unit?.trim() ?? "";
  return {
    kind,
    value,
    unit: rule.unit,
    unitInferred: u === undefined,
    plausible: value >= rule.min && value <= rule.max,
    min: rule.min,
    max: rule.max,
    source: unitText
      ? `${written}${unitText.length <= 2 ? "" : " "}${unitText}`
      : written,
  };
}

function formatNumber(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Review message for a value that was read but can't be right. */
function implausibleMessage(
  label: string,
  r: DimensionReading,
  where = "",
): string {
  const u = r.unit === "mm" ? "mm" : ` ${r.unit}`;
  return `${label}${where} "${r.source}" reads as ${formatNumber(r.value)}${u} — outside the ${formatNumber(r.min)}–${formatNumber(r.max)}${u} range. Check the ${label.toLowerCase()}.`;
}

// Regex building blocks. Every pattern below captures (1) the number and
// (2) the unit, if one was written.
const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const LEN_UNIT = String.raw`(millimet(?:re|er)s?|mm|mils?|centimet(?:re|er)s?|cm|metres?|meters?|mtrs?|m)`;
// A unit must end at a word boundary that isn't the start of m² / m2 / mm.
const UNIT_END = String.raw`(?![a-z0-9²³^])`;
const OPT_LEN_UNIT = String.raw`(?:\s*${LEN_UNIT}${UNIT_END})?`;
// A number that starts a pattern must not be the tail of another token
// ("H3.2", "90x45", the "400" of "2,400").
const NUM_START = String.raw`(?:^|[^\w.,])`;
const AREA_UNIT = String.raw`(m²|m\^2|m2|sqm|sq\.?\s?m|square\s+met(?:re|er)s?|mm²|mm2)`;
const SPACING_WORD = String.raw`(?:centres?|centers?|crs|ctrs|c\/c|cc|spacings?)(?![a-z])`;

const rx = (source: string) => new RegExp(source, "gi");

/** Nouns that mean a number describes something other than the wall itself. */
const NOT_THE_WALL_RE =
  /\b(?:windows?|doors?|openings?|sills?|lintels?|balustrades?|handrails?|rails?|bench(?:es)?|vanit(?:y|ies)|fences?|gates?|posts?|piles?|steps?|stairs?|risers?|treads?|joists?|bearers?|boards?|sheets?|battens?|decking|timber|stock|lengths?|plates?|nogs?|noggins?|dwangs?|rafters?|purlins?|screws?|nails?)\b/i;
/** Nouns that mean a "centres" figure isn't the stud spacing. */
const NOT_STUDS_RE =
  /\b(?:joists?|rafters?|purlins?|trusses?|battens?|bearers?|piles?|posts?|nogs?|noggins?|dwangs?|screws?|nails?|staples?|fixings?|fasteners?|brackets?|bolts?|pickets?|palings?)\b/i;
/** Nouns that mean a "centres" figure isn't the joist spacing. */
const NOT_JOISTS_RE =
  /\b(?:studs?|rafters?|purlins?|trusses?|battens?|bearers?|piles?|posts?|nogs?|noggins?|dwangs?|screws?|nails?|staples?|fixings?|fasteners?|brackets?|bolts?|pickets?|palings?|balusters?)\b/i;
/** Nouns that mean a "long"/"wide" figure isn't the deck / floor footprint. */
const NOT_THE_PLAN_RE =
  /\b(?:stairs?|steps?|landings?|treads?|risers?|joists?|bearers?|boards?|decking|posts?|piles?|rails?|handrails?|balustrades?|bench(?:es)?|ramps?|paths?|timber|stock|lengths?|screws?|planks?|gates?|doors?|windows?)\b/i;

/** The clause around a match — stops at , ; line breaks and full stops. */
function clauseAround(text: string, start: number, end: number): string {
  const splitter = /[;\n,]|\.(?!\d)/;
  const before = text.slice(Math.max(0, start - 40), start).split(splitter).pop() ?? "";
  const after = text.slice(end, end + 30).split(splitter)[0] ?? "";
  return `${before} ${after}`;
}

type DimensionPattern = {
  re: RegExp;
  /** Skip a match whose surrounding clause mentions one of these nouns. */
  exclude?: RegExp;
  /** Skip a specific reading (e.g. a wall thickness that looks like a length). */
  skip?: (m: RegExpMatchArray, r: DimensionReading) => boolean;
};

/** First reading, in pattern priority order, that isn't excluded. */
function firstReading(
  text: string,
  patterns: DimensionPattern[],
  kind: DimensionKind,
): DimensionReading | undefined {
  for (const p of patterns) {
    for (const m of text.matchAll(p.re)) {
      const r = readDimension(m[1] ?? "", m[2], kind);
      if (!r) continue;
      const start = m.index ?? 0;
      if (p.exclude?.test(clauseAround(text, start, start + m[0].length))) {
        continue;
      }
      if (p.skip?.(m, r)) continue;
      return r;
    }
  }
  return undefined;
}

const WALL_NOUN = String.raw`(?:walls?|walling|partitions?)`;

const WALL_LENGTH_PATTERNS: DimensionPattern[] = [
  // "wall length 4800", "wall length is 4.8m", "wall length: 2,400mm"
  { re: rx(String.raw`\bwall\s+length\s*(?:is\s+|of\s+|=\s*|:\s*)?${NUM}${OPT_LEN_UNIT}`) },
  // "the wall is 3600 long", "wall 4.8m long"
  { re: rx(String.raw`\bwall\s+(?:is\s+|runs?\s+)?${NUM}${OPT_LEN_UNIT}\s*long\b`) },
  // "a 10m wall", "4.8 metre long wall", "4800mm wall", "4.8 metres of wall".
  // The unit is required, and a mm/cm figure under 1 m here is the wall
  // THICKNESS ("90mm wall", "140mm walls") — never its length.
  {
    re: rx(String.raw`${NUM_START}${NUM}\s*${LEN_UNIT}${UNIT_END}\s*(?:long\s+)?(?:of\s+)?${WALL_NOUN}\b(?!\s*(?:height|high|thick))`),
    skip: (m, r) => /^(?:mm|mil|millimet|cm|centimet)/i.test(m[2] ?? "") && r.value < 1,
  },
  // "a 4800 long wall" — a bare number is fine: "long" makes it a length.
  { re: rx(String.raw`${NUM_START}${NUM}${OPT_LEN_UNIT}\s*long\s+${WALL_NOUN}\b`) },
];

/**
 * Lowest priority, voice / typed entry only: "5m long" / "4800 long" with no
 * wall word. A drawing's own plan edge beats a loose "long" in its notes.
 */
const LOOSE_WALL_LENGTH_PATTERNS: DimensionPattern[] = [
  { re: rx(String.raw`${NUM_START}${NUM}${OPT_LEN_UNIT}\s*long\b`), exclude: NOT_THE_WALL_RE },
];

const WALL_HEIGHT_PATTERNS: DimensionPattern[] = [
  // "wall height 2700", "stud height 2.7m", "ceiling height: 2.4 m"
  { re: rx(String.raw`\b(?:wall|stud|ceiling)\s+height\s*(?:is\s+|of\s+|=\s*|:\s*)?${NUM}${OPT_LEN_UNIT}`) },
  // "2.4 stud height", "2700 ceiling height"
  { re: rx(String.raw`${NUM_START}${NUM}${OPT_LEN_UNIT}\s*(?:stud|ceiling|wall)\s+height\b`) },
  // "2400 high", "2.4m high", "2.7 metres tall"
  { re: rx(String.raw`${NUM_START}${NUM}${OPT_LEN_UNIT}\s*(?:high|tall)\b`), exclude: NOT_THE_WALL_RE },
  // "height 2.4m", "height is 2400"
  { re: rx(String.raw`\bheight\s*(?:is\s+|of\s+|=\s*|:\s*)?${NUM}${OPT_LEN_UNIT}`), exclude: NOT_THE_WALL_RE },
];

// "studs at 600", "stud spacing 400mm", "studs @ 0.6m", "stud centres of 600"
const MEMBER_SPACING = String.raw`\s+(?:(?:are\s+)?(?:at|@|on|spaced(?:\s+at)?)\s*|(?:spacing|centres?|centers?)\s*(?:is\s+|of\s+|=\s*|:\s*|at\s+|@\s*)?)${NUM}${OPT_LEN_UNIT}`;

const STUD_SPACING_PATTERNS: DimensionPattern[] = [
  { re: rx(String.raw`\bstuds?${MEMBER_SPACING}`) },
  // "600 centres", "600mm crs", "0.6m centres", "60cm c/c"
  { re: rx(String.raw`${NUM_START}${NUM}${OPT_LEN_UNIT}\s*${SPACING_WORD}`), exclude: NOT_STUDS_RE },
];

const JOIST_SPACING_PATTERNS: DimensionPattern[] = [
  { re: rx(String.raw`\bjoists?${MEMBER_SPACING}`) },
  // "joist 450mm" — only with an explicit mm, so "joists 140x45" never reads.
  { re: rx(String.raw`\bjoists?\s+(?:centres?\s+|spacing\s+)?${NUM}\s*(mm|millimet(?:re|er)s?)${UNIT_END}(?!\s*[x×*])`) },
  { re: rx(String.raw`${NUM_START}${NUM}${OPT_LEN_UNIT}\s*${SPACING_WORD}`), exclude: NOT_JOISTS_RE },
];

function extractWallLength(
  text: string,
  { loose }: { loose: boolean },
): DimensionReading | undefined {
  return (
    firstReading(text, WALL_LENGTH_PATTERNS, "length") ??
    (loose ? firstReading(text, LOOSE_WALL_LENGTH_PATTERNS, "length") : undefined)
  );
}

function extractWallHeight(text: string): DimensionReading | undefined {
  return firstReading(text, WALL_HEIGHT_PATTERNS, "height");
}

function extractStudSpacing(text: string): DimensionReading | undefined {
  return firstReading(text, STUD_SPACING_PATTERNS, "spacing");
}

/** Total opening area, e.g. "openings 3.5m2" / "4.2 m² of openings". */
function extractOpeningAreaM2(text: string): DimensionReading | undefined {
  const patterns = [
    rx(String.raw`\bopenings?\s+(?:area\s*)?(?:of\s+|=\s*|:\s*|total(?:ling)?\s+)?${NUM}\s*${AREA_UNIT}`),
    rx(String.raw`${NUM_START}${NUM}\s*${AREA_UNIT}\s+(?:of\s+)?openings?\b`),
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const r = readDimension(m[1] ?? "", m[2], "area");
      if (r) return r;
    }
  }
  return undefined;
}

function extractCount(
  text: string,
  noun: "door" | "window",
): number | undefined {
  // Same line only — "Doors: 4\nWindows: 6" must not read as "4 windows".
  const re = new RegExp(
    `\\b(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)[ \\t]+${noun}s?\\b`,
    "i",
  );
  const m = text.match(re);
  if (m) {
    const n = readNumberToken(m[1]);
    if (typeof n === "number") return n;
  }
  // "Doors: 4" / "Window count = 6" — the scan's DIMENSIONS layout. A size
  // ("Door: 820 x 1980") is never read as a count.
  const listed = new RegExp(
    `\\b${noun}s?[ \\t]*(?:count|total|qty)?[ \\t]*[:=][ \\t]*(\\d{1,2})\\b(?![ \\t]*(?:[x×*]|mm|cm|m\\b|by\\b))`,
    "i",
  ).exec(text);
  if (listed) return Number(listed[1]);
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// Wall runs written in the DIMENSIONS text:
//   "TOTAL WALL RUN = 6.0 + 4.8 + 3.6 = 14.4m", "Total wall run: 52m",
//   "EXTERIOR WALL RUN = 8.4 + 6.0 + 8.4 + 6.0 = 28.8m"
// Only lines that START with the label are read, so prose that merely
// mentions a wall run is ignored.
// ─────────────────────────────────────────────────────────────────────────
export interface TextWallRun {
  /** The stated total, else the sum of the addends. */
  value: number;
  /** The total written after the last "=", if any (m). */
  stated?: number;
  /** The sum of the "a + b + c" addends, if written (m). */
  addendSum?: number;
  /** Every reading of the line: stated total and/or the addend sum. */
  candidates: number[];
  plausible: boolean;
  reading: DimensionReading;
}

/** Every number in a line, with its unit if one was written, in order. */
export function readNumberTokens(
  line: string,
): Array<{ num: string; unit: string | undefined; index: number }> {
  return [...line.matchAll(rx(`${NUM}${OPT_LEN_UNIT}`))].map((m) => ({
    num: m[1] ?? "",
    unit: m[2],
    index: m.index ?? 0,
  }));
}

const RUN_LINE_RE =
  /^\s*(?:[-*•]\s*)?(?:(?:total|overall)\s+)?(?:(exterior|external|perimeter|outside|interior|internal|partition|inside)\s+)?walls?\s+run\b|^\s*(?:[-*•]\s*)?total\s+(?:length\s+of\s+)?walls?\b/i;

/**
 * Read one "TOTAL / EXTERIOR / INTERIOR WALL RUN = a + b + … = t" line.
 * Exported for the scan review, which maps a tradie's correction of such a
 * line onto the plan marker.
 */
export function readWallRunLine(
  line: string,
): { which: "total" | "exterior" | "interior"; run: TextWallRun } | undefined {
  const label = RUN_LINE_RE.exec(line);
  if (!label) return undefined;
  const q = (label[1] ?? "").toLowerCase();
  const which = /^(?:exterior|external|perimeter|outside)$/.test(q)
    ? "exterior"
    : q
      ? "interior"
      : "total";
  const segments = line
    .slice(label.index + label[0].length)
    .split("=")
    .map((s) => s.trim())
    .filter((s) => /\d/.test(s));
  if (segments.length === 0) return undefined;
  const tokens = readNumberTokens;

  const last = segments[segments.length - 1];
  let stated: DimensionReading | undefined;
  let statedUnit: string | undefined;
  if (!last.includes("+")) {
    const t = tokens(last).pop();
    if (t) {
      stated = readDimension(t.num, t.unit, "run");
      statedUnit = t.unit;
    }
  }
  let addendSum: number | undefined;
  const addSegment = segments.find((s) => s.includes("+"));
  if (addSegment) {
    // Bare addends take the unit written on the stated total ("… = 14.4m").
    const inherit = statedUnit;
    const parts = tokens(addSegment);
    let sum = 0;
    for (const a of parts) {
      const r = readDimension(a.num, a.unit ?? inherit, "length");
      if (!r) {
        sum = NaN;
        break;
      }
      sum += r.value;
    }
    if (parts.length >= 2 && Number.isFinite(sum)) addendSum = roundMicro(sum);
  }
  const reading =
    stated ?? (addendSum !== undefined ? readDimension(addendSum, "m", "run") : undefined);
  if (!reading) return undefined;
  const candidates = [stated?.value, addendSum].filter(
    (v): v is number => v !== undefined,
  );
  return {
    which,
    run: {
      value: reading.value,
      stated: stated?.value,
      addendSum,
      candidates,
      plausible: reading.plausible,
      reading,
    },
  };
}

function extractWallRuns(text: string): {
  total?: TextWallRun;
  exterior?: TextWallRun;
} {
  const out: { total?: TextWallRun; exterior?: TextWallRun } = {};
  for (const line of text.split(/\r?\n/)) {
    const hit = readWallRunLine(line);
    if (!hit || hit.which === "interior") continue;
    // The last statement wins — the tradie's correction is usually below.
    out[hit.which] = hit.run;
  }
  return out;
}

/** Same number, allowing for rounding in how the drawing restated it. */
function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.01, 0.005 * Math.max(Math.abs(a), Math.abs(b)));
}

function extractGibSides(text: string): 1 | 2 | undefined {
  if (
    /\b(both\s+sides?|two\s+sides?|gib\s+both|double\s+sided?)/i.test(text)
  ) {
    return 2;
  }
  if (
    /\b(one\s+side(?:\s+only)?|single\s+sided?|gib\s+one\s+side)/i.test(text)
  ) {
    return 1;
  }
  return undefined;
}

function extractIncludeInsulation(text: string): boolean | undefined {
  if (/\b(no\s+insulation|without\s+insulation|skip\s+insulation)\b/i.test(text)) {
    return false;
  }
  if (/\b(insulation|pink\s*batts?|batts?|R\d+(?:\.\d+)?)/i.test(text)) {
    return true;
  }
  return undefined;
}

function extractIncludeSkirting(text: string): boolean | undefined {
  if (/\bno\s+skirtings?\b/i.test(text)) return false;
  if (/\bskirtings?\b/i.test(text)) return true;
  return undefined;
}

function extractIncludeArchitraves(text: string): boolean | undefined {
  if (/\bno\s+architraves?\b/i.test(text)) return false;
  if (/\barchitraves?\b/i.test(text)) return true;
  return undefined;
}

function extractWastePercent(text: string): number | undefined {
  const re =
    /(?:(\d+(?:\.\d+)?)\s*(?:%|percent)\s*waste|waste\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:%|percent)?)/i;
  const m = text.match(re);
  if (m) {
    const raw = m[1] ?? m[2];
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

export type ParseOptions = {
  applyDefaults?: boolean;
};

/**
 * Pick the takeoff type from a voice/text description.
 *
 * The order of the checks matters — "subfloor" is checked before
 * "deck" because every subfloor is also a deck-shaped structure
 * (joists/bearers/piles) and the subfloor keyword should win when
 * present. Similarly "cladding" is checked before "wall" because
 * "cladding on a 6m wall" is a cladding job, not a framing job.
 *
 * Returns "unknown" when nothing matches; the caller falls back to
 * the AI quote generator instead of a calculator.
 */
export function detectTakeoffType(description: string): TakeoffType {
  const raw = description ?? "";
  const text = raw.toLowerCase();
  // Prefer the structured `[T2Q_PLAN] type=…` marker the scan flow emits —
  // it carries the structure type the AI read off the DRAWING, which is the
  // source of truth. Loose keyword matching on the prose (below) is only a
  // fallback for legacy voice/typed entry that has no marker. Without this,
  // a "Job type: Deck" line or a stray "deck" mention in the prose could
  // force the deck calculator even when the drawing is a house layout the AI
  // never classified as a deck.
  const marker = extractStructuredPlanMarker(raw);
  if (marker?.type) {
    if (marker.type === "subfloor") return "subfloor";
    if (marker.type === "cladding") return "cladding";
    if (marker.type === "deck") return "deck";
    if (marker.type === "wall") return "wall";
    // A marker whose type isn't a calculator type (e.g. the AI classified a
    // house plan, fence or slab) means we have no calculator for it — fall
    // back to the AI generator rather than loose-matching the prose.
    return "unknown";
  }
  // SCOPE AUTHORITY: the scan flow stamps a `Job type: X` line carrying the AI's
  // DRAWING classification. When no structured marker is present (legacy scans,
  // or any path that didn't emit one), honour that classification as the scope
  // decider BEFORE any loose keyword matching — so a wall / framing / interior-
  // partition scan can NEVER be routed to deck materials by an incidental word
  // like "decking" in a boilerplate instruction. Deck materials require an
  // actual deck classification, never a keyword guess.
  const jobType = /(?:^|\n)\s*job type:\s*([a-z][a-z /-]*)/i
    .exec(raw)?.[1]
    ?.trim()
    .toLowerCase();
  if (jobType) {
    if (jobType.startsWith("deck")) return "deck";
    if (jobType.startsWith("subfloor") || jobType.startsWith("floor framing")) {
      return "subfloor";
    }
    if (jobType.startsWith("cladding")) return "cladding";
    if (
      jobType.startsWith("framing") ||
      jobType.startsWith("wall") ||
      jobType.startsWith("lining") ||
      jobType.startsWith("partition")
    ) {
      // Framing may be a subfloor/cladding job by build context; otherwise wall.
      if (/\bsub[-\s]?floor\b|\bfloor\s+framing\b/.test(text)) return "subfloor";
      if (/\bclad(ding)?\b|\bweatherboards?\b/.test(text)) return "cladding";
      return "wall";
    }
    // Concrete / fence / roofing / paint / other have no legacy calculator — the
    // orchestrator / AI generator handles them. CRUCIALLY: return "unknown"
    // rather than falling through to the deck keyword branch below.
    if (/^(concrete|fence|roof|paint|other)/.test(jobType)) return "unknown";
  }
  if (/\bsub[-\s]?floor\b|\bfloor\s+framing\b|\bfloor\s+joists?\b/.test(text)) {
    return "subfloor";
  }
  if (/\bclad(ding)?\b|\bweatherboards?\b|\bsiding\b/.test(text)) {
    return "cladding";
  }
  // GIB / plasterboard is an unambiguous interior-lining signal — a deck never
  // has it — so route a lined-wall job to wall BEFORE the deck keyword check,
  // preventing a stray "deck"/"decking" mention from misrouting a house/wall
  // scan to the deck calculator. (The structured marker above is still the
  // primary source of truth; this only hardens the marker-less fallback.)
  if (/\bgib\b|\bplasterboard\b/.test(text)) {
    return "wall";
  }
  // Ambiguity guard: if marker-less prose carries BOTH a deck signal AND a
  // STRONG wall-assembly signal (framing/studs — NOT the bare locational word
  // "wall", which appears in legit deck phrasings like "deck against the back
  // wall"), a weak keyword pick must NOT send a house/wall job to deck
  // materials. Surface it for review by returning "unknown" — the caller falls
  // back to the AI generator (no deck/wall template forced). The authoritative
  // [T2Q_PLAN] marker above resolves every real scan, so this only affects
  // ambiguous voice/typed entry.
  const deckSignal = /\bdeck(ing|s)?\b/.test(text);
  const wallSignal = /\bwall\b|\bframing\b|\bstuds?\b/.test(text);
  const wallAssemblySignal = /\bframing\b|\bstuds?\b/.test(text);
  if (deckSignal && wallAssemblySignal) {
    return "unknown";
  }
  if (deckSignal) {
    return "deck";
  }
  if (wallSignal) {
    return "wall";
  }
  return "unknown";
}

/**
 * Pull "L by W" dimensions from a description.
 *
 * Handles every common spoken/typed shorthand:
 *   "6m by 3m", "6 by 3", "6m × 3m", "6m x 3m", "6 metres by 3 metres",
 *   "6×3", "deck 6 by 3", "I'm doing a 4 m x 2 m deck"
 *
 * Returns the larger number as `lengthM`, the smaller as `widthM`. NZ
 * residential convention: long side = length, short side = width. The
 * downstream calculators run joists across width and decking along
 * length — flipping the two would silently swap joist orientation.
 */
function extractRectangle(
  text: string,
): { lengthM: number; widthM: number } | undefined {
  // Capture the value AND any unit suffix on each side so we can
  // disambiguate millimetres from metres. NZ trade drawings almost
  // always write dimensions in mm with the suffix dropped — "4800 x
  // 3820" means 4.8 m × 3.82 m, NOT 4800 m × 3820 m. Older versions
  // of this regex treated bare numbers as metres and produced
  // 1000× quote explosions.
  //
  // matchAll, not match — the transcript can contain multiple "X x Y"
  // patterns (e.g. "Posts 125x125", "Joists 140x45", "Deck 4800x3820")
  // and the FIRST match isn't always the deck plan. We loop and pick
  // the first match where both sides come out in a sane deck range.
  const re = rx(
    String.raw`${NUM}${OPT_LEN_UNIT}\s*(?:by|x|×|\*)\s*${NUM}${OPT_LEN_UNIT}`,
  );
  // Unitless sides follow the shared rule (readDimension): a bare value
  // ≥ 100 is millimetres ("4800 x 3820" = 4.8 m × 3.82 m), under 100 is
  // metres ("6 by 3").
  const parseSide = (value: string, unit: string | undefined): number =>
    readDimension(value, unit, "length")?.value ?? NaN;
  // A sane deck/wall/slab footprint is 1 m on the short side and at
  // most 30 m on the long side. Anything outside that envelope is
  // almost certainly a timber size (90x45, 125x125, 140x19) or a
  // bay window or fastener spacing, not the plan footprint.
  const MIN_PLAN_M = 1;
  const MAX_PLAN_M = 30;
  for (const m of text.matchAll(re)) {
    const a = parseSide(m[1] ?? "", m[2]);
    const b = parseSide(m[3] ?? "", m[4]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const lengthM = Math.max(a, b);
    const widthM = Math.min(a, b);
    if (widthM < MIN_PLAN_M) continue; // both timber-size or one tiny → skip
    if (lengthM > MAX_PLAN_M) continue; // even after clamp it's too big → skip
    return { lengthM, widthM };
  }
  return undefined;
}

/**
 * Pull the two largest standalone dimensions out of the transcript's
 * DIMENSIONS section. Used as a CROSS-CHECK against the
 * `[T2Q_PLAN]` marker: when the user edits the dimensions textarea
 * to correct what the AI mis-read, those edits should win over the
 * AI's structured plan guess.
 *
 * Scoping is critical. Wave 43 regression: the first version of this
 * function scanned the FULL transcript, including the AI's prose,
 * structural and notes sections. The AI sometimes mentions area /
 * volume values like "deck area 28.8m²" or "concrete 0.45m³ × 60",
 * and the regex would happily lift "28.8m" out of "28.8m²" because
 * `\b` treats `²` as a word boundary. That value then beat the
 * correct marker (6m × 4.8m) in the cross-check because 28.8 ≤ 30,
 * the calculator received a 28.8m × 6m "deck", and emitted 72 joist
 * lengths / 2027m of decking — exactly the bug the marker was
 * meant to PREVENT.
 *
 * Two defences:
 *   1. Restrict scanning to the explicit DIMENSIONS section if it's
 *      present (delimited by "DIMENSIONS (tradie-confirmed):" and
 *      the next "STRUCTURAL"/"NOTES" header). The AI is told to put
 *      ONE PLAN DIMENSION PER LINE in this section — exactly the
 *      shape this helper is meant to read.
 *   2. Tighter unit regex that explicitly rejects m²/m³/m2/m3.
 */
function extractStandaloneDims(
  text: string,
): { lengthM: number; widthM: number } | undefined {
  // Scope to the DIMENSIONS section when present. The whole-transcript
  // path is a fallback for inputs that don't go through ScanPanel
  // (legacy voice / typed entry).
  const dimsSectionRe =
    /DIMENSIONS\s*(?:\([^)]*\))?\s*:?\s*\n([\s\S]*?)(?=\n[A-Z][A-Z\s/&]+:|$)/i;
  const dimsMatch = text.match(dimsSectionRe);
  const scope = dimsMatch ? dimsMatch[1] : text;

  // Strip "X by Y" pairs so they don't double-count as standalone.
  const withoutPairs = scope.replace(
    rx(String.raw`${NUM}${OPT_LEN_UNIT}\s*(?:by|x|×|\*)\s*${NUM}${OPT_LEN_UNIT}`),
    " ",
  );

  // Reject m² / m³ / m2 / m3 — those are areas / volumes, not plan
  // dimensions. `(?![²³23])` after the unit is the area/volume
  // guard. `(?!m)` keeps us from matching the first `m` of `mm` as
  // a standalone metre unit.
  const re = rx(String.raw`${NUM}\s*${LEN_UNIT}${UNIT_END}`);
  const values = new Set<number>();
  const MIN_PLAN_M = 1;
  const MAX_PLAN_M = 30;
  for (const m of withoutPairs.matchAll(re)) {
    const inM = readDimension(m[1] ?? "", m[2], "length")?.value;
    if (inM === undefined) continue;
    if (inM < MIN_PLAN_M || inM > MAX_PLAN_M) continue;
    values.add(Math.round(inM * 1000) / 1000);
  }
  if (values.size < 2) return undefined;
  const sorted = Array.from(values).sort((a, b) => b - a);
  return { lengthM: sorted[0], widthM: sorted[1] };
}

function extractJoistSpacing(text: string): DimensionReading | undefined {
  // "450mm centres", "joists at 450", "joist spacing 0.6m", "450 crs"
  return firstReading(text, JOIST_SPACING_PATTERNS, "spacing");
}

/**
 * Footprint given as "4800 long and 3600 wide" / "6m long, 4.2m wide" — no
 * "by" pair. Both sides are needed; either can carry its own unit.
 */
function extractLongWide(
  text: string,
): { length: DimensionReading; width: DimensionReading } | undefined {
  const length = firstReading(
    text,
    [{ re: rx(String.raw`${NUM_START}${NUM}${OPT_LEN_UNIT}\s*long\b`), exclude: NOT_THE_PLAN_RE }],
    "length",
  );
  const width = firstReading(
    text,
    [{ re: rx(String.raw`${NUM_START}${NUM}${OPT_LEN_UNIT}\s*wide\b`), exclude: NOT_THE_PLAN_RE }],
    "width",
  );
  return length && width ? { length, width } : undefined;
}

function extractIncludePiles(text: string): boolean | undefined {
  if (/\bno\s+piles?\b|\bground[-\s]?level\b/i.test(text)) return false;
  if (/\bon\s+piles?\b|\bpile\s+spacing\b|\braised\b/i.test(text)) return true;
  return undefined;
}

/**
 * Decking board width (mm) from the job text.
 *
 * Decking-ANCHORED on purpose: a deck job also names joist/bearer sizes
 * like "140x45", so we only treat a "WxT" (or "Wmm") as the board width
 * when it sits next to a decking/board reference. Returns undefined when
 * the width isn't stated — the calculator then keeps its 90mm default and
 * the caller surfaces that assumption rather than hiding it.
 *
 * Catches:  "140x32 decking", "decking 140x32",
 *           "150x40 ... decking (140x32)", "140mm decking"
 * Ignores:  "140x45 joists at 450", "100x100 posts"
 */
export function extractDeckBoardWidthMm(text: string): number | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  const ok = (w: number) =>
    Number.isFinite(w) && w >= 60 && w <= 200 ? w : undefined;

  // Dressed size in parens next to a decking mention: "decking (140x32)".
  const paren = t.match(/decking[^()]{0,40}\((\d{2,3})\s*[x×]\s*\d{2,3}\)/);
  if (paren) {
    const w = ok(Number(paren[1]));
    if (w) return w;
  }

  // "<WxT> ... decking" (allow grade/treatment tokens in between).
  const before = t.match(
    /(\d{2,3})\s*[x×]\s*\d{2,3}\s*(?:rad\s*|h\d(?:\.\d)?\s*|sg\d\s*|gt\s*|premium\s*|kwila\s*|vitex\s*|garapa\s*|pine\s*)*decking/,
  );
  if (before) {
    const w = ok(Number(before[1]));
    if (w) return w;
  }

  // "decking ... <WxT>"
  const after = t.match(
    /decking\s*(?:boards?\s*)?(?:rad\s*|h\d(?:\.\d)?\s*)*(\d{2,3})\s*[x×]\s*\d{2,3}/,
  );
  if (after) {
    const w = ok(Number(after[1]));
    if (w) return w;
  }

  // "140mm decking" / "decking boards 140mm"
  const mm =
    t.match(/(\d{2,3})\s*mm\s*(?:wide\s*)?(?:deck(?:ing)?|board)/) ??
    t.match(/(?:deck(?:ing)?|board)s?\D{0,12}?(\d{2,3})\s*mm/);
  if (mm) {
    const w = ok(Number(mm[1]));
    if (w) return w;
  }

  return undefined;
}

/** Sane footprint envelope for a deck / subfloor edge (same as the marker). */
const PLAN_MIN_M = 1;
const PLAN_MAX_M = 30;

/**
 * Deck / subfloor footprint, in priority order:
 *   1. the `[T2Q_PLAN]` marker — the AI's structured plan, carrying every
 *      correction the tradie made on the scan review. Fields the tradie
 *      corrected (`edited=length_m,width_m`) are their own numbers, so no
 *      text heuristic may override them. Otherwise the marker is
 *      cross-checked against the DIMENSIONS text: a > 25% disagreement means
 *      the text (which the tradie reviewed) wins, unless the text figure
 *      looks like an area or is implausibly large.
 *   2. an "L by W" pair ("4800 x 3820", "6 by 3");
 *   3. "4800 long … 3600 wide";
 *   4. the two largest unit-bearing values in the DIMENSIONS section.
 */
function resolveFootprint(
  text: string,
  markerType: "deck" | "subfloor",
  noun: "Deck" | "Floor",
): { lengthM?: number; widthM?: number; assumptions: string[]; flags: string[] } {
  const assumptions: string[] = [];
  const flags: string[] = [];
  const marker = extractStructuredPlanMarker(text);
  if (
    marker &&
    (marker.type === undefined || marker.type === markerType) &&
    marker.lengthM !== undefined &&
    marker.widthM !== undefined
  ) {
    const lengthM = marker.lengthM;
    const widthM = marker.widthM;
    if (marker.edited?.some((f) => f === "length_m" || f === "width_m")) {
      assumptions.push(
        `Used the ${noun.toLowerCase()} size you corrected on the scan review (${lengthM}m × ${widthM}m).`,
      );
      return { lengthM, widthM, assumptions, flags };
    }
    const standalone = extractStandaloneDims(text);
    // Tolerance: 25% in EITHER axis. Tightened from 15% in Wave 43b
    // because the cross-check kept misfiring on L-shaped decks where
    // the DIMENSIONS section lists multiple edge lengths and the
    // marker bounds the enclosing rectangle. The marker is right
    // more often than not — only override when there's a meaningful
    // disagreement. (Corrections made on the scan review don't depend on
    // this: they are written into the marker itself — see edited= above.)
    const TOLERANCE = 0.25;
    const disagrees =
      !!standalone &&
      (Math.abs(lengthM - standalone.lengthM) / standalone.lengthM > TOLERANCE ||
        Math.abs(widthM - standalone.widthM) / standalone.widthM > TOLERANCE);
    // Plausibility guard: the standalone-dim extractor sometimes offers an
    // AREA figure (e.g. 28.8 = 6 × 4.8) or another oversized number as a
    // side length. Don't let the text override a sane AI plan when a side
    // ≈ the plan's area or is implausibly large for a residential deck —
    // that bug turned a 6×4.8 deck into 28.8×6 (72 joists).
    const area = lengthM * widthM;
    const standaloneSuspect =
      !!standalone &&
      ((area > 0 && Math.abs(standalone.lengthM - area) / area < 0.1) ||
        (area > 0 && Math.abs(standalone.widthM - area) / area < 0.1) ||
        Math.max(standalone.lengthM, standalone.widthM) > 25);
    if (standalone && disagrees && !standaloneSuspect) {
      assumptions.push(
        `AI's structured plan (${lengthM}m × ${widthM}m) disagreed with the dimensions text (${standalone.lengthM}m × ${standalone.widthM}m). Using the dimensions text.`,
      );
      return {
        lengthM: standalone.lengthM,
        widthM: standalone.widthM,
        assumptions,
        flags,
      };
    }
    if (standalone && disagrees && standaloneSuspect) {
      assumptions.push(
        `Dimensions text (${standalone.lengthM}m × ${standalone.widthM}m) looked like an area or an implausible length — kept the AI plan (${lengthM}m × ${widthM}m).`,
      );
    }
    return { lengthM, widthM, assumptions, flags };
  }

  const dims = extractRectangle(text);
  if (dims) return { lengthM: dims.lengthM, widthM: dims.widthM, assumptions, flags };

  const lw = extractLongWide(text);
  if (lw) {
    const lengthM = Math.max(lw.length.value, lw.width.value);
    const widthM = Math.min(lw.length.value, lw.width.value);
    if (widthM < PLAN_MIN_M || lengthM > PLAN_MAX_M) {
      flags.push(
        `${noun} size "${lw.length.source} long × ${lw.width.source} wide" reads as ${formatNumber(lw.length.value)} m × ${formatNumber(lw.width.value)} m — outside the ${PLAN_MIN_M}–${PLAN_MAX_M} m range. Check the ${noun.toLowerCase()} length and width.`,
      );
      return { assumptions, flags };
    }
    return { lengthM, widthM, assumptions, flags };
  }

  const standalone = extractStandaloneDims(text);
  if (standalone) {
    return {
      lengthM: standalone.lengthM,
      widthM: standalone.widthM,
      assumptions,
      flags,
    };
  }
  return { assumptions, flags };
}

/**
 * Joist centres for a deck / subfloor: stated in the text ("joists at 450",
 * "0.6m centres"), else the marker's. An implausible stated spacing is
 * flagged — never replaced by the default and never calculated.
 */
function resolveJoistSpacing(
  text: string,
  markerSpacingMm: number | undefined,
): { spacingMm?: number; flag?: string } {
  const r = extractJoistSpacing(text);
  if (r && !r.plausible) return { flag: implausibleMessage("Joist spacing", r) };
  if (r) return { spacingMm: r.value };
  if (markerSpacingMm !== undefined) {
    const m = readDimension(markerSpacingMm, "mm", "spacing");
    if (m && !m.plausible) {
      return { flag: implausibleMessage("Joist spacing", m, " on the drawing") };
    }
    return { spacingMm: markerSpacingMm };
  }
  return {};
}

function parseDeckDescription(
  description: string,
  options: ParseOptions,
): ParsedTakeoffResult {
  const { applyDefaults = true } = options;
  const text = description ?? "";
  const input: Partial<DeckTakeoffInput> = {};
  const assumptions: string[] = [];
  const missingFields: string[] = [];
  const reviewFlags: string[] = [];
  const flag = (message: string) => {
    reviewFlags.push(message);
    missingFields.push(message);
  };

  const marker = extractStructuredPlanMarker(text);
  const footprint = resolveFootprint(text, "deck", "Deck");
  assumptions.push(...footprint.assumptions);
  footprint.flags.forEach(flag);
  if (footprint.lengthM !== undefined && footprint.widthM !== undefined) {
    input.deckLengthM = footprint.lengthM;
    input.deckWidthM = footprint.widthM;
  }

  const joist = resolveJoistSpacing(text, marker?.joistSpacingMm);
  if (joist.flag) flag(joist.flag);
  const joistSpacing = joist.spacingMm;
  if (joistSpacing !== undefined) {
    input.joistSpacingMm = joistSpacing;
  } else if (applyDefaults && !joist.flag) {
    input.joistSpacingMm = 450;
    assumptions.push("Used default joist spacing of 450mm centres.");
  }

  const timberStock = extractTimberStockLengthM(text);
  if (timberStock !== undefined) {
    input.timberStockLengthM = timberStock;
  }

  const piles = extractIncludePiles(text);
  if (piles !== undefined) input.includePiles = piles;

  const waste = extractWastePercent(text);
  if (waste !== undefined) input.wastePercent = waste;
  else if (applyDefaults) input.wastePercent = 10;

  // Decking board width drives the lineal-metre count. When the tradie
  // states it (e.g. "140x32 decking") we use it; otherwise the calculator
  // keeps its 90mm default — but we make that ASSUMPTION VISIBLE rather
  // than silently costing wide boards as narrow ones.
  const boardWidthMm = extractDeckBoardWidthMm(text);
  if (boardWidthMm !== undefined) {
    input.boardWidthMm = boardWidthMm;
    if (boardWidthMm !== 90) {
      assumptions.push(`Decking width ${boardWidthMm}mm (read from your description).`);
    }
  } else if (applyDefaults) {
    assumptions.push(
      'Assumed 90mm decking boards — say e.g. "140mm decking" if yours are wider.',
    );
  }

  if (
    (input.deckLengthM === undefined || input.deckWidthM === undefined) &&
    footprint.flags.length === 0
  ) {
    missingFields.push("Deck length and width.");
  }

  let confidence = 0;
  if (input.deckLengthM !== undefined) confidence += 0.5;
  if (input.deckWidthM !== undefined) confidence += 0.3;
  if (joistSpacing !== undefined) confidence += 0.1;
  if (piles !== undefined) confidence += 0.1;
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  return {
    type: "deck",
    input,
    missingFields,
    assumptions,
    confidence,
    ...(reviewFlags.length > 0 ? { reviewFlags } : {}),
  };
}

function parseCladdingDescription(
  description: string,
  options: ParseOptions,
): ParsedTakeoffResult {
  const { applyDefaults = true } = options;
  const text = description ?? "";
  const input: Partial<CladdingTakeoffInput> = {};
  const assumptions: string[] = [];
  const missingFields: string[] = [];
  const reviewFlags: string[] = [];
  const flag = (message: string) => {
    reviewFlags.push(message);
    missingFields.push(message);
  };

  const marker = extractStructuredPlanMarker(text);

  const lengthReading =
    extractWallLength(text, { loose: !marker }) ??
    (marker?.lengthM !== undefined
      ? readDimension(marker.lengthM, "m", "length")
      : undefined);
  let lengthFlagged = false;
  // The shared plausibility rule — the same edge band the cladding
  // calculator and the orchestrator use. A run outside it is refused with
  // its plain reason, never rescaled (a 62 m run is simply 62 m).
  const lengthCheck = lengthReading?.plausible
    ? checkMetres("Cladding wall length", lengthReading.value, "edge")
    : undefined;
  if (lengthReading && !lengthReading.plausible) {
    flag(implausibleMessage("Wall length", lengthReading));
    lengthFlagged = true;
  } else if (lengthCheck && !lengthCheck.ok) {
    flag(lengthCheck.reason);
    lengthFlagged = true;
  } else if (lengthReading) {
    input.wallLengthM = lengthReading.value;
  }

  const height = resolveWallHeight(text, marker?.heightM);
  if (height.flag) flag(height.flag);
  const wallHeight = height.heightM;
  if (wallHeight !== undefined) {
    input.wallHeightM = wallHeight;
  } else if (applyDefaults && !height.flag) {
    input.wallHeightM = 2.4;
    assumptions.push("Used default wall height of 2.4m.");
  }

  const timberStock = extractTimberStockLengthM(text);
  if (timberStock !== undefined) {
    input.timberStockLengthM = timberStock;
  }

  // Openings — count windows + doors, estimate area from defaults unless a
  // total opening area (m²) is stated.
  const doors = extractCount(text, "door");
  const windows = extractCount(text, "window");
  const numberOfOpenings = (doors ?? 0) + (windows ?? 0);
  if (numberOfOpenings > 0) input.numberOfOpenings = numberOfOpenings;
  const openingArea = extractOpeningAreaM2(text);
  if (openingArea && !openingArea.plausible) {
    flag(implausibleMessage("Opening area", openingArea));
  } else if (openingArea) {
    input.openingAreaM2 = openingArea.value;
  } else if (numberOfOpenings > 0) {
    // Estimate opening area: doors 0.82×2.04 = 1.67m², windows 1.2×1.2 = 1.44m²
    const estimatedArea =
      (doors ?? 0) * 1.67 + (windows ?? 0) * 1.44;
    input.openingAreaM2 = Math.round(estimatedArea * 100) / 100;
    if (applyDefaults) {
      assumptions.push(
        `Estimated opening area from ${doors ?? 0} door(s) + ${windows ?? 0} window(s) at standard sizes.`,
      );
    }
  }

  const waste = extractWastePercent(text);
  if (waste !== undefined) input.wastePercent = waste;
  else if (applyDefaults) input.wastePercent = 10;

  if (input.wallLengthM === undefined && !lengthFlagged) {
    missingFields.push("Wall length.");
  }

  let confidence = 0;
  if (input.wallLengthM !== undefined) confidence += 0.5;
  if (wallHeight !== undefined) confidence += 0.2;
  if (numberOfOpenings > 0) confidence += 0.2;
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  return {
    type: "cladding",
    input,
    missingFields,
    assumptions,
    confidence,
    ...(reviewFlags.length > 0 ? { reviewFlags } : {}),
  };
}

function parseSubfloorDescription(
  description: string,
  options: ParseOptions,
): ParsedTakeoffResult {
  const { applyDefaults = true } = options;
  const text = description ?? "";
  const input: Partial<SubfloorTakeoffInput> = {};
  const assumptions: string[] = [];
  const missingFields: string[] = [];
  const reviewFlags: string[] = [];
  const flag = (message: string) => {
    reviewFlags.push(message);
    missingFields.push(message);
  };

  const marker = extractStructuredPlanMarker(text);
  const footprint = resolveFootprint(text, "subfloor", "Floor");
  assumptions.push(...footprint.assumptions);
  footprint.flags.forEach(flag);
  if (footprint.lengthM !== undefined && footprint.widthM !== undefined) {
    input.floorLengthM = footprint.lengthM;
    input.floorWidthM = footprint.widthM;
  }

  const joist = resolveJoistSpacing(text, marker?.joistSpacingMm);
  if (joist.flag) flag(joist.flag);
  const joistSpacing = joist.spacingMm;
  if (joistSpacing !== undefined) {
    input.joistSpacingMm = joistSpacing;
  } else if (applyDefaults && !joist.flag) {
    input.joistSpacingMm = 450;
    assumptions.push("Used default joist spacing of 450mm centres.");
  }

  const timberStock = extractTimberStockLengthM(text);
  if (timberStock !== undefined) {
    input.timberStockLengthM = timberStock;
  }

  const waste = extractWastePercent(text);
  if (waste !== undefined) input.wastePercent = waste;
  else if (applyDefaults) input.wastePercent = 10;

  if (
    (input.floorLengthM === undefined || input.floorWidthM === undefined) &&
    footprint.flags.length === 0
  ) {
    missingFields.push("Floor length and width.");
  }

  let confidence = 0;
  if (input.floorLengthM !== undefined) confidence += 0.5;
  if (input.floorWidthM !== undefined) confidence += 0.3;
  if (joistSpacing !== undefined) confidence += 0.2;
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  return {
    type: "subfloor",
    input,
    missingFields,
    assumptions,
    confidence,
    ...(reviewFlags.length > 0 ? { reviewFlags } : {}),
  };
}

export function parseTakeoffDescription(
  description: string,
  options: ParseOptions = {},
): ParsedTakeoffResult {
  // Spoken numbers → digits in measurement contexts ("four point eight
  // metres" → "4.8 metres", "twenty four hundred high" → "2400 high"). The
  // generate route may hand us the raw OR the cleaned transcript; this is the
  // same deterministic, idempotent pass the cleanup applies, so both parse
  // identically. Marker lines are left byte-for-byte untouched.
  const text = normalizeSpokenMeasurements(description ?? "").text;
  const type = detectTakeoffType(text);
  if (type === "deck") return parseDeckDescription(text, options);
  if (type === "cladding") {
    return parseCladdingDescription(text, options);
  }
  if (type === "subfloor") return parseSubfloorDescription(text, options);
  // Fall through to the original wall framing parser for type === "wall"
  // or "unknown" (the unknown branch produces an empty wall result which
  // canRunCalculator rejects, so the route falls back to the AI generator).
  return parseWallDescription(text, options);
}

/**
 * Wall height: stated in the text ("2400 high", "stud height 2.7m"), else the
 * drawing marker's. A value outside 1.8–6 m after unit conversion is flagged,
 * never defaulted and never calculated.
 */
function resolveWallHeight(
  text: string,
  markerHeightM: number | undefined,
): { heightM?: number; flag?: string } {
  const r = extractWallHeight(text);
  if (r) {
    return r.plausible
      ? { heightM: r.value }
      : { flag: implausibleMessage("Wall height", r) };
  }
  if (markerHeightM !== undefined) {
    const m = readDimension(markerHeightM, "m", "height");
    if (m && !m.plausible) {
      return { flag: implausibleMessage("Wall height", m, " on the drawing") };
    }
    return { heightM: markerHeightM };
  }
  return {};
}

/** Human names for plan fields the tradie can correct on the scan review. */
const EDITED_FIELD_LABELS: Record<string, string> = {
  wall_run_m: "total wall run",
  exterior_wall_run_m: "exterior wall run",
  height_m: "wall height",
  stud_spacing_mm: "stud spacing",
  door_count: "door count",
  window_count: "window count",
  length_m: "length",
  width_m: "width",
};

function parseWallDescription(
  description: string,
  options: ParseOptions,
): ParsedTakeoffResult {
  const { applyDefaults = true } = options;
  const text = description ?? "";
  const input: Partial<MaterialTakeoffInput> = {};
  const assumptions: string[] = [];
  const missingFields: string[] = [];
  const reviewFlags: string[] = [];
  const flag = (message: string) => {
    reviewFlags.push(message);
    missingFields.push(message);
  };

  const marker = extractStructuredPlanMarker(text);
  const textRuns = extractWallRuns(text);

  // Wall framing scales every quantity (studs/plates/nogs/GIB/insulation)
  // off the wall RUN. For a multi-room floor plan that's the TOTAL of every
  // wall segment (marker.wallRunM), NOT a single bounding-box edge. Prefer
  // it; fall back to a total wall run written in the DIMENSIONS text, then
  // to a single explicit "wall length" or the marker's edge length for a
  // one-wall job, keeping old transcripts byte-identical.
  //
  // The scan review writes the tradie's corrections INTO the marker, so the
  // marker and the text agree when the transcript is built. If they
  // disagree, the text was edited afterwards (or the drawing's structured
  // read contradicts its own text): the tradie-confirmed text wins and the
  // disagreement is recorded so risky drawings get a confirmation step.
  let wallLengthM: number | undefined;
  let usedWallRun = false;
  let lengthFlagged = false;
  const textTotal = textRuns.total;
  if (marker?.wallRunM !== undefined) {
    wallLengthM = marker.wallRunM;
    usedWallRun = true;
    if (
      textTotal &&
      !textTotal.candidates.some((c) => nearlyEqual(c, marker.wallRunM!))
    ) {
      if (textTotal.plausible) {
        assumptions.push(
          `The drawing's total wall run (${marker.wallRunM}m) disagreed with the dimensions text (${textTotal.value}m). Using the dimensions text.`,
        );
        wallLengthM = textTotal.value;
      } else {
        flag(implausibleMessage("Total wall run", textTotal.reading));
        wallLengthM = undefined;
        usedWallRun = false;
        lengthFlagged = true;
      }
    }
  } else if (textTotal) {
    if (textTotal.plausible) {
      wallLengthM = textTotal.value;
      usedWallRun = true;
    } else {
      flag(implausibleMessage("Total wall run", textTotal.reading));
      lengthFlagged = true;
    }
  } else {
    const r = extractWallLength(text, { loose: !marker });
    if (r && !r.plausible) {
      flag(implausibleMessage("Wall length", r));
      lengthFlagged = true;
    } else {
      wallLengthM = r?.value ?? marker?.lengthM;
    }
  }
  if (wallLengthM !== undefined) input.wallLengthM = wallLengthM;
  if (usedWallRun) {
    assumptions.push(
      `Framed off the total wall run (${wallLengthM}m) — every exterior and interior wall summed from the floor plan.`,
    );
  }

  // Exterior (perimeter) wall run, when the drawing distinguished it. Insulation
  // is then sized off EXTERIOR walls only (exact). Absent → exteriorWallLengthM
  // stays undefined and the calculator keeps insulation review-required (no
  // exterior/interior split is guessed). Clamp to the total so an inconsistent
  // marker can't make the exterior run exceed the whole wall run.
  let exteriorM = marker?.exteriorWallRunM;
  const textExterior = textRuns.exterior;
  if (
    exteriorM !== undefined &&
    textExterior &&
    !textExterior.candidates.some((c) => nearlyEqual(c, exteriorM!))
  ) {
    if (textExterior.plausible) {
      assumptions.push(
        `The drawing's exterior wall run (${exteriorM}m) disagreed with the dimensions text (${textExterior.value}m). Using the dimensions text.`,
      );
      exteriorM = textExterior.value;
    } else {
      flag(implausibleMessage("Exterior wall run", textExterior.reading));
      exteriorM = undefined;
    }
  }
  if (exteriorM !== undefined) {
    input.exteriorWallLengthM =
      wallLengthM !== undefined ? Math.min(exteriorM, wallLengthM) : exteriorM;
    assumptions.push(
      `Insulation sized off the exterior wall run (${input.exteriorWallLengthM}m) from the floor plan.`,
    );
  }

  const height = resolveWallHeight(text, marker?.heightM);
  if (height.flag) flag(height.flag);
  const wallHeightM = height.heightM;
  if (wallHeightM !== undefined) {
    input.wallHeightM = wallHeightM;
  } else if (applyDefaults && !height.flag) {
    input.wallHeightM = 2.4;
    assumptions.push("Used default wall height of 2.4m.");
  }

  const timberStock = extractTimberStockLengthM(text);
  if (timberStock !== undefined) {
    input.timberStockLengthM = timberStock;
  }

  // The legacy wall calculator only models 400/600 stud centres. Take the
  // marker spacing only when it's one of those; otherwise fall through to
  // the default so we don't emit a "studSpacingMm must be 400 or 600" warning.
  // A spacing the tradie STATED but the calculator can't model is surfaced
  // as an assumption rather than silently swapped for the default.
  const markerStud =
    marker?.studSpacingMm === 400 || marker?.studSpacingMm === 600
      ? marker.studSpacingMm
      : undefined;
  const studReading = extractStudSpacing(text);
  let studSpacingMm: number | undefined;
  if (studReading && !studReading.plausible) {
    flag(implausibleMessage("Stud spacing", studReading));
  } else if (studReading && (studReading.value === 400 || studReading.value === 600)) {
    studSpacingMm = studReading.value;
  } else {
    studSpacingMm = markerStud;
    if (studReading) {
      assumptions.push(
        `Stud spacing ${formatNumber(studReading.value)}mm isn't one the wall calculator models (400 or 600mm) — used ${studSpacingMm ?? 600}mm centres. Check the stud count.`,
      );
    }
  }
  if (studSpacingMm !== undefined) {
    input.studSpacingMm = studSpacingMm;
  } else if (applyDefaults && !(studReading && !studReading.plausible)) {
    input.studSpacingMm = 600;
    if (!studReading) assumptions.push("Used default stud spacing of 600mm centres.");
  }

  const numberOfDoors = extractCount(text, "door") ?? marker?.doorCount;
  input.numberOfDoors = numberOfDoors ?? 0;

  const numberOfWindows = extractCount(text, "window") ?? marker?.windowCount;
  input.numberOfWindows = numberOfWindows ?? 0;

  const gibSides = extractGibSides(text);
  if (gibSides !== undefined) input.gibSides = gibSides;

  const insulation = extractIncludeInsulation(text);
  if (insulation !== undefined) {
    input.includeInsulation = insulation;
  } else if (applyDefaults) {
    input.includeInsulation = true;
    assumptions.push("Assumed insulation is included unless stated otherwise.");
  }

  const skirting = extractIncludeSkirting(text);
  if (skirting !== undefined) input.includeSkirting = skirting;

  const architraves = extractIncludeArchitraves(text);
  if (architraves !== undefined) input.includeArchitraves = architraves;

  const wastePercent = extractWastePercent(text);
  if (wastePercent !== undefined) {
    input.wastePercent = wastePercent;
  } else if (applyDefaults) {
    input.wastePercent = 10;
  }

  // Say which numbers came from the tradie's own corrections on the scan
  // review, so the quote notes show the edit was used.
  const corrected = (marker?.edited ?? [])
    .filter((f) => f in EDITED_FIELD_LABELS)
    .map((f) => EDITED_FIELD_LABELS[f]);
  if (corrected.length > 0) {
    assumptions.push(
      `Used the ${corrected.join(", ")} you corrected on the scan review.`,
    );
  }

  if (input.wallLengthM === undefined && !lengthFlagged) {
    missingFields.push("Wall length.");
  }
  if (input.wallHeightM === undefined && !height.flag) {
    missingFields.push("Wall height.");
  }
  if (input.gibSides === undefined) {
    missingFields.push("GIB one side or both sides?");
  }

  let confidence = 0;
  if (input.wallLengthM !== undefined) confidence += 0.4;
  if (input.gibSides !== undefined) confidence += 0.3;
  if (wallHeightM !== undefined) confidence += 0.1;
  if (numberOfDoors !== undefined) confidence += 0.05;
  if (numberOfWindows !== undefined) confidence += 0.05;
  if (insulation !== undefined) confidence += 0.05;
  if (skirting !== undefined) confidence += 0.025;
  if (architraves !== undefined) confidence += 0.025;
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  return {
    type: "wall",
    input,
    missingFields,
    assumptions,
    confidence,
    ...(reviewFlags.length > 0 ? { reviewFlags } : {}),
  };
}

/** A finite number of metres inside the shared band for `kind`. */
function plausible(v: unknown, kind: "edge" | "wallRun" | "wallHeight"): boolean {
  return typeof v === "number" && isPlausibleMetres(v, kind);
}

/**
 * Dispatch on type: do we have enough parsed input to actually run a
 * calculator, or do we need to fall back to AI generation?
 *
 * Also the last line of defence against absurd inputs, however they were
 * built (parser, stored takeoff inputs, a dimension correction): a flagged
 * value, or any dimension outside the ONE shared plausibility band
 * (takeoff/plausibility.ts — the same bands the calculators and the
 * orchestrator use) never reaches a calculator — the send gate trusts
 * calculator quantities.
 */
export function canRunCalculator(parsed: ParsedTakeoffResult): boolean {
  if (parsed.reviewFlags && parsed.reviewFlags.length > 0) return false;
  if (parsed.type === "deck") {
    const i = parsed.input as Partial<DeckTakeoffInput>;
    return plausible(i.deckLengthM, "edge") && plausible(i.deckWidthM, "edge");
  }
  if (parsed.type === "cladding") {
    const i = parsed.input as Partial<CladdingTakeoffInput>;
    return plausible(i.wallLengthM, "edge") && plausible(i.wallHeightM, "wallHeight");
  }
  if (parsed.type === "subfloor") {
    const i = parsed.input as Partial<SubfloorTakeoffInput>;
    return plausible(i.floorLengthM, "edge") && plausible(i.floorWidthM, "edge");
  }
  // wall (original) — need length + height + gibSides. The length may be a
  // whole-house wall run, so it takes the wall-run band.
  const i = parsed.input as Partial<MaterialTakeoffInput>;
  return (
    plausible(i.wallLengthM, "wallRun") &&
    plausible(i.wallHeightM, "wallHeight") &&
    i.gibSides !== undefined
  );
}

/**
 * Single entry point the route calls: parse → run the matching
 * calculator → return the unified result. Returns null when the
 * parsed result doesn't have enough to run (caller falls back to AI
 * generation).
 */
export function runTakeoff(parsed: ParsedTakeoffResult): MaterialTakeoffResult | null {
  if (!canRunCalculator(parsed)) return null;
  if (parsed.type === "deck") {
    return calculateDeckTakeoff(parsed.input as DeckTakeoffInput);
  }
  if (parsed.type === "cladding") {
    return calculateCladdingTakeoff(parsed.input as CladdingTakeoffInput);
  }
  if (parsed.type === "subfloor") {
    return calculateSubfloorTakeoff(parsed.input as SubfloorTakeoffInput);
  }
  return calculateMaterialTakeoff(parsed.input as MaterialTakeoffInput);
}
