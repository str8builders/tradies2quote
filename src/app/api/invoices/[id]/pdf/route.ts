import { type NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/observability";
import { consumeFixedWindow, tooManyRequestsResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { generateInvoicePdf } from "@/lib/invoice-pdf-generator";
import { loadLogoForPdf } from "@/lib/pdf-logo";
import type { InvoiceSnapshot } from "@/lib/types/invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * Owner-facing invoice PDF.
 *
 * Regenerates the invoice PDF on demand from the frozen `invoice_data`
 * snapshot so the tradie can view it or back it up ("Save to Files") at
 * any time — mirrors /api/quotes/[id]/pdf. Read-only: does NOT send the
 * invoice or change its status.
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
  const quota = consumeFixedWindow(`pdf-invoice:${user.id}`, 60, 15 * 60_000);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_data, due_date, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!invoice || !invoice.invoice_data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "business_name, email, phone, address, gst_number, payment_instructions, logo_url",
    )
    .eq("id", user.id)
    .maybeSingle();

  const logo = await loadLogoForPdf(profile?.logo_url);

  let bytes: Uint8Array;
  try {
    bytes = await generateInvoicePdf({
      invoiceNumber: invoice.invoice_number,
      createdAt: invoice.created_at,
      dueDate: invoice.due_date,
      snapshot: invoice.invoice_data as InvoiceSnapshot,
      profile: profile ?? { business_name: null },
      paymentInstructions: profile?.payment_instructions ?? null,
      logo,
    });
  } catch (e) {
    captureError(e, { route: "invoices/pdf" });
    console.error("Invoice PDF generation failed", e);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }

  const filename = `${invoice.invoice_number}.pdf`;
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
