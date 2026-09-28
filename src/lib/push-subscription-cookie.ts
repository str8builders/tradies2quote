import "server-only";

/**
 * Identifies which `push_subscriptions` row belongs to THIS browser/phone,
 * so sign-out can delete exactly that row (audit finding 1 — subscriptions
 * used to survive sign-out, so the next account on the same device kept
 * getting the previous owner's pushes).
 *
 * Set by the subscribe route right after it writes a row (see
 * src/app/api/push/subscribe/route.ts); read by /auth/signout to know what
 * to delete. httpOnly so page script can never read or forge it, and it
 * only ever holds the row's opaque id — never the push endpoint/token
 * itself.
 */
export const PUSH_SUBSCRIPTION_COOKIE = "t2q-push-sub";

// A year and change — long enough to outlive a normal session. Sign-out
// clears it explicitly, so nothing depends on it expiring on its own.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

export function pushSubscriptionCookieOptions(maxAge: number = MAX_AGE_SECONDS) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}
