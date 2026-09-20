import {createClient} from "@/lib/supabase/server";
import {privateHeaders} from "@/lib/t2qcal-api";
import {getCachedAvatarUrl} from "@/lib/supabase/profile";

/**
 * Who is signed in, for the T2QCAL shell. T2QCAL shares the Tradies2Quote
 * session cookie (same origin), so a tradie who signed in to the quoting
 * app is already signed in here — this endpoint lets the shell SHOW that
 * instead of offering "Sign in" to someone who already has.
 * Never 401s: signed out is a normal answer, not an error.
 */
export async function GET(){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return Response.json({account:null},{headers:privateHeaders});
  const {data:profile}=await db.from("profiles").select("business_name").eq("id",user.id).maybeSingle();
  const business=typeof profile?.business_name==="string"&&profile.business_name.trim()?profile.business_name.trim():null;
  const avatar=await getCachedAvatarUrl(user.id);
  const initial=(user.email??"?").trim().charAt(0).toUpperCase()||"?";
  return Response.json({account:{id:user.id,email:user.email??null,name:business,avatar:avatar&&/^https:\/\//i.test(avatar)?avatar:null,initial}},{headers:privateHeaders});
}
