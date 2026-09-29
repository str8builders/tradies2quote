import { NextResponse } from "next/server";
import { UUID, planSetGuard } from "@/lib/planset/http";
import { PLAN_BUCKET } from "@/lib/planset/storage";
import type { SheetFacts } from "@/lib/planset/sheetFacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/plansets/{id}/sheet/{page} — what the viewer draws over one sheet:
 * page size, walls (with openings), marks, dimension checks, and the text
 * runs so evidence can be highlighted. Plus a short-lived link to the PDF.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string; page: string }> }) {
  const { id, page } = await ctx.params;
  const n = Number(page);
  if (!UUID.test(id) || !Number.isInteger(n) || n < 1 || n > 200) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const g = await planSetGuard();
  if (g instanceof NextResponse) return g;
  const { data } = await g.db.from("plan_set_sheets").select("facts").eq("set_id", id).eq("page", n).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const f = data.facts as SheetFacts;
  const { data: set } = await g.db.from("plan_sets").select("storage_path").eq("id", id).maybeSingle();
  const signed = set ? await g.db.storage.from(PLAN_BUCKET).createSignedUrl(String(set.storage_path), 600) : null;
  return NextResponse.json(
    {
      page: f.page,
      widthMm: f.widthMm,
      heightMm: f.heightMm,
      rotate: f.rotate,
      sheetId: f.title.sheetId,
      title: f.title.title,
      kind: f.kind,
      scale: f.scale,
      walls: f.walls,
      marks: f.marks,
      chains: f.dimensions.chains,
      text: f.text,
      pdfUrl: signed?.data?.signedUrl ?? null,
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
