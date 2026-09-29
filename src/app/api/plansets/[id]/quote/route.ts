import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { UUID, planSetGuard, type PlanSetRow } from "@/lib/planset/http";
import { applyAnswers, type Answers } from "@/lib/planset/model/answers";
import type { BuildingModel } from "@/lib/planset/model/types";
import { planTakeoff } from "@/lib/planset/takeoff/fromModel";
import { planSetQuoteData } from "@/lib/planset/takeoff/toQuote";
import { loadAllMaterials } from "@/lib/materials/loadLibrary";
import { clampMarkupPct, NZ_DEFAULTS, resolveTaxLabel, resolveTaxRate } from "@/lib/quote-defaults";
import type { LibraryMaterial } from "@/lib/quote-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/plansets/{id}/quote — a new draft quote with the plan-set
 * materials (priced from the library where it matches exactly; the rest
 * wait for a price). 201 { quoteId }. 409 while blockers are unanswered.
 */
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const g = await planSetGuard({ write: true, quota: ["plansets-quote", 60] });
  if (g instanceof NextResponse) return g;
  const { data } = await g.db.from("plan_sets").select("id, status, model, answers, original_filename").eq("id", id).maybeSingle();
  const row = data as Pick<PlanSetRow, "id" | "status" | "model" | "answers" | "original_filename"> | null;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status !== "ready" || !row.model) return NextResponse.json({ error: "These plans are still being read." }, { status: 409 });

  const takeoff = planTakeoff(applyAnswers(row.model as BuildingModel, (row.answers ?? {}) as Answers));
  if (takeoff.blockers.length) {
    return NextResponse.json({ error: "Answer the questions first.", blockers: takeoff.blockers }, { status: 409 });
  }
  if (!takeoff.lines.length) return NextResponse.json({ error: "There's nothing to put in a quote yet." }, { status: 409 });

  const { data: profile } = await g.db.from("profiles").select("tax_label, tax_rate, currency, country, default_markup_pct").eq("id", g.user.id).maybeSingle();
  const currency = (profile?.currency as string | null) ?? NZ_DEFAULTS.currency;
  const library = await loadAllMaterials<LibraryMaterial>(g.db, g.user.id, {
    select: "id, name, unit, default_unit_price, supplier, supplier_url, notes, usage_count, is_ai_estimated, last_used_at",
  }).catch(() => [] as LibraryMaterial[]);
  const quoteData = planSetQuoteData(
    takeoff,
    library.map((r) => ({ ...r, default_unit_price: r.default_unit_price !== null ? Number(r.default_unit_price) : null })),
    {
      currency,
      taxLabel: resolveTaxLabel(profile?.tax_label as string | null, profile?.country as string | null, currency),
      taxRate: resolveTaxRate(profile?.tax_rate as number | null, profile?.country as string | null, currency),
      markupPct: clampMarkupPct(profile?.default_markup_pct ?? NZ_DEFAULTS.default_markup_pct),
    },
    `Materials from the plans (${row.original_filename})`,
  );
  const ins = await g.db
    .from("quotes")
    .insert({
      user_id: g.user.id,
      voice_transcript: `Read from the plans: ${row.original_filename}`,
      status: "draft",
      quote_data: quoteData,
      ai_snapshot: quoteData,
      total_amount: quoteData.total,
      currency,
    })
    .select("id")
    .single();
  if (ins.error || !ins.data) {
    captureError(ins.error ?? new Error("no quote row"), { route: "plansets:quote" });
    return NextResponse.json({ error: "Couldn't create the quote. Try again." }, { status: 500 });
  }
  await g.db.from("plan_sets").update({ quote_id: ins.data.id, updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ quoteId: ins.data.id }, { status: 201 });
}
