import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isNativeShellRequest } from "@/lib/native-shell";

/**
 * Explicit consent for third-party AI processing (App Store Guideline 5.1.2(i)).
 *
 * The iOS app must get affirmative, informed consent before sending a tradie's
 * audio / photos / text to the configured AI processors. Text generation is
 * handled by the locally hosted Qwen model on this deployment; optional voice
 * or vision features may use a disclosed external provider when configured.
 * Consent is recorded on the
 * profile (`ai_consent_at` + `ai_consent_version`).
 *
 * SCOPE: enforcement is limited to the iOS App Store shell (detected via the
 * `T2QNativeShell` UA marker — see native-shell.ts). The existing web product,
 * governed by the privacy policy, is deliberately unchanged: gating every
 * existing web user's core flow behind a new consent wall is a product
 * decision, not a compliance one. Bump `AI_CONSENT_VERSION` to force re-consent
 * if the disclosure materially changes.
 */

export const AI_CONSENT_VERSION = "2026-08-local-qwen-v1";

/** True if the user has an on-record AI-processing consent. */
export async function hasAiConsent(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("ai_consent_at,ai_consent_version")
    .eq("id", userId)
    .maybeSingle();
  const profile = data as { ai_consent_at?: string | null; ai_consent_version?: string | null } | null;
  return Boolean(profile?.ai_consent_at && profile.ai_consent_version === AI_CONSENT_VERSION);
}

/**
 * Route guard for AI-egress endpoints (transcribe / scan-drawing / cleanup /
 * generate). Returns a 403 Response to short-circuit the handler when the
 * request is from the iOS shell AND the user hasn't consented; returns null
 * (proceed) for web requests or consented users. Call AFTER auth.
 *
 * This is the enforcement backstop — the client shows a consent modal first, so
 * a consented flow never reaches the 403.
 */
export async function aiConsentGate(
  supabase: SupabaseClient,
  userId: string,
): Promise<NextResponse | null> {
  // Web is unaffected — only the App Store binary requires the consent gate.
  if (!(await isNativeShellRequest())) return null;
  if (await hasAiConsent(supabase, userId)) return null;
  return NextResponse.json(
    {
      error: "ai_consent_required",
      message:
        "Turn on AI features to use voice, scan and quote generation. Open a new quote to review and enable it.",
    },
    { status: 403 },
  );
}
