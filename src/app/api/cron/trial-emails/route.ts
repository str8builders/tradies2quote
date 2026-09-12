import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { adminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getSubscriptionStatus } from "@/lib/subscription";
import { isStripeConfigured } from "@/lib/stripe-client";
import {
  EMAIL_KINDS,
  firstNameFromEmail,
  kindForUser,
  renderEmail,
  requiresZeroSentQuotes,
  sendTrialEmail,
  trialEndsLabel,
  type EmailKind,
} from "@/lib/trial-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel cron jobs are cancelled at 60s on Hobby. Sending 5 transactional
// emails per user is fast — Resend single-call latency is sub-second — but
// the auth.users scan + the per-user inserts can grow with the user base.
// 60s is the Hobby ceiling; on Pro we'd push this higher.
export const maxDuration = 60;

type Counters = {
  scanned: number;
  windowed: number;
  alreadySent: number;
  hasSentQuote: number;
  sent: number;
  failed: number;
  errors: { user_id: string; kind: EmailKind; error: string }[];
};

export async function POST(request: NextRequest) {
  return handle(request);
}

// Vercel Cron sends GET. Accept both so the same endpoint can be poked
// manually with curl + POST for testing.
export async function GET(request: NextRequest) {
  return handle(request);
}

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

  // Never warn that access ends while billing is deliberately disabled.
  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: true, skipped: "billing_not_configured" });
  }
  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";

  // Wrap the whole run in try/catch — Vercel Cron retries on 500, and
  // partial progress (counters) is preserved across the catch so the
  // log line always tells us what actually got sent before the error.
  try {
  const admin = adminClient();
  const now = new Date();
  const counters: Counters = {
    scanned: 0,
    windowed: 0,
    alreadySent: 0,
    hasSentQuote: 0,
    sent: 0,
    failed: 0,
    errors: [],
  };

  // Only consider users who have crossed the 24h threshold (the earliest
  // kind opens at 24h) and are within ~30 days of signup (anything older
  // either got every kind already — dedup will skip — or is a long-since
  // churned user we don't want to keep paging through).
  const maxAgeHours = 30 * 24;
  const minAgeHours = 24;
  const minCreatedAt = new Date(now.getTime() - maxAgeHours * 60 * 60 * 1000);
  const maxCreatedAt = new Date(now.getTime() - minAgeHours * 60 * 60 * 1000);

  // admin.auth.admin.listUsers() returns paginated auth users. 1000 per
  // page is the Supabase max. The user base for a tradie MVP will fit
  // in one page for a long time; we still loop for safety.
  let page = 1;
  const pageSize = 1000;
  // Page through all users: an old signup may have a restarted trial.
  // Never infer trial dates or page ordering from auth signup timestamps.
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: pageSize,
    });
    if (error) {
      console.error("listUsers failed", error);
      captureError(error, { route: "/api/cron/trial-emails" });
      return NextResponse.json(
        { error: "list_users_failed", message: error.message },
        { status: 500 },
      );
    }
    if (!data.users.length) break;

    for (const user of data.users) {
      counters.scanned += 1;
      const createdAt = user.created_at
        ? new Date(user.created_at)
        : null;
      if (!createdAt || !user.email) continue;
      const subscription = await getSubscriptionStatus({
        userId: user.id, signedUpAt: createdAt, email: user.email,
      });
      if (subscription.state === "paid") continue;
      const trialAnchor = new Date(subscription.trialEndsAt.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (trialAnchor < minCreatedAt || trialAnchor > maxCreatedAt) continue;
      const kind = kindForUser(trialAnchor, now);
      if (!kind) continue;
      counters.windowed += 1;

      // Dedup — has this user already received this kind?
      const { data: existing, error: dedupErr } = await admin
        .from("lifecycle_emails")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", kind)
        .maybeSingle();
      if (dedupErr) {
        counters.failed += 1;
        counters.errors.push({ user_id: user.id, kind, error: dedupErr.message });
        continue;
      }
      if (existing) {
        counters.alreadySent += 1;
        continue;
      }

      // Onboarding kinds skip users who've already sent a quote.
      if (requiresZeroSentQuotes(kind)) {
        const { count, error: countErr } = await admin
          .from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .in("status", ["sent", "viewed", "accepted", "scheduled", "in_progress", "completed"]);
        if (countErr) {
          counters.failed += 1;
          counters.errors.push({ user_id: user.id, kind, error: countErr.message });
          continue;
        }
        if ((count ?? 0) > 0) {
          counters.hasSentQuote += 1;
          // Record a dedup row anyway so we don't re-check this user
          // every hour for the rest of the window — they've graduated
          // past needing the nudge.
          if (!dryRun) {
            const { error } = await admin.from("lifecycle_emails")
              .insert({ user_id: user.id, kind, provider_message_id: null });
            if (error && error.code !== "23505") throw error;
          }
          continue;
        }
      }

      if (dryRun) continue;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tradies2quote.com";
      const rendered = renderEmail(kind, {
        firstName: firstNameFromEmail(user.email),
        appUrl,
        videoUrl: process.env.TRIAL_QUICKSTART_VIDEO_URL || undefined,
        calendlyUrl: process.env.TRIAL_CALENDLY_URL || undefined,
        trialEndsLabel: trialEndsLabel(trialAnchor),
      });

      const result = await sendTrialEmail({ to: user.email, rendered,
        idempotencyKey: `trial/${user.id}/${kind}/${trialAnchor.toISOString()}` });
      if (!result.ok) {
        counters.failed += 1;
        counters.errors.push({ user_id: user.id, kind, error: result.error });
        continue;
      }

      // Record successful delivery. The provider key protects near-term
      // retries; a recording failure must surface to the operator.
      const { error: insErr } = await admin
        .from("lifecycle_emails")
        .insert({
          user_id: user.id,
          kind,
          provider_message_id: result.messageId,
        });
      if (insErr) {
        counters.failed += 1;
        console.warn("lifecycle_emails recording failed", {
          user_id: user.id,
          kind,
          error: insErr.message,
        });
      }
      counters.sent += 1;
    }

    if (data.users.length < pageSize) break;
    page += 1;
  }

  return NextResponse.json({
    ok: counters.failed === 0,
    dryRun,
    now: now.toISOString(),
    kinds: EMAIL_KINDS,
    ...counters,
  }, { status: counters.failed ? 502 : 200 });
  } catch (err) {
    console.error("[cron/trial-emails] run failed", err);
    captureError(err, { route: "/api/cron/trial-emails" });
    return NextResponse.json(
      {
        error: "cron_run_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
