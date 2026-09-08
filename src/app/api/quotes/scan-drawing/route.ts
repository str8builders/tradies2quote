import { ANTHROPIC_URL, MAX_TOKENS, JOB_TYPES, MODEL, buildSystemPrompt, sanitisePlan, geometryPreamble, type AnthropicResponse, type ScanPayload } from "@/lib/scan-drawing";
import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { aiConsentGate } from "@/lib/ai-consent";
import { canWrite, getSubscriptionStatus } from "@/lib/subscription";
import { resolveDocumentType } from "@/lib/scanClassify";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";
import {
  MAX_SCAN_UPLOAD_BYTES,
  detectImageMime,
  isPreparedScanMime,
  sniffPreparedImageMime,
} from "@/lib/imageUpload";
import { parseModelJsonObject } from "@/lib/modelJson";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/fetchTimeout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Opus on a detailed image can take 20-40s. Vercel's default function
// timeout is 10s on Hobby, 60s on Pro — bump to 60 so we don't 502
// while Anthropic is still thinking. Clamped to the plan's max by
// Vercel.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Guideline 5.1.2(i) — no plan/site image goes to Anthropic vision without
  // recorded consent (iOS shell only; web unaffected).
  const consentGate = await aiConsentGate(supabase, user.id);
  if (consentGate) return consentGate;

  // Per-user daily cap — cheap circuit-breaker on drawing-scan (vision) spend.
  const quota = consumeDailyQuota(`scan-drawing:${user.id}`, 60);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

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
          "Your free trial has ended. Subscribe to keep scanning drawings.",
        upgrade_url: "/app/upgrade",
      },
      { status: 402 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Drawing scan is not configured. Set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with an 'image' field." },
      { status: 400 },
    );
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'image' file field." },
      { status: 400 },
    );
  }
  if (image.size === 0) {
    return NextResponse.json({ error: "Image file is empty." }, { status: 400 });
  }
  if (image.size > MAX_SCAN_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `Image exceeds ${Math.floor(MAX_SCAN_UPLOAD_BYTES / 1024 / 1024)} MB limit.`,
      },
      { status: 413 },
    );
  }
  const mime = detectImageMime(image);
  if (mime && !isPreparedScanMime(mime)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${image.type || image.name || "unknown"}.` },
      { status: 415 },
    );
  }

  const hintRaw = form.get("hint");
  const hint =
    typeof hintRaw === "string" && hintRaw.trim().length > 0
      ? hintRaw.trim().slice(0, 500)
      : null;

  // Optional hint only — the drawing is the source of truth for the
  // structure type. A missing/invalid value is fine; the AI classifies
  // the structure from the image and returns `detectedType`.
  const jobTypeRaw = form.get("jobType");
  const jobTypeHint =
    typeof jobTypeRaw === "string" && JOB_TYPES.has(jobTypeRaw)
      ? jobTypeRaw
      : null;

  const timberLengthRaw = form.get("timberLength");
  let timberLength = 6;
  if (typeof timberLengthRaw === "string") {
    const parsed = Number.parseFloat(timberLengthRaw);
    if (Number.isFinite(parsed) && parsed >= 2.4 && parsed <= 7.2) {
      timberLength = Math.round(parsed * 10) / 10;
    }
  }

  const arrayBuf = await image.arrayBuffer();
  const mediaType = sniffPreparedImageMime(new Uint8Array(arrayBuf));
  if (!mediaType) {
    return NextResponse.json(
      { error: "Unsupported or unreadable image file." },
      { status: 415 },
    );
  }
  const base64 = Buffer.from(arrayBuf).toString("base64");

  const userTextParts: string[] = [];
  userTextParts.push(
    jobTypeHint
      ? `The user suggested this may be a "${jobTypeHint}" job — treat that as a hint only and identify the real structure from the drawing. Tradie buys timber in ${timberLength}m lengths and wants a 10% waste factor.`
      : `No job type was given — identify the structure entirely from the drawing. Tradie buys timber in ${timberLength}m lengths and wants a 10% waste factor.`,
  );
  if (hint) {
    userTextParts.push(`Tradie note about this drawing: ${hint}`);
  }
  userTextParts.push(
    "Read every annotation on this hand-drawn plan and return the JSON described in the system prompt.",
  );

  const systemPrompt = buildSystemPrompt(jobTypeHint, timberLength);

  let claudeRes: Response;
  try {
    claudeRes = await fetchWithTimeout(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // `temperature` is deprecated on Opus 4.7 — the model uses
        // adaptive thinking instead of a temperature knob. The
        // structured system prompt + JSON prefill below are doing
        // the determinism work that temperature=0 used to do.
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: base64,
                  },
              },
              { type: "text", text: userTextParts.join("\n\n") },
            ],
          },
          // Note: pre Wave-42 there was a `{ role: "assistant",
          // content: "{" }` prefill here to force JSON output.
          // Opus 4.7's adaptive thinking is incompatible with
          // assistant-turn prefills, so we rely on the system
          // prompt's "Output STRICT JSON only" instruction instead.
        ],
      }),
    }, TIMEOUTS.llm);
  } catch (err) {
    captureError(err, { route: "quotes/scan-drawing" });
    console.error("scan-drawing fetch failed", err);
    return NextResponse.json(
      { error: "Network error contacting drawing model. Please try again." },
      { status: 502 },
    );
  }

  if (!claudeRes.ok) {
    const detail = await claudeRes.text().catch(() => "");
    // Status FIRST so even a 30-char-truncated log surface still
    // tells us what Anthropic returned. Format: "ANTHROPIC_<status>
    // <model> <first-bit-of-error-body>". Full JSON follows on the
    // next line for log tools that ingest everything.
    console.error(
      `ANTHROPIC_${claudeRes.status} ${MODEL} ${detail.slice(0, 120).replace(/\s+/g, " ")}`,
    );
    console.error(
      JSON.stringify({
        tag: "scan-drawing.anthropic_error",
        model: MODEL,
        status: claudeRes.status,
        statusText: claudeRes.statusText,
        detail: detail.slice(0, 2000),
      }),
    );
    return NextResponse.json(
      {
        error: "Drawing scan failed. Please try again.",
        // Surface the Anthropic status to the client so the on-screen
        // error is more useful than "try again" — e.g. a 404 likely
        // means the model id is wrong, 429 means rate limited.
        upstream_status: claudeRes.status,
      },
      { status: 502 },
    );
  }

  let payload: AnthropicResponse;
  try {
    payload = (await claudeRes.json()) as AnthropicResponse;
  } catch {
    console.error("scan-drawing returned non-JSON 200 body");
    return NextResponse.json(
      { error: "Drawing scan failed. Please try again." },
      { status: 502 },
    );
  }

  if (payload.stop_reason === "max_tokens") {
    return NextResponse.json(
      {
        error:
          "Drawing was too detailed to scan in one go. Try a tighter crop, or split it across two scans.",
      },
      { status: 502 },
    );
  }

  const text = payload.content?.find((c) => c.type === "text")?.text ?? "";

  let parsed: ScanPayload;
  try {
    parsed = parseModelJsonObject<ScanPayload>(text);
  } catch (e) {
    captureError(e, { route: "quotes/scan-drawing" });
    console.error(
      "scan-drawing failed to parse JSON",
      e,
      "raw (first 400):",
      text.slice(0, 400),
    );
    return NextResponse.json(
      { error: "Drawing scan response was malformed. Please try again." },
      { status: 502 },
    );
  }

  const dimensions = (parsed.dimensions ?? "").trim();
  const structural = (parsed.structural ?? "").trim();
  const notes = (parsed.notes ?? "").trim();
  const legacyTranscript = (parsed.transcript ?? "").trim();

  if (!dimensions && !structural && !legacyTranscript) {
    return NextResponse.json(
      { error: "Couldn't read anything off that drawing. Try a clearer photo." },
      { status: 422 },
    );
  }

  const plan = sanitisePlan(parsed.plan);
  // Prepend deterministic geometry for composite/primitive shapes so the
  // downstream takeoff uses the true area/perimeter, not a bounding box.
  const preamble = geometryPreamble(plan);
  const baseDimensions = dimensions || legacyTranscript;
  const finalDimensions = preamble
    ? `${preamble}\n${baseDimensions}`.trim()
    : baseDimensions;

  // The structure type the AI read off the DRAWING drives everything
  // downstream (the calculator marker, the "Job type:" line). The user's
  // hint is only a fallback if the AI didn't return a valid classification.
  const detectedType =
    typeof parsed.detectedType === "string" && JOB_TYPES.has(parsed.detectedType)
      ? parsed.detectedType
      : (jobTypeHint ?? "Other");

  return NextResponse.json({
    document_type: resolveDocumentType(
      parsed.document_type,
      [dimensions, structural, notes, legacyTranscript].join("\n"),
    ),
    detectedType,
    buildType:
      typeof parsed.buildType === "string" ? parsed.buildType.trim() : "",
    summary:
      typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    dimensions: finalDimensions,
    structural,
    notes,
    plan,
    jobTypeHint,
    timberLength,
  });
}
