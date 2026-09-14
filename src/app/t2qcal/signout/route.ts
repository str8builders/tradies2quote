import {cookies} from "next/headers";
import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";

/**
 * Sign out that stays inside T2QCAL's web-app scope. Mirrors /auth/signout
 * (server-side revoke, then explicit Max-Age=0 on every sb-* cookie on the
 * redirect itself) but lands on the calculator directory instead of /login,
 * so an installed T2QCAL is not thrown out to the browser. Excluded from the
 * session-refresh proxy for the same reason /auth/signout is.
 */
export async function POST(req:NextRequest){
  try{const db=await createClient();await db.auth.signOut({scope:"global"});}catch{/* still clear cookies */}
  const response=NextResponse.redirect(new URL("/t2qcal/calculators",req.url),303);
  const store=await cookies();
  for(const c of store.getAll())if(c.name.startsWith("sb-"))response.cookies.set(c.name,"",{path:"/",maxAge:0,httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production"});
  return response;
}
export async function GET(req:NextRequest){
  // Cross-site GETs must not sign a visitor out; a pasted URL (same-origin/none) still does.
  const site=req.headers.get("sec-fetch-site");
  if(site&&site!=="same-origin"&&site!=="none")return NextResponse.redirect(new URL("/t2qcal/calculators",req.url),303);
  return POST(req);
}
