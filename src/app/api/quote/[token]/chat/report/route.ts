import { type NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/observability";
import { adminClient } from "@/lib/supabase/admin";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { token: string };

/**
 * POST /api/quote/[token]/chat/report — Guideline 1.2 "report" control,
 * customer side.
 *
 * The anonymous customer on the public quote page can flag the chat (or a
 * specific message in it) as offensive/objectionable. The report lands in
 * `chat_reports` AND in the internal error monitor so the operator sees it
 * immediately — reports are reviewed within 24 hours (commitment stated in
 * the Terms and the App Review notes).
 *
 * Deliberately works for ANY token that resolves to a quote (not just
 * live-status ones): a customer must be able to report a conversation even
 * after the quote is accepted/expired.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<Params> },
) {
  const { token } = await ctx.params;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : "unknown";
  const quota = consumeDailyQuota(`chat-report:${ip}`, 20);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

  const body = (await request.json().catch(() => ({}))) as {
    reason?: unknown;
    messageIndex?: unknown;
    messagePreview?: unknown;
  };
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;
  const messageIndex =
    typeof body.messageIndex === "number" && Number.isFinite(body.messageIndex)
      ? Math.trunc(body.messageIndex)
      : null;
  const messagePreview =
    typeof body.messagePreview === "string"
      ? body.messagePreview.trim().slice(0, 300)
      : null;

  const admin = adminClient();
  const { data: quote } = await admin
    .from("quotes")
    .select("id")
    .eq("public_token", token)
    .maybeSingle();
  if (!quote) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error: insertErr } = await admin.from("chat_reports").insert({
    quote_id: quote.id,
    reporter: "customer",
    reason,
    message_index: messageIndex,
    message_preview: messagePreview,
  });
  if (insertErr) {
    captureError(insertErr, { route: "quote/chat/report" });
    return NextResponse.json(
      { error: "report_failed", message: "Couldn't send the report — try again." },
      { status: 500 },
    );
  }

  // Surface in the operator's monitor immediately (the review SLA is <24h;
  // the monitor + its email digest are how the operator actually sees it).
  captureError(new Error("chat report received (customer)"), {
    route: "quote/chat/report",
    extra: { quoteId: quote.id, reason, messageIndex },
  });

  return NextResponse.json({ ok: true });
}
