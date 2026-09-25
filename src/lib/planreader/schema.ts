// ─────────────────────────────────────────────────────────────────────────
// Plan-reader — normalized types + zod-shaped runtime validators.
//
// This is the persisted data model for the multi-sheet plan-reading system
// (see docs/plan-reader/ARCHITECTURE.md). It sits ON TOP of the existing
// takeoff pipeline in src/lib/takeoff/: an `ExtractedSheet` feeds the
// orchestrator, and every calculated quantity is an existing `TakeoffLine`
// (formulas in code, never in prompts).
//
// Conventions, matching src/lib/takeoff/schemas.ts:
//   - No zod (CLAUDE.md: avoid deps). `parse*` helpers return
//     `{ ok, value } | { ok:false, errors }`.
//   - The model is allowed to emit null for any extracted field; gates
//     (Phase 2) decide whether a null blocks rather than guessing.
// ─────────────────────────────────────────────────────────────────────────

import type { TakeoffResult } from "@/lib/takeoff/schemas";

// ── Sheet classification ──────────────────────────────────────────────────

/**
 * The disciplines we classify a single plan page into. Only `deck`,
 * `floor_plan`, and `foundation` are "supported" (they have extractors +
 * calculators). The rest are recognized so we can label and SKIP them
 * rather than mis-process them as a supported type.
 */
export type SheetType =
  | "deck"
  | "floor_plan"
  | "foundation"
  | "elevation"
  | "section_detail"
  | "schedule"
  | "unknown";

export const ALL_SHEET_TYPES: SheetType[] = [
  "deck",
  "floor_plan",
  "foundation",
  "elevation",
  "section_detail",
  "schedule",
  "unknown",
];

/** The sheet types that have a real extractor + calculator behind them. */
export const SUPPORTED_SHEET_TYPES: SheetType[] = [
  "deck",
  "floor_plan",
  "foundation",
];

export function isSheetType(v: unknown): v is SheetType {
  return typeof v === "string" && (ALL_SHEET_TYPES as string[]).includes(v);
}

export function isSupportedSheetType(t: SheetType): boolean {
  return SUPPORTED_SHEET_TYPES.includes(t);
}

/**
 * Result of classifying ONE sheet. `confidence` is in [0,1]; `basis` lists
 * the evidence that voted (e.g. "filename:deck", "titleblock:FOUNDATION
 * PLAN", "vision:0.82") so the decision is auditable.
 */
export type SheetClassification = {
  sheet_type: SheetType;
  confidence: number;
  basis: string[];
};

// ── File + sheet records (mirror the DB rows) ─────────────────────────────

export type PlanFileStatus =
  | "uploaded"
  | "classified"
  | "extracted"
  | "review"
  | "done"
  | "error";

export type PlanSheetStatus =
  | "classified"
  | "extracting"
  | "extracted"
  | "needs_review"
  | "blocked"
  | "done";

export type PlanFileRecord = {
  id: string;
  user_id: string;
  quote_id: string | null;
  project_id: string | null;
  original_filename: string;
  mime: string;
  byte_size: number;
  page_count: number;
  storage_path: string;
  uploaded_at: string;
  status: PlanFileStatus;
};

export type PlanSheetRecord = {
  id: string;
  file_id: string;
  user_id: string;
  sheet_number: number;
  sheet_label: string | null;
  image_path: string;
  sheet_type: SheetType;
  classification_confidence: number;
  classification_basis: string[];
  extraction: ExtractedSheet | null;
  review_required: boolean;
  review_reasons: string[];
  status: PlanSheetStatus;
};

// ── Extracted-sheet JSON (Phase 2-3 fills this; persisted as JSONB) ───────

export type LengthUnit = "mm" | "m" | "ft" | "in";

export type BBox = {
  /** Normalized [0,1] coordinates relative to the page image. */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type OcrBlock = {
  text: string;
  /** Null in Phase 2 (text-only OCR); populated once geometry coords exist. */
  bbox: BBox | null;
  confidence: number;
};

export type DimensionSource = "text" | "geometry";

export type LabelledDimension = {
  /** Canonical metric value in metres. */
  value_m: number;
  raw_text: string;
  bbox: BBox | null;
  source: DimensionSource;
};

export type DetectedSymbol = {
  /** e.g. "door", "window", "pile", "footing", "stud", "post". */
  kind: string;
  bbox: BBox;
  confidence: number;
};

export type SheetGeometry = {
  /** Open or closed polylines in normalized page coords. */
  polylines: Array<{ points: Array<[number, number]>; closed: boolean }>;
  /** Closed regions with a real-world area once scale is known (m²). */
  closed_areas: Array<{ points: Array<[number, number]>; area_m2: number | null }>;
  /** Openings (doors/windows) located in the geometry. */
  openings: Array<{ kind: "door" | "window" | "other"; bbox: BBox }>;
};

/**
 * The normalized extraction for a single sheet. Null until Phase 2-3 runs.
 * `takeoff` is the EXISTING TakeoffResult — the calculated, auditable
 * quantities. We do not invent a parallel calculation type.
 */
export type ExtractedSheet = {
  units: LengthUnit | null;
  scale_text: string | null;
  /** [0,1]. 0 ⇒ scale unknown ⇒ pixel measurement is forbidden (gate). */
  scale_confidence: number;
  /** [0,1] aggregate OCR confidence. */
  ocr_confidence: number;
  title_block: Record<string, string>;
  ocr_blocks: OcrBlock[];
  dimensions: LabelledDimension[];
  detected_symbols: DetectedSymbol[];
  geometry: SheetGeometry;
  takeoff: TakeoffResult | null;
  warnings: string[];
  review_required: boolean;
  /**
   * Set when the model call failed (timeout, provider error, refusal,
   * unreadable reply) instead of the sheet being read. A re-run of
   * /api/plans/extract retries these sheets and skips the ones read fine.
   */
  extraction_error?: string | null;
};

// ── zod-shaped validators ─────────────────────────────────────────────────

export type ParseOk<T> = { ok: true; value: T };
export type ParseErr = { ok: false; errors: string[] };
export type ParseResult<T> = ParseOk<T> | ParseErr;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Validate a raw classification object (e.g. from the vision call) into a
 * SheetClassification. Unknown/invalid sheet_type collapses to "unknown"
 * with confidence 0 — never a confident guess.
 */
export function parseSheetClassification(
  raw: unknown,
): ParseResult<SheetClassification> {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: ["classification must be an object"] };
  }
  const obj = raw as Record<string, unknown>;
  const sheet_type = isSheetType(obj.sheet_type) ? obj.sheet_type : "unknown";
  const confidence = isSheetType(obj.sheet_type)
    ? clamp01(typeof obj.confidence === "number" ? obj.confidence : 0)
    : 0;
  const basis = Array.isArray(obj.basis)
    ? obj.basis.filter((s): s is string => typeof s === "string")
    : [];
  return { ok: true, value: { sheet_type, confidence, basis } };
}

/** Are the metadata fields for a file ingest sane? (Phase-1 ingest guard.) */
export function validateIngestMeta(meta: {
  original_filename?: unknown;
  mime?: unknown;
  byte_size?: unknown;
  page_count?: unknown;
}): ParseResult<{
  original_filename: string;
  mime: string;
  byte_size: number;
  page_count: number;
}> {
  const errors: string[] = [];
  const original_filename =
    typeof meta.original_filename === "string" && meta.original_filename.trim()
      ? meta.original_filename.trim().slice(0, 255)
      : (errors.push("original_filename required"), "");
  const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
  const mime =
    typeof meta.mime === "string" && ALLOWED.includes(meta.mime)
      ? meta.mime
      : (errors.push(`mime must be one of ${ALLOWED.join(", ")}`), "");
  const byte_size =
    typeof meta.byte_size === "number" && meta.byte_size > 0
      ? meta.byte_size
      : (errors.push("byte_size must be > 0"), 0);
  const page_count =
    typeof meta.page_count === "number" &&
    Number.isInteger(meta.page_count) &&
    meta.page_count >= 1 &&
    meta.page_count <= 200
      ? meta.page_count
      : (errors.push("page_count must be an integer 1–200"), 0);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { original_filename, mime, byte_size, page_count },
  };
}

export const __test = { clamp01 };
