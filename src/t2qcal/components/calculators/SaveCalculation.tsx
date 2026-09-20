"use client";
import {useEffect,useState,useRef} from "react";
import {liveQuery} from "dexie";
import {saveLocalWorking,workingDB} from "@/t2qcal/lib/local-db";
import {queueBackup} from "@/t2qcal/lib/backup-sync";
import {useBackupAccount} from "../BackupSync";
import {useCalculationSeed} from "./CalculationSeed";
import {validateSnapshot,type CalculationSnapshot} from "@/t2qcal/lib/calculation-record";
const signatureOf=(snapshot:CalculationSnapshot,name:string)=>JSON.stringify({snapshot:{...snapshot,values:Object.fromEntries(Object.entries(snapshot.values).sort(([a],[b])=>a.localeCompare(b)))},name:name.trim()});
export function SaveCalculation({snapshot,title}:{snapshot:CalculationSnapshot;title:string}) {
  const seed=useCalculationSeed(),{account,refresh}=useBackupAccount();
  const [id,setId]=useState(()=>seed?.id??crypto.randomUUID()),[name,setName]=useState(seed?.name??title);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[login,setLogin]=useState(false),[backupState,setBackupState]=useState("");
  const lock=useRef(false);
  const signature=signatureOf(snapshot,name);
  useEffect(()=>{
    const sub=liveQuery(async()=>{
      if(!account)return "";
      const pending=await workingDB.outbox.get([account.id,id]);
      if(pending)return pending.status==="conflict"?"Backup conflict — open Your working to resolve it.":pending.status==="error"?"Backup needs attention — open Your working.":"Account backup pending";
      const receipt=await workingDB.receipts.get([account.id,id]);
      return receipt&&signatureOf(receipt.snapshot,receipt.name)===signature?"Backed up to account":"";
    }).subscribe({next:setBackupState,error:()=>setBackupState("Account backup status unavailable")});
    return()=>sub.unsubscribe();
  },[account,id,signature]);
  async function saveOnDevice(){
    if(lock.current)return;lock.current=true;setBusy(true);
    try{const target=id;const jobName=await saveLocalWorking({id:target,name,snapshot,revision:0,updated_at:new Date().toISOString()});setMessage(jobName?`Saved on this device and added to ${jobName}.`:"Saved on this device. Reopen it from Your working.");setLogin(false);}
    catch(e){setMessage(e instanceof Error?e.message:"Device storage is unavailable.");}
    finally{lock.current=false;setBusy(false);}
  }
  async function save(copy=false){
    if(lock.current)return;
    if(!account){setLogin(true);setMessage("Sign in while connected to queue an account backup. You can save on this device now.");return;}
    lock.current=true;setBusy(true);setMessage("");setLogin(false);
    try{
      const checked=validateSnapshot(snapshot),target=copy?crypto.randomUUID():id;
      const localTarget=target;
      await saveLocalWorking({id:localTarget,name,snapshot:checked,revision:0,updated_at:new Date().toISOString()});
      await queueBackup({ownerId:account.id,id:target,name,snapshot:checked,revision:copy?0:seed?.revision??0});
      setId(target);setMessage("Saved on this device. Account backup queued; keep the app open when connected.");
      await refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Account backup could not be queued. Check Your working for the device copy.");}
    finally{lock.current=false;setBusy(false);}
  }
  function signIn(){
    try{sessionStorage.setItem(`t2qcal.pending.${snapshot.slug}`,JSON.stringify({snapshot,name}));window.location.assign(`/t2qcal/signin?next=${encodeURIComponent(`/t2qcal/calculator/${snapshot.slug}?resume=1`)}`);}
    catch{setMessage("Your browser could not keep these inputs for sign-in. Save on this device before signing in.");}
  }
  return <section className="save-working" aria-label="Save calculation"><div><h2>Save your working</h2><p>Device saves work offline. After signing in, account backups queue on this device and retry when the app is open and connected.</p></div>
    <label>Calculation name<input maxLength={120} value={name} onChange={e=>setName(e.target.value)} /></label>
    <div className="save-actions"><button className="directory-button" disabled={busy||!name.trim()} onClick={()=>void saveOnDevice()}>Save on this device</button><a href="/t2qcal/device">Your working</a><button className="directory-button" disabled={busy||!name.trim()} onClick={()=>void save()}>{busy?"Saving…":"Back up to account"}</button>{(seed?.revision??0)>0&&<button disabled={busy} onClick={()=>void save(true)}>Back up a new copy</button>}<a href="/t2qcal/saved">View account-saved working</a></div>
    {message&&<p role="status">{message}</p>}{backupState&&<p role="status">{backupState}</p>}{login&&<button onClick={signIn}>Sign in and keep these inputs</button>}
  </section>;
}
