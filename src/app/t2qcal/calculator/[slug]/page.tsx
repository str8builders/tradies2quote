import {notFound,redirect} from "next/navigation";
import type {Metadata} from "next";
import {CalculatorWorkspace} from "@/t2qcal/components/calculators/CalculatorWorkspace";
import {getTool} from "@/t2qcal/lib/tools";
import {isUUID,validateSnapshot} from "@/t2qcal/lib/calculation-record";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";

type Params = {slug:string};

// Every calculator used to share t2qcal/layout.tsx's one title/description
// and no canonical, so Google saw 95 identical-looking pages. `absolute`
// bypasses the root layout's "Tradies2Quote | %s" template — T2QCAL titles
// its own pages, the same way the layout's own title does.
export async function generateMetadata({params}:{params:Promise<Params>}):Promise<Metadata>{
  const {slug}=await params,tool=getTool(slug);
  if(!tool)return {};
  return {
    title:{absolute:`${tool.name} — T2QCAL`},
    description:tool.summary,
    alternates:{canonical:`/t2qcal/calculator/${slug}`},
  };
}

export default async function CalculatorPage({params,searchParams}:{params:Promise<Params>;searchParams:Promise<{saved?:string;resume?:string}>}){
  const {slug}=await params,query=await searchParams,tool=getTool(slug);if(!tool)notFound();
  let record=null;
  if(query.saved){
    if(!isUUID(query.saved))notFound();
    const db=await createClient() as SupabaseClient;
    const {data:{user}}=await db.auth.getUser();
    if(!user)redirect(`/t2qcal/signin?next=${encodeURIComponent(`/t2qcal/calculator/${slug}?saved=${query.saved}`)}`);
    const {data,error}=await db.from("t2qcal_calculations").select("id,name,snapshot,revision,updated_at").eq("id",query.saved).eq("user_id",user.id).maybeSingle();
    if(error)throw new Error("Saved working could not be loaded. Please try again.");
    if(!data)notFound();
    const snapshot=validateSnapshot(data.snapshot);if(snapshot.slug!==slug)notFound();
    record={...data,snapshot};
  }
  return (
    <>
      {/* Server-rendered so search gets real per-calculator content: the
          client workspace below shows only "Restoring your working…" until
          its own effect resolves (CalculatorWorkspace.tsx), which is not
          part of the initial HTML. Reuses .calculator-title-row (t2qcal.css)
          — already styled for exactly this pairing, just never mounted. */}
      <div className="calculator-page" style={{paddingBottom:0}}>
        <div className="calculator-title-row">
          <h1>{tool.name}</h1>
          <p>{tool.summary}</p>
        </div>
      </div>
      <CalculatorWorkspace key={query.saved??(query.resume?"resume":slug)} tool={tool} record={record} resume={query.resume==="1"}/>
    </>
  );
}
