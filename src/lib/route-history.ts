/**
 * Where the user came from, inside this document.
 *
 * Next's App Router keeps one document alive across client navigations, so a
 * component that mounts on /app cannot tell "fresh entry after login" from
 * "came back from the calculators" by itself. <RouteTracker/> in the root
 * layout records every pathname change here; readers ask for the previous one.
 */
let previous: string | null = null;
let current: string | null = null;

export function recordPathname(pathname: string) {
  if (pathname === current) return;
  previous = current;
  current = pathname;
}

export function previousPathname(): string | null {
  return previous;
}

/** Test hook only. */
export function resetRouteHistory() {
  previous = null;
  current = null;
}

export const AUTH_ROUTE = /^\/(login|signup|auth|forgot-password|reset-password)(\/|$|\?)/;

/**
 * Play the welcome intro only on a real entry into the app:
 *   - arriving from a sign-in/sign-up page: always (this IS "entering the app"),
 *   - a cold document load (no previous route): unless seen within the window,
 *   - any other in-site navigation (calculators, public quote page…): never —
 *     replaying a 6.5 s modal on the way back from T2QCAL hid the bottom nav,
 *     froze scrolling behind the dialog and read as a glitch.
 */
export function shouldPlayWelcome({ previous: from, lastSeen, now, skipWindowMs }: {
  previous: string | null; lastSeen: number; now: number; skipWindowMs: number;
}): boolean {
  if (from !== null && AUTH_ROUTE.test(from)) return true;
  if (from !== null) return false;
  const elapsed = now - lastSeen;
  return !(lastSeen > 0 && elapsed >= 0 && elapsed < skipWindowMs);
}
