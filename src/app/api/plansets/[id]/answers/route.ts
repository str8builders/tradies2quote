import { NextResponse, type NextRequest } from "next/server";
import { UUID, planSetGuard } from "@/lib/planset/http";
import { sanitizeAnswers } from "@/lib/planset/model/answers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/plansets/{id}/answers — save the tradie's answers/corrections.
 * Body: { answers: { "flag:stud-height": 2400, "set:pitch_deg": 25, … } }
 * Merged over what's saved; a value of null removes that answer.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const g = await planSetGuard({ quota: ["plansets-answers", 600] });
  if (g instanceof NextResponse) return g;
  let body: { answers?: Record<string, unknown> };
  try {
    body = (await request.json()) as { answers?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const incoming = body.answers ?? {};
  const removals = Object.entries(incoming).filter(([, v]) => v === null).map(([k]) => k);
  const clean = sanitizeAnswers(Object.fromEntries(Object.entries(incoming).filter(([, v]) => v !== null)));
  if (!clean) return NextResponse.json({ error: "Those answers weren't in the expected form." }, { status: 400 });
  const { data: row } = await g.db.from("plan_sets").select("answers, status").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const merged: Record<string, unknown> = { ...(row.answers as Record<string, unknown>), ...clean };
  for (const k of removals) delete merged[k];
  const all = sanitizeAnswers(merged);
  if (!all) return NextResponse.json({ error: "Too many answers." }, { status: 400 });
  const upd = await g.db.from("plan_sets").update({ answers: all, updated_at: new Date().toISOString() }).eq("id", id);
  if (upd.error) return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  return NextResponse.json({ answers: all });
}
