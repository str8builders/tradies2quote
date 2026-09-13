import "server-only";
import {
  searchMaterials,
  type MaterialSearchHit,
  type MaterialMatchSource,
} from "./materialSearch";
import {
  normalizeMaterialQuery,
  type NormalizedMaterialQuery,
} from "./materialNormalizer";

/**
 * Stage 4.2 — parser integration glue.
 *
 * Given a free-text material description (typically extracted by Claude from
 * a tradie's voice/typed job summary), this module:
 *   1) normalises the description to extract treatment, size, brand, etc.;
 *   2) calls the `search_materials` RPC with the right filters;
 *   3) returns a typed match decision the upstream quote builder uses to
 *      either populate a real line price or emit a `missing_price` line.
 *
 * Critically, this module never invents a price. If the catalogue has no
 * confident match, the line is marked `missing_price` so the tradie sees
 * the gap and confirms the price themselves.
 *
 * NOT WIRED into `src/app/api/quotes/generate/route.ts` yet. Phase 4.3 will
 * do that; Phase 4.2 ends with this module green and tested in isolation.
 */

export type MaterialMatchInput = {
  description: string;
  /** Optional override; the normalizer's category hint is used when absent. */
  category?: string;
  /** Optional override; used by the catalogue importer when known. */
  brand?: string;
  /** Optional override; only useful for supplier-specific searches. */
  supplier?: string;
  /**
   * Run the catalogue search with the service-role client. Needed when the
   * pipeline runs outside a signed-in request (public quote requests) —
   * the cookie client there is anonymous and the RPC denies it.
   */
  asAdmin?: boolean;
};

export type MaterialMatched = {
  status: "matched";
  hit: MaterialSearchHit;
  source: MaterialMatchSource;
  normalized: NormalizedMaterialQuery;
};

export type MaterialMissingPrice = {
  status: "missing_price";
  reason: "no_match" | "match_no_price";
  /** When `reason === 'match_no_price'`, the matched-but-priceless hit. */
  partial: MaterialSearchHit | null;
  normalized: NormalizedMaterialQuery;
};

export type MaterialMatch = MaterialMatched | MaterialMissingPrice;

export async function matchMaterial(
  input: MaterialMatchInput,
): Promise<MaterialMatch> {
  const normalized = normalizeMaterialQuery(input.description);

  // Effective filters: explicit overrides take precedence over normalizer hints.
  const category =
    input.category ??
    (normalized.categoryHint !== "unknown" ? normalized.categoryHint : null);
  const brand = input.brand ?? normalized.brand;

  const hits = await searchMaterials({
    query: normalized.normalized || input.description,
    category,
    brand,
    supplier: input.supplier ?? null,
    // Phase 4.9 — when the description names an H-class, hard-filter the
    // catalogue to that class. This stops trigram similarity from picking
    // an H1.2 framing row when the tradie clearly said H3 (the V9 collapse).
    // null when the description doesn't name a class — fuzzy matching
    // keeps working unchanged for non-treatment-class queries.
    treatmentClass: normalized.treatmentClass,
    limit: 5,
    asAdmin: input.asAdmin === true,
  });

  if (hits.length === 0) {
    return {
      status: "missing_price",
      reason: "no_match",
      partial: null,
      normalized,
    };
  }

  // RPC has already ranked by tier_rank then match_score, so hits[0] is best.
  const best = hits[0];

  if (best.price == null || best.price <= 0) {
    return {
      status: "missing_price",
      reason: "match_no_price",
      partial: best,
      normalized,
    };
  }

  return {
    status: "matched",
    hit: best,
    source: best.match_source,
    normalized,
  };
}
