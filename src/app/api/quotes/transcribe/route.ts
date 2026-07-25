import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { aiConsentGate } from "@/lib/ai-consent";
import { loadUserVocab } from "@/lib/transcript/vocab";
import {
  buildAsrPrompt,
  STATIC_TRADE_VOCAB_PROMPT,
} from "@/lib/transcript/asrHints";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";
import { canWrite, getSubscriptionStatus } from "@/lib/subscription";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/fetchTimeout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPTED_PREFIX = "audio/";
const TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";
// gpt-4o-transcribe is OpenAI's current speech model — notably better
// than the legacy whisper-1 on accents and job-site noise. Same
// endpoint + params, so it's a drop-in. Kept as a constant so it's one
// line to A/B or revert once the eval set exists.
const TRANSCRIBE_MODEL = "gpt-4o-transcribe";
// Vocabulary bias is passed as the model's `prompt` so it leans toward NZ
// trade terms / brands over their English soundalikes ("jib" -> GIB). It's
// now built PER USER + job-relevant (their own materials/suppliers first) by
// buildAsrPrompt(), capped under the API's ~224-token window, with the curated
// static list as the floor. See src/lib/transcript/asrHints.ts. This fixes
// mishears at the source; the transcript cleanup glossary pass catches the rest.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Guideline 5.1.2(i) — no audio leaves the device to OpenAI/Anthropic
  // without recorded consent (iOS shell only; web unaffected).
  const consentGate = await aiConsentGate(supabase, user.id);
  if (consentGate) return consentGate;

  // Per-user daily cap — cheap circuit-breaker on transcription spend.
  const quota = consumeDailyQuota(`transcribe:${user.id}`, 150);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

  // Same plan gate as /api/quotes/generate — an expired trial shouldn't
  // keep spending Whisper money even though the result would be unusable.
  const sub = await getSubscriptionStatus({
    userId: user.id,
    signedUpAt: new Date(user.created_at ?? Date.now()),
    email: user.email,
  });
  if (!canWrite(sub)) {
    return NextResponse.json(
      {
        error: "trial_expired",
        message: "Your free trial has ended. Subscribe to keep creating quotes.",
        upgrade_url: "/app/upgrade",
      },
      { status: 402 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Transcription is not configured. Set OPENAI_API_KEY." },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with an 'audio' field." },
      { status: 400 },
    );
  }

  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'audio' file field." },
      { status: 400 },
    );
  }
  if (audio.size === 0) {
    return NextResponse.json({ error: "Audio file is empty." }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Audio file exceeds ${Math.floor(MAX_BYTES / 1024 / 1024)} MB limit.` },
      { status: 413 },
    );
  }
  if (audio.type && !audio.type.startsWith(ACCEPTED_PREFIX)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${audio.type}` },
      { status: 415 },
    );
  }

  // Build a per-user, job-relevant vocabulary prompt (their own materials +
  // suppliers first), falling back to the curated static list. Latency-
  // sensitive path, so skip the recent-quotes scan. Never throws.
  let asrPrompt = STATIC_TRADE_VOCAB_PROMPT;
  try {
    const vocab = await loadUserVocab(supabase, user.id, {
      includeRecentQuotes: false,
    });
    asrPrompt = buildAsrPrompt(vocab);
  } catch (e) {
    captureError(e, { route: "quotes/transcribe" });
    console.warn("[transcribe] vocab prompt build failed; using static", e);
  }

  const upstream = new FormData();
  upstream.append("file", audio, audio.name || "recording.webm");
  upstream.append("model", TRANSCRIBE_MODEL);
  upstream.append("response_format", "json");
  // Bias the model toward this tradie's NZ trade vocabulary at transcription time.
  upstream.append("prompt", asrPrompt);
  // Default to English — every target country (NZ/AU/UK/US/CA) is
  // English-speaking, so this stops the model wasting effort (or
  // mis-guessing) on language detection. A caller can still override.
  const languageRaw = form.get("language");
  const language =
    typeof languageRaw === "string" && languageRaw.trim().length > 0
      ? languageRaw.trim()
      : "en";
  upstream.append("language", language);

  // One retry on a transient upstream error (5xx / 429) — re-recording
  // on a job site is painful, and these blips usually clear instantly.
  // A 4xx won't fix itself, so it's returned straight away.
  let transcribeRes: Response | null = null;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      transcribeRes = await fetchWithTimeout(TRANSCRIBE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: upstream,
      }, TIMEOUTS.transcribe);
      if (transcribeRes.ok) break;
      if (
        attempt === 1 &&
        (transcribeRes.status >= 500 || transcribeRes.status === 429)
      ) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      break;
    }
  } catch (e) {
    // Timeout or network failure — the recording is still on the client,
    // so a clean retryable error beats an opaque platform 500.
    console.error("Transcription upstream failure", e);
    captureError(e, { route: "/api/quotes/transcribe" });
    return NextResponse.json(
      { error: "Transcription took too long. Please try again." },
      { status: 504 },
    );
  }

  if (!transcribeRes || !transcribeRes.ok) {
    const detail = transcribeRes
      ? await transcribeRes.text().catch(() => "")
      : "no response";
    console.error("Transcription error", transcribeRes?.status, detail);
    return NextResponse.json(
      { error: "Transcription failed. Please try again." },
      { status: 502 },
    );
  }

  let payload: { text?: string };
  try {
    payload = (await transcribeRes.json()) as { text?: string };
  } catch {
    // 200 OK but a non-JSON body (proxy/CDN error page, truncated
    // stream). Treat it as an upstream failure, not a 500.
    console.error("Transcription returned a non-JSON 200 body");
    return NextResponse.json(
      { error: "Transcription failed. Please try again." },
      { status: 502 },
    );
  }
  const transcript = (payload.text ?? "").trim();
  if (!transcript) {
    return NextResponse.json(
      { error: "Could not detect any speech in the recording." },
      { status: 422 },
    );
  }

  return NextResponse.json({ transcript });
}
