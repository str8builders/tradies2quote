/**
 * Stale-deploy self-heal, shared by the window-level listeners
 * (GlobalErrorListeners) and the error boundaries (error.tsx).
 *
 * After a deploy, any already-open tab / Capacitor webview still holds
 * HTML that references chunk files and Server Action ids that no longer
 * exist. Its next interaction throws one of the signatures below (Next 16's
 * browser error is `UnrecognizedActionError: Server Action "…" was not found
 * on the server`) and the
 * app looks broken until a manual refresh. Window-level listeners catch
 * the async cases, but a chunk that fails DURING RENDER (e.g. a
 * dynamic-import component like AccountHub) is swallowed by the nearest
 * error boundary and never reaches window.onerror — so the boundaries
 * must run this too. Reload ONCE per session: the reload picks up the
 * new build and the user's tap works on the second try instead of never.
 */
export const STALE_DEPLOY_RE =
  /Failed to find Server Action|was not found on the server|UnrecognizedActionError|ChunkLoadError|Failed to load chunk|Loading chunk .+ failed|error loading dynamically imported module/i;

export const STALE_DEPLOY_RELOAD_FLAG = "t2q-stale-deploy-reloaded";

/** Returns true when a recovery reload was initiated. */
export function maybeRecoverFromStaleDeploy(message: string): boolean {
  if (!STALE_DEPLOY_RE.test(message)) return false;
  try {
    if (sessionStorage.getItem(STALE_DEPLOY_RELOAD_FLAG)) return false; // no reload loops
    sessionStorage.setItem(STALE_DEPLOY_RELOAD_FLAG, "1");
  } catch {
    return false; // storage blocked — better to stay broken than loop forever
  }
  window.location.reload();
  return true;
}
