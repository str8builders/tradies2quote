import { type NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { token: string };

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<Params> },
) {
  const { token } = await ctx.params;
  const admin = adminClient();

  const { data: quoteRaw, error: qErr } = await admin
    .from("quotes")
    .select("user_id")
    .eq("public_token", token)
    .maybeSingle();
  const quote = quoteRaw as { user_id: string } | null;
  if (qErr || !quote) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: profileRaw } = await admin
    .from("profiles")
    .select("logo_url")
    .eq("id", quote.user_id)
    .maybeSingle();
  const profile = profileRaw as { logo_url: string | null } | null;

  if (!profile?.logo_url) {
    return NextResponse.json({ error: "no_logo" }, { status: 404 });
  }

  // Only redirect to OUR storage host. `logo_url` is a profile field, so a
  // compromised/imported value must not turn this public, token-addressed
  // route into an open redirect (audit 2026-07-10). Supabase public-object
  // URLs live under <SUPABASE_URL>/storage/v1/object/public/….
  const allowedOrigin = (() => {
    try {
      return new URL(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
      ).origin;
    } catch {
      return null;
    }
  })();
  if (/^https?:\/\//i.test(profile.logo_url)) {
    try {
      const target = new URL(profile.logo_url);
      if (allowedOrigin && target.origin === allowedOrigin) {
        return NextResponse.redirect(target, { status: 302 });
      }
    } catch {
      /* fall through to 404 */
    }
  }

  return NextResponse.json({ error: "logo_not_supported" }, { status: 404 });
}
