import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { consumeDailyQuota, consumeFixedWindow, tooManyRequestsResponse } from "@/lib/rate-limit";

import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { generateInvoicePdf } from "@/lib/invoice-pdf-generator";
import { loadLogoForPdf } from "@/lib/pdf-logo";
import { sendInvoiceEmail } from "@/lib/email-invoice";
import { formatCurrency, formatIssueDate } from "@/lib/quote-defaults";
import { dueDateForSend } from "@/lib/invoice-due-date";
import type { InvoiceSnapshot } from "@/lib/types/invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * POST /api/invoices/[id]/send
 *
 * Mirrors the quote send route: generate the invoice PDF → email it
 * via Resend → stamp sent_at + flip status to "sent".
 *
 * No public token / accept-online flow yet (invoices are pay-by-bank
 * for now). When Stripe Connect lands the PDF will carry a hosted
 * checkout link and this route will mint one.
 */
export async function POST(
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
  // Each call sends a real message at provider cost: throttle like the AI routes.
  const burst = consumeFixedWindow(`send-invoice:burst:${user.id}`, 20, 15 * 60_000);
  if (!burst.ok) return tooManyRequestsResponse(burst.resetAt);
  const daily = consumeDailyQuota(`send-invoice:${user.id}`, 150);
  if (!daily.ok) return tooManyRequestsResponse(daily.resetAt);

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, user_id, quote_id, invoice_number, status, total_amount, currency, invoice_data, due_date, created_at, sent_at, paid_at",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();
  if (invErr || !invoice) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (invoice.status === "paid") {
    return NextResponse.json(
      {
        error: "already_paid",
        message: "This invoice is already marked paid.",
      },
      { status: 400 },
    );
  }
  if (invoice.status === "cancelled") {
    return NextResponse.json(
      { error: "cancelled", message: "This invoice was cancelled." },
      { status: 400 },
    );
  }

  const snapshot = invoice.invoice_data as InvoiceSnapshot | null;
  if (!snapshot) {
    return NextResponse.json(
      {
        error: "snapshot_missing",
        message: "Invoice has no line-item snapshot — recreate the draft.",
      },
      { status: 500 },
    );
  }

  // Pull the recipient email off the invoice snapshot (frozen at draft
  // creation) so a later edit to the client record can't change who
  // receives the invoice.
  const to = (snapshot.client?.email ?? "").trim();
  if (!to) {
    return NextResponse.json(
      {
        error: "client_email_missing",
        message:
          "The client on this invoice has no email address — add one and recreate the draft.",
      },
      { status: 400 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "business_name, email, phone, address, gst_number, payment_instructions, logo_url",
    )
    .eq("id", user.id)
    .maybeSingle();

  // Wave 40 — bank/payment details entered once in Settings
  // (profiles.payment_instructions); the PDF and email renderers omit
  // their "How to pay" block when null.
  const paymentInstructions: string | null =
    profile?.payment_instructions ?? null;

  const logo = await loadLogoForPdf(profile?.logo_url);

  // First send restarts the payment term from today (a draft raised weeks
  // ago must not arrive overdue); a re-send keeps the date already given.
  // The PDF, the email and the stored row all use this one value.
  const sentAt = new Date();
  const dueDate = dueDateForSend(invoice, sentAt);

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateInvoicePdf({
      invoiceNumber: invoice.invoice_number,
      createdAt: invoice.created_at,
      dueDate,
      snapshot,
      profile: profile ?? { business_name: null },
      paymentInstructions,
      logo,
    });
  } catch (e) {
    captureError(e, { route: "invoices/send" });
    console.error("Invoice PDF generation failed", e);
    return NextResponse.json(
      {
        error: "pdf_generation_failed",
        message: "Could not generate the invoice PDF.",
      },
      { status: 500 },
    );
  }

  const totalText = formatCurrency(
    Number(invoice.total_amount) || 0,
    invoice.currency,
  );
  // due_date is null until the tradie sets one — that means "on receipt",
  // never the epoch ("01 Jan 1970") that formatIssueDate(null) produces.
  const dueDateLabel = dueDate ? formatIssueDate(dueDate) : "on receipt";

  const emailResult = await sendInvoiceEmail({
    to,
    businessName: profile?.business_name || "Your business",
    clientName: snapshot.client.name,
    total: totalText,
    dueDateLabel,
    invoiceNumber: invoice.invoice_number,
    pdf: pdfBytes,
    pdfFileName: `${invoice.invoice_number}.pdf`,
    paymentInstructions,
    replyTo: profile?.email ?? null,
  });
  if (!emailResult.ok) {
    return NextResponse.json(
      {
        error: emailResult.error,
        message:
          emailResult.error === "email_not_configured"
            ? "Email is not configured. Set RESEND_API_KEY."
            : "Could not send the invoice email. PDF was generated but not delivered.",
      },
      { status: emailResult.error === "email_not_configured" ? 503 : 502 },
    );
  }

  // Flip status + stamp sent_at. Service role bypass not needed — the
  // user-scoped query above already proved ownership.
  const admin = adminClient();

  // AUDIT PARITY with quote/SMS sends: record the outbound event so the
  // tracking trail covers invoices too. Best-effort — a logging failure
  // must never undo a successful delivery (same posture as quote send).
  if (invoice.quote_id) {
    const { error: evErr } = await admin.from("quote_events").insert({
      quote_id: invoice.quote_id,
      type: "invoice_sent",
      metadata: { to, invoice_id: invoice.id, invoice_number: invoice.invoice_number },
    });
    if (evErr) {
      captureError(new Error(`invoice_sent event insert failed: ${evErr.message}`), {
        route: "invoices/send",
      });
      console.error("invoice_sent event insert failed", evErr);
    }
  }

  const { error: uErr } = await admin
    .from("invoices")
    .update({
      status: "sent",
      sent_at: sentAt.toISOString(),
      ...(dueDate ? { due_date: dueDate } : {}),
    })
    .eq("id", invoice.id);
  if (uErr) {
    console.error("Invoice status update failed", uErr);
    return NextResponse.json(
      {
        error: "update_failed",
        message: "Invoice sent but couldn't update the status.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    invoice_id: invoice.id,
    sent_to: to,
  });
}
