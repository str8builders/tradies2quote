import type { QuoteData, QuoteLineItem, QuoteStatus } from "./quote-types";
import { computeQuoteTotals, moneyEquals, round2 } from "./quote-defaults";
import {
  classifyLineProvenance,
  licensedFamiliesForDescription,
  t2qcalLicensedFamily,
} from "./reviewGuard";
import { materialFamilyForDescription } from "./takeoff/license";

export type SendValidationError =
  | "client_name_missing"
  | "client_email_missing"
  | "client_email_invalid"
  | "client_phone_missing"
  | "client_phone_invalid"
  | "no_line_items"
  | "total_zero"
  | "already_accepted"
  | "job_underway"
  // Wave 45 — takeoff safety gate.
  | "takeoff_blocked"
  | "takeoff_unconfirmed";

export type SendValidationResult =
  | { ok: true; resolvedEmail: string }
  | { ok: false; error: SendValidationError; reasons?: string[] };

export type SmsSendValidationResult =
  | { ok: true; resolvedPhone: string }
  | { ok: false; error: SendValidationError; reasons?: string[] };

/**
 * Wave 45 — pre-send takeoff safety assessment.
 *
 * Reads the calculation-risk signals already carried on each line
 * (`takeoff_status`) plus the frozen evaluator verdict
 * (`quote_data.takeoff_evaluation`) and decides whether a quote may be
 * sent.
 *
 *   - HARD BLOCK (can_send=false): any `blocked` line OR evaluator
 *     `fail`. These cannot be sent by any path and cannot be overridden
 *     — the underlying number is missing or almost certainly wrong.
 *   - WARN (requires_acknowledgement=true): any `needs_review` /
 *     `assumed` line OR evaluator `caution`. Sendable, but only after an
 *     explicit acknowledgement so uncertainty is never hidden.
 *
 * Legacy quotes with no takeoff signals assess as fully sendable — the
 * absence of data is never treated as a block.
 */
export type TakeoffSafetyAssessment = {
  can_send: boolean;
  block_reasons: string[];
  warning_reasons: string[];
  requires_acknowledgement: boolean;
};

/**
 * "Genuinely empty" guard for the send gate. Returns true when at least one
 * line carries a real (non-zero) quantity. A quote with real quantities but
 * $0 prices (the manual-pricing default under PRICES_OFF) is NOT empty — it is
 * surfaced via the unpriced warn+acknowledge path, not a hard total-zero block.
 * This keeps the "quote total must be greater than zero" rule meaningful
 * (blocks a truly empty quote) without hard-blocking a count-first draft.
 */
function hasSendableQuantity(items: QuoteLineItem[]): boolean {
  return items.some((it) => (Number(it.quantity) || 0) > 0);
}

function lineLabels(items: QuoteLineItem[], max = 3): string {
  const names = items
    .map((it) => it.description?.trim())
    .filter((d): d is string => !!d);
  const shown = names.slice(0, max).join(", ");
  const extra = names.length > max ? ` +${names.length - max} more` : "";
  return shown ? `${shown}${extra}` : `${items.length} line(s)`;
}

/**
 * QUOTE QA — deterministic totals integrity (pre-send contradiction check).
 *
 * The send gate must never trust stored money fields blindly: every figure
 * the customer sees has to equal what `computeQuoteTotals` (the single
 * source of truth, sum-of-rounded) derives from the line items RIGHT NOW.
 * Both writers (generation + save) already recompute through it, so a
 * mismatch here means an unknown writer or corrupted data — exactly the
 * case that must HARD BLOCK rather than reach a customer.
 *
 * Legacy tolerance, matching this file's precedent ("absence of data is
 * never treated as a block"): a stored field that is missing/non-finite is
 * skipped; a field that is PRESENT but wrong blocks. Comparisons allow 1¢
 * (`moneyEquals`) so sub-cent float noise never false-blocks.
 */
export function assessQuoteTotalsIntegrity(
  quote_data: QuoteData | null,
): string[] {
  if (!quote_data) return [];
  const reasons: string[] = [];
  const items: QuoteLineItem[] = Array.isArray(quote_data.line_items)
    ? quote_data.line_items
    : [];
  if (items.length === 0) return [];

  // Per-line: the printed line_total must be qty × unit_price (rounded).
  const badLines = items.filter((it) => {
    const stored = Number(it.line_total);
    if (!Number.isFinite(stored)) return false; // legacy line — skip
    const expected = round2(
      (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    );
    return !moneyEquals(stored, expected);
  });
  if (badLines.length > 0) {
    reasons.push(
      `${badLines.length} line total(s) don't equal quantity × unit price: ${lineLabels(badLines)}. Re-save the quote to recalculate.`,
    );
  }

  // Quote-level: every stored money field must match the deterministic
  // recomputation from the lines + markup + tax rate.
  const expected = computeQuoteTotals(
    items.map((it) => ({
      type: it.type,
      quantity: Number(it.quantity) || 0,
      unit_price: Number(it.unit_price) || 0,
    })),
    Number(quote_data.markup_pct) || 0,
    Number(quote_data.tax_rate) || 0,
  );
  const checks: Array<{ label: string; stored: unknown; want: number }> = [
    { label: "materials subtotal", stored: quote_data.materials_subtotal, want: expected.materials_subtotal },
    { label: "labour subtotal", stored: quote_data.labour_subtotal, want: expected.labour_subtotal },
    { label: "markup", stored: quote_data.markup_amount, want: expected.markup_amount },
    { label: "subtotal before tax", stored: quote_data.subtotal_before_tax, want: expected.subtotal_before_tax },
    { label: `${quote_data.tax_label || "tax"} amount`, stored: quote_data.tax_amount, want: expected.tax_amount },
    { label: "total", stored: quote_data.total, want: expected.total },
  ];
  for (const c of checks) {
    const stored = Number(c.stored);
    if (!Number.isFinite(stored)) continue; // legacy/missing field — skip
    if (!moneyEquals(stored, c.want)) {
      reasons.push(
        `Stored ${c.label} ($${stored.toFixed(2)}) doesn't match the amount calculated from the line items ($${c.want.toFixed(2)}). Re-save the quote to recalculate before sending.`,
      );
    }
  }
  return reasons;
}

/**
 * QUOTE QA — scope/state contradictions (pre-send, HARD block, no auto-fix).
 *
 * Taxonomy:
 *   blocked_with_quantity — a line still marked `blocked` carries a real
 *     quantity. The recovery path clears `blocked` when the tradie types a
 *     quantity, so this state means corrupt/contradictory data. Never
 *     auto-fixed: the tradie must re-save (which re-derives state) so the
 *     fix is visible, not silent.
 *   unlicensed_deck / unlicensed_insulation — a MACHINE-origin (calculated
 *     or AI) deck/insulation-family line on a job whose own description
 *     never licensed that family: a leak-through past the generation
 *     guards. User-confirmed lines are exempt (rule 3 — explicit user
 *     confirmation is valid provenance for any family).
 *
 * `description` should be the same evidence generation licensed from —
 * the voice transcript / scan text; falls back to job_summary.
 */
export function assessQuoteContradictions(
  quote_data: QuoteData | null,
  description?: string | null,
): string[] {
  if (!quote_data) return [];
  const items: QuoteLineItem[] = Array.isArray(quote_data.line_items)
    ? quote_data.line_items
    : [];
  if (items.length === 0) return [];
  const reasons: string[] = [];

  const blockedWithQty = items.filter(
    (it) => it.takeoff_status === "blocked" && (Number(it.quantity) || 0) > 0,
  );
  if (blockedWithQty.length > 0) {
    reasons.push(
      `${blockedWithQty.length} blocked line(s) carry a quantity — contradictory state: ${lineLabels(blockedWithQty)}. Re-save the quote (or clear/re-enter the quantity) before sending.`,
    );
  }

  const licensed = licensedFamiliesForDescription(
    description ?? quote_data.job_summary,
  );
  const unlicensed = (family: "deck" | "insulation") =>
    items.filter((it) => {
      if (it.type !== "material") return false;
      const prov = classifyLineProvenance(it);
      if (prov !== "calculated" && prov !== "ai_unconfirmed") return false;
      return (
        materialFamilyForDescription(it.description ?? "") === family &&
        !licensed.has(family) &&
        t2qcalLicensedFamily(it) !== family
      );
    });
  const deckLeaks = unlicensed("deck");
  if (deckLeaks.length > 0) {
    reasons.push(
      `${deckLeaks.length} deck material line(s) have no deck evidence on this job: ${lineLabels(deckLeaks)}. Remove them, or confirm the quantities yourself if this really is deck work.`,
    );
  }
  const insulationLeaks = unlicensed("insulation");
  if (insulationLeaks.length > 0) {
    reasons.push(
      `${insulationLeaks.length} insulation line(s) have no insulation scope on this job: ${lineLabels(insulationLeaks)}. Remove them, or confirm the quantities yourself.`,
    );
  }
  return reasons;
}

export function assessQuoteTakeoffSafety(
  quote_data: QuoteData | null,
  opts: { description?: string | null } = {},
): TakeoffSafetyAssessment {
  const block_reasons: string[] = [];
  const warning_reasons: string[] = [];

  // QUOTE QA — totals integrity is a HARD block: a customer must never see
  // a total the line items don't add up to.
  block_reasons.push(...assessQuoteTotalsIntegrity(quote_data));
  // QUOTE QA — scope/state contradictions are HARD blocks too.
  block_reasons.push(
    ...assessQuoteContradictions(quote_data, opts.description),
  );

  const items: QuoteLineItem[] = Array.isArray(quote_data?.line_items)
    ? quote_data!.line_items
    : [];

  const blocked = items.filter((it) => it.takeoff_status === "blocked");
  const needsReview = items.filter(
    (it) => it.takeoff_status === "needs_review",
  );
  const assumed = items.filter((it) => it.takeoff_status === "assumed");

  if (blocked.length > 0) {
    block_reasons.push(
      `${blocked.length} line(s) couldn't be calculated and need more info: ${lineLabels(blocked)}.`,
    );
  }

  const evaluation = quote_data?.takeoff_evaluation ?? null;
  if (evaluation?.status === "fail") {
    for (const r of evaluation.reasons) block_reasons.push(r);
    if (evaluation.reasons.length === 0) {
      block_reasons.push("Automated check flagged the takeoff as unreliable.");
    }
  }

  // PHASE 4 — supplier-import source fidelity (HARD BLOCK, no override).
  // Re-checked LIVE against the current quote_data, never the frozen
  // import-time status, so a quote the tradie has since corrected is no
  // longer blocked. A quote that claims to mirror a supplier quote must
  // still match it: every supplier-sourced line's live total must equal
  // its printed source, and the printed subtotal must equal the sum of the
  // sourced lines (a gap = a dropped/duplicated line). Lines the tradie
  // ADDED (no source_line_total) are ignored here so legitimate additions
  // don't false-block.
  const SUPPLIER_TOL = 0.02;
  const sourcedLines = items.filter((it) => it.source_line_total != null);
  if (sourcedLines.length > 0) {
    const changed = sourcedLines.filter((it) => {
      const live = round2(
        (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
      );
      return Math.abs(live - (it.source_line_total as number)) > SUPPLIER_TOL;
    });
    if (changed.length > 0) {
      block_reasons.push(
        `${changed.length} line(s) no longer match the supplier quote: ${lineLabels(changed)}. Snap to the supplier value or correct the price.`,
      );
    }
    const supplierSubtotal = quote_data?.supplier_source?.subtotal ?? null;
    if (supplierSubtotal != null) {
      const sourcedSum = round2(
        sourcedLines.reduce((s, it) => s + (it.source_line_total as number), 0),
      );
      if (Math.abs(sourcedSum - supplierSubtotal) > SUPPLIER_TOL) {
        block_reasons.push(
          "The supplier subtotal doesn't match the imported lines — a line may be missing or duplicated. Re-scan or fix before sending.",
        );
      }
    }
  }

  // PHASE 7 — an AI-supplied material quantity must never enter the send
  // path unconfirmed. The tradie can confirm it, edit it (→ user-supplied),
  // or replace it with a calculator result. Until then it's a HARD block:
  // the AI never gets to put a quantity on a sent quote unchecked.
  const unconfirmedAiQty = items.filter(
    (it) =>
      it.type === "material" &&
      it.quantity_source === "ai" &&
      it.quantity_confirmed !== true,
  );
  if (unconfirmedAiQty.length > 0) {
    block_reasons.push(
      `${unconfirmedAiQty.length} material line(s) use an AI-estimated quantity that must be confirmed before sending: ${lineLabels(unconfirmedAiQty)}.`,
    );
  }

  // #1 — a risky drawing's key dimensions must all be confirmed before send
  // (HARD BLOCK, no override). Only present when buildDimensionConfirmation
  // flagged the drawing as risky; safe drawings and voice/typed quotes carry
  // no confirmation object, so they never block here.
  const dimConfirm = quote_data?.dimension_confirmation ?? null;
  if (dimConfirm?.required) {
    const unconfirmed = (dimConfirm.dimensions ?? []).filter(
      (d) => !d.confirmed,
    );
    if (unconfirmed.length > 0) {
      const labels = unconfirmed.map((d) => d.label).join(", ");
      const why = (dimConfirm.reasons ?? []).join(", ");
      block_reasons.push(
        `Confirm the key dimensions read off the drawing before sending: ${labels}${why ? ` (${why})` : ""}.`,
      );
    }
  }

  if (needsReview.length > 0) {
    warning_reasons.push(
      `${needsReview.length} line(s) flagged for review: ${lineLabels(needsReview)}.`,
    );
  }
  if (assumed.length > 0) {
    warning_reasons.push(
      `${assumed.length} line(s) used default assumptions: ${lineLabels(assumed)}.`,
    );
  }
  if (evaluation?.status === "caution") {
    for (const r of evaluation.reasons) warning_reasons.push(r);
    if (evaluation.reasons.length === 0) {
      warning_reasons.push("Automated check flagged the takeoff for review.");
    }
  }

  // BETA SAFETY — unpriced material guard. A material line with no price (or
  // $0) quotes that material at $0 and silently undercharges the job. This is
  // the common gap when a calculated / library-unmatched material has no
  // stored price. Flag it as a caution so the tradie must acknowledge before
  // sending rather than shipping a $0 line unnoticed — never a silent send.
  // Quantity-0 lines (e.g. blocked takeoffs) are excluded; the block path
  // already handles those. A flag, not a hard block: a $0 line can be a
  // deliberate allowance, so the tradie can acknowledge and proceed.
  const unpriced = items.filter(
    (it) =>
      it.type === "material" &&
      (Number(it.quantity) || 0) > 0 &&
      (it.is_missing_price === true || (Number(it.unit_price) || 0) <= 0),
  );
  if (unpriced.length > 0) {
    warning_reasons.push(
      `${unpriced.length} material line(s) have no price set and will quote at $0: ${lineLabels(unpriced)}. Add a price or confirm it's intentional before sending.`,
    );
  }

  const can_send = block_reasons.length === 0;
  return {
    can_send,
    block_reasons,
    warning_reasons,
    // Only ask for an acknowledgement when the quote is otherwise
    // sendable — a hard block supersedes the warning path.
    requires_acknowledgement: can_send && warning_reasons.length > 0,
  };
}

const PLACEHOLDER_NAMES = new Set(["", "to be confirmed", "tbc", "tbd"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// E.164-ish: leading +, 8–15 digits. Twilio rejects anything else outright.
const PHONE_E164_RE = /^\+\d{8,15}$/;

export function validateQuoteForSending(args: {
  status: QuoteStatus | string;
  total_amount: number | null;
  quote_data: QuoteData | null;
  /** Set true once the operator has acknowledged caution-level warnings. */
  acknowledged?: boolean;
  /** Original job description (voice transcript / scan text) — the same
   *  evidence generation licensed scopes from; used by the contradiction
   *  gate. Falls back to quote_data.job_summary when omitted. */
  description?: string | null;
}): SendValidationResult {
  const { status, quote_data, acknowledged, description } = args;
  if (status === "accepted") {
    return { ok: false, error: "already_accepted" };
  }
  // Audit 2026-09-15: a scheduled, in-progress or completed job must never be
  // resent — the raw status write in the send routes would drag it back to
  // "sent" and corrupt the lifecycle trail (and any invoice already raised).
  if (status === "scheduled" || status === "in_progress" || status === "completed") {
    return { ok: false, error: "job_underway" };
  }
  if (!quote_data) {
    return { ok: false, error: "no_line_items" };
  }
  const name = (quote_data.client?.name ?? "").trim();
  if (!name || PLACEHOLDER_NAMES.has(name.toLowerCase())) {
    return { ok: false, error: "client_name_missing" };
  }
  let email = (quote_data.client?.email ?? "").trim();
  // Legacy: older quotes had a single client.contact field with an email or phone.
  if (!email) {
    const legacy = (quote_data.client?.contact ?? "").trim();
    if (legacy && EMAIL_RE.test(legacy)) {
      email = legacy;
    }
  }
  if (!email) {
    return { ok: false, error: "client_email_missing" };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "client_email_invalid" };
  }
  const items = Array.isArray(quote_data.line_items)
    ? quote_data.line_items
    : [];
  if (items.length === 0) {
    return { ok: false, error: "no_line_items" };
  }
  // Blocked "needs dimensions" lines report the actionable missing-info error
  // FIRST (before the genuinely-empty check), so a quote that is all blocked
  // lines tells the tradie exactly what's missing rather than just "empty".
  const safety = assessQuoteTakeoffSafety(quote_data, { description });
  if (!safety.can_send) {
    return { ok: false, error: "takeoff_blocked", reasons: safety.block_reasons };
  }
  // Smarter than a raw total>0: block only when the quote is genuinely empty
  // (no line carries a real quantity). Real quantities at $0 price are allowed
  // as a draft and surface as the unpriced warn+acknowledge path below.
  if (!hasSendableQuantity(items)) {
    return { ok: false, error: "total_zero" };
  }
  if (safety.requires_acknowledgement && !acknowledged) {
    return {
      ok: false,
      error: "takeoff_unconfirmed",
      reasons: safety.warning_reasons,
    };
  }
  return { ok: true, resolvedEmail: email };
}

export function validateQuoteForSmsSending(args: {
  status: QuoteStatus | string;
  total_amount: number | null;
  quote_data: QuoteData | null;
  /** Set true once the operator has acknowledged caution-level warnings. */
  acknowledged?: boolean;
  /** See validateQuoteForSending — evidence text for the contradiction gate. */
  description?: string | null;
}): SmsSendValidationResult {
  const { status, quote_data, acknowledged, description } = args;
  if (status === "accepted") {
    return { ok: false, error: "already_accepted" };
  }
  // Audit 2026-09-15: a scheduled, in-progress or completed job must never be
  // resent — the raw status write in the send routes would drag it back to
  // "sent" and corrupt the lifecycle trail (and any invoice already raised).
  if (status === "scheduled" || status === "in_progress" || status === "completed") {
    return { ok: false, error: "job_underway" };
  }
  if (!quote_data) {
    return { ok: false, error: "no_line_items" };
  }
  const name = (quote_data.client?.name ?? "").trim();
  if (!name || PLACEHOLDER_NAMES.has(name.toLowerCase())) {
    return { ok: false, error: "client_name_missing" };
  }
  const phone = normalizePhone(quote_data.client?.phone ?? "");
  if (!phone) {
    return { ok: false, error: "client_phone_missing" };
  }
  if (!PHONE_E164_RE.test(phone)) {
    return { ok: false, error: "client_phone_invalid" };
  }
  const items = Array.isArray(quote_data.line_items)
    ? quote_data.line_items
    : [];
  if (items.length === 0) {
    return { ok: false, error: "no_line_items" };
  }
  // Blocked "needs dimensions" lines report the actionable missing-info error
  // FIRST (before the genuinely-empty check), so a quote that is all blocked
  // lines tells the tradie exactly what's missing rather than just "empty".
  const safety = assessQuoteTakeoffSafety(quote_data, { description });
  if (!safety.can_send) {
    return { ok: false, error: "takeoff_blocked", reasons: safety.block_reasons };
  }
  // Smarter than a raw total>0: block only when the quote is genuinely empty
  // (no line carries a real quantity). Real quantities at $0 price are allowed
  // as a draft and surface as the unpriced warn+acknowledge path below.
  if (!hasSendableQuantity(items)) {
    return { ok: false, error: "total_zero" };
  }
  if (safety.requires_acknowledgement && !acknowledged) {
    return {
      ok: false,
      error: "takeoff_unconfirmed",
      reasons: safety.warning_reasons,
    };
  }
  return { ok: true, resolvedPhone: phone };
}

/**
 * Strips spaces/dashes/parens and converts a NZ-style "021..." or "0..."
 * national number to E.164 (+64...). Anything already starting with "+"
 * is left alone after whitespace stripping. Returns "" if input is empty.
 *
 * Also fixes the most common NZ data-entry bug: typing the country code
 * AND the leading national 0 ("+64 022 504 4457" → "+640225044457").
 * Twilio rejects that — the leading 0 is the national-format prefix, not
 * part of the subscriber number, so the country-code form must drop it.
 */
export function normalizePhone(raw: string): string {
  const stripped = raw.replace(/[\s\-().]/g, "");
  if (!stripped) return "";
  // "+640225044457" → "+6422504457". Has to run BEFORE the generic
  // "starts with +" pass-through below.
  if (stripped.startsWith("+640")) return `+64${stripped.slice(4)}`;
  if (stripped.startsWith("+")) return stripped;
  // NZ national format: leading 0 → +64. Best-effort only; tradies
  // outside NZ should enter +country themselves.
  if (stripped.startsWith("0")) return `+64${stripped.slice(1)}`;
  return stripped;
}

export const SEND_ERROR_MESSAGES: Record<SendValidationError, string> = {
  client_name_missing: "Add a client name before sending.",
  client_email_missing: "Add the client's email address before sending.",
  client_email_invalid: "The client email doesn't look valid.",
  client_phone_missing: "Add the client's phone number before sending an SMS.",
  client_phone_invalid: "The client phone number doesn't look valid. Use a full international number (+64...).",
  no_line_items: "Add at least one line item before sending.",
  total_zero: "Add at least one line with a quantity before sending.",
  already_accepted: "This quote has already been accepted.",
  job_underway: "This job is scheduled, underway or completed — it can't be resent. Duplicate the quote if you need a fresh one.",
  takeoff_blocked:
    "Some quantities couldn't be calculated or look wrong. Fix the flagged lines before sending.",
  takeoff_unconfirmed:
    "This quote has assumptions or flagged quantities. Review and confirm them before sending.",
};
