import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { WELCOME_SEEN_COOKIE } from "@/lib/welcome-cookie";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // `next` is attacker-controllable via the query string — only allow
  // same-origin paths, never a full / protocol-relative URL.
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // A fresh sign-in is an entry: forget any earlier "seen" marker so the
      // first HTML of /app is already covered by the welcome (no dashboard flash).
      const response = NextResponse.redirect(new URL(next, origin));
      response.cookies.set(WELCOME_SEEN_COOKIE, "", { maxAge: 0, path: "/" });
      return response;
    }
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(error.message)}`,
        origin,
      ),
    );
  }

  // No code: Supabase sends the reason (expired or already-used link) as
  // error_description — show it instead of a bare sign-in page.
  const reason = searchParams.get("error_description") ?? searchParams.get("error");
  if (reason) {
    const wantsReset = next.startsWith("/reset-password");
    return NextResponse.redirect(new URL(`${wantsReset ? "/forgot-password" : "/login"}?error=${encodeURIComponent(reason.slice(0, 200))}`, origin));
  }
  return NextResponse.redirect(new URL("/login", origin));
}
