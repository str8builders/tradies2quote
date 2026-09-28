import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { expiryForSend } from "@/lib/quote-expiry";
import { STATUSES_A_SEND_REOPENS, changedRows, sendMovesToSent } from "@/lib/quote-send-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * POST /api/quotes/[id]/sms/sent
 *
 * Confirms a DEVICE-sent text (the tradie's own Messages app — see
 * src/lib/smsDeepLink.ts for why Twilio can't originate to +64).
 *
 * The sibling POST /api/quotes/[id]/sms already did the durable work
 * (PDF, public token, expiry) and handed back the composed text without
 * touching status. This route is the tradie asserting "I hit send", and
 * is the ONLY thing that flips the quote to `sent` on the device path —
 * from draft, or from declined / expired when the tradie sends it again
 * (the job page's "Send it again"; a declined quote left declined told the
 * client the quote was no longer available).
 *
 * That split is deliberate: opening Messages is not sending. Every other
 * status in this app means what it says, and a text the tradie abandoned
 * must not show as sent (it would silence follow-ups on a quote the
 * client never received).
 *
 * The audit row records `channel: "sms_device"` + `confirmed_by_user`
 * so the trail is honest that delivery was asserted, not observed the
 * way a Resend/Twilio acceptance is.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<Params> },
) {
  const { id } = await ctx.params;
  // Trigger provenance for the audit row. The button flips status the moment
  // the tradie taps "Open Messages" (the link leaves their hands), so the
  // honest metadata is "opened_messages", not a claim we observed delivery.
  // Defaults to confirmed_by_user for any older caller that sends no body.
  const body = (await request.json().catch(() => ({}))) as { trigger?: string };
  const trigger =
    body?.trigger === "opened_messages" ? "opened_messages" : "confirmed_by_user";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Ownership + a sanity check that the send path actually ran: a quote
  // with no public_token never had its artifacts minted, so there is no
  // link for the customer to open and nothing was textable.
  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("id, status, public_token, expires_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (qErr || !quote) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!quote.public_token) {
    return NextResponse.json(
      {
        error: "not_prepared",
        message: "Prepare the text before marking it sent.",
      },
      { status: 400 },
    );
  }
  // IDEMPOTENT by design. The flip fires as a fire-and-forget POST on the
  // "Open Messages" tap AND is re-ensured on the "Done" tap, so this route
  // is routinely called more than once for the same quote. Only a
  // draft / declined / expired -> sent transition writes — a quote already
  // sent or viewed (a reminder), or at a later lifecycle stage, is a no-op
  // success. This prevents:
  //   • re-stamping sent_at (which would move the follow-up cadence anchor),
  //   • walking viewed -> sent BACKWARD if the client opened the link first,
  //   • reopening a quote the client accepted meanwhile,
  //   • duplicate 'sent' audit rows.
  // The double-fire exists on purpose: a single dropped request must not
  // leave the quote stuck in draft (that stuck state is the exact
  // "QUOTE NOT FOUND" outage this whole change fixes).
  if (!sendMovesToSent(quote.status)) {
    return NextResponse.json({ ok: true, already: quote.status });
  }

  const now = new Date();
  // The prepare step set a fresh expiry; this only repairs one that is
  // missing or already past, so the link the client got works.
  const expires_at = expiryForSend(quote.expires_at, now);
  const admin = adminClient();
  const { data: flipped, error: uErr } = await admin
    .from("quotes")
    // A fresh offer: an old "opened" date is cleared for the next view to set.
    .update({ status: "sent", sent_at: now.toISOString(), viewed_at: null, expires_at })
    .eq("id", quote.id)
    // Guard the transition at the DB layer too: only flip a row that is
    // still in one of those statuses, so two racing requests can't both
    // write and an acceptance in between is never reverted.
    .in("status", STATUSES_A_SEND_REOPENS)
    .select("id");
  if (uErr) {
    captureError(uErr, { route: "quotes/sms/sent", extra: { step: "status_update" } });
    console.error("Quote status update failed (sms/sent)", uErr);
    return NextResponse.json(
      { error: "update_failed", message: "Couldn't update the quote status." },
      { status: 500 },
    );
  }
  if (changedRows(flipped) === 0) {
    // The other tap (or another tab) got there first, or the status moved on.
    return NextResponse.json({ ok: true, already: "changed" });
  }

  const { error: evErr } = await admin.from("quote_events").insert({
    quote_id: quote.id,
    type: "sent",
    metadata: { channel: "sms_device", trigger },
  });
  if (evErr) {
    captureError(evErr, {
      route: "quotes/sms/sent",
      extra: { step: "quote_events.sent" },
    });
    console.error("quote_events 'sent' insert failed (sms/sent)", evErr);
  }

  return NextResponse.json({ ok: true });
}
