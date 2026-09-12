import { type NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { downloadSignature } from "@/lib/quote-storage";
import { classifyPublicQuote } from "@/lib/quote-public-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { token: string };

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<Params> },
) {
  const { token } = await ctx.params;
  const admin = adminClient();
  const { data: quoteRaw, error } = await admin
    .from("quotes")
    .select("signature_path, accepted_at, status, expires_at, deleted_at")
    .eq("public_token", token)
    .maybeSingle();
  const quote = quoteRaw as
    | { signature_path: string | null; accepted_at: string | null; status: string; expires_at: string | null; deleted_at: string | null }
    | null;
  if (error || !quote || !quote.signature_path || !quote.accepted_at || quote.deleted_at ||
    classifyPublicQuote(quote, new Date()).kind !== "accepted") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let bytes: Uint8Array;
  try {
    bytes = await downloadSignature(quote.signature_path);
  } catch (e) {
    console.error("Signature download failed", e);
    return NextResponse.json({ error: "download_failed" }, { status: 500 });
  }

  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
    },
  });
}
