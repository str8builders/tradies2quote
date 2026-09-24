import { type NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { consumeFixedWindow, tooManyRequestsResponse } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { downloadPdf } from "@/lib/quote-storage";
import { quoteNumber } from "@/lib/quote-defaults";
import { classifyPublicQuote } from "@/lib/quote-public-view";
import { generateQuotePdf } from "@/lib/pdf-generator";
import { loadLogoForPdf } from "@/lib/pdf-logo";
import { businessNameForDocuments } from "@/lib/business-name";
import { captureError } from "@/lib/observability";
import type { QuoteData } from "@/lib/quote-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { token: string };

/**
 * Customer-facing "View full PDF".
 *
 * Serves the PDF stored at send time while it still shows the current
 * revision of the quote (`pdf_version = version`). Once the tradie edits a
 * sent quote the stored file is stale — the customer would read one set of
 * figures on the page and another in the PDF — so it is re-rendered from the
 * current quote instead. Nothing is written back: the next send stores a
 * fresh file and stamps its revision.
 */
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
    .select("id, user_id, pdf_path, pdf_version, version, quote_data, created_at, expires_at, status, deleted_at")
    .eq("public_token", token)
    .maybeSingle();
  const quote = quoteRaw as
    | {
        id: string;
        user_id: string;
        pdf_path: string | null;
        pdf_version: number | null;
        version: number;
        quote_data: unknown;
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
  if (quote.pdf_version !== null && quote.pdf_version === quote.version) {
    try {
      bytes = await downloadPdf(quote.pdf_path);
    } catch (e) {
      console.error("Public PDF download failed", e);
      return NextResponse.json({ error: "download_failed" }, { status: 500 });
    }
  } else {
    const rendered = await renderCurrentRevision(admin, quote, token);
    if ("error" in rendered) {
      return NextResponse.json({ error: rendered.error }, { status: rendered.status });
    }
    bytes = rendered.bytes;
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

/** Render the quote as it stands now — the same document the send route stores. */
async function renderCurrentRevision(
  admin: ReturnType<typeof adminClient>,
  quote: { id: string; user_id: string; created_at: string; quote_data: unknown },
  token: string,
): Promise<{ bytes: Uint8Array } | { error: string; status: number }> {
  const data = quote.quote_data as QuoteData | null;
  if (!data || !Array.isArray(data.line_items)) {
    return { error: "not_found", status: 404 };
  }
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("business_name, email, phone, address, logo_url")
    .eq("id", quote.user_id)
    .maybeSingle();
  const businessName = businessNameForDocuments(profile?.business_name);
  if (profileError || !businessName) {
    return { error: "pdf_unavailable", status: 503 };
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tradies2quote.com";
  try {
    const bytes = await generateQuotePdf({
      quoteId: quote.id,
      createdAt: quote.created_at,
      quote: data,
      profile: { ...profile, business_name: businessName },
      acceptUrl: `${appUrl}/quote/${token}`,
      logo: await loadLogoForPdf(profile?.logo_url),
    });
    return { bytes };
  } catch (e) {
    captureError(e, { route: "quote/pdf" });
    console.error("Public PDF render failed", e);
    return { error: "generation_failed", status: 500 };
  }
}
