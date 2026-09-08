import { safeNextPath } from "@/lib/safe-redirect";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAppRoute = (pathname === "/app" || pathname.startsWith("/app/"));
  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password";

  const publicOrigin = process.env.NEXT_PUBLIC_APP_URL || request.url;
  function redirectWithSession(url: URL) {
    const redirected = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirected.cookies.set(cookie);
    return redirected;
  }

  if (isAppRoute && !user) {
    const url = new URL("/login", publicOrigin);
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return redirectWithSession(url);
  }

  if (isAuthRoute && user) {
    const url = new URL(safeNextPath(request.nextUrl.searchParams.get("next")), publicOrigin);
    return redirectWithSession(url);
  }

  return response;
}
