import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { QuoteData } from "@/lib/quote-types";
import { isQuoteLocked, QUOTE_LOCKED_MESSAGE } from "@/lib/lifecycle/lock";

/**
 * Edit the cleaned transcript without regenerating the quote.
 *
 *   POST /api/quotes/[id]/transcript
 *     body: { cleanedTranscript: string }
 *
 * Use case: tradie spotted a typo or wrong size in the AI-cleaned text
 * and wants to fix it inline. The line items remain as the AI generated
 * them. To re-run quote generation against the edited text, use the
 * sibling /transcript/regenerate route instead.
 *
 * Response: { ok: true }
 *
 * Privacy: the edited transcript stays inside `quote_data.transcript`
 * (server-side only). The `get_quote_by_token` RPC does not project
 * `transcript`, so it never reaches the public customer page.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { cleanedTranscript?: unknown };
  try {
    body = (await request.json()) as { cleanedTranscript?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cleaned = body.cleanedTranscript;
  if (typeof cleaned !== "string" || cleaned.trim().length === 0) {
    return NextResponse.json(
      { error: "cleanedTranscript must be a non-empty string" },
      { status: 400 },
    );
  }

  const { data: quote, error } = await supabase
    .from("quotes")
    .select("id, quote_data, user_id, status")
    .eq("id", id)
    .single();
  if (error || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  if (quote.user_id !== user.id) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  // Accepted quotes are read-only end to end, including this private note.
  if (isQuoteLocked(quote.status)) {
    return NextResponse.json({ error: QUOTE_LOCKED_MESSAGE }, { status: 409 });
  }

  const quoteData = quote.quote_data as QuoteData | null;
  if (!quoteData) {
    return NextResponse.json(
      { error: "Quote has not been generated yet" },
      { status: 409 },
    );
  }

  const existing = (quoteData.transcript ?? null) as Record<string, unknown> | null;
  const updated: QuoteData = {
    ...quoteData,
    transcript: {
      ...(existing ?? {}),
      cleaned,
    },
  };

  const { error: uErr } = await supabase
    .from("quotes")
    .update({ quote_data: updated })
    .eq("id", quote.id);
  if (uErr) {
    console.error("[transcript] save edited cleaned failed", uErr);
    return NextResponse.json(
      { error: "Failed to save transcript" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
