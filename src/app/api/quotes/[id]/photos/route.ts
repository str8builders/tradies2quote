import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getTeamContext } from "@/lib/team";
import { captureError } from "@/lib/observability";
import { consumeFixedWindow } from "@/lib/rate-limit";
import { isNativeShellRequest } from "@/lib/native-shell";
import { PHOTO_BUCKET, MAX_PHOTO_BYTES, normaliseQuotePhoto } from "@/lib/quote-photos";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function owner(ctx: Context) {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { id } = await ctx.params;
  const result = await db.from("quotes").select("id,status").eq("id", id).eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  if (result.error || !result.data) return null;
  return { user, quote: result.data };
}
export async function GET(request: NextRequest, ctx: Context) {
  const access = await owner(ctx);
  if (!access) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  const admin = adminClient(); const photoId = request.nextUrl.searchParams.get("photo");
  if (photoId) {
    const result = await admin.from("quote_attachments").select("path").eq("id", photoId).eq("quote_id", access.quote.id).is("deleted_at", null).maybeSingle();
    if (!result.data || result.error) return new Response(null, { status: 404 });
    const file = await admin.storage.from(PHOTO_BUCKET).download(result.data.path);
    if (file.error || !file.data) return new Response(null, { status: 503 });
    return new Response(file.data, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }
  try {
    const context = await getTeamContext(access.user.id);
    const result = await admin.from("quote_attachments").select("id,name").eq("quote_id", access.quote.id).is("deleted_at", null).order("created_at");
    if (result.error) throw result.error;
    return NextResponse.json({ photos: result.data, canEdit: context.active && access.quote.status === "draft", enabled: context.active });
  } catch (e) { captureError(e, { route: "quote/photos" }); return NextResponse.json({ error: "Photos could not be loaded." }, { status: 503 }); }
}
export async function POST(request: NextRequest, ctx: Context) {
  const access = await owner(ctx);
  if (!access) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  if (!consumeFixedWindow(`photos:${access.user.id}`, 20, 60_000).ok) return NextResponse.json({ error: "Please wait a minute." }, { status: 429 });
  try {
    const context = await getTeamContext(access.user.id);
    // The iPhone app never names a plan (App Store 3.1.3(f)).
    if (!context.active || access.quote.status !== "draft") return NextResponse.json({ error: (await isNativeShellRequest()) ? "Photos can't be added to this quote." : "Add photos to a draft with an active Crew or Builder plan." }, { status: 403 });
    if (Number(request.headers.get("content-length")) > MAX_PHOTO_BYTES + 100_000) return NextResponse.json({ error: "Choose a photo under 10 MB." }, { status: 413 });
    const data = await request.formData(); const file = data.get("photo");
    if (!(file instanceof File) || file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: "Choose a photo under 10 MB." }, { status: 400 });
    let bytes: Buffer;
    try { bytes = await normaliseQuotePhoto(new Uint8Array(await file.arrayBuffer())); }
    catch { return NextResponse.json({ error: "Use a valid, still JPEG, PNG or WebP photo under 10 MB." }, { status: 400 }); }
    const admin = adminClient(); const path = `${access.user.id}/${access.quote.id}/${randomUUID()}.jpg`;
    const upload = await admin.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (upload.error) throw upload.error;
    const registered = await admin.rpc("register_quote_photo", { p_data: { quote_id: access.quote.id, user_id: access.user.id, path, name: file.name.replace(/[\x00-\x1f]/g, "").slice(0,150) || "Job photo" } });
    if (registered.error) {
      await admin.storage.from(PHOTO_BUCKET).remove([path]);
      return NextResponse.json({ error: "This quote can no longer accept photos, or already has 8. Refresh and retry." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) { captureError(e, { route: "quote/photos" }); return NextResponse.json({ error: "The photo could not be saved. Please retry." }, { status: 503 }); }
}
export async function DELETE(request: NextRequest, ctx: Context) {
  const access = await owner(ctx);
  if (!access) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  const input = await request.json().catch(() => null);
  if (typeof input?.id !== "string") return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
  const selected = await adminClient().from("quote_attachments").select("id").eq("id", input.id).eq("quote_id", access.quote.id).is("deleted_at", null).maybeSingle();
  if (selected.error || !selected.data) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  // RPC locks the quote and rechecks ownership/status; soft delete is reversible.
  const result = await adminClient().rpc("remove_quote_photo", { p_id: input.id, p_user: access.user.id });
  if (result.error) return NextResponse.json({ error: "Only draft photos can be removed." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
