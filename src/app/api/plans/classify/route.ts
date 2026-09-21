import { aiConsentGate } from "@/lib/ai-consent";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canWrite, getSubscriptionStatus } from "@/lib/subscription";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";
import {
  classifyFromText,
  classifyFromVision,
  combineClassification,
} from "@/lib/planreader/classify";
import { classificationGate } from "@/lib/planreader/gates";
import { isSheetType, type SheetClassification } from "@/lib/planreader/schema";
import { PLAN_BUCKET } from "@/lib/planreader/storage";
import { planReaderAllowed } from "@/lib/planreader/flag";
import {
  gateSummary,
  logPlanSheet,
  summarizePlanRun,
  type PlanSheetLog,
} from "@/lib/planreader/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/plans/classify   body: { file_id }
 *
 * Phase 1. Classifies every page of an already-ingested file into a SheetType
 * + confidence, using filename hints + the vision model. Persists the result
 * and enforces the CLASSIFICATION gate (the only gate active in Phase 1):
 *
 *   - sheet_type "unknown" OR confidence < threshold  → review_required = true,
 *     status = "needs_review". Hard rule: such a sheet NEVER reaches an
 *     extractor downstream.
 *   - recognized but unsupported (elevation/section/schedule) → classified,
 *     with an advisory reason that no takeoff extractor exists for it.
 *   - supported + confident → status = "classified".
 *
 * No gate averaging: the classification gate alone decides review_required
 * here; the remaining five gates run in later phases on their own signals.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const consentGate = await aiConsentGate(supabase, user.id);
  if (consentGate) return consentGate;

  if (!planReaderAllowed(user.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const quota = consumeDailyQuota(`plans-classify:${user.id}`, 120);
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
        message: "Your free trial has ended. Subscribe to keep reading plans.",
        upgrade_url: "/app/upgrade",
      },
      { status: 402 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Plan classification is not configured. Set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const fileId = (body as { file_id?: unknown })?.file_id;
  if (typeof fileId !== "string" || !fileId) {
    return NextResponse.json({ error: "Missing 'file_id'." }, { status: 400 });
  }

  // RLS scopes this to the owner; a non-owner / missing id yields no row.
  const { data: file, error: fileErr } = await supabase
    .from("plan_files")
    .select("id, original_filename")
    .eq("id", fileId)
    .maybeSingle();
  if (fileErr) {
    return NextResponse.json({ error: fileErr.message }, { status: 500 });
  }
  if (!file) {
    return NextResponse.json({ error: "Plan file not found." }, { status: 404 });
  }

  const { data: sheets, error: sheetsErr } = await supabase
    .from("plan_sheets")
    .select("id, sheet_number, image_path")
    .eq("file_id", fileId)
    .order("sheet_number", { ascending: true });
  if (sheetsErr) {
    return NextResponse.json({ error: sheetsErr.message }, { status: 500 });
  }
  if (!sheets || sheets.length === 0) {
    return NextResponse.json({ error: "No sheets to classify." }, { status: 409 });
  }

  const storage = supabase.storage.from(PLAN_BUCKET);
  const out: Array<{
    sheet_id: string;
    sheet_number: number;
    sheet_type: string;
    confidence: number;
    review_required: boolean;
    review_reasons: string[];
    status: string;
  }> = [];
  const logs: PlanSheetLog[] = [];

  for (const sheet of sheets) {
    // Title-block OCR text is a Phase-2 signal; Phase 1 classifies from the
    // filename heuristic + the vision model only.
    const textVerdict = classifyFromText({ filename: file.original_filename });

    let vision: SheetClassification | null = null;
    let imageMissing = false;
    const dl = await storage.download(sheet.image_path);
    if (dl.error || !dl.data) {
      // Image not uploaded yet / unreadable → cannot vision-classify. We do
      // NOT guess: fall back to text only and force review.
      imageMissing = true;
    } else {
      const buf = Buffer.from(await dl.data.arrayBuffer());
      vision = await classifyFromVision({
        apiKey,
        imageBase64: buf.toString("base64"),
        mediaType: dl.data.type || "image/png",
      });
    }

    const verdict = combineClassification(textVerdict, vision);
    const gate = classificationGate(verdict);

    const review_required = !gate.pass || imageMissing;
    const review_reasons: string[] = [];
    if (gate.reason) review_reasons.push(gate.reason);
    if (imageMissing) review_reasons.push("page image unavailable");

    const sheet_type = isSheetType(verdict.sheet_type) ? verdict.sheet_type : "unknown";
    const status = review_required ? "needs_review" : "classified";

    const { error: updErr } = await supabase
      .from("plan_sheets")
      .update({
        sheet_type,
        classification_confidence: verdict.confidence,
        classification_basis: verdict.basis,
        review_required,
        review_reasons,
        status,
      })
      .eq("id", sheet.id);
    if (updErr) {
      return NextResponse.json(
        { error: `failed to persist sheet ${sheet.sheet_number}: ${updErr.message}` },
        { status: 500 },
      );
    }

    out.push({
      sheet_id: sheet.id,
      sheet_number: sheet.sheet_number,
      sheet_type,
      confidence: verdict.confidence,
      review_required,
      review_reasons,
      status,
    });

    const log: PlanSheetLog = {
      phase: "classify",
      file_id: fileId,
      sheet_id: sheet.id,
      sheet_number: sheet.sheet_number,
      sheet_type,
      classification_confidence: verdict.confidence,
      gates: gateSummary([gate]),
      final_status: status,
      review_required,
      errors: imageMissing ? ["page image unavailable"] : [],
    };
    logPlanSheet(log);
    logs.push(log);
  }

  summarizePlanRun(fileId, "classify", logs);
  await supabase.from("plan_files").update({ status: "classified" }).eq("id", fileId);

  return NextResponse.json({ file_id: fileId, sheets: out }, { status: 200 });
}
