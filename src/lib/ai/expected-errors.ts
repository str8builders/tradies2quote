import { isAiError, type AiErrorKind } from "./errors";

/**
 * Provider trouble that clears by itself and that the person is already told
 * about in plain words: our time limit ran out, or the provider was
 * rate-limiting or full (after the shared client's own retries). It isn't a
 * bug anyone can fix, so it is logged with console.warn and kept out of the
 * error sink, where it only buried the real problems. Everything else (a
 * request we got wrong, our key or billing, an outage, a non-AI error) is
 * still reported.
 */
export const EXPECTED_AI_ERROR_KINDS: ReadonlySet<AiErrorKind> = new Set<AiErrorKind>([
  "timeout",
  "rate_limited",
  "overloaded",
]);

export function isExpectedAiError(e: unknown): boolean {
  return isAiError(e) && EXPECTED_AI_ERROR_KINDS.has(e.kind);
}
