import type { NextRequest } from "next/server";
import { dispatchMobile } from "@/lib/mobile/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;
type Context = { params: Promise<{ path: string[] }> };
async function handler(request: NextRequest, context: Context) {
  return dispatchMobile(request, (await context.params).path);
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
