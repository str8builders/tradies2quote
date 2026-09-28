import { isStaleDeployError } from "@/lib/stale-deploy";

/** The save came back refused (the editor already says why). */
export const SAVE_FAILED = "Could not save your latest edits.";
/** The save never came back: most often the connection. */
export const SAVE_THREW = "Could not save your latest edits. Check your connection and try again.";

export type SaveBeforeSendResult =
  | { ok: true }
  /** `staleDeploy`: the page is from before an update (reload it with reloadForUpdate). */
  | { ok: false; message: string; staleDeploy: unknown | null };

/**
 * The classic Send buttons (StickyActionBar, SendQuoteButton) save the
 * editor before the send route runs. A save that throws must reset the
 * button with a plain message, never leave it on "Saving…"; a page left open
 * across an update gets the error back so it can load the new version.
 */
export async function saveBeforeSending(save: () => Promise<boolean>): Promise<SaveBeforeSendResult> {
  try {
    return (await save()) ? { ok: true } : { ok: false, message: SAVE_FAILED, staleDeploy: null };
  } catch (e) {
    return { ok: false, message: SAVE_THREW, staleDeploy: isStaleDeployError(e) ? e : null };
  }
}
