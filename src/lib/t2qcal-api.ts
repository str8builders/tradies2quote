import "server-only";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {consumeFixedWindow} from "@/lib/rate-limit";
export async function calculatorAccount(request:Request,write=false) {
  // The public origin differs from request.url behind the Sydney reverse proxy.
  const appOrigin=new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
  if(write && request.headers.get("origin")!==appOrigin) return {error:Response.json({error:"Open this request from the app."},{status:403,headers:privateHeaders})} as const;
  const db=await createClient() as SupabaseClient;
  const {data:{user},error}=await db.auth.getUser();
  if(error || !user)return {error:Response.json({error:"Sign in with your Tradies2Quote account."},{status:401,headers:privateHeaders})} as const;
  const expectedOwner=request.headers.get("X-T2Q-Owner");
  if(write && expectedOwner && expectedOwner!==user.id)return {error:Response.json({error:"Your signed-in account changed. Reopen Your working to review this backup."},{status:403,headers:privateHeaders})} as const;
  if(!consumeFixedWindow(`t2qcal:${write?"write":"read"}:${user.id}`,write?60:240,60_000).ok)return {error:Response.json({error:"Please wait a moment and try again."},{status:429,headers:privateHeaders})} as const;
  return {db,user} as const;
}
export const privateHeaders={"Cache-Control":"private, no-store"};
export async function smallJSON(request:Request):Promise<unknown> {
  if(!request.headers.get("content-type")?.startsWith("application/json"))throw new Error("Send calculation data as JSON.");
  if(Number(request.headers.get("content-length")??0)>32768)throw new Error("This calculation is too large.");
  const reader=request.body?.getReader();if(!reader)throw new Error("No calculation was provided.");
  let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw new Error("This calculation is too large.");}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error("The calculation data could not be read.");}
}
