import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { adminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  engagementRecipient,
  reviewsEnabled,
  followupsEnabled,
  replyToFor,
  sendReviewRequestEmail,
  sendFollowupEmail,
} from "@/lib/engagement";
import { quoteNumber, formatCurrency } from "@/lib/quote-defaults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handle(request);
}
export async function GET(request: NextRequest) {
  return handle(request);
}

type Counters = {
  reviews_sent: number;
  followups_sent: number;
  failed: number;
  errors: { quote_id: string; kind: string; error: string }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The client's name and email as written on the quote itself (not the
 * clients row linked by quotes.client_id, which the public request form
 * links loosely: see engagementRecipient).
 */
const QUOTE_CLIENT_COLUMNS =
  "client_name:quote_data->client->>name, client_email:quote_data->client->>email, client_contact:quote_data->client->>contact";

type QuoteClientColumns = { client_name: string | null; client_email: string | null; client_contact: string | null };

async function handle(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "cron_not_configured", message: "Set CRON_SECRET." },
      { status: 503 },
    );
  }
  const authHeader = request.headers.get("authorization");
  if (!isAuthorizedCron(authHeader)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";
  let eligible = 0;
  const reviewsOn = reviewsEnabled();
  const followupsOn = followupsEnabled();
  if (!reviewsOn && !followupsOn) {
    return NextResponse.json({ ok: true, skipped: "flags_off" });
  }

  const counters: Counters = { reviews_sent: 0, followups_sent: 0, failed: 0, errors: [] };

  try {
    const admin = adminClient();
    const now = Date.now();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tradies2quote.com";

    // Only opted-in tradies — one query, then everything below is scoped to them.
    const { data: settings, error: settingsError } = await admin
      .from("feature_settings")
      .select("user_id, google_review_url, auto_review_enabled, auto_followup_enabled")
      .or("auto_review_enabled.eq.true,auto_followup_enabled.eq.true");

    if (settingsError) throw settingsError;
    if (!settings || settings.length === 0) {
      return NextResponse.json({ ok: true, note: "no_opted_in_users", ...counters });
    }

    const userIds = settings.map((s) => s.user_id);
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, business_name, currency, email")
      .in("id", userIds);
    if (profilesError) throw profilesError;
    const profById = new Map((profiles ?? []).map((p) => [p.id, p]));

    /** Where this quote's email went (newest send first), for the recipient rule. */
    const recipientFor = async (quoteId: string, client: QuoteClientColumns): Promise<string | null> => {
      const { data: events, error: eventsError } = await admin
        .from("quote_events")
        .select("metadata, created_at")
        .eq("quote_id", quoteId)
        .eq("type", "sent")
        .order("created_at", { ascending: false })
        .limit(20);
      if (eventsError) throw eventsError;
      return engagementRecipient(events ?? [], { email: client.client_email, contact: client.client_contact });
    };

    // ── Review requests: completed quotes, opted-in tradie with a review URL ──
    if (reviewsOn) {
      const since = new Date(now - 30 * DAY_MS).toISOString();
      for (const s of settings) {
        if (!s.auto_review_enabled || !s.google_review_url) continue;
        const { data: quotes, error: quotesError } = await admin
          .from("quotes")
          .select(`id, client_id, completed_at, ${QUOTE_CLIENT_COLUMNS}`)
          .eq("user_id", s.user_id)
          .eq("status", "completed")
          .is("deleted_at", null)
          .gte("completed_at", since)
          .not("client_id", "is", null);

        if (quotesError) throw quotesError;
        for (const q of quotes ?? []) {
          const { data: existing, error: existingError } = await admin
            .from("review_requests")
            .select("id")
            .eq("quote_id", q.id)
            .maybeSingle();
          if (existingError) throw existingError;
          if (existing) continue;

          const client = q as unknown as QuoteClientColumns;
          const to = await recipientFor(q.id, client);
          if (!to) continue;
          eligible += 1;
          if (dryRun) continue;

          const prof = profById.get(s.user_id);
          // Ledger-first: claim the quote_id (unique) BEFORE sending. If the
          // run dies after a send, the old send-then-record order re-emailed
          // the customer on the next run. A failed claim (incl. a concurrent
          // run's conflict) means someone else owns it — skip.
          const { error: claimErr } = await admin
            .from("review_requests")
            .insert({ user_id: s.user_id, quote_id: q.id, channel: "email" });
          if (claimErr?.code === "23505") continue;
          if (claimErr) throw claimErr;
          const result = await sendReviewRequestEmail({
            to,
            clientName: client.client_name?.trim() || "there",
            businessName: prof?.business_name || "your tradie",
            reviewUrl: s.google_review_url,
            replyTo: replyToFor(prof?.email),
          });
          if (!result.ok) {
            counters.failed += 1;
            counters.errors.push({ quote_id: q.id, kind: "review", error: result.error });
            // Release the claim so the next run can retry the send.
            await admin.from("review_requests").delete().eq("quote_id", q.id);
            continue;
          }
          counters.reviews_sent += 1;
        }
      }
    }

    // ── Follow-ups: sent/viewed quotes >2 days old, not yet accepted ──────────
    // Never for a deleted quote or one past its expiry: its "Review & accept"
    // link would only reach "not found" or "expired".
    if (followupsOn) {
      const twoDaysAgo = new Date(now - 2 * DAY_MS).toISOString();
      const nowIso = new Date(now).toISOString();
      for (const s of settings) {
        if (!s.auto_followup_enabled) continue;
        const { data: quotes, error: quotesError } = await admin
          .from("quotes")
          .select(`id, client_id, sent_at, public_token, total_amount, currency, created_at, expires_at, ${QUOTE_CLIENT_COLUMNS}`)
          .eq("user_id", s.user_id)
          .in("status", ["sent", "viewed"])
          .is("deleted_at", null)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .not("client_id", "is", null)
          .not("public_token", "is", null)
          .lte("sent_at", twoDaysAgo);

        if (quotesError) throw quotesError;
        for (const q of quotes ?? []) {
          if (!q.sent_at) continue;
          // Belt and braces for the filter above.
          if (q.expires_at && Date.parse(q.expires_at) <= now) continue;
          const days = Math.floor((now - Date.parse(q.sent_at)) / DAY_MS);
          const step = days >= 5 ? 2 : 1;

          const { data: existing, error: existingError } = await admin
            .from("quote_followups")
            .select("id")
            .eq("quote_id", q.id)
            .eq("step", step)
            .maybeSingle();
          if (existingError) throw existingError;
          if (existing) continue;

          const client = q as unknown as QuoteClientColumns;
          const to = await recipientFor(q.id, client);
          if (!to) continue;
          eligible += 1;
          if (dryRun) continue;

          const prof = profById.get(s.user_id);
          const currency = q.currency ?? prof?.currency ?? "NZD";
          // Ledger-first claim, same as review requests above.
          const { error: claimErr } = await admin
            .from("quote_followups")
            .insert({ user_id: s.user_id, quote_id: q.id, step, channel: "email" });
          if (claimErr?.code === "23505") continue;
          if (claimErr) throw claimErr;
          const result = await sendFollowupEmail({
            to,
            clientName: client.client_name?.trim() || "there",
            businessName: prof?.business_name || "your tradie",
            quoteNumber: quoteNumber(q.id, q.created_at),
            total: formatCurrency(Number(q.total_amount ?? 0), currency),
            acceptUrl: `${appUrl}/quote/${q.public_token}`,
            step,
            replyTo: replyToFor(prof?.email),
          });
          if (!result.ok) {
            counters.failed += 1;
            counters.errors.push({ quote_id: q.id, kind: "followup", error: result.error });
            await admin
              .from("quote_followups")
              .delete()
              .eq("quote_id", q.id)
              .eq("step", step);
            continue;
          }
          counters.followups_sent += 1;
        }
      }
    }

    return NextResponse.json({ ok: counters.failed === 0, dryRun, eligible, now: new Date(now).toISOString(), ...counters }, { status: counters.failed ? 502 : 200 });
  } catch (err) {
    console.error("[cron/engagement] run failed", err);
    captureError(err, { route: "/api/cron/engagement" });
    return NextResponse.json(
      { error: "cron_run_failed", message: err instanceof Error ? err.message : String(err), ...counters },
      { status: 500 },
    );
  }
}
