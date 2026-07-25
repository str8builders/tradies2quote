import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { consumeFixedWindow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/waitlist
 *
 * Takes an email for the T2QCAL companion app, which is not on the App Store
 * yet. That's the whole endpoint — one address and where it came from.
 *
 * Posture:
 *   - PUBLIC + unauthenticated on purpose: the people signing up don't have
 *     accounts yet. It accepts nothing but an email and a short source tag,
 *     and stores no IP or user agent, so a leak of this table is a leak of a
 *     mailing list and nothing more.
 *   - The write runs under the service role because `app_waitlist` has RLS on
 *     with no policies — anon cannot touch it directly.
 *   - Rate-limited per IP so the list can't be stuffed by a script.
 *   - Honeypot: a form field no human sees. Filled in means a bot, and the bot
 *     gets the same cheerful 200 as everyone else with nothing written — a
 *     rejection just teaches it to try again without the field.
 *   - Every outcome that isn't a malformed address returns the SAME response,
 *     so this can't be used to test whether an address is already on the list.
 */
const MAX_BYTES = 2 * 1024;
// Per IP, per instance. A person signs up once; five in ten minutes is already
// generous for a shared office NAT, and stops a script cold.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60_000;

const SOURCES = new Set(["calculator", "landing"]);

// Deliberately loose: this is a shape check, not an attempt to decide which
// addresses exist. Anything with one @, no spaces, and a dotted domain passes.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function clientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

const ok = () => NextResponse.json({ ok: true });

export async function POST(request: NextRequest) {
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  let body: { email?: unknown; source?: unknown; company?: unknown };
  try {
    body = JSON.parse(text || "{}");
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // The honeypot. Answer as if it worked; write nothing.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return ok();
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL.test(email)) {
    return NextResponse.json(
      { error: "invalid_email", message: "That doesn't look like an email address." },
      { status: 400 },
    );
  }

  // Throttle AFTER the shape check so a typo doesn't burn someone's allowance.
  const quota = consumeFixedWindow(`waitlist:${clientIp(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "That's a few too many in a row. Try again shortly.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1000))),
        },
      },
    );
  }

  const source = typeof body.source === "string" && SOURCES.has(body.source)
    ? body.source
    : "calculator";

  const { error } = await adminClient().from("app_waitlist").insert({ email, source });

  // 23505 is the unique index on lower(email): they're already on the list,
  // which is exactly what they asked for. Anything else is ours, not theirs.
  if (error && error.code !== "23505") {
    console.error("[waitlist] insert failed", error.code, error.message);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't save that just now. Try again in a minute." },
      { status: 500 },
    );
  }

  return ok();
}
