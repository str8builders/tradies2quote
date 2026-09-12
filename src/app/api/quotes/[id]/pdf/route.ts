import { type NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { generateQuotePdf } from "@/lib/pdf-generator";
import { loadLogoForPdf } from "@/lib/pdf-logo";
import { quoteNumber } from "@/lib/quote-defaults";
import type { QuoteData } from "@/lib/quote-types";
import { BUSINESS_NAME_REQUIRED, businessNameForDocuments } from "@/lib/business-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * Owner-facing quote PDF.
 *
 * Regenerates the PDF on demand from the CURRENT `quote_data` every
 * time, rather than downloading the file frozen at send-time. The
 * stored `pdf_path` is only written when a quote is sent (see
 * /api/quotes/[id]/send + /sms); after that, editing the quote updates
 * `quote_data` + `total_amount` but never refreshed the stored PDF, so
 * the owner's "view PDF" showed a stale total that didn't match the
 * on-screen itemised quote. Rendering live keeps the owner's PDF in
 * lockstep with what they see in the editor.
 *
 * The customer-facing PDF (/api/quote/[token]/pdf) intentionally still
 * serves the frozen `pdf_path` — the customer keeps exactly the quote
 * that was sent until the tradie re-sends.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<Params> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, quote_data, created_at, public_token")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!quote || !quote.quote_data) {
    return NextResponse.json({ error: "no_quote" }, { status: 404 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("business_name, email, phone, address, logo_url")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) return NextResponse.json({ error: "profile_unavailable", message: "Could not load your business details. Please try again." }, { status: 503 });
  const businessName = businessNameForDocuments(profile?.business_name);
  if (!businessName) return NextResponse.json(BUSINESS_NAME_REQUIRED, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tradies2quote.com";
  const acceptUrl = quote.public_token
    ? `${appUrl}/quote/${quote.public_token}`
    : null;

  const logo = await loadLogoForPdf(profile?.logo_url);

  let bytes: Uint8Array;
  try {
    bytes = await generateQuotePdf({
      quoteId: quote.id,
      createdAt: quote.created_at,
      quote: quote.quote_data as QuoteData,
      profile: { ...profile, business_name: businessName },
      acceptUrl,
      logo,
    });
  } catch (e) {
    captureError(e, { route: "quotes/pdf" });
    console.error("PDF generation failed", e);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
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
