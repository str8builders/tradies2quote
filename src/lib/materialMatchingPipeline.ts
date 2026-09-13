import "server-only";
import { matchMaterial, type MaterialMatch } from "./materialMatcher";
import { round2 } from "./quote-defaults";
import type {
  PriceConfidence,
  PriceSource,
  QuoteLineItem,
} from "./quote-types";

/**
 * Stage 4.3 — Material matching pipeline.
 *
 * Runs after AI line-item parsing in `src/app/api/quotes/generate/route.ts`,
 * gated by the `MATERIAL_MATCHING_ENABLED` env var (default OFF).
 *
 * Behaviour matrix:
 *
 *   enabled = false (default, including all of production today):
 *     items pass through unchanged. Stage 3 generation flow is preserved
 *     bit-for-bit.
 *
 *   enabled = true (Supabase dev branch + worktree only):
 *     for each `material` line item:
 *       a) call materialMatcher with the description
 *       b) if matched: set material_id, library_id (mirror), price_match_key,
 *          price_source ('user_library' or 'catalogue_seed'), price_confidence
 *          (high|medium|low from match_score), is_missing_price=false,
 *          is_ai_estimated=false; override unit_price with the catalogue
 *          price; recompute line_total.
 *       c) if missing_price: keep description + AI's unit_price as a
 *          suggestion, set price_source='missing_price', is_missing_price=true,
 *          is_ai_estimated=true.
 *
 *     Non-material lines (labour, other) are passed through.
 */

type MatcherFn = (input: { description: string }) => Promise<MaterialMatch>;

export type EnrichmentOptions = {
  enabled: boolean;
  /** Test seam — replace the matcher in unit tests. */
  matcher?: MatcherFn;
  /** Search the catalogue as the service role (no signed-in request). */
  asAdmin?: boolean;
};

function confidenceFromScore(score: number): PriceConfidence {
  if (score > 0.7) return "high";
  if (score > 0.4) return "medium";
  return "low";
}

function priceSourceFromMatchSource(source: string): PriceSource {
  if (source === "direct_user" || source === "alias_user") {
    return "user_library";
  }
  return "catalogue_seed";
}

export async function enrichLineItemsWithCatalogue(
  items: QuoteLineItem[],
  options: EnrichmentOptions,
): Promise<QuoteLineItem[]> {
  if (!options.enabled) return items;
  const match: MatcherFn =
    options.matcher ??
    (options.asAdmin
      ? (input) => matchMaterial({ ...input, asAdmin: true })
      : matchMaterial);

  const out: QuoteLineItem[] = [];
  for (const item of items) {
    if (item.type !== "material") {
      out.push(item);
      continue;
    }

    // A line already priced from the tradie's OWN library by the strong
    // token match upstream (price_source="user_library", high confidence)
    // is authoritative — this stage's normalized-name matcher must never
    // downgrade it to missing_price just because ITS lookup missed.
    if (
      item.price_source === "user_library" &&
      item.price_confidence === "high" &&
      Number(item.unit_price) > 0
    ) {
      out.push(item);
      continue;
    }

    const result = await match({ description: item.description });

    if (result.status === "matched") {
      const hit = result.hit;
      const newPrice = hit.price ?? item.unit_price;
      const qty = Number(item.quantity) || 0;
      out.push({
        ...item,
        material_id: hit.id,
        library_id: hit.id,
        price_match_key:
          result.normalized.normalized || item.description.toLowerCase(),
        price_source: priceSourceFromMatchSource(result.source),
        price_confidence: confidenceFromScore(hit.match_score),
        is_missing_price: false,
        is_ai_estimated: false,
        unit_price: newPrice,
        unit: hit.unit ?? item.unit,
        line_total: round2(qty * newPrice),
      });
    } else {
      // result.status === "missing_price" — never invent a price.
      out.push({
        ...item,
        material_id: result.partial?.id ?? null,
        // Keep library_id from any prior Stage 2.5 match if it was set —
        // otherwise null it explicitly to make the missing state obvious.
        library_id: item.library_id ?? null,
        price_match_key:
          result.normalized.normalized || item.description.toLowerCase(),
        price_source: "missing_price",
        price_confidence: "low",
        is_missing_price: true,
        is_ai_estimated: true,
      });
    }
  }
  return out;
}

/** Centralised flag read so callers and tests share one source of truth. */
export function materialMatchingEnabledFromEnv(): boolean {
  return process.env.MATERIAL_MATCHING_ENABLED === "true";
}

// =============================================================================
// Stage 4.4 — Safe wrapper
// =============================================================================
//
// Core invariant: quote generation must always succeed if the original Stage 3
// AI quote generation succeeds. Material matching is a best-effort enrichment
// layer; any failure (RPC missing, permission denied, timeout, malformed
// response, missing env, unreachable Supabase, etc.) falls back to the
// original AI line items unchanged. Failures are logged server-side only.
//
// Diagnostics never reach the customer-facing surfaces (PDF, email,
// public quote page). They go to console.warn / console.log for Vercel
// Functions logs and developer triage.

const DEFAULT_TIMEOUT_MS = 8000;
const TIMEOUT_ERROR_MESSAGE = "material_matching_timeout";

export type EnrichmentFallbackReason = "disabled" | "error" | "timeout";

export type EnrichmentDiagnostics = {
  enabled: boolean;
  fallback: EnrichmentFallbackReason | null;
  fallbackReason?: string;
  totalLines: number;
  materialLines: number;
  matched?: number;
  missingPrice?: number;
};

export type SafeEnrichmentResult = {
  items: QuoteLineItem[];
  diagnostics: EnrichmentDiagnostics;
};

export type SafeEnrichmentOptions = EnrichmentOptions & {
  /** Override default timeout (ms). Falls back to MATERIAL_MATCHING_TIMEOUT_MS env. */
  timeoutMs?: number;
};

function readTimeoutMs(override?: number): number {
  if (typeof override === "number" && override > 0) return override;
  const fromEnv = Number(process.env.MATERIAL_MATCHING_TIMEOUT_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TIMEOUT_MS;
}

function countMaterialLines(items: QuoteLineItem[]): number {
  return items.filter((i) => i.type === "material").length;
}

/**
 * Safe wrapper. Always returns a usable `items` array. Never throws.
 *
 *   enabled = false (default for production):
 *     identity passthrough; diagnostics.fallback = 'disabled'.
 *
 *   enabled = true, matcher succeeds:
 *     enriched items returned; diagnostics carries matched/missing counts.
 *
 *   enabled = true, matcher throws, times out, or misbehaves:
 *     ORIGINAL items returned unchanged; diagnostics.fallback set to
 *     'error' or 'timeout'; a server-side warn line is logged.
 */
export async function safelyEnrichLineItemsWithCatalogue(
  items: QuoteLineItem[],
  options: SafeEnrichmentOptions,
): Promise<SafeEnrichmentResult> {
  const totalLines = items.length;
  const materialLines = countMaterialLines(items);

  if (!options.enabled) {
    return {
      items,
      diagnostics: {
        enabled: false,
        fallback: "disabled",
        totalLines,
        materialLines,
      },
    };
  }

  const timeoutMs = readTimeoutMs(options.timeoutMs);

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(TIMEOUT_ERROR_MESSAGE));
    }, timeoutMs);
  });

  try {
    const enriched = await Promise.race([
      enrichLineItemsWithCatalogue(items, options),
      timeoutPromise,
    ]);

    if (timeoutHandle) clearTimeout(timeoutHandle);

    // Validate shape — any deviation is treated as a malformed response and
    // falls back. Belt-and-braces around the matcher's own typing.
    if (!Array.isArray(enriched)) {
      throw new Error("malformed_enrichment_result");
    }

    const matched = enriched.filter(
      (i) =>
        i.type === "material" && !i.is_missing_price && Boolean(i.material_id),
    ).length;
    const missingPrice = enriched.filter(
      (i) => i.type === "material" && i.is_missing_price,
    ).length;

    // Server-side diagnostic only. Not in any client-facing payload.
    console.log("[material-matching] enriched", {
      enabled: true,
      total_lines: totalLines,
      material_lines: materialLines,
      matched,
      missing_price: missingPrice,
    });

    return {
      items: enriched,
      diagnostics: {
        enabled: true,
        fallback: null,
        totalLines,
        materialLines,
        matched,
        missingPrice,
      },
    };
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const message = err instanceof Error ? err.message : String(err);
    const fallback: EnrichmentFallbackReason =
      message === TIMEOUT_ERROR_MESSAGE ? "timeout" : "error";

    console.warn("[material-matching] fallback", {
      enabled: true,
      reason: fallback,
      message,
      total_lines: totalLines,
      material_lines: materialLines,
    });

    return {
      items, // ← original items unchanged. Stage 3 invariant preserved.
      diagnostics: {
        enabled: true,
        fallback,
        fallbackReason: message,
        totalLines,
        materialLines,
      },
    };
  }
}
