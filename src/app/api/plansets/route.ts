import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { planSetGuard } from "@/lib/planset/http";
import { MAX_SET_BYTES, PLAN_BUCKET, setPdfPath } from "@/lib/planset/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/plansets — start an upload of a whole plan set.
 * Body: { original_filename, byte_size, quote_id? }
 * Returns 201 { id, upload: { path, token } }: the browser then uploads the
 * PDF straight to the private bucket (uploadToSignedUrl) and calls
 * POST /api/plansets/{id}/start.
 */
export async function POST(request: NextRequest) {
  const g = await planSetGuard({ write: true, quota: ["plansets-create", 20] });
  if (g instanceof NextResponse) return g;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const name = typeof body.original_filename === "string" ? body.original_filename.trim().slice(0, 255) : "";
  const size = typeof body.byte_size === "number" ? Math.floor(body.byte_size) : 0;
  if (!name || !/\.pdf$/i.test(name)) return NextResponse.json({ error: "Upload the plans as a PDF." }, { status: 400 });
  if (size <= 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (size > MAX_SET_BYTES) return NextResponse.json({ error: "That PDF is bigger than 50 MB. Split it into two files and upload each." }, { status: 413 });
  const quoteId = typeof body.quote_id === "string" && /^[0-9a-f-]{36}$/i.test(body.quote_id) ? body.quote_id : null;

  const id = crypto.randomUUID();
  const path = setPdfPath(g.user.id, id);
  const ins = await g.db.from("plan_sets").insert({ id, user_id: g.user.id, quote_id: quoteId, original_filename: name, byte_size: size, storage_path: path });
  if (ins.error) {
    captureError(ins.error, { route: "plansets:create" });
    return NextResponse.json({ error: "Couldn't start the upload. Try again." }, { status: 500 });
  }
  const signed = await g.db.storage.from(PLAN_BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data) {
    captureError(signed.error ?? new Error("no signed url"), { route: "plansets:create" });
    await g.db.from("plan_sets").delete().eq("id", id);
    return NextResponse.json({ error: "Couldn't start the upload. Try again." }, { status: 500 });
  }
  return NextResponse.json({ id, upload: { path: signed.data.path, token: signed.data.token } }, { status: 201 });
}

/** GET /api/plansets — your plan sets, newest first. */
export async function GET() {
  const g = await planSetGuard();
  if (g instanceof NextResponse) return g;
  const { data, error } = await g.db
    .from("plan_sets")
    .select("id, original_filename, status, step, progress, page_count, quote_id, error, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "Couldn't load your plans." }, { status: 500 });
  return NextResponse.json({ sets: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
