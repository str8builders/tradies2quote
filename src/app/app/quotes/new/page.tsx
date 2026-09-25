import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { canWrite, getCachedSubscriptionStatus } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";
import { isNativeShellRequest } from "@/lib/native-shell";
import { hasAiConsent } from "@/lib/ai-consent";
import { isNewLookOn } from "@/lib/ui/newLook";
import { AppHeader } from "../../_components/AppHeader";
import { QuoteInputTabs } from "./_components/QuoteInputTabs";
import { NewQuoteFlow } from "./_v2/NewQuoteFlow";

export const metadata: Metadata = {
  title: "New quote",
};

/** Plain words for the errors `createDraftQuote` redirects back with. */
const NEW_QUOTE_ERRORS: Record<string, string> = {
  "missing-transcript":
    "Tell us about the job first. Say it, type it or scan a plan, then tap Continue.",
  "draft-failed":
    "We couldn't start that quote. Check your internet connection and try again.",
};

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; start?: string | string[] }>;
}) {
  const { error: rawError, start: rawStart } = await searchParams;
  const start = (Array.isArray(rawStart) ? rawStart[0] : rawStart) === "talk" ? "talk" : null;
  const errorKey = Array.isArray(rawError) ? rawError[0] : rawError;
  const errorMessage = errorKey ? NEW_QUOTE_ERRORS[errorKey] : undefined;
  const { user } = await getCachedAuthUser();

  if (!user) {
    redirect("/login");
  }

  // Trial-expired users land on the upgrade page instead of the
  // recorder. They can still view + send existing quotes (those pages
  // don't gate), so this is the single chokepoint that enforces the
  // read-only contract my trial-end emails promised.
  const sub = await getCachedSubscriptionStatus(
    user.id,
    user.created_at ?? null,
    user.email,
  );
  if (!canWrite(sub)) {
    redirect("/app/upgrade?from=new-quote");
  }

  // Guideline 5.1.2(i) — inside the iOS shell, require explicit AI-processing
  // consent before the first voice/scan/generate action. Web is unaffected.
  const [nativeShell, consented, newLook] = await Promise.all([
    isNativeShellRequest(),
    (async () => hasAiConsent(await createClient(), user.id))(),
    isNewLookOn(),
  ]);
  const needsAiConsent = nativeShell && !consented;

  // Only offer input channels whose provider is actually configured —
  // voice needs OpenAI transcription, scan needs Anthropic vision. Typed
  // input always works.
  const voiceEnabled = Boolean(process.env.OPENAI_API_KEY?.trim());
  const scanEnabled = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  // Redesign (new look, behind the switch): the same gates and inputs above,
  // new screens in ./_v2. Switched off, everything below is unchanged.
  if (newLook) {
    return (
      <>
        <AppHeader context="New quote" />
        <NewQuoteFlow
          errorKey={errorKey}
          start={start}
          needsAiConsent={needsAiConsent}
          voiceEnabled={voiceEnabled}
          scanEnabled={scanEnabled}
        />
      </>
    );
  }

  const intro = [
    voiceEnabled ? "Talk it through" : null,
    "type it out",
    scanEnabled ? "or scan a hand-drawn plan" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-screen text-white">
      <AppHeader context="New quote" />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="t2q-page-intro mb-8">
          <div className="t2q-section-label-pro mb-3">{"// step 1 of 3"}</div>
          <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
            Describe the <span className="text-brand">job.</span>
          </h1>
          <p className="mt-3 text-sm text-ink-300 sm:text-base">
            {intro.charAt(0).toUpperCase() + intro.slice(1)} — either way we
            turn it into a quote.
          </p>
        </div>

        {errorMessage ? (
          <div
            role="alert"
            data-testid="new-quote-error"
            className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-base text-red-200"
          >
            {errorMessage}
          </div>
        ) : null}

        <QuoteInputTabs
          needsAiConsent={needsAiConsent}
          voiceEnabled={voiceEnabled}
          scanEnabled={scanEnabled}
        />
      </main>
    </div>
  );
}
