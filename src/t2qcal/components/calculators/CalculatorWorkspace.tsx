"use client";
import {readLocalLibrary} from "@/t2qcal/lib/local-db";
import {useEffect,useState} from "react";
import {CalculationSeed,type SavedCalculation} from "./CalculationSeed";
import {InteractiveCalculator} from "./InteractiveCalculators";
import {validateSnapshot} from "@/t2qcal/lib/calculation-record";
import type {ToolEntry} from "@/t2qcal/lib/tools";
export function CalculatorWorkspace({tool,record,resume}:{tool:ToolEntry;record:SavedCalculation|null;resume:boolean}){
  const [loaded,setLoaded]=useState(false),[saved,setSaved]=useState(record),[error,setError]=useState("");
  useEffect(()=>{
    let cancelled=false;
    async function restore(){
      try{
        let next=record;
        if(resume){
          const key=`t2qcal.pending.${tool.slug}`,raw=sessionStorage.getItem(key);
          if(raw){const data=JSON.parse(raw),snapshot=validateSnapshot(data.snapshot);if(snapshot.slug!==tool.slug)throw new Error("These inputs belong to a different calculator.");next={id:crypto.randomUUID(),name:typeof data.name==="string"?data.name.slice(0,120):tool.name,snapshot,revision:0,updated_at:new Date().toISOString()};if(!cancelled)sessionStorage.removeItem(key);}
        }else{
          const match=window.location.hash.match(/^#device=([a-f0-9-]+)$/i);
          if(match){const local=(await readLocalLibrary()).calculations.find(r=>r.id===match[1]&&r.snapshot.slug===tool.slug);if(!local)throw new Error("This device-saved calculation could not be found. Open Your working to choose another.");next=local;}
        }
        if(!cancelled)setSaved(next);
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:"The browser could not restore your working.");}
      finally{if(!cancelled)setLoaded(true);}
    }
    void restore();return()=>{cancelled=true;};
  },[resume,tool.slug,tool.name,record]);
  if(error)return <main className="calculator-page"><p role="alert">{error}</p><a href="/t2qcal/device">Your working</a></main>;
  if(!loaded)return <main className="calculator-page" role="status">Restoring your working…</main>;
  return <>{error&&<p role="alert">{error}</p>}<CalculationSeed record={saved}><InteractiveCalculator tool={tool}/></CalculationSeed></>;
}
