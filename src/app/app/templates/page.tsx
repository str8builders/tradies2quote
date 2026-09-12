import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "../_components/AppHeader";
import { TemplatesManager } from "./TemplatesManager";
export const metadata={title:"Terms templates"};
export default async function TemplatesPage(){const db=await createClient();const{data:{user}}=await db.auth.getUser();if(!user)redirect('/login');return <div className="min-h-screen text-white"><AppHeader context="Terms templates"/><main className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><div className="t2q-section-label-pro">{"// builder workspace"}</div><h1 className="mt-3 text-3xl font-semibold">Terms, ready to reuse.</h1><p className="mt-3 text-sm text-ink-300">Save your own wording, then apply it while reviewing a quote. Existing quotes keep their saved terms.</p><TemplatesManager/></main></div>;}
