import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { consumeFixedWindow, tooManyRequestsResponse } from "@/lib/rate-limit";
import { isUuid } from "@/lib/quote-video/constants";
import { loadQuoteVideoFile } from "@/lib/quote-video/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * Owner-only: the ready MP4 of the quote's current version, served from our
 * own origin so the quote page's "Share video" button can hand the file to
 * the phone's share sheet (and "Download video" can save it) without a
 * cross-origin fetch. The client's quote link plays the video through signed
 * URLs instead; the private bucket has no client access at all.
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const quota = consumeFixedWindow(`quote-video-file:${user.id}`, 30, 15 * 60_000);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

  const file = await loadQuoteVideoFile(db, adminClient(), user.id, id);
  if (!file.ok) {
    return NextResponse.json({ error: file.status === 404 ? "not_found" : "unavailable" }, { status: file.status });
  }
  return new Response(file.bytes, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(file.bytes.byteLength),
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
