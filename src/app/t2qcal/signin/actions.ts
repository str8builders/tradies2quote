"use server";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {calculatorNextPath} from "@/t2qcal/lib/signin-path";
import {signInErrorCode,type SignInErrorCode} from "@/t2qcal/lib/signin-errors";

export async function t2qcalSignInAction(formData:FormData){
  const email=String(formData.get("email")??"").trim();
  const password=String(formData.get("password")??"");
  const next=calculatorNextPath(formData.get("next"));
  const back=(error:SignInErrorCode)=>`/t2qcal/signin?error=${encodeURIComponent(error)}&next=${encodeURIComponent(next)}`;
  if(!email||!password)redirect(back("missing"));
  const db=await createClient();
  const {error}=await db.auth.signInWithPassword({email,password});
  if(error)redirect(back(signInErrorCode(error.message)));
  redirect(next);
}
