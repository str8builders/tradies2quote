import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  try {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    /* fall through to cookie wipe */
  }

  // 2. Build the redirect response and explicitly expire every sb-*
  //    cookie on it. Setting maxAge: 0 + matching path forces the
  //    browser to drop the cookie immediately.
  const url = new URL("/login", req.url);
  const response = NextResponse.redirect(url, 303);

  const cookieStore = await cookies();
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
    return NextResponse.redirect(new URL("/login", req.url), 303);
  }
  return POST(req);
}
