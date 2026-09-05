import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConsentGate } from "@/lib/ai-consent";
import { canWrite, getSubscriptionStatus } from "@/lib/subscription";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";
import { cleanTranscript } from "@/lib/transcriptCleanup";
import { loadUserVocab } from "@/lib/transcript/vocab";
import {
  buildClarificationsWithOptions,
  type Clarification,
} from "@/lib/clarifications";

/**
 * /api/quotes/cleanup — runs the transcript cleanup pass in isolation.
 *
 * Wave 36 — the cleanup work used to live inline inside
 * /api/quotes/generate (regex pass + LLM summary). The new modal flow
 * on the new-quote page needs it as a standalone step: cleanup runs
 * FIRST, surfaces clarification questions WITH options, the tradie
 * answers them in a modal, and only THEN does /api/quotes/generate
 * fire with the enriched transcript. This route is the seam.
 *
 * Contract:
 *   POST { transcript: string }
 *   200  {
 *     cleanedTranscript: string,
 *     questions: [{ id, question, why, options[] }],
 *     summary: TranscriptSummary | null
 *   }
 *
 * Auth-gated (proxy.ts + getUser() here as defense-in-depth). Never
 * mutates the database — pure compute. The cleaned data is returned
 * to the client which uses it to drive the modal; the eventual call
 * to /api/quotes/generate re-runs cleanup over the answer-enriched
 * transcript so the persisted quote_data.transcript reflects the
 * final resolved state.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The CPU-only local model can take several minutes for a summary.
export const maxDuration = 1800;

type CleanupRequest = {
  transcript?: unknown;
};

type CleanupResponse = {
  cleanedTranscript: string;
  questions: Clarification[];
  summary: Awaited<ReturnType<typeof cleanTranscript>>["summary"];
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Guideline 5.1.2(i) — cleanup runs an LLM pass over the transcript, so it
  // needs recorded consent too (iOS shell only; web unaffected). The client
  // falls back to direct submission on a non-200, so this never hard-blocks.
  const consentGate = await aiConsentGate(supabase, user.id);
  if (consentGate) return consentGate;

  // Same spend gates as /api/quotes/generate — cleanup runs an LLM pass,
  // so cap it per user and refuse expired trials. The client falls back
  // to direct submission on any non-200, so this never blocks a quote.
  const quota = consumeDailyQuota(`cleanup:${user.id}`, 150);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);
  const sub = await getSubscriptionStatus({
    userId: user.id,
    signedUpAt: new Date(user.created_at ?? Date.now()),
    email: user.email,
  });
  if (!canWrite(sub)) {
    return NextResponse.json({ error: "trial_expired" }, { status: 402 });
  }

  let body: CleanupRequest;
  try {
    body = (await request.json()) as CleanupRequest;
  } catch {
    return NextResponse.json(
      { error: "Expected JSON body with a 'transcript' string." },
      { status: 400 },
    );
  }

  const transcript =
    typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (!transcript) {
    return NextResponse.json(
      { error: "Missing 'transcript' field." },
      { status: 400 },
    );
  }
  if (transcript.length > 10_000) {
    return NextResponse.json(
      { error: "Transcript exceeds 10,000 characters." },
      { status: 413 },
    );
  }

  // Load the caller's controlled vocabulary (global glossary + their own
  // materials / suppliers / Tradie Brain terms / recent quote lines) so the
  // cleanup glossary pass can fix domain-term spellings. Never throws.
  const vocab = await loadUserVocab(supabase, user.id, {
    includeRecentQuotes: true,
  });

  // Cleanup never throws — it has built-in fallbacks for the local-model
  // summary call. If local text AI is unavailable it just returns
  // null for `summary` and the questions list is whatever the
  // deterministic regex + glossary pass produced.
  const cleaned = await cleanTranscript(transcript, {
    vocab,
  });

  // Merge the regex-pass clarifications with the LLM summary's
  // assumptions / missing info / compliance risks, then attach
  // hardcoded option sets where the question shape lets us
  // recognise a known pattern (gib/batts/battens). Everything else
  // gets an empty options array — the modal renders those as a free
  // text input.
  const questions = buildClarificationsWithOptions({
    regexQuestions: cleaned.clarificationQuestions,
    summary: cleaned.summary,
  });

  const response: CleanupResponse = {
    cleanedTranscript: cleaned.cleanedTranscript,
    questions,
    summary: cleaned.summary,
  };
  return NextResponse.json(response);
}
