/**
 * After an update goes live, a page that was already open still calls the
 * previous build's server actions, which the new server doesn't know
 * ("Failed to find Server Action … from an older or newer deployment").
 * That isn't the person's signal: load the new version instead of saying so.
 */

/** The error a stale page gets when it calls a server action after an update. */
export function isStaleDeployError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /server action/i.test(message) && /(not found|failed to find|older or newer deployment)/i.test(message);
}

/** Tell the person, then load the new version. */
export function reloadForUpdate(show: (message: string) => void): void {
  show("Tradies2Quote was just updated. Reloading…");
  window.setTimeout(() => window.location.reload(), 800);
}

/** The page was built from a different commit than the one now live. */
export function isOutOfDate(pageBuild: string | null | undefined, liveCommit: unknown): boolean {
  return Boolean(pageBuild) && typeof liveCommit === "string" && liveCommit.length > 0 && liveCommit !== pageBuild;
}
