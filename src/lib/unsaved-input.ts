import { useEffect } from "react";

/**
 * Pages say while they hold input the tradie hasn't saved yet: the words for
 * a new quote, a recording being written down, an open editor on the job
 * page. StaleVersionReload doesn't reload the app for an update while any is
 * held, so coming back from another app never wipes the screen. The update
 * still happens: the next save meets it and reloads (lib/stale-deploy), and
 * the new-quote words are backed up for that reload (new/_v2/lib/saved-job).
 *
 * A plain in-memory registry for this tab; nothing is stored.
 */
const holders = new Set<symbol>();

/** Hold until the returned release is called (releasing twice is harmless). */
export function holdUnsavedInput(label = "unsaved input"): () => void {
  const token = Symbol(label);
  holders.add(token);
  return () => {
    holders.delete(token);
  };
}

/** Anything on screen that a reload would lose. */
export function hasUnsavedInput(): boolean {
  return holders.size > 0;
}

/** Hold while `active` is true, from a client component. */
export function useUnsavedInput(active: boolean, label?: string): void {
  useEffect(() => (active ? holdUnsavedInput(label) : undefined), [active, label]);
}
