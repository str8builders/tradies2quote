import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTeamContext } from "@/lib/team";
import { captureError } from "@/lib/observability";
import { isNativeShellRequest } from "@/lib/native-shell";
export const dynamic = "force-dynamic";
export async function GET() {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const context = await getTeamContext(user.id);
    const { data, error } = await db.from("terms_templates").select("id,title,body").eq("user_id", context.ownerId).order("title");
    if (error) throw error;
    return NextResponse.json({ templates: data, enabled: context.plan === "builder", canEdit: context.plan === "builder" && context.isOwner });
  } catch (e) { captureError(e, { route: "/api/terms-templates" }); return NextResponse.json({ error: "Templates could not be loaded." }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const input = await request.json().catch(() => null);
  if (!input || typeof input.title !== "string" || !input.title.trim() || input.title.length>100 || typeof input.body !== "string" || !input.body.trim() || input.body.length>20000) return NextResponse.json({ error: "Add a title and terms (up to 20,000 characters)." }, { status: 400 });
  const values = { user_id: user.id, title: input.title.trim(), body: input.body.trim() };
  const result = input.id ? await db.from("terms_templates").update(values).eq("id", input.id).eq("user_id", user.id).select("id").single() : await db.from("terms_templates").insert(values).select("id").single();
  // The iPhone app never names a plan (App Store 3.1.3(f)).
  if (result.error) return NextResponse.json({ error: (await isNativeShellRequest()) ? "Terms templates can't be changed on this account." : "An active Builder plan and team-owner access are required." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
