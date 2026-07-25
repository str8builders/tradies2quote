import { type NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

type Action = "disable" | "enable" | "report";

/**
 * POST /api/quotes/[id]/chat/moderate — Guideline 1.2 controls, tradie side.
 *
 * Three actions on the quote's public customer chat:
 *   - "disable" — turn the chat off for this quote link (the customer is an
 *     anonymous token-holder, so this IS the block-abusive-user control).
 *   - "enable"  — turn it back on.
 *   - "report"  — flag the conversation to the operator (lands in
 *     chat_reports + the internal monitor; reviewed within 24 hours).
 *
 * Ownership is proven by the user-scoped select before any write.
 */
export async function POST(
  request: NextRequest,
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

  const body = (await request.json().catch(() => ({}))) as {
    action?: unknown;
    reason?: unknown;
  };
  const action = body.action as Action;
  if (action !== "disable" && action !== "enable" && action !== "report") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (qErr || !quote) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = adminClient();

  if (action === "report") {
    const { error: insertErr } = await admin.from("chat_reports").insert({
      quote_id: quote.id,
      reporter: "tradie",
      reason,
    });
    if (insertErr) {
      captureError(insertErr, { route: "quotes/chat/moderate" });
      return NextResponse.json({ error: "report_failed" }, { status: 500 });
    }
    captureError(new Error("chat report received (tradie)"), {
      route: "quotes/chat/moderate",
      extra: { quoteId: quote.id, reason },
    });
    return NextResponse.json({ ok: true });
  }

  const { error: updateErr } = await admin
    .from("quotes")
    .update({ chat_disabled: action === "disable" })
    .eq("id", quote.id);
  if (updateErr) {
    captureError(updateErr, { route: "quotes/chat/moderate" });
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, chat_disabled: action === "disable" });
}
