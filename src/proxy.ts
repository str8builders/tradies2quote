import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Wave 13.2 — `auth/signout` excluded so the proxy can't refresh
    // the session during a sign-out request. If the middleware ran on
    // /auth/signout, it would call supabase.auth.getUser() and could
    // re-emit fresh auth cookies, racing with the route handler's
    // explicit cookie expiry writes. Excluding it guarantees the only
    // Set-Cookie headers on the response come from the route handler.
    // Also skipped: static media, the service worker, SEO files, and the
    // machine endpoints (Stripe webhook, cron, health) — none read a user
    // session, and running the session refresh on them cost ~4,000 auth
    // calls a fortnight for three users.
    "/((?!_next/static|_next/image|favicon.ico|auth/signout|t2qcal/signout|videos/|images/|wallpaper/|vendor/|sw\\.js|robots\\.txt|sitemap\\.xml|api/stripe/webhook|api/cron/|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|woff2?)$).*)",
  ],
};
