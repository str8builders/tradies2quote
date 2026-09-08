import {notFound,redirect} from "next/navigation";
import {CalculatorWorkspace} from "@/t2qcal/components/calculators/CalculatorWorkspace";
import {getTool} from "@/t2qcal/lib/tools";
import {isUUID,validateSnapshot} from "@/t2qcal/lib/calculation-record";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
export default async function CalculatorPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{saved?:string;resume?:string}>}){
  const {slug}=await params,query=await searchParams,tool=getTool(slug);if(!tool)notFound();
  let record=null;
  if(query.saved){
    if(!isUUID(query.saved))notFound();
    const db=await createClient() as SupabaseClient;
    const {data:{user}}=await db.auth.getUser();
    if(!user)redirect(`/login?next=${encodeURIComponent(`/t2qcal/calculator/${slug}?saved=${query.saved}`)}`);
    const {data,error}=await db.from("t2qcal_calculations").select("id,name,snapshot,revision,updated_at").eq("id",query.saved).eq("user_id",user.id).maybeSingle();
    if(error)throw new Error("Saved working could not be loaded. Please try again.");
    if(!data)notFound();
    const snapshot=validateSnapshot(data.snapshot);if(snapshot.slug!==slug)notFound();
    record={...data,snapshot};
  }
  return <CalculatorWorkspace key={query.saved??(query.resume?"resume":slug)} tool={tool} record={record} resume={query.resume==="1"}/>;
}
