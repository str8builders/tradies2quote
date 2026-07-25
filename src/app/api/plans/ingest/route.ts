import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canWrite, getSubscriptionStatus } from "@/lib/subscription";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";
import { validateIngestMeta } from "@/lib/planreader/schema";
import { createPlanRecords } from "@/lib/planreader/ingest";
import { MAX_PLAN_PAGES, MAX_PLAN_UPLOAD_BYTES } from "@/lib/planreader/storage";
import { planReaderAllowed } from "@/lib/planreader/flag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/plans/ingest
 *
 * Phase 1. Creates the plan_files + plan_sheets rows for an upload and returns
 * signed Storage upload URLs. The browser (which already split the PDF into
 * page PNGs client-side) then PUTs the original + each page image
 * directly to the private `plan-uploads` bucket.
 *
 * Body (JSON):
 *   { original_filename, mime, byte_size, page_count, quote_id?, project_id? }
 *
 * Auth + per-user daily quota + subscription gating mirror the existing
 * scan-drawing route. This route NEVER trusts a client-supplied user id —
 * the owner is read from the authenticated session.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Internal-only until GA: hide the route's existence from non-owners while
  // PLAN_READER_ENABLED is off.
  if (!planReaderAllowed(user.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const quota = consumeDailyQuota(`plans-ingest:${user.id}`, 120);
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Expected a JSON body." },
      { status: 400 },
    );
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const parsed = validateIngestMeta({
    original_filename: b.original_filename,
    mime: b.mime,
    byte_size: b.byte_size,
    page_count: b.page_count,
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "invalid_metadata", details: parsed.errors },
      { status: 400 },
    );
  }

  if (parsed.value.byte_size > MAX_PLAN_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `File exceeds ${Math.floor(MAX_PLAN_UPLOAD_BYTES / 1024 / 1024)} MB limit.`,
      },
      { status: 413 },
    );
  }
  if (parsed.value.page_count > MAX_PLAN_PAGES) {
    return NextResponse.json(
      { error: `Too many pages (max ${MAX_PLAN_PAGES}).` },
      { status: 413 },
    );
  }

  // Optional links — validated only for shape; RLS guards real ownership.
  const quote_id = typeof b.quote_id === "string" ? b.quote_id : null;
  const project_id = typeof b.project_id === "string" ? b.project_id.slice(0, 120) : null;

  const result = await createPlanRecords(supabase, user.id, {
    ...parsed.value,
    quote_id,
    project_id,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result.value, { status: 201 });
}
