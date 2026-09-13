import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConsentGate } from "@/lib/ai-consent";
import { canWrite, getSubscriptionStatus } from "@/lib/subscription";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";
import { resolveLocalLlmConfig } from "@/lib/llm/local-chat";
import { resolveQuoteTextProvider } from "@/lib/llm/quote-text-provider";
import { generateQuoteForUser } from "@/lib/quote-generation/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The self-hosted Qwen model is CPU-only and this route also performs a
// transcript-summary call after the main quote. Keep the platform declaration
// honest even though the current systemd deployment does not enforce it.
export const maxDuration = 1800;
// The live llama.cpp service is capped at 2,048 generated tokens. Asking for
// more cannot increase the output and makes truncation expectations misleading.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Guideline 5.1.2(i) — no transcript/prompt goes to AI without
  // recorded consent (iOS shell only; web unaffected).
  const consentGate = await aiConsentGate(supabase, user.id);
  if (consentGate) return consentGate;

  // Per-user daily cap — cheap circuit-breaker on quote-generation spend.
  const quota = consumeDailyQuota(`generate:${user.id}`, 150);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

  // Defence-in-depth gate. The /app/quotes/new page already redirects
  // expired-trial users to /app/upgrade, but a determined client could
  // POST here directly with an existing quote id and slip through the
  // page redirect. Refusing at the API layer closes the gap.
  const sub = await getSubscriptionStatus({
    userId: user.id,
    signedUpAt: new Date(user.created_at ?? Date.now()),
    email: user.email,
  });
  if (!canWrite(sub)) {
    return NextResponse.json(
      {
        error: "trial_expired",
        message:
          "Your free trial has ended. Subscribe to keep generating new quotes.",
        upgrade_url: "/app/upgrade",
      },
      { status: 402 },
    );
  }

  const textProvider = resolveQuoteTextProvider();
  try {
    if (!textProvider) throw new Error("no quote text provider configured");
    if (textProvider === "local") resolveLocalLlmConfig();
  } catch {
    return NextResponse.json(
      { error: "Quote generation is not configured." },
      { status: 503 },
    );
  }

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json({ error: "Missing 'id' field" }, { status: 400 });
  }

  const result = await generateQuoteForUser({
    db: supabase,
    userId: user.id,
    quoteId: id,
    textProvider,
  });
  if (!result.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
