import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";
import { isValidRequestSlug } from "@/lib/quote-requests/slug";
import { findTradieBySlug } from "@/lib/quote-requests/intake";
import { suggestClarifyingQuestions } from "@/lib/quote-requests/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_IP_PER_DAY = 30;

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Optional pre-submit step for the public request form: a few short
 * clarifying questions for the client's description. Always answers 200
 * with a (possibly empty) list, so the form never depends on it.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!isValidRequestSlug(slug)) {
    return NextResponse.json({ error: "This request link isn't active." }, { status: 404 });
  }
  const quota = consumeDailyQuota(`quote-request-questions:${clientIp(request)}`, PER_IP_PER_DAY);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

  let description = "";
  try {
    const body = (await request.json()) as { description?: unknown };
    description = typeof body.description === "string" ? body.description.trim() : "";
  } catch {
    return NextResponse.json({ questions: [] });
  }
  if (description.length < 20 || description.length > 3000) {
    return NextResponse.json({ questions: [] });
  }

  const tradie = await findTradieBySlug(adminClient(), slug);
  if (!tradie) {
    return NextResponse.json({ error: "This request link isn't active." }, { status: 404 });
  }

  const questions = await suggestClarifyingQuestions(description);
  return NextResponse.json({ questions });
}
