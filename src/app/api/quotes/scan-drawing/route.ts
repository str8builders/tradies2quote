import { MAX_TOKENS, JOB_TYPES, MODEL, buildSystemPrompt, sanitisePlan, geometryPreamble, type ScanPayload } from "@/lib/scan-drawing";
import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { aiConsentGate } from "@/lib/ai-consent";
import { prepareImageForAi, UnreadableImageError } from "@/lib/aiImage";
import { callAnthropic, type AnthropicCallResult } from "@/lib/ai/anthropic";
import { describeAiError, isAiError } from "@/lib/ai/errors";
import { trackAgentRun, usageSummary } from "@/lib/agent-monitor/track";
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
import { TIMEOUTS } from "@/lib/fetchTimeout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A 4,096-token Opus read of a dense drawing can run well past 50 s, and a
// 429/5xx/529 is retried by the shared AI client inside its time budget — so
// each attempt may use the full generation ceiling (TIMEOUTS.generation).
// Self-hosted (Sydney VPS), so this is a ceiling for platforms that enforce
// it, not a kill timer.
export const maxDuration = 300;

/** Monitor name for /app/agents/monitor. */
export const DRAWING_SCAN_AGENT_NAME = "Drawing Scan";

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
  if (!sniffPreparedImageMime(new Uint8Array(arrayBuf))) {
    return NextResponse.json(
      { error: "Unsupported or unreadable image file." },
      { status: 415 },
    );
  }
  // Re-encode so no camera metadata (EXIF/GPS) reaches the AI provider.
  let prepared: Awaited<ReturnType<typeof prepareImageForAi>>;
  try {
    prepared = await prepareImageForAi(new Uint8Array(arrayBuf));
  } catch (e) {
    if (!(e instanceof UnreadableImageError)) captureError(e, { route: "quotes/scan-drawing" });
    return NextResponse.json(
      { error: "Unsupported or unreadable image file." },
      { status: 415 },
    );
  }
  const mediaType = prepared.mediaType;
  const base64 = prepared.data.toString("base64");

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

  const run = trackAgentRun(DRAWING_SCAN_AGENT_NAME, {
    runIdPrefix: "dscan",
    userId: user.id,
    startMessage: `Reading a drawing (${MODEL})`,
  });

  let reply: AnthropicCallResult;
  try {
    // The shared AI client times each attempt out and retries 429/5xx/529
    // and network errors with backoff inside its budget; failures come back
    // as typed AiErrors.
    reply = await callAnthropic({
      apiKey,
      body: {
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
      },
      timeoutMs: TIMEOUTS.generation,
      onTruncated: "return",
    });
  } catch (err) {
    // Status FIRST so even a truncated log line still says what the
    // provider returned; the detail stays server-side.
    console.error(`scan-drawing ${MODEL} failed: ${describeAiError(err)}`);
    captureError(err, { route: "quotes/scan-drawing" });
    await run.fail(err);
    if (isAiError(err) && err.status !== null) {
      return NextResponse.json(
        {
          error: "Drawing scan failed. Please try again.",
          // The provider's status only (never its body) so the on-screen
          // error can say more than "try again" — 429 means rate limited.
          upstream_status: err.status,
        },
        { status: 502 },
      );
    }
    if (isAiError(err) && err.kind === "timeout") {
      return NextResponse.json(
        { error: "The drawing scan took too long. Please try again." },
        { status: 504 },
      );
    }
    if (isAiError(err) && err.kind === "refused") {
      return NextResponse.json(
        { error: "That image couldn't be scanned. Try a photo of the drawing only." },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: "Network error contacting drawing model. Please try again." },
      { status: 502 },
    );
  }

  if (reply.truncated) {
    await run.fail(new Error("reply hit max_tokens"), "Truncated");
    return NextResponse.json(
      {
        error:
          "Drawing was too detailed to scan in one go. Try a tighter crop, or split it across two scans.",
      },
      { status: 502 },
    );
  }

  const text = reply.text;

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
    await run.fail(e, "Unparseable reply");
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
    await run.succeed(`Nothing readable · ${usageSummary(reply.usage, reply.attempts)}`);
    return NextResponse.json(
      { error: "Couldn't read anything off that drawing. Try a clearer photo." },
      { status: 422 },
    );
  }

  // The wall-run totals are re-added in code from the segments listed in
  // the dimensions text (the model's own arithmetic isn't trusted).
  const plan = sanitisePlan(parsed.plan, { dimensionsText: dimensions || legacyTranscript });
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

  await run.succeed(`Scanned · ${usageSummary(reply.usage, reply.attempts)}`);
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
