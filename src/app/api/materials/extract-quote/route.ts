import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { aiConsentGate } from "@/lib/ai-consent";
import { canWrite, getSubscriptionStatus } from "@/lib/subscription";
import { isOwnerEmail } from "@/lib/owner";
import { trialEndedResponse } from "@/lib/trial-ended-response";
import { MAX_PDF_UPLOAD_BYTES, MAX_SCAN_UPLOAD_BYTES, isPdfFile } from "@/lib/imageUpload";
import { aiModel } from "@/lib/ai/models";
import { trackAgentRun, usageSummary } from "@/lib/agent-monitor/track";
import {
  READ_DEADLINE_MS,
  prepareSupplierUpload,
  readSupplierDocument,
  type SupplierDocMode,
} from "@/lib/materials/supplierDocReader";

/**
 * POST /api/materials/extract-quote
 *
 * Body: multipart/form-data with a `file` (or the older `image`) field: a
 * photo of a NZ building-merchant quote / invoice / price list, or a PDF of
 * one (up to 10 MB and 20 pages). `mode=price_list` reads a price list (no
 * totals); anything else reads a quote. Returns the extracted lines for the
 * tradie to REVIEW before anything is written to their library:
 *
 *   200 { supplier, currency, gst_inclusive, items[], subtotal, discount?,
 *         freight?, adjustments?, gst, total, notes[], extraction_status … }
 *   400 bad/missing file · 401 unauth · 402 new quotes paused (trial ended)
 *   403 AI consent required (iOS app) · 413 too big · 415 wrong type
 *   422 nothing readable · 429 daily limit · 502/503/504 upstream
 *
 * Each item carries the line total printed on the quote as
 * `source_line_total`. A photo is re-encoded (EXIF/GPS dropped) before it is
 * sent to the model; a PDF is sent whole as a document.
 *
 * The AI only extracts (src/lib/materials/supplierDocReader.ts, which the
 * golden eval calls too). The write happens later via the
 * `importSupplierQuoteItems` / `importMaterials` server actions, after the
 * human confirms.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vision over a dense quote can take 20-40 s. The reader works to a deadline
// 85 s after the request arrives and only starts a second pass when it can
// finish (READ_DEADLINE_MS / MIN_RETRY_MS).
export const maxDuration = 90;

/** Monitor name for /app/agents/monitor. */
const SUPPLIER_QUOTE_AGENT_NAME = "Supplier Quote Reader";

// Daily AI cap per user — same in-memory pattern as /api/suppliers/extract.
// Cheap (no DB write), per-instance, owner-bypassed for dogfooding.
const DAILY_LIMIT = 20;
const usageBuckets = new Map<string, { count: number; resetAt: number }>();

function checkAndCountUsage(
  userId: string,
): { ok: true } | { ok: false; resetAt: number } {
  const now = Date.now();
  const utcMidnight = new Date();
  utcMidnight.setUTCHours(24, 0, 0, 0);
  const resetAt = utcMidnight.getTime();

  const bucket = usageBuckets.get(userId);
  if (!bucket || bucket.resetAt <= now) {
    usageBuckets.set(userId, { count: 1, resetAt });
    return { ok: true };
  }
  if (bucket.count >= DAILY_LIMIT) {
    return { ok: false, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { ok: true };
}

export async function POST(request: NextRequest) {
  // Every answer is due inside maxDuration; the reader works to this.
  const deadlineAt = Date.now() + READ_DEADLINE_MS;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Guideline 5.1.2(i) — no supplier document goes to Anthropic without
  // recorded consent (iOS shell only; web unaffected).
  const consentGate = await aiConsentGate(supabase, user.id);
  if (consentGate) return consentGate;

  const sub = await getSubscriptionStatus({
    userId: user.id,
    signedUpAt: new Date(user.created_at ?? Date.now()),
    email: user.email,
  });
  if (!canWrite(sub)) {
    // Website: this sentence and the plans link. iPhone app: only "New quotes
    // are paused on this account." (App Store 3.1.3(f)).
    return trialEndedResponse("Your free trial has ended. Subscribe to keep scanning supplier quotes.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Quote scanning is not configured. Set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  if (!isOwnerEmail(user.email)) {
    const limit = checkAndCountUsage(user.id);
    if (!limit.ok) {
      const hoursUntilReset = Math.max(
        1,
        Math.ceil((limit.resetAt - Date.now()) / (60 * 60 * 1000)),
      );
      return NextResponse.json(
        {
          error: `Daily AI limit reached. Resets in about ${hoursUntilReset}h. Add materials manually until then, or get in touch if this seems wrong.`,
          resetAt: new Date(limit.resetAt).toISOString(),
        },
        { status: 429 },
      );
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a 'file' field." },
      { status: 400 },
    );
  }

  const upload = form.get("file") ?? form.get("image");
  const mode: SupplierDocMode = form.get("mode") === "price_list" ? "price_list" : "quote";
  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field." }, { status: 400 });
  }
  if (upload.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  const namedPdf = isPdfFile(upload);
  const sizeLimit = namedPdf ? MAX_PDF_UPLOAD_BYTES : MAX_SCAN_UPLOAD_BYTES;
  if (upload.size > sizeLimit) {
    return NextResponse.json(
      {
        error: namedPdf
          ? `PDF exceeds ${MAX_PDF_UPLOAD_BYTES / 1024 / 1024} MB. Split it into smaller files and scan each one.`
          : `Image exceeds ${Math.floor(MAX_SCAN_UPLOAD_BYTES / 1024 / 1024)} MB limit.`,
      },
      { status: 413 },
    );
  }

  // A PDF is checked (readable, unlocked, ≤ 20 pages) and sent whole; a
  // photo is re-encoded so camera metadata never reaches the AI provider.
  const prepared = await prepareSupplierUpload(new Uint8Array(await upload.arrayBuffer()), upload);
  if (!prepared.ok) {
    if (prepared.cause) captureError(prepared.cause, { route: "materials/extract-quote" });
    return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  }
  const doc = prepared.doc;

  // The model id lives in src/lib/ai/models.ts with every other one.
  const model = aiModel("supplierQuote");
  const what = mode === "price_list" ? "price list" : "quote";
  const run = trackAgentRun(SUPPLIER_QUOTE_AGENT_NAME, {
    runIdPrefix: "squote",
    userId: user.id,
    startMessage: `Reading a supplier ${what} (${model}, ${doc.kind === "pdf" ? `PDF, ${doc.pages} page(s)` : "photo"})`,
  });

  const result = await readSupplierDocument({ apiKey, doc, mode, deadlineAt, model });
  if (!result.ok) {
    captureError(result.cause, { route: "materials/extract-quote" });
    await run.fail(result.cause, result.label);
    return NextResponse.json(result.body, { status: result.status });
  }

  // 422 only for a truly unusable read (no usable items at all).
  if (result.value.items.length === 0) {
    await run.succeed(`No product lines · ${usageSummary(result.usage, result.attempts)}`);
    return NextResponse.json(
      {
        error:
          doc.kind === "pdf"
            ? `No ${mode === "price_list" ? "prices" : "product lines"} found in that PDF. If it's a scan, check the pages are clear and the right way up.`
            : `No ${mode === "price_list" ? "prices" : "product lines"} found. Make sure the whole page is in frame and in focus.`,
      },
      { status: 422 },
    );
  }

  console.log("[extract-quote] ok", {
    userId: user.id,
    mode,
    kind: doc.kind,
    supplier: result.value.supplier,
    items: result.value.items.length,
    status: result.status,
    rowFailures: result.rowFailures.length,
    attempts: result.attempts,
  });

  await run.succeed(
    `${result.value.items.length} line(s), ${result.status} · ${usageSummary(result.usage, result.attempts)}`,
  );
  // 200 even when needs_review/blocked so the tradie SEES the partial read
  // + exactly why; createQuoteFromScan's reconciliation still gates create.
  return NextResponse.json({
    ...result.value,
    extraction_status: result.status,
    extraction_reasons: result.reasons,
    row_failures: result.rowFailures,
    warnings: result.warnings,
    // Ops layer — how many model calls ran, so the review queue can show a
    // retry rate. Purely informational.
    attempts: result.attempts,
  });
}
