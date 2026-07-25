/**
 * Pure classifier for the PUBLIC quote page (/quote/[token]).
 *
 * Extracted from the page's inline if-ladder after the 2026-07-17 outage, in
 * which a texted quote left in `draft` (its device-SMS link minted a token but
 * never flipped status to `sent`) rendered "Quote not found" to the client —
 * and the not_found came from the DRAFT-STATUS guard, not the RPC null-check,
 * so it was mis-debugged for hours. Making the branch a named, unit-tested
 * function locks the exact semantics so this class of confusion can't recur.
 *
 * Behaviour is IDENTICAL to the previous ladder — order matters:
 *   1. accepted-like (accepted/scheduled/in_progress/completed) → accepted
 *   2. declined                                                 → unavailable
 *   3. expired status OR past expires_at                        → expired
 *   4. sent / viewed                                            → live
 *   5. anything else (draft, unknown)                           → not_live
 */
export type PublicView =
  | { kind: "accepted" }
  | { kind: "expired" }
  | { kind: "unavailable" }
  | { kind: "live" }
  | { kind: "not_live"; status: string };

const ACCEPTED_LIKE = new Set([
  "accepted",
  "scheduled",
  "in_progress",
  "completed",
]);

export function classifyPublicQuote(
  quote: { status: string; expires_at: string | null },
  now: Date,
): PublicView {
  if (ACCEPTED_LIKE.has(quote.status)) return { kind: "accepted" };
  // Declined is checked before expiry so a declined-and-expired quote reads
  // "no longer available" (the tradie's action), matching the old ladder's
  // `status === "declined" ? "unavailable" : "expired"`.
  if (quote.status === "declined") return { kind: "unavailable" };
  const isExpired =
    quote.expires_at !== null && new Date(quote.expires_at) < now;
  if (isExpired || quote.status === "expired") return { kind: "expired" };
  if (quote.status === "sent" || quote.status === "viewed")
    return { kind: "live" };
  return { kind: "not_live", status: quote.status };
}

/**
 * Whether the PUBLIC link preview (the OG title/description in
 * `generateMetadata` and the generated `opengraph-image`) may show the
 * business name + total.
 *
 * TRUE only for the statuses whose page BODY actually renders the quote in
 * full — `live` (sent/viewed) and `accepted`. For draft/declined/expired the
 * body hides every figure ("unsent quotes never leak BY DESIGN"), so the
 * unfurl card MUST stay neutral too — otherwise the business name and dollar
 * total would leak, via the in-band meta tags / OG image, for a quote the page
 * itself refuses to show. This is the exact leak-surface the 2026-07-17
 * draft-token postmortem hardened; keep the two surfaces in lockstep here.
 */
export function isRichPreviewEligible(
  quote: { status: string; expires_at: string | null },
  now: Date,
): boolean {
  const kind = classifyPublicQuote(quote, now).kind;
  return kind === "live" || kind === "accepted";
}
