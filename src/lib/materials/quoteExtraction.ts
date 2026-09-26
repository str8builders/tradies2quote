// ─────────────────────────────────────────────────────────────────────────
// Supplier-quote extraction — pure parser / normaliser.
//
// The AI (Claude vision) reads a photo of a NZ building-merchant quote and
// returns loose JSON. This module is the deterministic boundary: it turns
// that JSON into a typed, sanitised `SupplierQuoteExtraction` the rest of
// the app can trust. The AI extracts; this code normalises; the human
// reviews; `importSupplierQuoteItems` writes. The AI is never the source
// of truth for a price.
//
// No zod (CLAUDE.md says avoid deps) — the `parse*` helper is zod-shaped:
// it returns `{ ok, value }` / `{ ok, errors }` so call sites branch the
// same way as the takeoff schemas.
// ─────────────────────────────────────────────────────────────────────────

// Money rounds through the ONE exact half-up helper (1.005 → 1.01).
import { round2 } from "../quote-defaults";

export type ExtractedSupplierItem = {
  /** Product description as printed on the quote. */
  name: string;
  /** Normalised unit (each, m, m², sheet, length, bag, …). */
  unit: string;
  /**
   * Unit price as shown, at full precision (never rounded to the cent —
   * 0.125 × 1000 must stay $125). Negative for a printed discount / credit
   * line. GST handling is decided at review time. Null = not found.
   */
  price: number | null;
  /** Supplier SKU / product code if printed. */
  sku: string | null;
  /** Line quantity in the printed unit — used when building a quote 1:1. */
  quantity: number | null;
  /**
   * Piece count when the line shows a "N/length" breakdown (e.g. "19/4.8m"
   * → 19 pieces). When present it's authoritative: the supplier already did
   * the stock-length maths, so we don't re-round.
   */
  pieces: number | null;
  /**
   * The line total EXACTLY as printed on the supplier quote. Read-only
   * SOURCE value — the validation layer reconciles this against the
   * recomputed `quantity × price`. Never used to overwrite a price. Null
   * when the quote doesn't print a per-line total.
   */
  source_line_total: number | null;
  /**
   * The raw text the model read this row off, for provenance / "show me
   * where this came from" in review. Null when unavailable.
   */
  raw_text: string | null;
  /** [0,1] — the model's confidence in this row (lower when derived/unclear). */
  confidence: number;
};

export type SupplierQuoteExtraction = {
  supplier: string | null;
  /** Quote / order number as printed, for the review header. */
  quote_number: string | null;
  currency: string | null;
  /** true = displayed unit prices INCLUDE GST, false = exclude, null = unclear. */
  gst_inclusive: boolean | null;
  items: ExtractedSupplierItem[];
  /**
   * Document-level totals EXACTLY as printed. Read-only SOURCE values the
   * validation layer reconciles against the recomputed figures. Null when
   * the quote doesn't print that summary line.
   */
  subtotal: number | null;
  gst: number | null;
  total: number | null;
  /**
   * PHASE 2 — document-level adjustments EXACTLY as printed, when the quote
   * breaks them out. Optional; absent on quotes that don't print them.
   * Reconciliation folds them into the expected grand total (discount
   * reduces; freight/adjustments add) so a legitimate freight/discount
   * quote doesn't falsely fail to reconcile.
   */
  discount?: number | null;
  freight?: number | null;
  adjustments?: number | null;
  /** Things the tradie should double-check (smudged numbers, ambiguous units). */
  notes: string[];
};

/**
 * A row the strict parser REJECTED (malformed value / no name / not an
 * object). Surfaced so the failure is visible to the tradie + the debug
 * trace — never silently dropped or "fixed".
 */
export type RowFailure = {
  index: number;
  reason: string;
  raw_text: string | null;
};

export type ParseResult =
  | {
      ok: true;
      value: SupplierQuoteExtraction;
      /** Rows rejected as malformed (visible, not silently dropped). */
      rowFailures: RowFailure[];
      /** Non-fatal notes (e.g. possible duplicate rows) — visible, not silent. */
      warnings: string[];
    }
  | { ok: false; errors: string[] };

/** Deterministic verdict on how trustworthy an extraction is. */
export type ExtractionStatus = "ok" | "needs_review" | "blocked";

/** One AI extraction attempt (value + the rows it rejected). */
export type ExtractionAttempt = {
  value: SupplierQuoteExtraction;
  rowFailures: RowFailure[];
};

// Common NZ-merchant unit spellings → canonical form.
const UNIT_ALIASES: Record<string, string> = {
  ea: "each",
  each: "each",
  unit: "each",
  no: "each",
  "no.": "each",
  pcs: "each",
  pc: "each",
  m: "m",
  lm: "m",
  lin: "m",
  "lin m": "m",
  lineal: "m",
  m2: "m²",
  "m^2": "m²",
  sqm: "m²",
  "sq m": "m²",
  m3: "m³",
  "m^3": "m³",
  cum: "m³",
  sheet: "sheet",
  sht: "sheet",
  length: "length",
  lgth: "length",
  len: "length",
  bag: "bag",
  box: "box",
  roll: "roll",
  pair: "pair",
  kg: "kg",
  l: "L",
  litre: "L",
  ltr: "L",
};

export function normaliseUnit(raw: unknown): string {
  if (typeof raw !== "string") return "each";
  const t = raw.trim().toLowerCase();
  if (!t) return "each";
  return UNIT_ALIASES[t] ?? t;
}

/** Coerce a price-ish value to a number, tolerating "$1,234.50" strings. */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const cleaned = v.replace(/[$,\s]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function clampConfidence(v: unknown): number {
  const n = toNumber(v);
  if (n === null) return 0.6;
  return Math.max(0, Math.min(1, n));
}


/**
 * Clean binary floating-point noise off a unit price WITHOUT rounding it to
 * the cent (11.5 / 1.15 → 10, 0.05 / 1.15 → 0.04347826087). Line totals are
 * money and are rounded to cents; unit prices are not — rounding them first
 * is what turned 10,000 × $0.05 into $460 instead of $500.
 */
export function preciseUnitPrice(n: number): number {
  if (!Number.isFinite(n) || n === 0) return 0;
  return Number(n.toPrecision(10));
}

// Intentional "no price" markers — NOT a misread, so they read as ABSENT
// (kept row, null value), never a malformed rejection.
const NON_PRICE_MARKERS = new Set([
  "",
  "-",
  "—",
  "poa",
  "por",
  "tbc",
  "tba",
  "n/a",
  "na",
  "ask",
  "call",
]);

type NumClass =
  | { kind: "number"; value: number }
  | { kind: "absent" }
  | { kind: "malformed" };

/**
 * Classify a numeric field's raw value with three outcomes so the parser
 * can be strict WITHOUT over-rejecting:
 *   - number    → a usable value (tolerates "$1,234.50")
 *   - absent    → genuinely no value (null / "" / a "POA"/"TBC" marker)
 *   - malformed → present but unreadable (e.g. "12.4O") → reject the row
 */
function classifyNumeric(raw: unknown): NumClass {
  if (raw === null || raw === undefined) return { kind: "absent" };
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { kind: "number", value: raw } : { kind: "malformed" };
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (NON_PRICE_MARKERS.has(trimmed.toLowerCase())) return { kind: "absent" };
    const cleaned = trimmed.replace(/[$,\s]/g, "");
    if (cleaned === "") return { kind: "absent" };
    const n = Number(cleaned);
    return Number.isFinite(n) ? { kind: "number", value: n } : { kind: "malformed" };
  }
  return { kind: "malformed" };
}

/**
 * Parse + sanitise the raw model JSON. Always returns ok:true with a
 * (possibly empty) item list unless the payload isn't even an object —
 * the caller decides what to do with zero items.
 */
export function parseSupplierQuoteExtraction(raw: unknown): ParseResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: ["extraction must be an object"] };
  }
  const obj = raw as Record<string, unknown>;

  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  // Row signature → the 1-based position it was first read at. Identical
  // rows are KEPT (a quote can genuinely list the same item twice — two
  // deliveries, two discounts) but flagged so the tradie can check.
  const seen = new Map<string, number>();
  const items: ExtractedSupplierItem[] = [];
  const rowFailures: RowFailure[] = [];
  const warnings: string[] = [];

  rawItems.forEach((it, index) => {
    if (typeof it !== "object" || it === null) {
      rowFailures.push({ index, reason: "row is not an object", raw_text: null });
      return;
    }
    const r = it as Record<string, unknown>;
    const raw_text =
      typeof r.raw_text === "string" && r.raw_text.trim()
        ? r.raw_text.trim()
        : null;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) {
      rowFailures.push({ index, reason: "row has no product name", raw_text });
      return;
    }

    // Strict: a PRESENT-but-unreadable numeric value rejects the row (it's a
    // misread we must surface, not silently null). A genuinely ABSENT value
    // (null / "" / a "POA"/"TBC" marker) is allowed through.
    const priceC = classifyNumeric(r.price);
    const qtyC = classifyNumeric(r.quantity);
    const ltC = classifyNumeric(r.line_total);
    const piecesC = classifyNumeric(r.pieces);
    const malformed: string[] = [];
    if (priceC.kind === "malformed") malformed.push("unit price");
    if (qtyC.kind === "malformed") malformed.push("quantity");
    if (ltC.kind === "malformed") malformed.push("line total");
    if (piecesC.kind === "malformed") malformed.push("pieces");
    if (malformed.length > 0) {
      rowFailures.push({
        index,
        reason: `${malformed.join(", ")} couldn't be read for "${name}"`,
        raw_text,
      });
      return;
    }

    const unit = normaliseUnit(r.unit);
    // Prices keep their full precision and their sign: a printed discount or
    // credit is a real line, not a misread to zero out.
    let price = priceC.kind === "number" ? priceC.value : null;
    let quantity = qtyC.kind === "number" ? qtyC.value : null;
    // A credit printed as a negative QUANTITY ("-2 × 12.40 = -24.80") is
    // normalised to a positive quantity and a negative price, so every
    // downstream "quantity > 0" rule still holds and qty × price still
    // equals the printed line total.
    if (quantity != null && quantity < 0) {
      quantity = -quantity;
      if (price != null) price = -price;
    }
    const pieces =
      piecesC.kind === "number" && piecesC.value > 0
        ? Math.round(piecesC.value)
        : null;
    const source_line_total =
      ltC.kind === "number" ? round2(ltC.value) : null;
    const sku =
      typeof r.sku === "string" && r.sku.trim() ? r.sku.trim() : null;
    const confidence = clampConfidence(r.confidence);

    // Identical rows are kept (never silently dropped) — the printed
    // subtotal reconciliation catches a row the model read twice — but the
    // tradie gets a visible note to check it.
    const key = [name.toLowerCase(), unit, quantity, price, source_line_total].join("|");
    const firstRow = seen.get(key);
    if (firstRow !== undefined) {
      warnings.push(
        `Possible duplicate: row ${items.length + 1} ("${name}") reads the same as row ${firstRow}. Both are kept — untick one if the quote doesn't list it twice.`,
      );
    } else {
      seen.set(key, items.length + 1);
    }

    items.push({
      name,
      unit,
      price,
      sku,
      quantity,
      pieces,
      source_line_total,
      raw_text,
      confidence,
    });
  });

  const supplier =
    typeof obj.supplier === "string" && obj.supplier.trim()
      ? obj.supplier.trim()
      : null;
  const quote_number =
    typeof obj.quote_number === "string" && obj.quote_number.trim()
      ? obj.quote_number.trim()
      : null;
  const currency =
    typeof obj.currency === "string" && obj.currency.trim()
      ? obj.currency.trim()
      : null;
  const gst_inclusive =
    typeof obj.gst_inclusive === "boolean" ? obj.gst_inclusive : null;
  const subtotal = toNumber(obj.subtotal);
  const gst = toNumber(obj.gst);
  const total = toNumber(obj.total);
  const notes = Array.isArray(obj.notes)
    ? obj.notes.filter((s): s is string => typeof s === "string")
    : [];

  return {
    ok: true,
    value: {
      supplier,
      quote_number,
      currency,
      gst_inclusive,
      items,
      subtotal,
      gst,
      total,
      ...totalsBlockAdjustments(obj),
      notes,
    },
    rowFailures,
    warnings,
  };
}

/**
 * Freight, an account / trade discount and any other adjustment printed in
 * the TOTALS block (not as product rows), as the validator expects them: the
 * discount as a positive amount taken off ("-45.00" and "45.00" under "Less
 * discount" are the same $45), freight and adjustments with their printed
 * sign. Keys are left out when the quote prints none, so a plain quote reads
 * exactly as before.
 */
export function totalsBlockAdjustments(
  obj: Record<string, unknown>,
): Pick<SupplierQuoteExtraction, "discount" | "freight" | "adjustments"> {
  const out: Pick<SupplierQuoteExtraction, "discount" | "freight" | "adjustments"> = {};
  const discount = toNumber(obj.discount);
  const freight = toNumber(obj.freight);
  const adjustments = toNumber(obj.adjustments);
  if (discount != null && discount !== 0) out.discount = round2(Math.abs(discount));
  if (freight != null && freight !== 0) out.freight = round2(freight);
  if (adjustments != null && adjustments !== 0) out.adjustments = round2(adjustments);
  return out;
}

/**
 * Deterministic verdict on an extraction's trustworthiness.
 *
 *   blocked       — too incomplete to trust/reconcile (no usable items, or
 *                   rejected rows with no printed totals to reconcile the
 *                   partial against).
 *   needs_review  — partial but reviewable (rejected rows WITH printed
 *                   totals, no totals at all, a priceless line, or low
 *                   confidence).
 *   ok            — no critical extraction issues.
 */
export function assessExtraction(
  value: SupplierQuoteExtraction,
  rowFailures: RowFailure[],
  /** A price list prints no totals, so none are expected (default: a quote). */
  opts: { expectTotals?: boolean } = {},
): { status: ExtractionStatus; reasons: string[] } {
  const items = value.items;
  const expectTotals = opts.expectTotals !== false;
  const noTotals = expectTotals && value.subtotal == null && value.total == null;

  if (items.length === 0) {
    return {
      status: "blocked",
      reasons: ["No usable product lines were extracted."],
    };
  }
  if (rowFailures.length > 0 && noTotals) {
    return {
      status: "blocked",
      reasons: [
        `${rowFailures.length} row(s) couldn't be read and there's no printed subtotal/total to reconcile the partial against.`,
        ...rowFailures.map((f) => f.reason),
      ],
    };
  }

  const reasons: string[] = [];
  if (rowFailures.length > 0) {
    reasons.push(
      `${rowFailures.length} row(s) couldn't be read: ${rowFailures
        .map((f) => f.reason)
        .join("; ")}`,
    );
  }
  if (noTotals) {
    reasons.push("No printed subtotal or total to reconcile against.");
  }
  const priceless = items.filter(
    (it) => it.price == null && it.source_line_total == null,
  );
  if (priceless.length > 0) {
    reasons.push(`${priceless.length} line(s) have no price or line total.`);
  }
  const meanConfidence =
    items.reduce((s, it) => s + (it.confidence ?? 0), 0) / items.length;
  if (meanConfidence < 0.5) {
    reasons.push(`Low extraction confidence (${meanConfidence.toFixed(2)}).`);
  }

  return reasons.length > 0
    ? { status: "needs_review", reasons }
    : { status: "ok", reasons: [] };
}

/** How far the extracted lines are from the printed subtotal/total (lower =
 *  more reconcilable). Infinity when there's nothing to reconcile against. */
function reconciliationScore(value: SupplierQuoteExtraction): number {
  const sumLines = round2(
    value.items.reduce((s, it) => {
      const lt =
        it.source_line_total != null
          ? it.source_line_total
          : it.quantity != null && it.price != null
            ? it.quantity * it.price
            : 0;
      return s + lt;
    }, 0),
  );
  if (value.subtotal != null) return Math.abs(value.subtotal - sumLines);
  if (value.total != null) return Math.abs(value.total - sumLines);
  return Number.POSITIVE_INFINITY;
}

const EXTRACTION_STATUS_RANK: Record<ExtractionStatus, number> = {
  ok: 0,
  needs_review: 1,
  blocked: 2,
};

/**
 * Pick the best of several extraction attempts (initial + retries). Prefers
 * the MOST RECONCILABLE result (lines tie out to the printed totals) over a
 * merely cleaner-looking one, then best status, then fewest rejected rows,
 * then most items.
 */
export function chooseBestExtraction(
  attempts: ExtractionAttempt[],
  opts: { expectTotals?: boolean } = {},
): ExtractionAttempt & { status: ExtractionStatus; reasons: string[] } {
  const scored = attempts.map((a) => {
    const { status, reasons } = assessExtraction(a.value, a.rowFailures, opts);
    return { ...a, status, reasons, score: reconciliationScore(a.value) };
  });
  scored.sort((x, y) => {
    if (x.score !== y.score) return x.score - y.score; // most reconcilable
    if (EXTRACTION_STATUS_RANK[x.status] !== EXTRACTION_STATUS_RANK[y.status]) {
      return EXTRACTION_STATUS_RANK[x.status] - EXTRACTION_STATUS_RANK[y.status];
    }
    if (x.rowFailures.length !== y.rowFailures.length) {
      return x.rowFailures.length - y.rowFailures.length;
    }
    return y.value.items.length - x.value.items.length;
  });
  const best = scored[0];
  return {
    value: best.value,
    rowFailures: best.rowFailures,
    status: best.status,
    reasons: best.reasons,
  };
}

/**
 * Convert a displayed MONEY AMOUNT (a line total or document total) to ex-GST,
 * rounded to the cent. `rate` is the GST fraction (NZ = 0.15).
 *
 * Do not use this for unit prices: rounding a unit price before multiplying
 * compounds the error across the quantity (10,000 × $0.05 incl → $460).
 * Use `unitPriceExGst` for those.
 */
export function toExGst(
  price: number,
  inclusive: boolean,
  rate = 0.15,
): number {
  const ex = inclusive ? price / (1 + rate) : price;
  return round2(ex);
}

/**
 * Convert a displayed UNIT price to ex-GST at full precision (the library's
 * `default_unit_price` and quote unit prices are ex-GST). Only floating-point
 * noise is removed — see `preciseUnitPrice`.
 */
export function unitPriceExGst(
  price: number,
  inclusive: boolean,
  rate = 0.15,
): number {
  return preciseUnitPrice(inclusive ? price / (1 + rate) : price);
}
