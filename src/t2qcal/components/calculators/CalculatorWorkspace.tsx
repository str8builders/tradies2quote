"use client";
import {useEffect,useState} from "react";
import {CalculationSeed,type SavedCalculation} from "./CalculationSeed";
import {InteractiveCalculator} from "./InteractiveCalculators";
import {validateSnapshot} from "@/t2qcal/lib/calculation-record";
import type {ToolEntry} from "@/t2qcal/lib/tools";
export function CalculatorWorkspace({tool,record,resume}:{tool:ToolEntry;record:SavedCalculation|null;resume:boolean}){
  const [loaded,setLoaded]=useState(!resume),[saved,setSaved]=useState(record),[error,setError]=useState("");
  useEffect(()=>{
    if(!resume)return;
    // Restore once after hydration: sessionStorage is unavailable during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try{const key=`t2qcal.pending.${tool.slug}`,raw=sessionStorage.getItem(key);if(raw){const data=JSON.parse(raw),snapshot=validateSnapshot(data.snapshot);if(snapshot.slug!==tool.slug)throw new Error();setSaved({id:crypto.randomUUID(),name:typeof data.name==="string"?data.name.slice(0,120):tool.name,snapshot,revision:0,updated_at:new Date().toISOString()});sessionStorage.removeItem(key);}}
    catch{setError("The browser could not restore the inputs from before sign-in. Please enter them again.");}
    finally{setLoaded(true);}
  },[resume,tool.slug,tool.name]);
  if(!loaded)return <main className="calculator-page" role="status">Restoring your working…</main>;
  return <>{error&&<p role="alert">{error}</p>}<CalculationSeed record={saved}><InteractiveCalculator tool={tool}/></CalculationSeed></>;
}
