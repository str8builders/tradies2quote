import { NextResponse } from "next/server";
import { UUID, adminDb, planSetGuard, startJobAfterResponse } from "@/lib/planset/http";
import { MAX_SET_BYTES, PLAN_BUCKET } from "@/lib/planset/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/plansets/{id}/start — the PDF is uploaded; read it.
 * Also retries a set that failed. 202 { status: "queued" }.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const g = await planSetGuard({ write: true, quota: ["plansets-start", 40] });
  if (g instanceof NextResponse) return g;
  const { data: row } = await g.db.from("plan_sets").select("id, status, storage_path").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status === "queued" || row.status === "reading") return NextResponse.json({ status: row.status }, { status: 202 });

  // The file must really be there, and not over the limit.
  const folder = String(row.storage_path).replace(/\/original\.pdf$/, "");
  const listed = await g.db.storage.from(PLAN_BUCKET).list(folder, { search: "original.pdf" });
  const file = listed.data?.find((f) => f.name === "original.pdf");
  if (!file) return NextResponse.json({ error: "The PDF hasn't finished uploading." }, { status: 409 });
  const size = Number((file.metadata as { size?: number } | null)?.size ?? 0);
  if (size > MAX_SET_BYTES) return NextResponse.json({ error: "That PDF is bigger than 50 MB." }, { status: 413 });

  // Job columns are server-only: queue it with the service role.
  const upd = await adminDb()
    .from("plan_sets")
    .update({ status: "queued", error: null, step: "Waiting to start", lease_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", g.user.id)
    .in("status", ["uploading", "failed", "ready"]);
  if (upd.error) return NextResponse.json({ error: "Couldn't start reading. Try again." }, { status: 500 });
  startJobAfterResponse(id);
  return NextResponse.json({ status: "queued" }, { status: 202 });
}
