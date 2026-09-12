import { randomBytes, createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTeamContext } from "@/lib/team";
import { captureError } from "@/lib/observability";
import { consumeFixedWindow } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export async function GET() {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const context = await getTeamContext(user.id);
    const { data: roster, error } = await db.rpc("team_roster");
    if (error) throw error;
    return NextResponse.json({ ...context, roster: roster ?? { members: [], invitations: [] } });
  } catch (e) { captureError(e, { route: "/api/team" }); return NextResponse.json({ error: "Your team could not be loaded. Please retry." }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!consumeFixedWindow(`team:${user.id}`, 30, 60_000).ok) return NextResponse.json({ error: "Wait a minute before trying again." }, { status: 429 });
  const input = await request.json().catch(() => null);
  if (!input || !["create","invite","accept","revoke","remove","leave","rename"].includes(input.action)) return NextResponse.json({ error: "Invalid team action." }, { status: 400 });
  const token = input.action === "invite" ? randomBytes(32).toString("hex") : input.action === "accept" ? input.token : null;
  if (input.action === "accept" && (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))) return NextResponse.json({ error: "This invitation is invalid." }, { status: 400 });
  const data = { name: typeof input.name === "string" ? input.name.slice(0,100) : null, email: typeof input.email === "string" ? input.email.trim().toLowerCase() : null, id: input.id, user_id: input.user_id,
    token_hash: token ? createHash("sha256").update(token).digest("hex") : null };
  const result = await db.rpc("manage_team", { p_action: input.action, p_data: data });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, ...result.data, ...(input.action === "invite" ? { link: `${process.env.NEXT_PUBLIC_APP_URL || "https://tradies2quote.com"}/app/team?invite=${token}` } : {}) });
}
