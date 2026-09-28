"use server";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {allowSignInAttempt} from "@/lib/auth/signin-throttle";
import {requestIp} from "@/lib/request-ip";
import {calculatorNextPath} from "@/t2qcal/lib/signin-path";
import {signInErrorCode,type SignInErrorCode} from "@/t2qcal/lib/signin-errors";

export async function t2qcalSignInAction(formData:FormData){
  const email=String(formData.get("email")??"").trim();
  const password=String(formData.get("password")??"");
  const next=calculatorNextPath(formData.get("next"));
  const back=(error:SignInErrorCode)=>`/t2qcal/signin?error=${encodeURIComponent(error)}&next=${encodeURIComponent(next)}`;
  if(!email||!password)redirect(back("missing"));
  // Throttled per IP and per email before Supabase sees it (it only sees this server's IP).
  if(!allowSignInAttempt({ip:requestIp({headers:await headers()}),email}))redirect(back("throttled"));
  const db=await createClient();
  const {error}=await db.auth.signInWithPassword({email,password});
  if(error)redirect(back(signInErrorCode(error.message)));
  redirect(next);
}
