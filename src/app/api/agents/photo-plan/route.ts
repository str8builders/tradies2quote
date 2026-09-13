import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_IMAGE_BYTES,
  PHOTO_PLAN_AGENT_NAME,
  runPhotoPlanAgent,
} from "@/lib/agents/photo-plan";
import {
  detectImageMime,
  isPreparedScanMime,
  sniffPreparedImageMime,
} from "@/lib/imageUpload";
import {
  flushAgentRun,
  logAgentRunFinish,
  newRunId,
} from "@/lib/agent-monitor/logger";
import { canWrite, getSubscriptionStatus } from "@/lib/subscription";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vision call on an up-to-8MB image can take 20-40s; default function timeout
// would 502 mid-flow. This route is reachable by every tradie (PhotoPlanPanel).
export const maxDuration = 60;

/**
 * POST /api/agents/photo-plan
 *
 * Body: multipart/form-data with:
 *   • image: File (image/jpeg | image/png | image/webp | image/gif)
 *   • hint:  optional string the tradie typed alongside
 *
 * Returns: { description, items, reviewFlags, quoteNote }
 *
 * Auth gated. Never writes to the database. Image bytes are forwarded
 * to OpenAI Vision in-memory and discarded after the response.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Same spend gates as /api/quotes/generate — this route forwards images
  // to OpenAI Vision, so an expired trial or a scripted loop costs money.
  const quota = consumeDailyQuota(`photo-plan:${user.id}`, 100);
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
        message: "Your free trial has ended. Subscribe to keep using photo analysis.",
        upgrade_url: "/app/upgrade",
      },
      { status: 402 },
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data with an 'image' field." },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Could not read form data." },
      { status: 400 },
    );
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'image' file field." },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Image is empty." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      {
        error: `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`,
      },
      { status: 413 },
    );
  }
  const mediaType = detectImageMime(file);
  if (mediaType && !isPreparedScanMime(mediaType)) {
    return NextResponse.json(
      {
        error: `Unsupported image type: ${file.type || file.name || "unknown"}.`,
      },
      { status: 415 },
    );
  }

  const hintRaw = form.get("hint");
  const hint = typeof hintRaw === "string" ? hintRaw : null;

  // Convert the image to base64 in-memory. Buffer is more efficient
  // than the regular btoa() path for binary data and is available in
  // the Node runtime.
  const arrayBuf = await file.arrayBuffer();
  const sniffedMediaType = sniffPreparedImageMime(new Uint8Array(arrayBuf));
  if (!sniffedMediaType) {
    return NextResponse.json(
      { error: "Unsupported or unreadable image file." },
      { status: 415 },
    );
  }
  const imageBase64 = Buffer.from(arrayBuf).toString("base64");

  // ONE run id for the whole invocation: the shared runtime owns the
  // run.start/run.finish pair, so the route only closes the row when the
  // agent throws before the runtime opened it (a no-op update otherwise).
  const runId = newRunId("photo");
  const startedAt = Date.now();

  try {
    const result = await runPhotoPlanAgent(
      {
        imageBase64,
        mimeType: sniffedMediaType,
        hint,
      },
      { runId },
    );
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    captureError(err, { route: "/api/agents/photo-plan" });
    logAgentRunFinish({
      agentName: PHOTO_PLAN_AGENT_NAME,
      runId,
      stepName: "run.finish",
      status: "failed",
      message,
      durationMs: Date.now() - startedAt,
    });
    await flushAgentRun(runId);
    const isConfig = /not configured/i.test(message);
    return NextResponse.json(
      { error: message },
      { status: isConfig ? 503 : 502 },
    );
  }
}
