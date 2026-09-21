import { aiConsentGate } from "@/lib/ai-consent";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canWrite, getSubscriptionStatus } from "@/lib/subscription";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";
import { extractSheet } from "@/lib/planreader/extract";
import { isSheetType, isSupportedSheetType } from "@/lib/planreader/schema";
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
 * POST /api/plans/extract   body: { file_id }
 *
 * Phase 2. Runs OCR + title-block + scale + dimension extraction for the
 * SUPPORTED, classification-passed sheets of a file, then enforces the gates.
 *
 * HARD RULE (enforced here, structurally): a sheet only reaches the extractor
 * when its sheet_type is a supported type (deck/floor_plan/foundation) AND it
 * did not fail the classification gate. unknown / unsupported / low-confidence
 * sheets are SKIPPED — never extracted, never fed to a calculator.
 *
 * Per-sheet status after extraction:
 *   - blocked       → a HARD gate failed (e.g. no dimensions at all).
 *   - needs_review  → a soft gate failed (scale/ocr/etc.).
 *   - extracted     → all active gates passed.
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

  const quota = consumeDailyQuota(`plans-extract:${user.id}`, 120);
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
      { error: "Plan extraction is not configured. Set ANTHROPIC_API_KEY." },
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

  const { data: file, error: fileErr } = await supabase
    .from("plan_files")
    .select("id, original_filename")
    .eq("id", fileId)
    .maybeSingle();
  if (fileErr) return NextResponse.json({ error: fileErr.message }, { status: 500 });
  if (!file) return NextResponse.json({ error: "Plan file not found." }, { status: 404 });

  const { data: sheets, error: sheetsErr } = await supabase
    .from("plan_sheets")
    .select("id, sheet_number, image_path, sheet_type, review_required")
    .eq("file_id", fileId)
    .order("sheet_number", { ascending: true });
  if (sheetsErr) return NextResponse.json({ error: sheetsErr.message }, { status: 500 });
  if (!sheets || sheets.length === 0) {
    return NextResponse.json({ error: "No sheets found." }, { status: 409 });
  }

  const storage = supabase.storage.from(PLAN_BUCKET);
  const out: Array<{
    sheet_id: string;
    sheet_number: number;
    action: "extracted" | "skipped";
    status?: string;
    review_required?: boolean;
    reasons?: string[];
    skip_reason?: string;
  }> = [];
  const logs: PlanSheetLog[] = [];

  for (const sheet of sheets) {
    const sheetType = isSheetType(sheet.sheet_type) ? sheet.sheet_type : "unknown";

    // HARD RULE: skip anything not supported or not classification-passed.
    if (!isSupportedSheetType(sheetType)) {
      const skip_reason =
        sheetType === "unknown"
          ? "unknown sheet type — never extracted"
          : `unsupported sheet type "${sheetType}" — no extractor`;
      out.push({
        sheet_id: sheet.id,
        sheet_number: sheet.sheet_number,
        action: "skipped",
        skip_reason,
      });
      const log: PlanSheetLog = {
        phase: "extract",
        file_id: fileId,
        sheet_id: sheet.id,
        sheet_number: sheet.sheet_number,
        sheet_type: sheetType,
        final_status: "skipped",
        errors: [skip_reason],
      };
      logPlanSheet(log);
      logs.push(log);
      continue;
    }
    if (sheet.review_required) {
      const skip_reason = "failed classification gate — resolve review before extracting";
      out.push({
        sheet_id: sheet.id,
        sheet_number: sheet.sheet_number,
        action: "skipped",
        skip_reason,
      });
      const log: PlanSheetLog = {
        phase: "extract",
        file_id: fileId,
        sheet_id: sheet.id,
        sheet_number: sheet.sheet_number,
        sheet_type: sheetType,
        final_status: "skipped",
        errors: [skip_reason],
      };
      logPlanSheet(log);
      logs.push(log);
      continue;
    }

    const dl = await storage.download(sheet.image_path);
    if (dl.error || !dl.data) {
      await supabase
        .from("plan_sheets")
        .update({ status: "needs_review", review_required: true, review_reasons: ["page image unavailable"] })
        .eq("id", sheet.id);
      out.push({
        sheet_id: sheet.id,
        sheet_number: sheet.sheet_number,
        action: "skipped",
        skip_reason: "page image unavailable",
      });
      const log: PlanSheetLog = {
        phase: "extract",
        file_id: fileId,
        sheet_id: sheet.id,
        sheet_number: sheet.sheet_number,
        sheet_type: sheetType,
        final_status: "needs_review",
        review_required: true,
        errors: ["page image unavailable"],
      };
      logPlanSheet(log);
      logs.push(log);
      continue;
    }

    const buf = Buffer.from(await dl.data.arrayBuffer());
    const { extracted, enforcement } = await extractSheet({
      apiKey,
      imageBase64: buf.toString("base64"),
      mediaType: dl.data.type || "image/png",
      sheetType,
      filename: file.original_filename,
    });

    const status = enforcement.blocked
      ? "blocked"
      : enforcement.review_required
        ? "needs_review"
        : "extracted";

    const { error: updErr } = await supabase
      .from("plan_sheets")
      .update({
        extraction: extracted as unknown as Record<string, unknown>,
        review_required: enforcement.review_required,
        review_reasons: enforcement.reasons,
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
      action: "extracted",
      status,
      review_required: enforcement.review_required,
      reasons: enforcement.reasons,
    });

    const log: PlanSheetLog = {
      phase: "extract",
      file_id: fileId,
      sheet_id: sheet.id,
      sheet_number: sheet.sheet_number,
      sheet_type: sheetType,
      gates: gateSummary(enforcement.results),
      final_status: status,
      review_required: enforcement.review_required,
      errors: extracted.warnings,
    };
    logPlanSheet(log);
    logs.push(log);
  }

  summarizePlanRun(fileId, "extract", logs);
  await supabase.from("plan_files").update({ status: "extracted" }).eq("id", fileId);

  return NextResponse.json({ file_id: fileId, sheets: out }, { status: 200 });
}
