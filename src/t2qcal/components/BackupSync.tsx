"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState} from "react";
import {liveQuery} from "dexie";
import {workingDB,type BackupItem} from "../lib/local-db";
import {flushBackups,resolveBackup,retryBackup} from "../lib/backup-sync";
import {isUUID} from "../lib/calculation-record";
type Account={id:string;email:string|null};
const SyncContext=createContext<{account:Account|null;refresh:()=>Promise<void>}>({account:null,refresh:async()=>{}});
export function BackupSyncProvider({children}:{children:React.ReactNode}){
  const [account,setAccount]=useState<Account|null>(null),running=useRef(false);
  const refresh=useCallback(async()=>{
    if(running.current||!navigator.onLine)return;
    running.current=true;
    try{
      const response=await fetch("/api/t2qcal/account",{cache:"no-store",signal:AbortSignal.timeout(10_000)});
      if(!response.ok)throw new Error();
      const data=await response.json(),next=isUUID(data.account?.id)?data.account as Account:null;
      setAccount(next);
      if(next)await flushBackups(next.id);
    }catch{/* A network error never changes a queued operation's owner or marks it backed up. */}
    finally{running.current=false;}
  },[]);
  useEffect(()=>{
    const timer=window.setInterval(()=>void refresh(),30_000);
    const trigger=()=>void refresh();trigger();
    window.addEventListener("online",trigger);window.addEventListener("focus",trigger);
    return()=>{window.clearInterval(timer);window.removeEventListener("online",trigger);window.removeEventListener("focus",trigger);};
  },[refresh]);
  return <SyncContext.Provider value={{account,refresh}}>{children}</SyncContext.Provider>;
}
export const useBackupAccount=()=>useContext(SyncContext);
export function BackupStatus(){
  const {account,refresh}=useBackupAccount(),[items,setItems]=useState<BackupItem[]>([]),[error,setError]=useState("");
  useEffect(()=>{
    const sub=liveQuery<BackupItem[]>(()=>account?workingDB.outbox.where("ownerId").equals(account.id).toArray():Promise.resolve([])).subscribe({next:setItems,error:()=>setError("Backup status is unavailable. Device working is still separate from account backup.")});
    return()=>sub.unsubscribe();
  },[account]);
  async function act(item:BackupItem,action:"retry"|"copy"|"discard"){
    if(!account)return;
    try{if(action==="retry")await retryBackup(account.id,item.id);else await resolveBackup(account.id,item.id,action==="copy");setError("");await refresh();}
    catch{setError("The backup could not be updated. Please try again.");}
  }
  return <section className="save-working" aria-label="Account backup status"><h2>Account backup</h2><p>{account?`Backups belong to ${account.email??"your signed-in account"}. Queued working retries while the app is open and connected.`:"Sign in while connected to queue account backups. Device working remains available without an account."}</p>{error&&<p role="alert">{error}</p>}{account&&!items.length&&<p>No pending backups for this account. Calculations saved only on this device are not automatically uploaded.</p>}{items.map(item=><article key={item.id}><h3>{item.name}</h3><p role="status">{item.status==="sending"?"Backing up…":item.status==="conflict"?"Changed on another device — choose how to resolve it.":item.status==="error"?"Needs attention":"Saved on device · Account backup pending"}</p>{item.error&&<p>{item.error}</p>}<div className="save-actions">{item.status==="conflict"?<><button onClick={()=>void act(item,"copy")}>Back up as a new copy</button><button onClick={()=>void act(item,"discard")}>Keep server version</button><small>Both choices keep your device copy. Open account-saved working to view the server version.</small></>:<button disabled={item.status==="sending"} onClick={()=>void act(item,"retry")}>Retry backup</button>}</div></article>)}</section>;
}
