import { redirect } from "next/navigation";
import { Screen } from "@/components/ui/screen";
import { SectionTitle } from "@/components/ui/section-title";
import { createClient } from "@/lib/supabase/server";
import { isNativeShellRequest } from "@/lib/native-shell";
import { isNewLookOn } from "@/lib/ui/newLook";
import { AppHeader } from "../_components/AppHeader";
import { TemplatesManager } from "./TemplatesManager";
import { TemplatesCards } from "./_newlook/TemplatesCards";
export const metadata={title:"Terms templates"};
// 3.1.3(f): inside the iPhone app no plan names or plan links, decided here on the server ("builder" is a plan name).
export default async function TemplatesPage(){const db=await createClient();const{data:{user}}=await db.auth.getUser();if(!user)redirect('/login');const[inApp,newLook]=await Promise.all([isNativeShellRequest(),isNewLookOn()]);
// Redesign: cards under <AppHeader>'s top bar, same API and app-only wording. Off: unchanged below.
if(newLook)return <Screen data-testid="templates-screen"><AppHeader context="Terms templates"/><div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-10"><SectionTitle as="h2" description="Save your own wording, then apply it while reviewing a quote. Existing quotes keep their saved terms.">Terms, ready to reuse</SectionTitle><TemplatesCards inApp={inApp}/></div></Screen>;
return <div className="min-h-screen text-white"><AppHeader context="Terms templates"/><main className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><header className="t2q-page-intro"><div className="t2q-section-label-pro">{inApp?"// your wording":"// builder workspace"}</div><h1 className="mt-3 text-3xl font-semibold">Terms, ready to reuse.</h1><p className="mt-3 text-sm text-ink-300">Save your own wording, then apply it while reviewing a quote. Existing quotes keep their saved terms.</p></header><TemplatesManager inApp={inApp}/></main></div>;}
