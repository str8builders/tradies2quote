import type {Metadata} from "next";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {SignInForm} from "./SignInForm";
import {calculatorNextPath} from "@/t2qcal/lib/signin-path";
import {signInErrorMessage} from "@/t2qcal/lib/signin-errors";

export const metadata:Metadata={title:{absolute:"Sign in — T2QCAL"}};

/**
 * In-scope sign-in for T2QCAL.
 *
 * The shared /login page lives outside the T2QCAL web-app scope (/t2qcal/),
 * so on an installed T2QCAL icon it opened in the browser and the session
 * landed there instead of in the app. This page keeps the whole round trip
 * inside /t2qcal/, so signing in once here signs the installed app in.
 * Opened from inside Tradies2Quote (or a normal browser tab) the session is
 * already shared and this page simply forwards to `next`.
 */
export default async function SignInPage({searchParams}:{searchParams:Promise<{error?:string;next?:string}>}){
  const {error,next:rawNext}=await searchParams;
  const next=calculatorNextPath(rawNext);
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(user)redirect(next);
  return <main className="native-page native-signin">
    <section className="native-hero"><div className="native-eyebrow">{"// ONE LOGIN, BOTH APPS"}</div><h1>SIGN IN.<br/><em>KEEP WORKING.</em></h1><p>Use your Tradies2Quote email and password. Saved working, jobs and quote drafts follow you to every device.</p></section>
    <SignInForm next={next} error={signInErrorMessage(error)??undefined}/>
  </main>;
}
