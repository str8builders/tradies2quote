import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTeamContext } from "@/lib/team";
import { captureError } from "@/lib/observability";
export const dynamic = "force-dynamic";
export async function GET() {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const context = await getTeamContext(user.id);
    const { data, error } = await db.from("clients").select("id,name,email,phone,address").eq("user_id", context.clientOwnerId).order("name").limit(1000);
    if (error) throw error;
    return NextResponse.json({ clients: data, shared: context.clientOwnerId !== user.id || context.active && !!context.team });
  } catch (e) { captureError(e, { route: "/api/clients" }); return NextResponse.json({ error: "Clients could not be loaded. Please retry." }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const input = await request.json().catch(() => null);
  if (!input || typeof input.name !== "string" || !input.name.trim() || input.name.length > 150 || [input.email,input.phone,input.address].some(v => v != null && (typeof v !== "string" || v.length>500))) return NextResponse.json({ error: "Enter a client name and valid contact details." }, { status: 400 });
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const { data, error } = await db.rpc("save_client_contact", { p_data: input });
  if (error) { captureError(error, { route: "/api/clients" }); return NextResponse.json({ error: "Client could not be saved. Please retry." }, { status: 400 }); }
  return NextResponse.json({ client: data });
}
