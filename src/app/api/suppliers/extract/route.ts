import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { extractModelJsonObject } from "@/lib/modelJson";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/owner";

/**
 * POST /api/suppliers/extract
 *
 * Body: { url: string }
 *
 * Fetches the supplier product page HTML, hands a slice of it to Claude
 * and asks for the product name + price + unit. Returns:
 *   200 { product: { name, price, unit } | null, url, fetched: boolean }
 *   400 if the URL is missing or malformed
 *   401 if the user isn't signed in
 *   429 if the user is over their daily quota
 *   502 if the upstream Claude call fails
 *
 * The route never throws on supplier-side failures (CORS-equivalent on
 * the server, 4xx/5xx responses, timeouts, blocked HEAD/GET): it
 * surfaces `fetched: false` and `product: null` and lets the client
 * fall back to manual entry.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
// Sonnet 5's tokenizer emits ~30% more tokens than Sonnet 4 for the same
// content — 512 risked truncating mid-JSON, so give it headroom.
const MAX_TOKENS = 1024;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_CHARS = 60_000;

/**
 * Daily cap on extracts per authenticated user. Counted in-memory per
 * serverless instance — Vercel may spin up multiple instances so a
 * determined abuser could exceed this in aggregate, but it costs us
 * nothing (no DB write per call) and shuts down the obvious
 * scripted-loop case where one session hammers the endpoint from one
 * machine. A real abuser puts us into territory worth a proper
 * table-backed limiter; until then this catches 95% of the risk.
 *
 * Resets at UTC midnight to match the chat endpoint's convention so
 * both surfaces feel consistent to anyone debugging.
 */
const DAILY_LIMIT = 30;
const usageBuckets = new Map<
  string,
  { count: number; resetAt: number }
>();

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

type ExtractRequest = { url?: unknown };

type ExtractedProduct = {
  name: string;
  price: number;
  unit: string;
};

type ExtractResponse = {
  product: ExtractedProduct | null;
  url: string;
  fetched: boolean;
  reason?: string;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Owner bypass — lets the owner dogfood + stress-test without
  // tripping their own cap. Mirrors how /app/agents + /app/debug
  // are owner-gated via the same helper.
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Product extraction is not configured." },
      { status: 503 },
    );
  }

  let body: ExtractRequest;
  try {
    body = (await request.json()) as ExtractRequest;
  } catch {
    return NextResponse.json(
      { error: "Expected JSON body with a 'url' field." },
      { status: 400 },
    );
  }

  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing 'url'." }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return NextResponse.json(
      { error: "Only http(s) URLs are supported." },
      { status: 400 },
    );
  }

  // Fetch the page HTML. We never trust the URL — set a tight timeout
  // and a stock-looking User-Agent so suppliers don't return a 403
  // bot wall. Any failure here yields a structured `fetched: false`
  // response instead of a 5xx.
  let html = "";
  let fetched = false;
  let reason: string | undefined;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(parsedUrl.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-NZ,en;q=0.9",
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      reason = `Supplier responded with ${res.status}.`;
    } else {
      const text = await res.text();
      html = text.slice(0, MAX_HTML_CHARS);
      fetched = true;
    }
  } catch (e) {
    reason =
      e instanceof Error && e.name === "AbortError"
        ? "Supplier page took too long to load."
        : "Could not reach the supplier site.";
  }

  if (!fetched) {
    const payload: ExtractResponse = {
      product: null,
      url: parsedUrl.toString(),
      fetched: false,
      reason,
    };
    return NextResponse.json(payload);
  }

  // Strip script/style noise to give Claude a leaner page. Cheap regex
  // pass — leaves attribute text (alt, title, data-*) which often carry
  // the price on JS-rendered listings.
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, MAX_HTML_CHARS);

  const system = `You extract a single product from a supplier product page.
Return ONLY a JSON object — no prose, no markdown. Two valid shapes:
  { "name": "<product name>", "price": <number>, "unit": "<unit like each, m, m², sheet>" }
  null

Rules:
- Price must be the supplier's displayed price for ONE unit, as a number with no currency symbol. NZ supplier sites usually display GST-inclusive prices; return whatever the page shows and let the client decide.
- If the page is a category/listing rather than a single product, return null.
- If the price is missing, "POA", or "Add to cart for price", return null.
- Unit defaults to "each" when the page doesn't say otherwise. Common alternatives: m, m², m³, kg, sheet, pair, roll, box, bag, lot.
- Do not invent values. If unsure, return null.`;

  const userMsg = `URL: ${parsedUrl.toString()}\n\nPage HTML (truncated):\n${cleaned}`;

  let claudeRes: Response;
  try {
    claudeRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      // Sonnet 5 rejects non-default `temperature` with a 400 — omit it.
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
  } catch (e) {
    captureError(e, { route: "suppliers/extract" });
    console.error("Claude fetch failed", e);
    return NextResponse.json(
      { error: "Extraction service unreachable." },
      { status: 502 },
    );
  }

  if (!claudeRes.ok) {
    const detail = await claudeRes.text().catch(() => "");
    console.error("Claude API error", claudeRes.status, detail.slice(0, 400));
    return NextResponse.json(
      { error: "Extraction failed. Try again." },
      { status: 502 },
    );
  }

  let payload: { content?: Array<{ type: string; text?: string }> };
  try {
    payload = (await claudeRes.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
  } catch {
    return NextResponse.json(
      { error: "Extraction response was malformed." },
      { status: 502 },
    );
  }
  const text =
    payload.content?.find((c) => c.type === "text")?.text?.trim() ?? "";

  // extractModelJsonObject tolerates code fences and returns null when the
  // model answered "null" (no product found) — both cases leave product null.
  let product: ExtractedProduct | null = null;
  const jsonText = extractModelJsonObject(text);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        const name =
          typeof obj.name === "string" ? obj.name.trim() : "";
        const price = typeof obj.price === "number" ? obj.price : NaN;
        const unit =
          typeof obj.unit === "string" && obj.unit.trim().length > 0
            ? obj.unit.trim()
            : "each";
        if (name && Number.isFinite(price) && price >= 0) {
          product = {
            name,
            price: Math.round(price * 100) / 100,
            unit,
          };
        }
      }
    } catch {
      // Claude returned non-JSON despite the instructions — treat as
      // "couldn't find a product" rather than a server error.
      product = null;
    }
  }

  const out: ExtractResponse = {
    product,
    url: parsedUrl.toString(),
    fetched: true,
  };
  return NextResponse.json(out);
}
