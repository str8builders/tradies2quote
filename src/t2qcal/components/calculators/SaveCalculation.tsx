"use client";
import {useState,useRef} from "react";
import {useCalculationSeed} from "./CalculationSeed";
import {validateSnapshot,type CalculationSnapshot} from "@/t2qcal/lib/calculation-record";
export function SaveCalculation({snapshot,title}:{snapshot:CalculationSnapshot;title:string}) {
  const seed=useCalculationSeed();
  const [id,setId]=useState(()=>seed?.id??crypto.randomUUID());
  const [revision,setRevision]=useState(seed?.revision??0);
  const [name,setName]=useState(seed?.name??title);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[login,setLogin]=useState(false);
  const [savedSignature,setSavedSignature]=useState(seed?JSON.stringify({snapshot:seed.snapshot,name:seed.name}):"");
  const copyId=useRef<string|null>(null);
  const signature=JSON.stringify({snapshot:{...snapshot,values:Object.fromEntries(Object.entries(snapshot.values).sort(([a],[b])=>a.localeCompare(b)))},name:name.trim()});
  async function save(copy=false){
    if(busy)return;
    let checked:CalculationSnapshot;
    try{checked=validateSnapshot(snapshot);}catch(e){setMessage(e instanceof Error?e.message:"Check the calculator inputs.");return;}
    const target=copy?(copyId.current??(copyId.current=crypto.randomUUID())):id;
    setBusy(true);setMessage("");setLogin(false);
    try{
      const response=await fetch(`/api/t2qcal/calculations/${target}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,snapshot:checked,revision:copy?0:revision}),signal:AbortSignal.timeout(20000)});
      const data=await response.json();
      if(response.status===401){setLogin(true);throw new Error("Sign in with your Tradies2Quote account to save this working.");}
      if(!response.ok)throw new Error(data.error??"Your working was not saved.");
      copyId.current=null;setId(data.record.id);setRevision(data.record.revision);setSavedSignature(signature);setMessage("Saved to your account.");
      const url=new URL(window.location.href);url.searchParams.set("saved",data.record.id);url.searchParams.delete("resume");window.history.replaceState(null,"",url);
    }catch(e){setMessage(e instanceof Error?e.message:"Your working was not saved. Please try again.");}
    finally{setBusy(false);}
  }
  function signIn(){
    try{sessionStorage.setItem(`t2qcal.pending.${snapshot.slug}`,JSON.stringify({snapshot,name}));window.location.assign(`/login?next=${encodeURIComponent(`/t2qcal/calculator/${snapshot.slug}?resume=1`)}`);}
    catch{setMessage("Your browser could not keep these inputs for sign-in. Copy or print them before signing in.");}
  }
  return <section className="save-working" aria-label="Save calculation"><div><h2>Save your working</h2><p>Keep these inputs in your account and reopen them on another device.</p></div>
    <label>Calculation name<input maxLength={120} value={name} onChange={e=>setName(e.target.value)} /></label>
    <div className="save-actions"><button className="directory-button" disabled={busy||!name.trim()} onClick={()=>save()}>{busy?"Saving…":savedSignature===signature?"Saved":"Save working"}</button>{revision>0&&<button disabled={busy} onClick={()=>save(true)}>Save a new copy</button>}<a href="/t2qcal/saved">View saved working</a></div>
    {message&&<p role="status">{message}</p>}{login&&<button onClick={signIn}>Sign in and keep these inputs</button>}
  </section>;
}
