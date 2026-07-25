import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { generateQuotePdf } from "@/lib/pdf-generator";
import { loadLogoForPdf } from "@/lib/pdf-logo";
import { buildSmsBody, sendQuoteSms, smsConfigured } from "@/lib/sms-quote";
import { uploadPdf } from "@/lib/quote-storage";
import { generatePublicToken } from "@/lib/quote-tokens";
import {
  SEND_ERROR_MESSAGES,
  validateQuoteForSmsSending,
  type SendValidationError,
} from "@/lib/quote-validation";
import { formatCurrency, quoteNumber } from "@/lib/quote-defaults";
import type { QuoteData } from "@/lib/quote-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<Params> },
) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    acknowledged?: boolean;
  };
  const acknowledged = body?.acknowledged === true;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select(
      "id, user_id, status, quote_data, total_amount, currency, created_at, public_token, pdf_path, expires_at, voice_transcript",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (qErr || !quote) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const qd = quote.quote_data as QuoteData | null;

  const validation = validateQuoteForSmsSending({
    status: quote.status,
    total_amount: quote.total_amount,
    quote_data: qd,
    acknowledged,
    // Contradiction gate evidence: the same text generation licensed
    // scopes from (transcript/scan), falling back to the job summary.
    description:
      (quote as { voice_transcript?: string | null }).voice_transcript ??
      qd?.job_summary ??
      null,
  });
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: validation.error,
        message: SEND_ERROR_MESSAGES[validation.error as SendValidationError],
        reasons: validation.reasons ?? [],
      },
      { status: 400 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name, email, phone, address, logo_url")
    .eq("id", user.id)
    .maybeSingle();

  const quoteData = quote.quote_data as QuoteData;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tradies2quote.com";
  const token = quote.public_token ?? generatePublicToken();
  const acceptUrl = `${appUrl}/quote/${token}`;

  // Generate + upload the PDF up-front so the public /quote/[token] page
  // serves it instantly when the customer taps the SMS link. Mirrors the
  // email send route: durable artifacts first, irreversible action last.
  const logo = await loadLogoForPdf(profile?.logo_url);

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateQuotePdf({
      quoteId: quote.id,
      createdAt: quote.created_at,
      quote: quoteData,
      profile: profile ?? { business_name: null },
      acceptUrl,
      logo,
    });
  } catch (e) {
    captureError(e, { route: "quotes/sms" });
    console.error("PDF generation failed (sms)", e);
    return NextResponse.json(
      { error: "pdf_generation_failed", message: "Could not generate the PDF." },
      { status: 500 },
    );
  }

  let pdfPath: string;
  try {
    pdfPath = await uploadPdf(quote.user_id, quote.id, pdfBytes);
  } catch (e) {
    captureError(e, { route: "quotes/sms" });
    console.error("PDF upload failed (sms)", e);
    return NextResponse.json(
      { error: "pdf_upload_failed", message: "Could not save the PDF." },
      { status: 500 },
    );
  }

  const number = quoteNumber(quote.id, quote.created_at);
  const totalText = formatCurrency(Number(quote.total_amount) || 0, quote.currency);

  const admin = adminClient();
  const expires_at =
    quote.expires_at ??
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error: preErr } = await admin
    .from("quotes")
    .update({ pdf_path: pdfPath, public_token: token, expires_at })
    .eq("id", quote.id);
  if (preErr) {
    console.error("Quote pre-send update failed (sms)", preErr);
    return NextResponse.json(
      {
        error: "update_failed",
        message: "Could not save the quote before sending.",
      },
      { status: 500 },
    );
  }

  const smsArgs = {
    to: validation.resolvedPhone,
    businessName: profile?.business_name || "Your business",
    clientName: quoteData.client.name,
    total: totalText,
    acceptUrl,
    quoteNumber: number,
  };

  // DEVICE PATH (the NZ default — see src/lib/smsDeepLink.ts for why
  // Twilio cannot reach +64 mobiles). No platform sender configured, so
  // hand the composed text back and let the client open the tradie's own
  // Messages app.
  //
  // The quote is deliberately NOT marked sent here: the PDF and public
  // link are now durable (saved above), but nothing has been sent — the
  // tradie still has to hit send in Messages. They confirm that via
  // POST /api/quotes/[id]/sms/sent, so "sent" never means "we opened an
  // app and hoped".
  if (!smsConfigured()) {
    return NextResponse.json({
      ok: true,
      mode: "device",
      to: validation.resolvedPhone,
      body: buildSmsBody(smsArgs),
      accept_url: acceptUrl,
      client_name: quoteData.client.name,
    });
  }

  const smsResult = await sendQuoteSms(smsArgs);
  if (!smsResult.ok) {
    return NextResponse.json(
      {
        error: smsResult.error,
        message:
          smsResult.error === "sms_not_configured" ||
          smsResult.error === "sms_token_not_configured" ||
          smsResult.error === "sms_from_not_configured"
            ? "Text sending isn't available right now — send by email instead."
            : "Could not send the SMS. PDF was saved but the message wasn't delivered.",
      },
      {
        status:
          smsResult.error === "sms_not_configured" ||
          smsResult.error === "sms_token_not_configured" ||
          smsResult.error === "sms_from_not_configured"
            ? 503
            : 502,
      },
    );
  }

  const { error: uErr } = await admin
    .from("quotes")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", quote.id);
  if (uErr) {
    console.error("Quote status update failed (sms)", uErr);
    return NextResponse.json(
      {
        error: "update_failed",
        message: "SMS sent but couldn't update quote status.",
      },
      { status: 500 },
    );
  }

  if (acknowledged) {
    console.log("[send-gate] takeoff override used", {
      quoteId: quote.id,
      channel: "sms",
    });
  }
  // Audit row for the status-history timeline. Non-fatal — the SMS is out
  // and the status is already "sent" — but a silent loss here leaves a hole
  // in the tracking UI, so log + capture instead of fire-and-ignore.
  const { error: evErr } = await admin.from("quote_events").insert({
    quote_id: quote.id,
    type: "sent",
    metadata: {
      channel: "sms",
      to: validation.resolvedPhone,
      sid: smsResult.sid,
      ...(acknowledged ? { takeoff_override: true } : {}),
    },
  });
  if (evErr) {
    captureError(evErr, {
      route: "quotes/sms",
      extra: { step: "quote_events.sent" },
    });
    console.error("quote_events 'sent' insert failed (sms)", evErr);
  }

  return NextResponse.json({
    ok: true,
    public_token: token,
    accept_url: acceptUrl,
  });
}
