import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Versioned, account-wide consent for the disclosed AI processors.
 * All authenticated AI entry points use this gate, on web and native.
 * Provider or purpose changes require a new version and affirmative consent.
 */

import { AI_CONSENT_VERSION } from "./ai-disclosure";
export { AI_CONSENT_VERSION } from "./ai-disclosure";

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

/** Return a 403 before any AI processing when current consent is absent. */
export async function aiConsentGate(
  supabase: SupabaseClient,
  userId: string,
): Promise<NextResponse | null> {
  // Account consent is required on every authenticated surface. A native
  // caller cannot bypass this by removing or changing a User-Agent marker.
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
