/**
 * Send the route still waiting on this device before finishing work, so
 * the last stretch lands inside the session: the server keeps no points
 * after the finish. LocationBridge registers the senders (the browser's
 * buffer, or the iPhone app's own); Finish work (ClockCard) and automatic
 * clock-outs call flushRoutePoints first.
 */

type Sender = () => Promise<unknown>;

const senders = new Set<Sender>();

/** Add a sender; returns the function that removes it again. */
export function registerRouteFlusher(send: Sender): () => void {
  senders.add(send);
  return () => {
    senders.delete(send);
  };
}

/** How long Finish waits for the route before carrying on without it. */
export const FLUSH_TIMEOUT_MS = 5000;

/**
 * Every sender at once, until they're done or `timeoutMs` passes, so a bad
 * signal never holds up Finish. Never throws.
 */
export async function flushRoutePoints(timeoutMs = FLUSH_TIMEOUT_MS): Promise<void> {
  if (senders.size === 0) return;
  const sending = Promise.all([...senders].map((send) => Promise.resolve().then(send).catch(() => undefined)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([sending, waited]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
