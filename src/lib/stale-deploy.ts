/**
 * After an update goes live, a page that was already open still calls the
 * previous build's server actions, which the new server doesn't know
 * ("Failed to find Server Action … from an older or newer deployment").
 * That isn't the person's signal: load the new version instead of saying so.
 */

import { STALE_DEPLOY_RE, maybeRecoverFromStaleDeploy } from "./staleDeploy";

function messageOf(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return typeof error === "string" ? error : "";
}

/** The error a stale page gets after an update (old server action or page file). */
export function isStaleDeployError(error: unknown): boolean {
  return STALE_DEPLOY_RE.test(messageOf(error));
}

/**
 * Tell the person, then load the new version (with the same loop guard as
 * the error screens). If it just reloaded and that didn't help, say how to
 * get going instead of looping.
 */
export function reloadForUpdate(show: (message: string) => void, error: unknown = "UnrecognizedActionError"): void {
  show("Tradies2Quote was just updated. Reloading…");
  window.setTimeout(() => {
    if (!maybeRecoverFromStaleDeploy(messageOf(error) || "UnrecognizedActionError")) {
      show("Tradies2Quote was just updated. Close and reopen the app, then try again.");
    }
  }, 800);
}

/** The page was built from a different commit than the one now live. */
export function isOutOfDate(pageBuild: string | null | undefined, liveCommit: unknown): boolean {
  return Boolean(pageBuild) && typeof liveCommit === "string" && liveCommit.length > 0 && liveCommit !== pageBuild;
}
