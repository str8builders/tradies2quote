import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { purgeAccount } from "@/lib/account-deletion";
import { captureError } from "@/lib/observability";

/**
 * Account deletion for the native calculator app.
 *
 * Apple Guideline 5.1.1(v) requires any app that creates accounts to let the
 * user delete theirs from inside that app. T2QCAL creates accounts, so T2QCAL
 * needs this — and it cannot do the deletion itself, because deletion needs the
 * SERVICE_ROLE key and that key must never ship inside an app. So the app
 * proves who it is with the user's own token, and the server does the work.
 *
 * The caller is authenticated by their access token and nothing else. There is
 * deliberately no way to name a different user: the id purged is the id the
 * token resolves to. An endpoint that took a user id and a bearer token would
 * only be as safe as its own comparison of the two, and that comparison is a
 * line of code someone can get wrong later.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Authentication first, configuration second. The other way round lets an
  // unauthenticated caller tell a misconfigured server from a healthy one,
  // which is a small thing to give away for nothing.
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // The typed confirmation is required here as well as in the app. A
  // destructive endpoint that fires on an empty body is one stray request away
  // from deleting somebody's business.
  let confirm = "";
  try {
    const body = (await request.json()) as { confirm?: unknown };
    confirm = typeof body.confirm === "string" ? body.confirm.trim() : "";
  } catch {
    confirm = "";
  }
  if (confirm !== "DELETE") {
    return NextResponse.json(
      { error: 'Type DELETE (all caps) to confirm.' },
      { status: 400 },
    );
  }

  // `PUBLISHABLE_KEY`, which is what this project calls its anon key
  // everywhere else — see `src/lib/supabase/client.ts`. Reaching for the
  // conventional `ANON_KEY` name here left the route permanently
  // misconfigured, and it answered every request with a 500 rather than
  // failing at build time.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }

  // Resolve the token to a user. This is the only thing that decides whose
  // account is destroyed.
  const supabase = createSupabaseClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const result = await purgeAccount(user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } catch (e) {
    captureError(e, { route: "api/account/delete" });
    return NextResponse.json(
      { error: "Could not finish deleting your account. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
