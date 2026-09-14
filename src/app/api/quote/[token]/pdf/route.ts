import { type NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { consumeFixedWindow, tooManyRequestsResponse } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { downloadPdf } from "@/lib/quote-storage";
import { quoteNumber } from "@/lib/quote-defaults";
import { classifyPublicQuote } from "@/lib/quote-public-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { token: string };

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<Params> },
) {
  const { token } = await ctx.params;
  // Public bearer URL: a light per-IP cap so the token cannot be probed at speed.
  const quota = consumeFixedWindow(`public-quote-get:${requestIp(request)}`, 120, 15 * 60_000);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);
  const admin = adminClient();
  const { data: quoteRaw, error } = await admin
    .from("quotes")
    .select("id, pdf_path, created_at, expires_at, status, deleted_at")
    .eq("public_token", token)
    .maybeSingle();
  const quote = quoteRaw as
    | {
        id: string;
        pdf_path: string | null;
        created_at: string;
        expires_at: string | null;
        status: string;
        deleted_at: string | null;
      }
    | null;
  if (error || !quote || !quote.pdf_path || quote.deleted_at) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const view = classifyPublicQuote(quote, new Date());
  if (view.kind === "expired") {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if (view.kind !== "live" && view.kind !== "accepted") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let bytes: Uint8Array;
  try {
    bytes = await downloadPdf(quote.pdf_path);
  } catch (e) {
    console.error("Public PDF download failed", e);
    return NextResponse.json({ error: "download_failed" }, { status: 500 });
  }

  const filename = `${quoteNumber(quote.id, quote.created_at)}.pdf`;
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
