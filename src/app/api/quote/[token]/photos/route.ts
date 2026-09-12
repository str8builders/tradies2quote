import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { classifyPublicQuote } from "@/lib/quote-public-view";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params; const admin = adminClient();
  const result = await admin.from("quotes").select("id,status,expires_at,deleted_at").eq("public_token", token).maybeSingle();
  const quote = result.data;
  if (result.error || !quote || quote.deleted_at || !["live", "accepted"].includes(classifyPublicQuote(quote, new Date()).kind)) return new Response(null, { status: 404 });
  const photoId = request.nextUrl.searchParams.get("photo");
  if (!photoId) {
    const photos = await admin.from("quote_attachments").select("id,name").eq("quote_id", quote.id).is("deleted_at", null).order("created_at");
    if (photos.error) return new Response(null, { status: 503 });
    return NextResponse.json({ photos: photos.data }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const photo = await admin.from("quote_attachments").select("path").eq("quote_id", quote.id).eq("id", photoId).is("deleted_at", null).maybeSingle();
  if (photo.error || !photo.data) return new Response(null, { status: 404 });
  const file = await admin.storage.from("quote-attachments").download(photo.data.path);
  if (file.error || !file.data) return new Response(null, { status: 503 });
  return new Response(file.data, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
