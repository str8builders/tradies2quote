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
 * must run this too. Reload once per deploy, not once per session: the
 * iPhone app keeps one session for days, across several deploys, and a
 * session-wide "once" stranded it on the second. A minute's guard stops
 * reload loops; the reload picks up the new build and the user's tap works
 * on the second try instead of never.
 */
export const STALE_DEPLOY_RE =
  /Failed to find Server Action|was not found on the server|UnrecognizedActionError|ChunkLoadError|Failed to load chunk|Loading chunk .+ failed|error loading dynamically imported module/i;

/** When the last recovery reload happened (ms), for this tab. */
export const STALE_DEPLOY_RELOAD_FLAG = "t2q-stale-deploy-reloaded";
/** A second stale error this soon after reloading means the reload didn't help: stop. */
export const STALE_DEPLOY_LOOP_GUARD_MS = 60_000;

/** Returns true when a recovery reload was initiated. */
export function maybeRecoverFromStaleDeploy(message: string, now: number = Date.now()): boolean {
  if (!STALE_DEPLOY_RE.test(message)) return false;
  try {
    const last = Number(sessionStorage.getItem(STALE_DEPLOY_RELOAD_FLAG) || 0);
    if (Number.isFinite(last) && last > 0 && now - last < STALE_DEPLOY_LOOP_GUARD_MS) return false; // no reload loops
    sessionStorage.setItem(STALE_DEPLOY_RELOAD_FLAG, String(now));
  } catch {
    return false; // storage blocked — better to stay broken than loop forever
  }
  window.location.reload();
  return true;
}
