// ─────────────────────────────────────────────────────────────────────────
// Takeoff system — types + lightweight runtime schemas.
//
// We intentionally do NOT pull in zod (CLAUDE.md says avoid deps). The
// `parse*` helpers below are zod-shaped: they return `{ ok, value, errors }`
// so call sites can branch the same way. The schemas live next to the
// types so misalignment between runtime validation and TS types stays
// loud at edit time.
// ─────────────────────────────────────────────────────────────────────────

export type ScopeType =
  | "deck"
  | "cladding"
  | "framing"
  | "roofing"
  | "lining"
  | "insulation"
  | "fencing"
  | "concrete"
  | "fixing"
  | "generic";

export const ALL_SCOPES: ScopeType[] = [
  "deck",
  "cladding",
  "framing",
  "roofing",
  "lining",
  "insulation",
  "fencing",
  "concrete",
  "fixing",
  "generic",
];

/**
 * Overall status of a takeoff result or a single line item.
 *
 *   ok            — calculated from concrete inputs, no warnings.
 *   assumed       — calculated, but at least one default was substituted.
 *   needs_review  — calculated, but the validator flagged something odd.
 *                   The user should eyeball it before sending.
 *   blocked       — could not calculate; critical input missing or
 *                   internally inconsistent. The tradie must clarify
 *                   before a number can be produced.
 */
export type TakeoffStatus = "ok" | "assumed" | "needs_review" | "blocked";

export type Confidence = "high" | "medium" | "low";

/**
 * A clarification question to put in front of the tradie.
 *
 *   blocking=true means the calculator literally cannot run without
 *   this answer. blocking=false means we have a default we'll use but
 *   the answer would tighten the result.
 */
export type ClarificationQuestion = {
  id: string;
  scope: ScopeType;
  field: string;
  question: string;
  hint?: string;
  /** When false we'll proceed with a default; when true we won't. */
  blocking: boolean;
  /** Suggested answers — shown as quick chips. */
  suggestions?: string[];
  /** Plain-language unit ("mm", "m", "m²", "yes/no"). */
  unit?: string;
};

/**
 * Pure-geometry source for a number on the final quote.
 *
 *   formula   — short calc string the explain layer renders for humans.
 *   inputs    — exact numeric inputs that fed the formula.
 *   assumed   — which inputs came from a default rather than the user.
 *   stockNote — how stock-length conversion was applied (if any).
 */
export type LineBasis = {
  formula: string;
  inputs: Record<string, number | string | boolean | null>;
  assumed: string[];
  stockNote?: string;
};

export type TakeoffLine = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  /** Per-line status (rolls up into the result status). */
  status: TakeoffStatus;
  /** "Show working" payload. */
  basis: LineBasis;
  /** Per-line numeric confidence in [0,1]. */
  confidence: number;
  /** Soft flags that explain why status is not "ok" (assumed/needs_review). */
  assumption_flags: string[];
  validation_flags: string[];
  /** Short prose explanation suitable for the UI. */
  explanation: string;
  /** Optional library/match hint used downstream by the matcher. */
  priceMatchKey?: string;
};

/**
 * Result of a single calculator run (one scope).
 */
export type ScopeResult = {
  scope: ScopeType;
  status: TakeoffStatus;
  summary: {
    primary_metric: string;
    primary_value: number;
    unit: string;
    /** All numeric inputs that fed the calc, for audit. */
    inputs: Record<string, number | string | boolean | null>;
  };
  lines: TakeoffLine[];
  warnings: string[];
  assumptions: string[];
  clarifications: ClarificationQuestion[];
  /** Human-readable working narrative built by the explain layer. */
  explanation: string;
  /**
   * Post-calculation plausibility verdict. Advisory only — the
   * evaluator NEVER recalculates or overwrites a quantity. Optional so
   * older callers / fixtures stay valid.
   */
  evaluator?: EvaluatorVerdict;
};

// ─────────────────────────────────────────────────────────────────────────
// Scope licensing (P0 hardening) — POSITIVE evidence that a material
// family is allowed in this job. Calculators only run for licensed
// scopes; a routed-but-unlicensed scope is recorded as a denial and
// produces NO lines. Types live here (not license.ts) to avoid an
// import cycle; logic lives in license.ts.
// ─────────────────────────────────────────────────────────────────────────

export type LicenseEvidenceKind = "scan_marker" | "user_statement" | "keyword";

export type ScopeLicense = {
  scope: ScopeType;
  /** The positive evidence that granted this scope. */
  granted_by: { kind: LicenseEvidenceKind; ref: string };
  confidence: number;
};

export type LicenseDenial = {
  scope: ScopeType;
  /** Human-readable reason shown to the tradie (never silent). */
  reason: string;
};

/**
 * Top-level result of the whole orchestrator.
 *
 * `scopes` is the array of per-scope results (one per sub-scope). The
 * overall status is the WORST status across all scopes — if even one
 * line is blocked the whole takeoff is "needs_review" (or "blocked"
 * when ALL critical scopes are blocked).
 */
export type TakeoffResult = {
  status: TakeoffStatus;
  primary_scope: ScopeType;
  scopes: ScopeResult[];
  clarifications: ClarificationQuestion[];
  warnings: string[];
  /** Aggregated plausibility verdict across all calculated scopes. */
  evaluator?: EvaluatorVerdict;
  /** Positive scope licenses that allowed each calculated scope. */
  licenses?: ScopeLicense[];
  /** Routed scopes that were refused a license (and why). */
  license_denials?: LicenseDenial[];
};

// ─────────────────────────────────────────────────────────────────────────
// Evaluator (post-calculation plausibility layer).
//
// Runs AFTER the deterministic calculator + validator. It reviews the
// extraction, the calculator output and the validator flags and assigns
// a plausibility verdict. It is ADVISORY — it never invents or replaces
// a quantity, and the calculator stays the source of truth.
//
//   pass     — nothing implausible spotted.
//   caution  — output is suspicious; a human should eyeball it before
//              it goes out (does not hard-block, but requires an explicit
//              acknowledgement at the send gate).
//   fail     — output is almost certainly wrong; hard-blocked from send.
// ─────────────────────────────────────────────────────────────────────────

export type EvaluatorStatus = "pass" | "caution" | "fail";

export type EvaluatorReason = {
  /** Stable machine code, e.g. "roof_area_not_pitched". */
  code: string;
  /** Human-readable explanation suitable for the UI. */
  message: string;
  severity: "caution" | "fail";
  scope: ScopeType;
};

export type EvaluatorVerdict = {
  status: EvaluatorStatus;
  reasons: EvaluatorReason[];
  /** [0,1] — lower when more/severe reasons fire. */
  confidence: number;
  /** True when status is not "pass" (caution or fail). */
  requires_manual_confirmation: boolean;
};

export function evaluatorStatusRank(s: EvaluatorStatus): number {
  switch (s) {
    case "pass":
      return 0;
    case "caution":
      return 1;
    case "fail":
      return 2;
  }
}

export function worstEvaluatorStatus(
  items: EvaluatorStatus[],
): EvaluatorStatus {
  if (items.length === 0) return "pass";
  return items.reduce((acc, s) =>
    evaluatorStatusRank(s) > evaluatorStatusRank(acc) ? s : acc,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Structured extraction — what the LLM (or regex parser) feeds us.
//
// The LLM is allowed to emit `null` for any field. The validator below
// flags critical nulls as `needs_clarification` rather than guessing.
// ─────────────────────────────────────────────────────────────────────────

export type ExtractedDimensions = {
  length_m?: number | null;
  width_m?: number | null;
  height_m?: number | null;
  area_m2?: number | null;
  perimeter_m?: number | null;
  pitch_deg?: number | null;
  volume_m3?: number | null;
  /**
   * Roofing: the gutter (eave) length — the edge long-run sheets are laid
   * side by side along — when the tradie names it ("gutter runs the 12m
   * side"). Null → the roofing calculator assumes the longer plan side.
   */
  eave_m?: number | null;
};

export type ExtractedOpening = {
  kind: "door" | "window" | "other";
  width_m?: number | null;
  height_m?: number | null;
  count?: number | null;
};

export type ExtractedExtraction = {
  /** Cumulative confidence in the extraction itself (LLM or regex). */
  confidence: number;
  project_type: string | null;
  scope_type: ScopeType;
  /** When the job spans multiple scopes. */
  sub_scopes: ScopeType[];
  dimensions: ExtractedDimensions;
  openings: ExtractedOpening[];
  /** Spacing / centres in mm — joists, studs, battens, rafters, etc. */
  spacing_mm?: number | null;
  /** Material spec hint (e.g. "180mm bevel-back weatherboard"). */
  material_spec?: string | null;
  /** Stock length the tradie buys timber in (m). */
  stock_length_m?: number | null;
  /** Manufacturer board / sheet coverage (mm wide). */
  coverage_mm?: number | null;
  /** Waste percentage; null → calculator default. */
  waste_percent?: number | null;
  /**
   * Wall context for the exterior-only insulation rule. "exterior"
   * requires POSITIVE evidence (user statement / scan marker) — it is
   * never guessed. Absence of evidence is "unknown", which BLOCKS the
   * insulation calculator (fail closed).
   */
  wall_kind?: "exterior" | "interior" | "mixed" | "unknown" | null;
  /** Exterior (perimeter) wall run in metres, when separately known. */
  exterior_wall_run_m?: number | null;
  /** Free-form notes the calculator should pass through. */
  notes: string[];
  /** Fields the extraction couldn't resolve. */
  needs_clarification: string[];
  clarification_questions: ClarificationQuestion[];
  /** Where the extraction's evidence came from. */
  source_basis: "regex" | "llm" | "marker" | "manual";
};

// ─────────────────────────────────────────────────────────────────────────
// Lightweight runtime validators — zod-shaped.
// ─────────────────────────────────────────────────────────────────────────

export type ParseOk<T> = { ok: true; value: T };
export type ParseErr = { ok: false; errors: string[] };
export type ParseResult<T> = ParseOk<T> | ParseErr;

const isFinitePositive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

const isFiniteNonNeg = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

const optNumber = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

export function isScopeType(v: unknown): v is ScopeType {
  return typeof v === "string" && (ALL_SCOPES as string[]).includes(v);
}

export function parseExtractedExtraction(
  raw: unknown,
): ParseResult<ExtractedExtraction> {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: ["extraction must be an object"] };
  }
  const obj = raw as Record<string, unknown>;
  const confidence = typeof obj.confidence === "number" ? obj.confidence : 0;
  const scope_type = isScopeType(obj.scope_type)
    ? (obj.scope_type as ScopeType)
    : "generic";
  if (!isScopeType(obj.scope_type)) {
    errors.push(`scope_type missing or invalid; defaulted to "generic"`);
  }
  const sub_scopes_raw = Array.isArray(obj.sub_scopes) ? obj.sub_scopes : [];
  const sub_scopes = sub_scopes_raw.filter(isScopeType) as ScopeType[];

  const rawDims =
    typeof obj.dimensions === "object" && obj.dimensions !== null
      ? (obj.dimensions as Record<string, unknown>)
      : {};
  const dimensions: ExtractedDimensions = {
    length_m: optNumber(rawDims.length_m),
    width_m: optNumber(rawDims.width_m),
    height_m: optNumber(rawDims.height_m),
    area_m2: optNumber(rawDims.area_m2),
    perimeter_m: optNumber(rawDims.perimeter_m),
    pitch_deg: optNumber(rawDims.pitch_deg),
    volume_m3: optNumber(rawDims.volume_m3),
    eave_m: optNumber(rawDims.eave_m),
  };

  const openings: ExtractedOpening[] = Array.isArray(obj.openings)
    ? obj.openings
        .filter(
          (o): o is Record<string, unknown> =>
            typeof o === "object" && o !== null,
        )
        .map((o): ExtractedOpening => ({
          kind:
            o.kind === "door" || o.kind === "window"
              ? (o.kind as "door" | "window")
              : "other",
          width_m: optNumber(o.width_m),
          height_m: optNumber(o.height_m),
          count: optNumber(o.count),
        }))
    : [];

  const value: ExtractedExtraction = {
    confidence: Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : 0,
    project_type:
      typeof obj.project_type === "string" ? obj.project_type : null,
    scope_type,
    sub_scopes,
    dimensions,
    openings,
    spacing_mm: optNumber(obj.spacing_mm),
    material_spec:
      typeof obj.material_spec === "string" ? obj.material_spec : null,
    stock_length_m: optNumber(obj.stock_length_m),
    coverage_mm: optNumber(obj.coverage_mm),
    waste_percent: optNumber(obj.waste_percent),
    wall_kind:
      obj.wall_kind === "exterior" ||
      obj.wall_kind === "interior" ||
      obj.wall_kind === "mixed" ||
      obj.wall_kind === "unknown"
        ? (obj.wall_kind as ExtractedExtraction["wall_kind"])
        : null,
    exterior_wall_run_m: optNumber(obj.exterior_wall_run_m),
    notes: Array.isArray(obj.notes)
      ? obj.notes.filter((s): s is string => typeof s === "string")
      : [],
    needs_clarification: Array.isArray(obj.needs_clarification)
      ? obj.needs_clarification.filter((s): s is string => typeof s === "string")
      : [],
    clarification_questions: [],
    source_basis:
      obj.source_basis === "llm" ||
      obj.source_basis === "regex" ||
      obj.source_basis === "marker" ||
      obj.source_basis === "manual"
        ? (obj.source_basis as ExtractedExtraction["source_basis"])
        : "regex",
  };

  // Soft validation: dimensions should be in a sane envelope (1m–100m for
  // residential trade work). We don't reject — extraction layer is best-
  // effort, validate.ts decides whether to block.
  const sanity = (label: string, v: number | null | undefined) => {
    if (typeof v === "number" && (v <= 0 || v > 200)) {
      errors.push(`${label}=${v} is outside the 0–200 m sanity envelope`);
    }
  };
  sanity("length_m", dimensions.length_m);
  sanity("width_m", dimensions.width_m);
  sanity("height_m", dimensions.height_m);

  return { ok: true, value };
}

/**
 * Coerce a TakeoffStatus to a sort key so we can compute the worst
 * status across a list of lines/scopes.
 */
export function statusRank(s: TakeoffStatus): number {
  switch (s) {
    case "ok":
      return 0;
    case "assumed":
      return 1;
    case "needs_review":
      return 2;
    case "blocked":
      return 3;
  }
}

export function worstStatus(items: TakeoffStatus[]): TakeoffStatus {
  if (items.length === 0) return "ok";
  return items.reduce((acc, s) =>
    statusRank(s) > statusRank(acc) ? s : acc,
  );
}

// Re-export the input-shape helpers for tests.
export const __test = { isFinitePositive, isFiniteNonNeg, optNumber };
