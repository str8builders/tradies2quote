export type QuoteItemType = "material" | "labour" | "other";

export type PriceSource =
  | "user_library"
  | "catalogue_seed"
  | "csv_import"
  | "supplier_import"
  | "missing_price"
  | "ai_estimate";

export type PriceConfidence = "high" | "medium" | "low";

// ---------------------------------------------------------------------------
// Stage 5 — NZ Building Compliance Knowledge Layer.
//
// These types are inlined here (rather than imported from
// `src/lib/compliance/types.ts`) so that quote-types.ts has no
// dependency on the compliance module. This keeps the dependency
// direction one-way: compliance imports QuoteLineItem from this file,
// not the reverse.
//
// The fields are CRITICALLY server-side only — they are deliberately
// absent from `PublicLineItem`. The exact-6-field test in
// `materialMatchingPipeline.test.ts` will fail if anyone widens
// PublicLineItem to leak them, and `compliance/public-quote-stripping.test.ts`
// asserts the same invariant for the new fields specifically.
// ---------------------------------------------------------------------------

export type ComplianceConfidence = "high" | "medium" | "low";

/** Provenance of a per-line-item compliance decision. */
export type ComplianceProvenance =
  | "rule"
  | "catalogue"
  | "user_library"
  | "ai_estimate"
  | "missing_context";

/** Citation referencing a row in `compliance/sources.ts`. */
export type ComplianceCitation = {
  source_id: string;
  reason: string;
};

export type QuoteLineItem = {
  type: QuoteItemType;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  library_id?: string | null;
  /** Stage 4 catalogue row ID (mirrors library_id when both are set). */
  material_id?: string | null;
  is_ai_estimated?: boolean;
  is_missing_price?: boolean;
  is_calculated_takeoff?: boolean;
  formula?: string;
  price_match_key?: string;
  /** Stage 4 — where the unit_price came from. */
  price_source?: PriceSource;
  /** Stage 4 — confidence in the price match. */
  price_confidence?: PriceConfidence;
  /** Stage 5 — human-readable reason this line is on the quote. */
  reason?: string;
  /** Stage 5 — confidence in the compliance review for this line. */
  confidence?: ComplianceConfidence;
  /** Stage 5 — provenance of the compliance decision. */
  compliance_source_type?: ComplianceProvenance;
  /** Stage 5 — internal review notes (NEVER shown on the public quote). */
  compliance_notes?: string[];
  /** Stage 5 — confirmations the user must give before this line is safe. */
  required_confirmations?: string[];
  /** Stage 5 — citations to the approved-source knowledge base. */
  citations?: ComplianceCitation[];
  /**
   * Wave 44 — takeoff status from the takeoff orchestrator. One of
   *   ok            — calculated from concrete inputs.
   *   assumed       — calculated with at least one default substituted.
   *   needs_review  — calculator ran but validator flagged something.
   *   blocked       — calculator could not run; needs clarification.
   * Server-side only — never exposed via PublicLineItem.
   */
  takeoff_status?: "ok" | "assumed" | "needs_review" | "blocked";
  /**
   * Wave 44 — soft flags explaining a non-"ok" takeoff_status.
   * Server-side only.
   */
  takeoff_flags?: string[];
  /**
   * Wave 47 — row-level warning badges, e.g. supplier-estimate sanity
   * checks ("2 pile kits for 12 piles — likely undercount"). Stored in
   * quote_data JSONB; server-side only (never on PublicLineItem).
   */
  warnings?: string[];
  /**
   * For supplier-quote (ITM) imports: the line total printed on the
   * supplier quote, in the quote's ex-GST basis. Read-only SOURCE value the
   * Review Quote editor reconciles against `line_total` (= qty × unit_price).
   * Absent on quotes that didn't come from a scanned supplier quote.
   */
  source_line_total?: number | null;
  /**
   * PHASE 2 (source preservation) — the line EXACTLY as read from the
   * supplier document, never GST-converted or recomputed. The live
   * `quantity`/`unit`/`unit_price`/`line_total` above are the NORMALIZED
   * (computed, ex-GST) values; these mirror the raw source so Review Quote
   * can diff source vs app and the source is never silently overwritten.
   * Absent on non-supplier lines.
   */
  source_description?: string | null;
  source_quantity?: number | null;
  source_unit?: string | null;
  source_unit_price?: number | null;
  /**
   * Deterministic per-line reconciliation flags raised by the validation
   * engine (e.g. "line_total≠qty×price", "price_derived_from_total").
   */
  validation_flags?: string[];
  /**
   * PHASE 7 — provenance of this line's QUANTITY, plus whether the tradie
   * has confirmed it. Final-send rule: an AI-supplied material quantity
   * (`quantity_source === "ai"`) may NOT be sent until it is confirmed
   * (`quantity_confirmed === true`), edited (→ "user"), or replaced with a
   * deterministic calculator result (→ "calculator"). Calculator / supplier
   * / user quantities are trusted. Absent = legacy (treated as not "ai").
   */
  quantity_source?: "ai" | "calculator" | "supplier" | "user";
  quantity_confirmed?: boolean;
  /** T2QCAL — stable calculator output key; internal review evidence only. */
  t2qcal_source_key?: string;
  /** T2QCAL — canonical product/package basis used for the quantity. */
  t2qcal_basis_fingerprint?: string;
  /** T2QCAL — plain-language assumptions/checks shown in Review Quote only. */
  t2qcal_assumptions?: string[];
  t2qcal_checks?: string[];
  /** T2QCAL — honest source note, separate from compliance `reason`. */
  t2qcal_provenance_note?: string;
  /** T2QCAL — calculator inputs at the moment the result was produced. */
  t2qcal_calculator_snapshot?: {
    toolSlug: string;
    toolName: string;
    inputs: Array<{ key: string; label: string; value: number; unit: string; displayLabel?: string | null }>;
  };
};

/**
 * Wave 45 — frozen summary of the takeoff evaluator's verdict for this
 * quote. Written ONCE by `/api/quotes/generate` into `quote_data`, read
 * by the pre-send safety gate. Server-side only — never exposed via
 * PublicLineItem / PublicQuotePayload.
 *
 *   pass     — no implausible output spotted.
 *   caution  — suspicious; send requires an explicit acknowledgement.
 *   fail     — almost certainly wrong; send is hard-blocked.
 */
export type TakeoffEvaluationSummary = {
  status: "pass" | "caution" | "fail";
  /** Human-readable reasons (already de-coupled from internal codes). */
  reasons: string[];
  confidence: number;
};

export type TakeoffInputsSnapshot = Partial<{
  wallLengthM: number;
  wallHeightM: number;
  studSpacingMm: number;
  numberOfDoors: number;
  numberOfWindows: number;
  gibSides: 1 | 2;
  includeInsulation: boolean;
  includeSkirting: boolean;
  includeArchitraves: boolean;
  wastePercent: number;
}>;

// ---------------------------------------------------------------------------
// #1 — Drawing key-dimension confirmation.
//
// A drawing scan can mis-read the numbers that DRIVE a takeoff (deck length,
// floor width, wall height). For RISKY drawings we freeze the exact extracted
// key dimensions and require the tradie to confirm (or correct) them before
// the quote can be sent. Confirmation is a HARD send-gate block — never
// produced for voice/typed inputs or safe drawings, so safe jobs see no
// friction. Server-side only; never exposed via PublicLineItem/PublicQuote.
// ---------------------------------------------------------------------------

/** Why a drawing's key dimensions need confirming before send. */
export type DimensionConfirmationReason =
  | "low_confidence"
  | "plan_text_disagree"
  | "no_scale"
  | "large_quantity";

/**
 * One key dimension the tradie must confirm or correct. `key` is the
 * deterministic calculator INPUT FIELD NAME (e.g. "deckLengthM") so a
 * correction maps straight back onto the calculator with no translation.
 */
export type ConfirmableDimension = {
  key: string;
  label: string;
  value: number;
  unit: string;
  confirmed: boolean;
};

export type DimensionConfirmation = {
  /** True when the drawing was risky enough to require confirmation. */
  required: boolean;
  reasons: DimensionConfirmationReason[];
  /** Which calculator drives these dimensions (for recompute on edit). */
  takeoff_type: "deck" | "subfloor" | "cladding" | "wall";
  dimensions: ConfirmableDimension[];
  /** Auth user id that confirmed; set when the tradie confirms. */
  confirmed_by?: string | null;
  /** ISO timestamp the dimensions were confirmed. */
  confirmed_at?: string | null;
};

export type LibraryMaterial = {
  id: string;
  name: string;
  unit: string | null;
  default_unit_price: number | null;
  supplier: string | null;
  supplier_url: string | null;
  notes: string | null;
  usage_count: number;
  is_ai_estimated: boolean;
  last_used_at: string | null;
};

export type QuoteClient = {
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  contact?: string | null;
};

/**
 * Quote lifecycle statuses.
 *
 * `scheduled`, `in_progress`, `completed` were added in Wave 13 (the
 * lifecycle state machine). They mirror the new Postgres enum values
 * applied by `wave13_lifecycle_status_enums_and_columns`.
 *
 * Transitions between these are enforced server-side by the
 * `public.transition_quote_lifecycle` RPC and mirrored in
 * `src/lib/lifecycle/stages.ts`.
 */
export type QuoteStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired"
  | "scheduled"
  | "in_progress"
  | "completed";

export type QuoteEventType =
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired"
  | "scheduled"
  | "in_progress"
  | "completed";

export type QuoteEvent = {
  id: string;
  quote_id: string;
  type: QuoteEventType;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type PublicLineItem = {
  type: QuoteItemType;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
};

export type PublicQuotePayload = {
  id: string;
  status: QuoteStatus;
  created_at: string;
  sent_at: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  accepted_quote_version: number;
  currency: string;
  has_pdf: boolean;
  has_signature: boolean;
  has_logo: boolean;
  business_name: string | null;
  business_email: string | null;
  business_phone: string | null;
  client: {
    name: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
  };
  job_summary: string | null;
  line_items: PublicLineItem[];
  materials_subtotal: number;
  labour_subtotal: number;
  markup_amount: number;
  subtotal_before_tax: number;
  tax_amount: number;
  total: number;
  tax_label: string;
  tax_rate: number;
  terms: string | null;
};

export type QuoteData = {
  client: QuoteClient;
  job_summary: string;
  line_items: QuoteLineItem[];
  materials_subtotal: number;
  labour_subtotal: number;
  markup_pct: number;
  markup_amount: number;
  subtotal_before_tax: number;
  tax_amount: number;
  total: number;
  currency: string;
  tax_label: string;
  tax_rate: number;
  terms: string;
  notes: string[];
  takeoff_inputs?: TakeoffInputsSnapshot;
  /**
   * Wave 45 — frozen evaluator verdict for the takeoff. Read by the
   * pre-send safety gate. Absent on legacy quotes (treated as unknown,
   * never as a hard block).
   */
  takeoff_evaluation?: TakeoffEvaluationSummary;
  /**
   * Stage 5 — server-side compliance review payload.
   *
   * Stored alongside the quote in the JSONB `quote_data` column so the
   * dashboard preview / future review panel can read it. NEVER returned
   * by the public-quote RPC `get_quote_by_token` — that RPC explicitly
   * projects only the customer-facing fields.
   *
   * The shape is `unknown` rather than `ComplianceReview` to avoid a
   * circular dependency between `quote-types.ts` and
   * `src/lib/compliance/`. Callers cast on read.
   */
  compliance_review?: unknown;
  /**
   * Stage 6 — server-side transcript layers (raw / cleaned / summary /
   * corrections / clarifications / confidence).
   *
   * Same privacy contract as `compliance_review`: stored in JSONB,
   * never returned by `get_quote_by_token`, never reachable from the
   * public quote page. Type is `unknown` to avoid a circular import
   * with `src/lib/transcriptCleanup.ts`. Callers cast on read.
   */
  transcript?: unknown;
  /**
   * Wave 36 — customer chat history (Quote-That-Sells-Itself).
   *
   * Append-only array of { role, content, timestamp, intent?,
   * note_to_tradie? } objects. Written by the public
   * /api/quote/[token]/chat endpoint, read by the tradie's preview
   * page to surface conversation + actionable notes.
   *
   * Stored as `unknown` to avoid coupling the public quote type to
   * the chat agent's shape. The chat endpoint narrows on read.
   * Excluded from `get_quote_by_token`'s projection (the customer
   * already sees their own messages via the running chat UI; they
   * don't need the persisted log).
   */
  chat_history?: unknown;
  /**
   * For supplier-quote (ITM) imports: the printed document totals as
   * scanned, in the quote's ex-GST basis (subtotal/gst/total) plus the
   * supplier name. Read-only SOURCE values the Review Quote editor
   * reconciles against the live computed totals. Absent on non-import
   * quotes — the editor only shows the reconciliation panel when present.
   */
  supplier_source?: SupplierSource | null;
  /**
   * #1 — frozen key-dimension confirmation for a risky drawing takeoff.
   * Read by the pre-send safety gate (hard-blocks until all required
   * dimensions are confirmed). Absent on voice/typed quotes and on safe
   * drawings (no friction). Server-side only — never in PublicQuotePayload.
   */
  dimension_confirmation?: DimensionConfirmation | null;
  /**
   * Independent verification of the generated quote (deterministic checks
   * always; the LLM critic when QUOTE_VERIFY_ENABLED) — a VerificationReport
   * from `src/lib/agents/verify/quoteVerify.ts`, written once at generation
   * and rendered in the review page's "Quote Review Agent" section.
   *
   * Same privacy contract as `compliance_review`: server-side only, NEVER
   * projected by `get_quote_by_token` (not in PublicQuotePayload). Typed
   * `unknown` to keep quote-types dependency-free; narrow with
   * `parseVerificationReport`.
   */
  verification?: unknown;
};

export type SupplierSource = {
  supplier: string | null;
  /**
   * NORMALIZED (ex-GST) document totals the app reconciles the computed
   * quote against. (Legacy fields — kept for existing readers.)
   */
  subtotal: number | null;
  gst: number | null;
  total: number | null;
  /**
   * PHASE 2 (source preservation) — values EXACTLY as printed on the
   * supplier document, never GST-converted. The source is never silently
   * overwritten; the reconciliation engine compares these (GST-aware)
   * against the normalized/computed quote.
   */
  gst_inclusive?: boolean | null;
  source_subtotal?: number | null;
  source_gst?: number | null;
  source_total?: number | null;
  source_discount?: number | null;
  source_freight?: number | null;
  source_adjustments?: number | null;
  /** Deterministic reconciliation verdict (source vs computed). */
  reconciliation_status?: "ok" | "needs_review" | "blocked";
  reconciliation_reasons?: string[];
  /**
   * #2 — strict-extraction verdict captured at scan time (provenance):
   * how trustworthy the AI read of the supplier doc was.
   */
  extraction_status?: "ok" | "needs_review" | "blocked";
  extraction_reasons?: string[];
  /**
   * Ops layer — rows the strict parser REJECTED at scan time (index,
   * reason, raw_text). Persisted so the owner extraction-review queue can
   * show exactly which rows failed without re-running the scan. Same shape
   * as `RowFailure` in `materials/quoteExtraction.ts` (inlined to keep
   * quote-types dependency-free). Absent on clean reads.
   */
  row_failures?: Array<{
    index: number;
    reason: string;
    raw_text: string | null;
  }>;
  /**
   * Ops layer — how many AI extraction attempts ran (1 = first pass clean,
   * 2 = a retry fired). Drives the retry-rate metric. Absent on legacy rows.
   */
  extraction_attempts?: number;
  /**
   * Ops layer — set true once a human edited / completed a flagged supplier
   * import (the deterministic correction-capture path in saveQuoteChanges).
   * No re-extraction is implied; this is "a person fixed it" provenance.
   */
  extraction_corrected?: boolean;
  corrected_by?: string | null;
  corrected_at?: string | null;
  /**
   * Ops layer — when the owner explicitly marked this flagged extraction
   * handled from the review queue. Reviewed entries drop out of the default
   * queue while keeping their original extraction_status for the record.
   */
  extraction_reviewed_at?: string | null;
};

export type QuoteProfile = {
  business_name: string | null;
  country: string;
  default_labour_rate: number;
  default_markup_pct: number;
  tax_label: string;
  tax_rate: number;
  currency: string;
};
