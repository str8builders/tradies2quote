import { fetchWithTimeout } from "./fetchTimeout";

/**
 * One bounded retry for Anthropic's transient capacity errors:
 *   429 rate_limit_error — honour `retry-after` (capped);
 *   529 overloaded_error — back off ~1.5 s (+ jitter).
 * Anything else (400s, 500s, network/timeout errors) is returned or thrown
 * as-is — retrying those only doubles the tradie's wait.
 */

export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 529]);

const BASE_BACKOFF_MS = 1500;
const JITTER_MS = 500;
/** Never sit on a slow retry-after for longer than this. */
export const MAX_RETRY_WAIT_MS = 10_000;

export function retryDelayMs(
  res: Response,
  attempt: number,
  random: () => number = Math.random,
): number {
  const header = res.headers.get("retry-after");
  if (header != null && header.trim() !== "") {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_WAIT_MS);
    }
    const at = Date.parse(header);
    if (Number.isFinite(at)) {
      return Math.min(Math.max(0, at - Date.now()), MAX_RETRY_WAIT_MS);
    }
  }
  return Math.min(
    BASE_BACKOFF_MS * 2 ** attempt + Math.floor(random() * JITTER_MS),
    MAX_RETRY_WAIT_MS,
  );
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchWithOverloadRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  opts: { retries?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Response> {
  const retries = opts.retries ?? 1;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    const res = await fetchWithTimeout(url, init, timeoutMs);
    if (!RETRYABLE_STATUSES.has(res.status) || attempt >= retries) return res;
    const wait = retryDelayMs(res, attempt);
    // Release the first response's socket before waiting.
    await res.body?.cancel().catch(() => undefined);
    await sleep(wait);
  }
}
