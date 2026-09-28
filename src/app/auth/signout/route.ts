import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { publicUrl } from "@/lib/public-origin";
import { captureError } from "@/lib/observability";
import { PUSH_SUBSCRIPTION_COOKIE, pushSubscriptionCookieOptions } from "@/lib/push-subscription-cookie";

const ROW_ID_RE = /^[0-9a-f-]{8,64}$/i;

/**
 * Delete THIS browser/phone's push subscription row, if any (the cookie the
 * subscribe route set — see push-subscription-cookie.ts). Works for both
 * Web Push and APNs rows: either way it's the same table, keyed by the same
 * opaque row id, regardless of which account it was subscribed under.
 *
 * Audit finding 1: subscriptions used to survive sign-out, so the next
 * account signed in on the same device kept getting the previous owner's
 * pushes. Best-effort and non-blocking — a failure here must never stop
 * sign-out itself.
 */
async function deleteThisDevicesPushSubscription(rowId: string | undefined, userId: string | null): Promise<void> {
  // Only ever the signing-out account's own row: the cookie is the browser's
  // to edit, so it must not be able to name someone else's subscription.
  if (!rowId || !ROW_ID_RE.test(rowId) || !userId) return;
  try {
    const admin = adminClient() as unknown as SupabaseClient;
    const { error } = await admin.from("push_subscriptions").delete().eq("id", rowId).eq("user_id", userId);
    if (error) {
      console.error("push subscription cleanup on sign-out failed", error);
      captureError(error, { route: "auth/signout" });
    }
  } catch (e) {
    console.error("push subscription cleanup on sign-out failed", e);
    captureError(e, { route: "auth/signout" });
  }
}

/**
 * Wave 13.2 — Sign-out route handler.
 *
 * Replaces the previous `signOutAction` server action. Two reasons the
 * server action was unreliable in production:
 *
 *   1. `cookieStore.delete(name)` in a server action doesn't include
 *      the `path` attribute the cookie was originally set with, so the
 *      delete header can fail to match the actual cookie. Result:
 *      cookie stays alive, middleware refreshes the session on the
 *      next request, and the user is silently re-authenticated.
 *
 *   2. After a server action calls `redirect()`, the browser follows
 *      the 307 with whatever cookies the response carries. If the
 *      cookie-clear writes didn't land on the redirect response
 *      (timing of when Next attaches them in a server action call),
 *      the redirected GET to /login still carries valid auth cookies.
 *
 * The route-handler pattern bypasses both issues: we construct the
 * redirect Response ourselves and set explicit Max-Age=0 cookies on
 * it. The browser deletes the cookies the moment the redirect lands.
 *
 * 303 (See Other) is used so the browser swaps the POST to a GET for
 * the redirect — the right semantics for "I'm done, look elsewhere".
 */
export async function POST(req: NextRequest) {
  // 1. Best-effort server-side revocation. Invalidates the refresh
  //    token on Supabase's side so it can't be replayed even if a
  //    cookie leaks. Wrapped in try/catch because a network blip
  //    here shouldn't block local cookie cleanup.
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    /* fall through to cookie wipe */
  }

  const cookieStore = await cookies();

  // 1.5. This browser/phone's push subscription (if any) belongs to the
  //      account that's signing out — delete it so the next account on
  //      this device doesn't inherit stale pushes (audit finding 1).
  await deleteThisDevicesPushSubscription(cookieStore.get(PUSH_SUBSCRIPTION_COOKIE)?.value, userId);

  // 2. Build the redirect response and explicitly expire every sb-*
  //    cookie on it. Setting maxAge: 0 + matching path forces the
  //    browser to drop the cookie immediately.
  // Behind Caddy, req.url is the server's own address (localhost:3001).
  const url = publicUrl("/login", req);
  const response = NextResponse.redirect(url, 303);

  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith("sb-")) {
      response.cookies.set(c.name, "", {
        path: "/",
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
  }
  response.cookies.set(PUSH_SUBSCRIPTION_COOKIE, "", pushSubscriptionCookieOptions(0));

  return response;
}

/**
 * GET variant — exists only so a stray browser visit to
 * /auth/signout (e.g. user pasted the URL) still signs them out
 * gracefully. The form on the dashboard uses POST.
 */
export async function GET(req: NextRequest) {
  // A GET from another site (an <img> or a link on someone else's page) must
  // not be able to sign a visitor out; only a same-site visit — a pasted URL —
  // still signs out gracefully.
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return NextResponse.redirect(publicUrl("/login", req), 303);
  }
  return POST(req);
}
