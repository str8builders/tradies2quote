import { NextResponse } from "next/server";
import { UUID, adminDb, isStalled, planSetGuard, startJobAfterResponse, type PlanSetRow } from "@/lib/planset/http";
import { PLAN_BUCKET } from "@/lib/planset/storage";
import { applyAnswers, type Answers } from "@/lib/planset/model/answers";
import type { BuildingModel } from "@/lib/planset/model/types";
import { planTakeoff } from "@/lib/planset/takeoff/fromModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/plansets/{id} — progress while reading; the register, model,
 * answers and sheet list when ready. A read that stalled (server restart)
 * is restarted here, so a reload always resumes.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const g = await planSetGuard();
  if (g instanceof NextResponse) return g;
  const { data } = await g.db.from("plan_sets").select("*").eq("id", id).maybeSingle();
  const row = data as PlanSetRow | null;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (isStalled(row)) {
    await adminDb().from("plan_sets").update({ status: "queued", lease_at: null, updated_at: new Date().toISOString() }).eq("id", id).in("status", ["queued", "reading"]);
    startJobAfterResponse(id);
  }
  const sheets =
    row.status === "ready"
      ? ((await g.db.from("plan_set_sheets").select("page, sheet_id, title, kind, building, scale_ratio, scale_basis").eq("set_id", id).order("page")).data ?? [])
      : [];
  // The model as the tradie has corrected it, and the materials worked out from it.
  const effective = row.status === "ready" && row.model ? applyAnswers(row.model as BuildingModel, (row.answers ?? {}) as Answers) : null;
  const takeoff = effective ? planTakeoff(effective) : null;
  return NextResponse.json(
    {
      id: row.id,
      name: row.original_filename,
      status: row.status,
      step: row.step,
      progress: row.progress,
      pageCount: row.page_count,
      quoteId: row.quote_id,
      error: row.error,
      register: row.status === "ready" ? row.register : null,
      model: effective,
      answers: row.answers ?? {},
      takeoff,
      sheets,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** DELETE /api/plansets/{id} — remove the set and its PDF. */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const g = await planSetGuard();
  if (g instanceof NextResponse) return g;
  const { data: row } = await g.db.from("plan_sets").select("id, storage_path").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await g.db.storage.from(PLAN_BUCKET).remove([String(row.storage_path)]);
  const del = await g.db.from("plan_sets").delete().eq("id", id);
  if (del.error) return NextResponse.json({ error: "Couldn't delete it. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
