import { aiConsentGate } from "@/lib/ai-consent";
import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
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
import { fetchWithTimeout, TIMEOUTS } from "@/lib/fetchTimeout";

/**
 * POST /api/materials/extract-quote
 *
 * Body: multipart/form-data with an `image` file (a photo of a NZ
 * building-merchant quote / invoice). Returns the extracted line items
 * for the tradie to REVIEW before anything is written to their library:
 *
 *   200 { supplier, currency, gst_inclusive, items[], notes[] }
 *   400 bad/missing image · 401 unauth · 402 trial expired
 *   413 too big · 415 wrong type · 429 daily limit · 502/503 upstream
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

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
// A quote can list 30-40 lines; each JSON row is ~40 tokens. 8192 keeps
// headroom so a long quote doesn't truncate mid-array.
const MAX_TOKENS = 8192;

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

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
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
- Use NZ trade vocabulary.`;

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

  const images = form.getAll("image");
  if (images.length < 1 || images.length > 8 || images.some(image => !(image instanceof File))) {
    return NextResponse.json({ error: "Choose one to eight image pages from the same supplier document." }, { status: 400 });
  }
  const pages = images as File[];
  if (pages.reduce((sum, image) => sum + image.size, 0) > MAX_SCAN_UPLOAD_BYTES) return NextResponse.json({ error: "The document is too large." }, { status: 413 });
  const content: Array<{ type: "image"; source: { type: "base64"; media_type: string; data: string } }> = [];
  for (const image of pages) {
    if (image.size === 0) return NextResponse.json({ error: "Image file is empty." }, { status: 400 });
    const mime = detectImageMime(image);
    if (mime && !isPreparedScanMime(mime)) return NextResponse.json({ error: "Unsupported image type." }, { status: 415 });
    const bytes = new Uint8Array(await image.arrayBuffer());
    const mediaType = sniffPreparedImageMime(bytes);
    if (!mediaType) return NextResponse.json({ error: "Unsupported or unreadable image file." }, { status: 415 });
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: Buffer.from(bytes).toString("base64") } });
  }

  type RouteAttempt = {
    value: SupplierQuoteExtraction;
    rowFailures: RowFailure[];
    warnings: string[];
  };
  type AttemptResult =
    | { kind: "attempt"; attempt: RouteAttempt }
    | { kind: "error"; status: number; body: Record<string, unknown> };

  // One AI extraction pass. `priorReasons` (non-empty on a retry) is fed
  // back to the model so it re-reads the rows it got wrong.
  async function runExtraction(priorReasons: string[]): Promise<AttemptResult> {
    const retryNote =
      priorReasons.length > 0
        ? `\n\nYour previous read had problems: ${priorReasons.join("; ")}. Re-read EVERY row carefully, capture the EXACT printed numbers (never guess or skip a line), and include the printed subtotal, GST and total.`
        : "";
    let res: Response;
    try {
      res = await fetchWithTimeout(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        // Sonnet 5 rejects non-default `temperature` with a 400 — omit it.
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                ...content,
                {
                  type: "text",
                  text: `Read every product line across all ${pages.length} pages of this ONE supplier quote. Do not count carried-forward subtotals as product lines. Return the JSON described in the system prompt.${retryNote}`,
                },
              ],
            },
          ],
        }),
      }, TIMEOUTS.extraction);
    } catch (err) {
      captureError(err, { route: "materials/extract-quote" });
      console.error("extract-quote fetch failed", err);
      return {
        kind: "error",
        status: 502,
        body: { error: "Network error contacting the scan model. Please try again." },
      };
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `ANTHROPIC_${res.status} ${MODEL} ${detail.slice(0, 120).replace(/\s+/g, " ")}`,
      );
      return {
        kind: "error",
        status: 502,
        body: { error: "Quote scan failed. Please try again.", upstream_status: res.status },
      };
    }
    let payload: AnthropicResponse;
    try {
      payload = (await res.json()) as AnthropicResponse;
    } catch {
      return { kind: "error", status: 502, body: { error: "Quote scan failed. Please try again." } };
    }
    if (payload.stop_reason === "max_tokens") {
      return {
        kind: "error",
        status: 502,
        body: {
          error:
            "That quote had too many lines to read in one go. Try photographing it in two halves.",
        },
      };
    }
    const text = payload.content?.find((c) => c.type === "text")?.text ?? "";
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
      };
    }
    const parsed = parseSupplierQuoteExtraction(raw);
    if (!parsed.ok) {
      return {
        kind: "error",
        status: 502,
        body: { error: "Couldn't read that quote. Try a sharper, flatter photo." },
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
