/**
 * "Seen the welcome" marker, as a cookie so the SERVER can decide whether the
 * first HTML of /app should already be covered by the welcome. sessionStorage
 * could not do that: the dashboard painted first and the welcome only opened
 * after hydration, which on a phone meant seeing the app before the intro.
 * Written by the client when the welcome closes; cleared by sign-in so a
 * fresh entry always gets the intro. Not httpOnly: the client reads it too.
 */
export const WELCOME_SEEN_COOKIE = "t2q-welcome-seen";
export const WELCOME_SEEN_MAX_AGE_S = 6 * 3600;
export const WELCOME_SKIP_WINDOW_MS = WELCOME_SEEN_MAX_AGE_S * 1000;

/** Timestamp (ms) from a Cookie header / document.cookie string, or 0. */
export function parseWelcomeSeen(cookieString: string | null | undefined): number {
  if (!cookieString) return 0;
  const match = cookieString.match(new RegExp(`(?:^|;\\s*)${WELCOME_SEEN_COOKIE}=(\\d{1,16})(?:;|$)`));
  const value = match ? Number(match[1]) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function readWelcomeSeen(): number {
  try { return parseWelcomeSeen(document.cookie); } catch { return 0; }
}

export function writeWelcomeSeen(now = Date.now()) {
  try {
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${WELCOME_SEEN_COOKIE}=${now}; Max-Age=${WELCOME_SEEN_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`;
  } catch { /* Entry also works without cookies. */ }
}
