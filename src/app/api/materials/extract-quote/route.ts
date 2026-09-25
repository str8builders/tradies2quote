import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { aiConsentGate } from "@/lib/ai-consent";
import { prepareImageForAi, UnreadableImageError } from "@/lib/aiImage";
import { canWrite, getSubscriptionStatus } from "@/lib/subscription";
import { isOwnerEmail } from "@/lib/owner";
import {
  assessExtraction,
  chooseBestExtraction,
  parseSupplierQuoteExtraction,
  type RowFailure,
  type SupplierQuoteExtraction,
} from "@/lib/materials/quoteExtraction";
import {
  MAX_SCAN_UPLOAD_BYTES,
  detectImageMime,
  isPreparedScanMime,
  sniffPreparedImageMime,
} from "@/lib/imageUpload";
import { parseModelJsonObject } from "@/lib/modelJson";
import { TIMEOUTS } from "@/lib/fetchTimeout";
import { aiModel } from "@/lib/ai/models";
import { callAnthropic, type AiUsage, addUsage, ZERO_USAGE } from "@/lib/ai/anthropic";
import { describeAiError, isAiError } from "@/lib/ai/errors";
import { trackAgentRun, usageSummary } from "@/lib/agent-monitor/track";

/**
 * POST /api/materials/extract-quote
 *
 * Body: multipart/form-data with an `image` file (a photo of a NZ
 * building-merchant quote / invoice). Returns the extracted line items
 * for the tradie to REVIEW before anything is written to their library:
 *
 *   200 { supplier, currency, gst_inclusive, items[], notes[] }
 *   400 bad/missing image · 401 unauth · 402 trial expired
 *   403 AI consent required (iOS app) · 413 too big · 415 wrong type
 *   429 daily limit · 502/503 upstream
 *
 * Each item carries the line total printed on the quote as
 * `source_line_total`. The photo is re-encoded (EXIF/GPS dropped) before it
 * is sent to the model.
 *
 * The AI only extracts. The write happens later via the
 * `importSupplierQuoteItems` server action, after the human confirms.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vision over a dense quote photo can take 20-40s. Allow headroom for one
// retry when the first extraction is incomplete (#2). Plan-dependent — if
// the deploy caps at 60s the retry is time-budget-skipped (UI "Scan again").
export const maxDuration = 90;

/** Monitor name for /app/agents/monitor. */
const SUPPLIER_QUOTE_AGENT_NAME = "Supplier Quote Reader";
// A quote can list 30-40 lines; each JSON row is ~40 tokens. 8192 keeps
// headroom so a long quote doesn't truncate mid-array.
const MAX_TOKENS = 8192;
// Sonnet 5 thinks adaptively INSIDE max_tokens and inside the 80 s budget.
// Reading printed numbers off a photo is transcription, not reasoning — low
// effort keeps the thinking from eating the cap (truncated JSON on dense
// quotes) or the timeout. Same knob src/lib/agents/runtime.ts uses.
const EFFORT = "low";

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

const SYSTEM_PROMPT = `You read a photo of a NEW ZEALAND building-supplier quote, invoice or order (e.g. ITM, PlaceMakers, Mitre 10 Trade, Bunnings, Carters, Bunnings Trade). Extract each product line so the prices can go into a tradie's price library.

Return STRICT JSON only — no prose, no markdown, no code fences:
{
  "supplier": string | null,
  "quote_number": string | null,
  "currency": string | null,
  "gst_inclusive": boolean | null,
  "items": [
    {
      "name": string,
      "unit": string,
      "quantity": number | null,
      "pieces": number | null,
      "price": number | null,
      "line_total": number | null,
      "sku": string | null,
      "raw_text": string | null,
      "confidence": number
    }
  ],
  "subtotal": number | null,
  "gst": number | null,
  "total": number | null,
  "notes": string[]
}

Field rules:
- "supplier": the merchant's name if shown (e.g. "ITM"), else null.
- "quote_number": the quote / order / reference number as printed, else null.
- "currency": e.g. "NZD" if shown, else null.
- "gst_inclusive": true if the UNIT prices shown INCLUDE GST, false if they EXCLUDE GST, null if you can't tell. NZ trade quotes are usually GST-exclusive.
- "name": the product description as printed.
- "unit": each, m, m², m³, sheet, length, bag, box, kg, pair, roll … default "each".
- "quantity": the line quantity in the SAME unit as the unit price, so that quantity × price = the line total printed on the quote. null if not shown.
- "pieces": when the line shows an "N/length" breakdown (e.g. "19/4.8m" = 19 lengths), the piece count (19), else null.
- "price": the UNIT price (price for ONE unit), as a number, no "$" or commas. If the line only shows a quantity and a line total, divide total by quantity to get the unit price and LOWER the confidence. null if there is no usable price.
- "line_total": the line total EXACTLY as printed on that row (no "$"/commas). Capture what is printed — do NOT compute or correct it. null if no per-line total is shown. (This is the source value the app reconciles against; the app recomputes its own total separately.)
- "sku": the product/SKU/order code if printed, else null.
- "raw_text": the row's text as you read it (e.g. "19/4.8m H3.2 140x45 @ 12.40 = 235.60"), for review provenance. null if unsure.
- "confidence": 0..1 — your confidence in this row. Lower it when the text is unclear or you derived the unit price.
- "subtotal" / "gst" / "total": the document summary amounts EXACTLY as printed (no "$"/commas), else null. Capture them — do NOT compute or correct them.
- "notes": short strings for anything the tradie should double-check (smudged numbers, ambiguous units, lines you skipped).

Hard rules:
- Extract BOTH the unit price ("price") AND the printed line total ("line_total") for each row — capture them exactly, never compute or "fix" a printed number.
- Capture the printed summary amounts in "subtotal", "gst" and "total". Do NOT include subtotal/GST/total/rounding rows as product items in "items".
- Do NOT invent products or numbers. If you cannot read a value, use null and add a note — never guess.
- Keep a freight/delivery line as an item only if it's a real chargeable line.
- A discount or credit printed as its own row IS an item: give it a NEGATIVE "price" and "line_total" exactly as printed (e.g. -25.00). Never drop it or make it positive.
- If the same product is printed on two rows, return BOTH rows — never merge or de-duplicate lines.
- Use NZ trade vocabulary.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Guideline 5.1.2(i) — no supplier-quote photo goes to Anthropic without
  // recorded consent (iOS shell only; web unaffected).
  const consentGate = await aiConsentGate(supabase, user.id);
  if (consentGate) return consentGate;

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
          "Your free trial has ended. Subscribe to keep scanning supplier quotes.",
        upgrade_url: "/app/upgrade",
      },
      { status: 402 },
    );
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
      { error: `Image exceeds ${Math.floor(MAX_SCAN_UPLOAD_BYTES / 1024 / 1024)} MB limit.` },
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

  const arrayBuf = await image.arrayBuffer();
  if (!sniffPreparedImageMime(new Uint8Array(arrayBuf))) {
    return NextResponse.json(
      { error: "Unsupported or unreadable image file." },
      { status: 415 },
    );
  }
  // Never forward camera metadata (EXIF/GPS) to the AI provider.
  let prepared: Awaited<ReturnType<typeof prepareImageForAi>>;
  try {
    prepared = await prepareImageForAi(new Uint8Array(arrayBuf));
  } catch (e) {
    if (!(e instanceof UnreadableImageError)) captureError(e, { route: "materials/extract-quote" });
    return NextResponse.json(
      { error: "Unsupported or unreadable image file." },
      { status: 415 },
    );
  }
  const mediaType = prepared.mediaType;
  const base64 = prepared.data.toString("base64");

  type RouteAttempt = {
    value: SupplierQuoteExtraction;
    rowFailures: RowFailure[];
    warnings: string[];
  };
  type AttemptResult =
    | { kind: "attempt"; attempt: RouteAttempt }
    | {
        kind: "error";
        status: number;
        body: Record<string, unknown>;
        /** Server-side cause, for the monitor row. */
        cause: unknown;
        label?: string;
      };

  // The model id lives in src/lib/ai/models.ts with every other one.
  const model = aiModel("supplierQuote");
  const run = trackAgentRun(SUPPLIER_QUOTE_AGENT_NAME, {
    runIdPrefix: "squote",
    userId: user.id,
    startMessage: `Reading a supplier quote (${model})`,
  });
  let usage: AiUsage = { ...ZERO_USAGE };

  // One AI extraction pass. `priorReasons` (non-empty on a retry) is fed
  // back to the model so it re-reads the rows it got wrong.
  async function runExtraction(priorReasons: string[]): Promise<AttemptResult> {
    const retryNote =
      priorReasons.length > 0
        ? `\n\nYour previous read had problems: ${priorReasons.join("; ")}. Re-read EVERY row carefully, capture the EXACT printed numbers (never guess or skip a line), and include the printed subtotal, GST and total.`
        : "";
    let reply: Awaited<ReturnType<typeof callAnthropic>>;
    try {
      // Timeout, retries on 429/5xx/529 and network errors, and error
      // typing all come from the shared AI client.
      reply = await callAnthropic({
        apiKey,
        // Sonnet 5 rejects non-default `temperature` with a 400 — omit it.
        body: {
          model,
          max_tokens: MAX_TOKENS,
          output_config: { effort: EFFORT },
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: mediaType, data: base64 },
                },
                {
                  type: "text",
                  text: `Read every product line on this supplier quote and return the JSON described in the system prompt.${retryNote}`,
                },
              ],
            },
          ],
        },
        timeoutMs: TIMEOUTS.extraction,
        onTruncated: "return",
      });
    } catch (err) {
      captureError(err, { route: "materials/extract-quote" });
      console.error(`extract-quote ${model} failed: ${describeAiError(err)}`);
      if (isAiError(err) && err.kind === "timeout") {
        return {
          kind: "error",
          status: 504,
          body: { error: "Reading the quote took too long. Please try again." },
          cause: err,
        };
      }
      if (isAiError(err) && err.status !== null) {
        return {
          kind: "error",
          status: 502,
          body: { error: "Quote scan failed. Please try again.", upstream_status: err.status },
          cause: err,
        };
      }
      return {
        kind: "error",
        status: 502,
        body: { error: "Network error contacting the scan model. Please try again." },
        cause: err,
      };
    }
    usage = addUsage(usage, reply.usage);
    if (reply.truncated) {
      return {
        kind: "error",
        status: 502,
        body: {
          error:
            "That quote had too many lines to read in one go. Try photographing it in two halves.",
        },
        cause: new Error("reply hit max_tokens"),
        label: "Truncated",
      };
    }
    const text = reply.text;
    let raw: unknown;
    try {
      raw = parseModelJsonObject<unknown>(text);
    } catch (e) {
      captureError(e, { route: "materials/extract-quote" });
      console.error(
        "extract-quote failed to parse JSON",
        e,
        "raw (first 400):",
        text.slice(0, 400),
      );
      return {
        kind: "error",
        status: 502,
        body: { error: "Couldn't read that quote. Try a sharper, flatter photo." },
        cause: e,
        label: "Unparseable reply",
      };
    }
    const parsed = parseSupplierQuoteExtraction(raw);
    if (!parsed.ok) {
      return {
        kind: "error",
        status: 502,
        body: { error: "Couldn't read that quote. Try a sharper, flatter photo." },
        cause: new Error("extraction failed validation"),
        label: "Invalid reply",
      };
    }
    return {
      kind: "attempt",
      attempt: {
        value: parsed.value,
        rowFailures: parsed.rowFailures,
        warnings: parsed.warnings,
      },
    };
  }

  // Retry loop: re-run when the extraction isn't "ok", bounded by attempt
  // count AND a time budget so we never blow the function timeout.
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 40_000;
  const MAX_ATTEMPTS = 2;
  const attempts: RouteAttempt[] = [];
  let priorReasons: string[] = [];
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const r = await runExtraction(priorReasons);
    if (r.kind === "error") {
      // Hard failure on the first pass → surface it. On a retry → keep the
      // attempt(s) we already have.
      if (attempts.length === 0) {
        await run.fail(r.cause, r.label);
        return NextResponse.json(r.body, { status: r.status });
      }
      break;
    }
    attempts.push(r.attempt);
    const assessment = assessExtraction(r.attempt.value, r.attempt.rowFailures);
    if (assessment.status === "ok") break;
    priorReasons = assessment.reasons;
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
  }

  const best = chooseBestExtraction(attempts);
  const bestWarnings =
    attempts.find((a) => a.value === best.value)?.warnings ?? [];

  // 422 only for a truly unusable read (no usable items at all).
  if (best.value.items.length === 0) {
    await run.succeed(`No product lines · ${usageSummary(usage, attempts.length)}`);
    return NextResponse.json(
      {
        error:
          "No product lines found. Make sure the whole quote is in frame and in focus.",
      },
      { status: 422 },
    );
  }

  console.log("[extract-quote] ok", {
    userId: user.id,
    supplier: best.value.supplier,
    items: best.value.items.length,
    status: best.status,
    rowFailures: best.rowFailures.length,
    attempts: attempts.length,
  });

  await run.succeed(
    `${best.value.items.length} line(s), ${best.status} · ${usageSummary(usage, attempts.length)}`,
  );
  // 200 even when needs_review/blocked so the tradie SEES the partial read
  // + exactly why; createQuoteFromScan's reconciliation still gates create.
  return NextResponse.json({
    ...best.value,
    extraction_status: best.status,
    extraction_reasons: best.reasons,
    row_failures: best.rowFailures,
    warnings: bestWarnings,
    // Ops layer — surface how many passes ran so the review queue can show a
    // retry rate. Purely informational; the retry behaviour itself is unchanged.
    attempts: attempts.length,
  });
}
