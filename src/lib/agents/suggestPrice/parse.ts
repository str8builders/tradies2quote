// ─────────────────────────────────────────────────────────────────────────
// Suggest-a-Price agent — strict output validator (the safety boundary).
//
// The LLM returns loose JSON; this turns it into a typed, sanitised
// SuggestPriceResult — or a safe manual-pricing fallback. It can ONLY ever
// emit a suggestion: the recommended_action is constrained to a fixed safe
// set (none of which applies anything), prices are clamped to positive
// numbers or null, and advisory_only is forced true. Nothing here writes.
// ─────────────────────────────────────────────────────────────────────────

import {
  UI_ACTIONS,
  type RecommendedAction,
  type SuggestAlternative,
  type SuggestConfidence,
  type SuggestPriceResult,
  type SuggestPriceTargetLine,
  type SuggestStatus,
  type EvidenceRankItem,
  type EvidenceSourceType,
} from "./types";
import { round2 } from "@/lib/quote-defaults";

const STATUSES: SuggestStatus[] = ["suggested", "needs_manual_pricing", "no_safe_match"];
const CONFIDENCES: SuggestConfidence[] = ["high", "medium", "low", "none"];
const ACTIONS: RecommendedAction[] = ["use_once", "save_to_library", "ask_user", "manual_price"];
const SOURCE_TYPES: EvidenceSourceType[] = [
  "library", "corrected_history", "quote_history", "supplier_import", "generic",
];
const STRENGTHS = ["strong", "medium", "weak"] as const;
const ALT_CONF = ["high", "medium", "low"] as const;

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function posPriceOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

function targetLine(t: SuggestPriceTargetLine): SuggestPriceResult["target_line"] {
  return {
    description: str(t.description),
    quantity: Number(t.quantity) || 0,
    unit: t.unit ?? null,
    trade_scope: t.trade_scope ?? null,
    job_type: t.job_type ?? null,
  };
}

/** A safe, advisory, no-price result that always routes the tradie to manual. */
export function safeManualFallback(
  target: SuggestPriceTargetLine,
  summary = "Not enough safe evidence to suggest a price — price this line manually.",
  riskFlags: string[] = [],
): SuggestPriceResult {
  return {
    agent: "suggest_a_price",
    version: "1.0",
    advisory_only: true,
    target_line: targetLine(target),
    recommendation: {
      status: "needs_manual_pricing",
      best_match_name: null,
      best_match_material_id: null,
      suggested_unit_price: null,
      suggested_price_range_low: null,
      suggested_price_range_high: null,
      currency: "NZD",
      confidence: "none",
      should_save_mapping_if_accepted: false,
      recommended_action: "manual_price",
    },
    reasoning: { summary, evidence_ranked: [], risk_flags: riskFlags, missing_information: [] },
    alternatives: [],
    ui_actions: { ...UI_ACTIONS },
  };
}

/**
 * Validate + sanitise the model's JSON into a SuggestPriceResult. Malformed
 * payloads collapse to a `no_safe_match` advisory result.
 */
export function parseSuggestion(
  raw: unknown,
  target: SuggestPriceTargetLine,
): SuggestPriceResult {
  if (typeof raw !== "object" || raw === null) {
    return { ...safeManualFallback(target), recommendation: { ...safeManualFallback(target).recommendation, status: "no_safe_match" } };
  }
  const obj = raw as Record<string, unknown>;
  const rec = obj.recommendation;
  if (typeof rec !== "object" || rec === null) {
    return { ...safeManualFallback(target), recommendation: { ...safeManualFallback(target).recommendation, status: "no_safe_match" } };
  }
  const r = rec as Record<string, unknown>;

  let status = oneOf<SuggestStatus>(r.status, STATUSES, "needs_manual_pricing");
  const confidence = oneOf<SuggestConfidence>(r.confidence, CONFIDENCES, "none");
  const action = oneOf<RecommendedAction>(r.recommended_action, ACTIONS, "manual_price");

  const price = posPriceOrNull(r.suggested_unit_price);
  let low = posPriceOrNull(r.suggested_price_range_low);
  let high = posPriceOrNull(r.suggested_price_range_high);
  if (low != null && high != null && low > high) {
    [low, high] = [high, low];
  }

  // A "suggested" status with neither a point price nor a range can't stand —
  // downgrade to manual so the UI never offers a $0 / empty suggestion.
  if (status === "suggested" && price == null && low == null && high == null) {
    status = "needs_manual_pricing";
  }

  const reasoningRaw =
    typeof obj.reasoning === "object" && obj.reasoning !== null
      ? (obj.reasoning as Record<string, unknown>)
      : {};
  const evidence_ranked: EvidenceRankItem[] = Array.isArray(reasoningRaw.evidence_ranked)
    ? (reasoningRaw.evidence_ranked as unknown[])
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
        .map((e) => ({
          source_type: oneOf<EvidenceSourceType>(e.source_type, SOURCE_TYPES, "generic"),
          source_label: str(e.source_label, "evidence"),
          strength: oneOf(e.strength, STRENGTHS, "weak"),
          note: str(e.note),
        }))
    : [];

  const alternatives: SuggestAlternative[] = Array.isArray(obj.alternatives)
    ? (obj.alternatives as unknown[])
        .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
        .slice(0, 5)
        .map((a) => ({
          name: str(a.name),
          material_id: strOrNull(a.material_id),
          suggested_unit_price: posPriceOrNull(a.suggested_unit_price),
          confidence: oneOf(a.confidence, ALT_CONF, "low"),
          why_not_top_choice: str(a.why_not_top_choice),
        }))
        .filter((a) => a.name.length > 0)
    : [];

  return {
    agent: "suggest_a_price",
    version: "1.0",
    advisory_only: true,
    target_line: targetLine(target),
    recommendation: {
      status,
      best_match_name: strOrNull(r.best_match_name),
      best_match_material_id: strOrNull(r.best_match_material_id),
      suggested_unit_price: price,
      suggested_price_range_low: low,
      suggested_price_range_high: high,
      currency: "NZD",
      confidence,
      should_save_mapping_if_accepted: r.should_save_mapping_if_accepted === true,
      recommended_action: action,
    },
    reasoning: {
      summary: str(reasoningRaw.summary),
      evidence_ranked,
      risk_flags: strArray(reasoningRaw.risk_flags),
      missing_information: strArray(reasoningRaw.missing_information),
    },
    alternatives,
    ui_actions: { ...UI_ACTIONS },
  };
}
